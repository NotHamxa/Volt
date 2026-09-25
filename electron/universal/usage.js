import Store from "electron-store";

// Constructed on first use rather than at import: electron-store needs an
// Electron app context, and scoring code that only reads a usage map should
// stay importable without one.
let _store = null;
const store = () => (_store ??= new Store());

const ITEMS_KEY = "searchUsage";     // { [itemKey]: { score, t } }
const CHOICES_KEY = "queryChoices";  // { [queryPrefix]: { [itemKey]: { score, t } } }
const V1_KEY = "appUsage";           // { "name|id": { count, last } } — apps only
const LEGACY_KEY = "appLaunchStack"; // most-recent-first name list

const DAY_MS = 86_400_000;
const HALF_LIFE_DAYS = 30;
const MAX_PREFIX = 10;      // "c" … "chromebeta" — longer queries learn under their first 10 chars
const MAX_PER_PREFIX = 8;   // choices remembered per prefix
const FORGET_BELOW = 0.05;  // a single use, ~4 months untouched

/**
 * Every use adds 1 to a score that halves every HALF_LIFE_DAYS. Unlike a
 * count decayed by the last use, a burst of use a year ago stays a year old
 * even if the item was opened once today.
 */
const decayed = (entry, now) =>
    entry ? entry.score * Math.pow(0.5, Math.max(0, now - entry.t) / (HALF_LIFE_DAYS * DAY_MS)) : 0;
const bump = (entry, now) => ({ score: decayed(entry, now) + 1, t: now });

const typeKey = (type) => (String(type ?? "").startsWith("command") ? "command" : String(type ?? "app"));

/**
 * Items are keyed on type, name and location, so two things sharing a name
 * don't share a history. Commands are keyed on name alone: their "path" is
 * the script body, which changes whenever the command is edited.
 */
export function usageKey(item) {
    const type = typeKey(item?.type);
    const name = String(item?.name ?? "").toLowerCase();
    const id = type === "command" ? "" : String(item?.path ?? item?.appId ?? "").toLowerCase();
    return `${type}|${name}|${id}`;
}

// Apps carried over from the name-only launch stack have no location.
const legacyKeyFor = (item) => `app|${String(item?.name ?? "").toLowerCase()}|`;

