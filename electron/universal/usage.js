import Store from "electron-store";

// Constructed on first use rather than at import: electron-store needs an
// Electron app context, and scoring code that only reads a usage map should
// stay importable without one.
let _store = null;
const store = () => (_store ??= new Store());

const USAGE_KEY = "appUsage";
const LEGACY_KEY = "appLaunchStack";
const HALF_LIFE_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Usage is keyed on name *and* location, so two apps that happen to share a
 * name don't share a launch count. Legacy data only had names, hence the
 * name-only fallback key below.
 */
export function usageKey(item) {
    const name = String(item?.name ?? "").toLowerCase();
    const id = String(item?.path ?? item?.appId ?? "").toLowerCase();
    return `${name}|${id}`;
}

function legacyKeyFor(item) {
    return `${String(item?.name ?? "").toLowerCase()}|`;
}

function parse(raw) {
    if (!raw) return null;
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Converts the old most-recently-used name list into counts. The list was
 * ordered newest first, so position stands in for how often something was used.
 */
function migrateFromStack(now) {
    const stack = (() => {
        try {
            const raw = JSON.parse(store().get(LEGACY_KEY) ?? "[]");
            return Array.isArray(raw) ? raw : [];
        } catch {
            return [];
        }
    })();

    const usage = {};
    stack.forEach((name, index) => {
        usage[`${String(name).toLowerCase()}|`] = {
            count: Math.max(1, stack.length - index),
            last: now,
        };
    });
    return usage;
}

export function loadUsage(now = Date.now()) {
    const existing = parse(store().get(USAGE_KEY));
    if (existing) return existing;
    const migrated = migrateFromStack(now);
    store().set(USAGE_KEY, JSON.stringify(migrated));
    return migrated;
}

export function recordLaunch(item, now = Date.now()) {
    if (!item?.name) return;
    const usage = loadUsage(now);
    const key = usageKey(item);
    const previous = usage[key] ?? usage[legacyKeyFor(item)] ?? { count: 0, last: 0 };
    usage[key] = { count: (previous.count ?? 0) + 1, last: now };
    store().set(USAGE_KEY, JSON.stringify(usage));
}

/**
 * Launch count decayed by age — recent-and-frequent beats
 * frequent-but-forgotten. Half of the weight is gone after HALF_LIFE_DAYS.
 */
export function frecency(usage, item, now = Date.now()) {
    if (!usage) return 0;
    const entry = usage[usageKey(item)] ?? usage[legacyKeyFor(item)];
    const count = entry?.count ?? 0;
    if (count <= 0) return 0;
    const ageDays = Math.max(0, (now - (entry.last ?? 0)) / DAY_MS);
    return count * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/** Drops usage for apps that are no longer installed. */
export function pruneUsage(appCache) {
    const usage = loadUsage();
    const live = new Set();
    for (const app of appCache ?? []) {
        live.add(usageKey(app));
        live.add(legacyKeyFor(app));
    }
    const kept = {};
    for (const [key, value] of Object.entries(usage)) {
        if (live.has(key)) kept[key] = value;
    }
    store().set(USAGE_KEY, JSON.stringify(kept));
    return kept;
}