function parse(raw) {
    if (!raw) return null;
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/** Carries app launch counts over from the previous formats. */
function migrate(now) {
    const items = {};
    const v1 = parse(store().get(V1_KEY));
    if (v1) {
        for (const [key, { count = 0, last = now } = {}] of Object.entries(v1)) {
            if (count > 0) items[`app|${key}`] = { score: count, t: last };
        }
        return items;
    }
    let stack = [];
    try {
        const raw = JSON.parse(store().get(LEGACY_KEY) ?? "[]");
        if (Array.isArray(raw)) stack = raw;
    } catch { /* no history */ }
    // Ordered newest first, so position stands in for how often it was used.
    stack.forEach((name, index) => {
        items[`app|${String(name).toLowerCase()}|`] = { score: Math.max(1, stack.length - index), t: now };
    });
    return items;
}

// Search reads usage on every keystroke, and each store.get() re-reads and
// parses the whole config file from disk. Every write goes through this
// module, so the in-memory copy stays authoritative.
let cached = null;

export function loadUsage(now = Date.now()) {
    if (cached) return cached;
    const items = parse(store().get(ITEMS_KEY));
    cached = { items: items ?? migrate(now), choices: parse(store().get(CHOICES_KEY)) ?? {} };
    if (!items) save(cached);
    return cached;
}

// One set() call: each one rewrites the whole config file.
function save(usage) {
    cached = usage;
    store().set({ [ITEMS_KEY]: JSON.stringify(usage.items), [CHOICES_KEY]: JSON.stringify(usage.choices) });
}

/** Drops whatever has decayed to nothing, so the maps don't grow forever. */
function forgetFaded(usage, now) {
    const items = {};
    for (const [key, entry] of Object.entries(usage.items)) {
        if (decayed(entry, now) >= FORGET_BELOW) items[key] = entry;
    }
    const choices = {};
    for (const [prefix, picks] of Object.entries(usage.choices)) {
        const kept = Object.entries(picks)
            .filter(([, entry]) => decayed(entry, now) >= FORGET_BELOW)
            .sort(([, a], [, b]) => decayed(b, now) - decayed(a, now))
            .slice(0, MAX_PER_PREFIX);
        if (kept.length) choices[prefix] = Object.fromEntries(kept);
    }
    return { items, choices };
}

/** An item was opened or run, from search or anywhere else. */
export function recordUse(item, now = Date.now()) {
    if (!item?.name) return;
    const usage = loadUsage(now);
    const key = usageKey(item);
    const previous = usage.items[key] ?? usage.items[legacyKeyFor(item)];
    save(forgetFaded({ ...usage, items: { ...usage.items, [key]: bump(previous, now) } }, now));
}

/**
 * The user picked `item` after typing `normalisedQuery`. Remembered under
 * every prefix of the query, so typing less next time still finds it.
 */
export function recordChoice(normalisedQuery, item, now = Date.now()) {
    if (!item?.name || !normalisedQuery) return;
    const usage = loadUsage(now);
    const key = usageKey(item);
    const choices = { ...usage.choices };
    const upTo = Math.min(normalisedQuery.length, MAX_PREFIX);
    for (let len = 1; len <= upTo; len++) {
        const prefix = normalisedQuery.slice(0, len);
        const picks = { ...choices[prefix] };
        picks[key] = bump(picks[key], now);
        choices[prefix] = picks;
    }
    save(forgetFaded({ ...usage, choices }, now));
}

/**
 * Per-query usage signals, resolved once per search:
 *   frecency — decayed use count of the item (any query)
 *   share    — fraction of past picks for this query that were this item,
 *              smoothed so a single pick doesn't claim full confidence
 */
export function usageSignals(usage, normalisedQuery, now = Date.now()) {
    const picks = usage?.choices?.[String(normalisedQuery ?? "").slice(0, MAX_PREFIX)] ?? {};
    const pickScores = {};
    let total = 0;
    for (const [key, entry] of Object.entries(picks)) {
        total += pickScores[key] = decayed(entry, now);
    }
    const items = usage?.items ?? {};
    const signals = (item, key = usageKey(item)) => ({
        frecency: decayed(items[key] ?? (item?.type === "app" ? items[legacyKeyFor(item)] : undefined), now),
        share: pickScores[key] ? pickScores[key] / (total + 1) : 0,
    });
    // Upper bounds for this query, so ranking can skip the lookup for items
    // that couldn't reach the top even with the strongest signal on record.
    signals.maxFrecency = Object.values(items).reduce((max, entry) => Math.max(max, decayed(entry, now)), 0);
    signals.maxShare = Object.values(pickScores).reduce((max, score) => Math.max(max, score / (total + 1)), 0);
    return signals;
}

/** When `item` was last opened, or null if Volt has never seen it used. */
export function lastUsed(item, now = Date.now()) {
    const { items } = loadUsage(now);
    const entry = items[usageKey(item)] ?? (item?.type === "app" ? items[legacyKeyFor(item)] : undefined);
    return entry?.t ?? null;
}

/** Drops app history for apps that are no longer installed; other types keep theirs. */
export function pruneUsage(appCache, now = Date.now()) {
    const usage = loadUsage(now);
    const live = new Set();
    for (const app of appCache ?? []) {
        live.add(usageKey(app));
        live.add(legacyKeyFor(app));
    }
    const isDeadApp = (key) => key.startsWith("app|") && !live.has(key);
    const items = Object.fromEntries(Object.entries(usage.items).filter(([key]) => !isDeadApp(key)));
    const choices = {};
    for (const [prefix, picks] of Object.entries(usage.choices)) {
        choices[prefix] = Object.fromEntries(Object.entries(picks).filter(([key]) => !isDeadApp(key)));
    }
    const pruned = forgetFaded({ items, choices }, now);
    save(pruned);
    return pruned;
}
