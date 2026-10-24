import path from "path";
import os from "os";
import settings from "../data/settings.json" with { type: 'json' };
import { usageSignals, usageKey } from "./usage.js";

const SEPARATORS = /[\s\-_.()[\]{}'"!?,:;/\\|]+/;

// Folds accents so "resume" finds Résumé.pdf. Most names are plain ASCII, so
// they skip the decomposition.
const foldAccents = (str) => (/[\u0080-￿]/.test(str) ? str.normalize("NFD").replace(/\p{M}/gu, "") : str);

export const normaliseString = (str) => foldAccents(String(str ?? "").toLowerCase()).replace(/[\s\-_.()[\]{}'"!?,:;/\\|]+/g, "");

/** Word pieces of a name, used for word-boundary and acronym matching. */
export const tokenise = (str) =>
    String(str ?? "").split(SEPARATORS).filter(Boolean).map(t => foldAccents(t.toLowerCase()));

// ─── match tiers ─────────────────────────────────────────────────────────────
// Ordered so a better kind of match always outranks a worse one, whatever the
// frecency or type weighting does on top.
const TIER = {
    EXACT: 1000,
    PREFIX: 800,
    WORD_PREFIX: 600,
    ACRONYM: 450,
    SUBSTRING: 250,
    SUBSEQUENCE: 120,
};

// Nudges results of the same quality towards the thing people usually mean.
const TYPE_WEIGHT = {
    app: 1,
    command: 0.97,
    commandOpen: 0.97,
    commandConfirm: 0.97,
    commandConfirmOpen: 0.97,
    setting: 0.94,
    // A pinned link was put there on purpose, like an app.
    link: 0.96,
    folder: 0.9,
    file: 0.86,
};

const FRECENCY_BOOST = 0.6;        // ceiling on the general-use bonus (+60%)
const FRECENCY_SATURATION = 3;     // ~3 recent uses earns half of it
const CHOICE_BOOST = 1;            // ceiling on the picked-for-this-query bonus (+100%)

const usageBoost = (frecency, share) =>
    1 + FRECENCY_BOOST * (frecency / (frecency + FRECENCY_SATURATION)) + CHOICE_BOOST * share;
const GLOBAL_LIMIT = 20;      // total rows handed to the renderer
const TYPE_CAP = 8;           // stops one category flooding the list

/**
 * Attaches the derived match fields once per item. The caches are long-lived,
 * so this is computed on first sight and reused for every later keystroke.
 */
function index(item) {
    if (item._normalized === undefined) {
        // Folder-scan entries already carry the same normalisation.
        item._normalized = item.normalisedName ?? normaliseString(item.name);
        item._tokens = tokenise(item.name);
        item._acronym = item._tokens.map(t => t[0]).join("");
        // Filled lazily for the few items that reach ranking, but declared
        // here so every item keeps one object shape, adding it later to only
        // some of them slows property access across the whole index.
        item._usageKey = null;
    }
    return item;
}

/** True when every character of `needle` appears in order within `haystack`. */
function subsequenceRatio(haystack, needle) {
    let hi = 0;
    let matched = 0;
    let firstHit = -1;
    let lastHit = 0;
    for (let ni = 0; ni < needle.length; ni++) {
        const ch = needle[ni];
        while (hi < haystack.length && haystack[hi] !== ch) hi++;
        if (hi >= haystack.length) return 0;
        if (firstHit === -1) firstHit = hi;
        lastHit = hi;
        matched++;
        hi++;
    }
    if (matched !== needle.length) return 0;
    // Tighter runs score higher than characters scattered across the name.
    const span = Math.max(1, lastHit - firstHit + 1);
    return needle.length / span;
}

/**
 * How well `item` matches the normalised query. 0 means no match at all.
 * Shorter names win ties, so "Photos" beats "Photoshop" for "phot".
 */
function scoreItem(item, nq) {
    index(item);
    const norm = item._normalized;
    if (!norm || !nq) return 0;

    const concision = nq.length / norm.length;   // 0..1, higher is tighter

    if (norm === nq) return TIER.EXACT;
    if (norm.startsWith(nq)) return TIER.PREFIX + 100 * concision;

    for (const token of item._tokens) {
        if (token.startsWith(nq)) return TIER.WORD_PREFIX + 100 * concision;
    }

    if (item._acronym.length > 1 && item._acronym.startsWith(nq)) {
        return TIER.ACRONYM + 100 * concision;
    }

    const at = norm.indexOf(nq);
    if (at !== -1) {
        // Earlier occurrences are more likely to be what was meant.
        return TIER.SUBSTRING + 60 * concision - Math.min(50, at);
    }

    const ratio = subsequenceRatio(norm, nq);
    if (ratio > 0) return TIER.SUBSEQUENCE * ratio;

    return 0;
}

// OneDrive backup (and a user moving them) relocates these folders, so the
// main process supplies the real known-folder paths via setKnownFolders. The
// home-folder guess is only a fallback, which also keeps this module
// importable from plain node.
const SUGGESTED_NAMES = { downloads: "Downloads", documents: "Documents", desktop: "Desktop" };
let resolveKnownFolder = (key) => path.join(os.homedir(), SUGGESTED_NAMES[key]);
let suggestedFolders = null;

/** `resolve(key)` returns the path of "downloads", "documents" or "desktop"; it's called on first search. */
export function setKnownFolders(resolve) {
    resolveKnownFolder = resolve;
    suggestedFolders = null;
}

function getSuggestedFolders() {
    return (suggestedFolders ??= Object.entries(SUGGESTED_NAMES).map(([key, name]) => {
        let folderPath;
        try { folderPath = resolveKnownFolder(key); } catch { /* fall back below */ }
        return { name, type: "folder", path: folderPath || path.join(os.homedir(), name), source: "PreDefined" };
    }));
}

const settingsIndex = settings.map(s => index({ ...s }));

// ─── simple lookups kept for direct IPC callers ──────────────────────────────

export function searchApps(appCache, query) {
    if (!appCache?.length) return [];
    // An empty query means "give me everything", the renderer uses this to
    // build its full app list and logo map.
    if (!query) return appCache;
    const nq = normaliseString(query);
    return appCache.filter(app => scoreItem(app, nq) > 0);
}

export function searchSettings(query) {
    const nq = normaliseString(query);
    if (!nq) return [];
    return settingsIndex.filter(item => scoreItem(item, nq) > 0);
}

export function searchCommands(commandsCache, query) {
    if (!commandsCache?.length) return [];
    const nq = normaliseString(query);
    if (!nq) return [];
    return commandsCache.filter(cmd => scoreItem(cmd, nq) > 0);
}

export function searchFilesAndFolders(query, cachedFolderData) {
    const nq = normaliseString(query);
    if (!nq) return [];
    const results = [];
    for (const folder of getSuggestedFolders()) {
        if (scoreItem(folder, nq) > 0) results.push(folder);
    }
    for (const list of Object.values(cachedFolderData ?? {})) {
        for (const item of list ?? []) {
            if (scoreItem(item, nq) > 0) results.push(item);
        }
    }
    return results;
}

// ─── ranked search ───────────────────────────────────────────────────────────

const clean = ({ _normalized, _tokens, _acronym, _usageKey, ...rest }) => rest;

// Same ordering as String#localeCompare, without its per-call collator lookup.
const compareNames = new Intl.Collator().compare;

// Arrival order breaks the last tie, matching a stable sort over all matches.
const rank = (a, b) =>
    b.score - a.score ||
    a.item._normalized.length - b.item._normalized.length ||
    compareNames(String(a.item.name), String(b.item.name)) ||
    a.seq - b.seq;

// Windows paths are case-insensitive.
const samePath = (a, b) => !!a && a.length === b?.length && (a === b || a.toLowerCase() === b.toLowerCase());

/**
 * Keeps only each bucket's best TYPE_CAP entries while scoring. Nothing below
 * that could ever be shown, so a one-letter query over a large folder index no
 * longer materialises and sorts every match.
 */
class TopPerBucket {
    buckets = {};
    seq = 0;

    constructor(signals) {
        this.signals = signals;
        this.maxBoost = usageBoost(signals.maxFrecency, signals.maxShare);
    }

    offer(item, bucket, base, dedupe = false) {
        const typeWeight = TYPE_WEIGHT[item.type] ?? 0.85;
        const top = (this.buckets[bucket] ??= []);
        const full = top.length === TYPE_CAP;
        // Most matches can't reach the top even with the strongest usage on
        // record, so skip the lookup for them.
        if (full && base * typeWeight * this.maxBoost < top[TYPE_CAP - 1].score) return;

        const { frecency, share } = this.signals(item, (item._usageKey ??= usageKey(item)));
        // Both bonuses saturate against an absolute scale rather than the
        // strongest candidate, otherwise the most-used item collects the full
        // boost even when its own score has decayed away to nothing. The share
        // is what the user picked for this very query, so it counts for more.
        const entry = { item, bucket, score: base * typeWeight * usageBoost(frecency, share), seq: this.seq++ };

        if (full && rank(entry, top[TYPE_CAP - 1]) >= 0) return;
        // Overlapping indexed folders (or a suggested folder that is also
        // indexed) list the same path twice. Copies score identically, so the
        // first one is already here if either could be shown.
        if (dedupe && top.some(e => samePath(e.item.path, item.path))) return;
        let at = top.length;
        while (at > 0 && rank(entry, top[at - 1]) < 0) at--;
        top.splice(at, 0, entry);
        if (top.length > TYPE_CAP) top.pop();
    }

    // One list in score order, the strongest match first, whatever its type.
    results() {
        return Object.values(this.buckets).flat().sort(rank).slice(0, GLOBAL_LIMIT).map(e => clean(e.item));
    }
}

function collect(top, items, nq, bucket) {
    for (const item of items ?? []) {
        const base = scoreItem(item, nq);
        if (base > 0) top.offer(item, bucket, base);
    }
}

/**
 * Scores every candidate in one pool, then splits the winners back into the
 * buckets the renderer expects. Selection is global: a strong file result is no
 * longer discarded just because other categories happen to have matches.
 */
export function processSearchQuery(appCache, commandsCache, cachedFolderData, usage, query, filters, now = Date.now(), links = []) {
    const q = normaliseString(query).trim();
    if (!q) return { results: [] };

    const top = new TopPerBucket(usageSignals(usage, q, now));
    if (filters[0]) collect(top, appCache, q, "apps");
    // Links ride with apps: both are things you pinned to launch.
    if (filters[0]) collectLinks(top, links, q);
    if (filters[3]) collect(top, settingsIndex, q, "settings");
    if (filters[4]) collectCommands(top, commandsCache, q, query);

    if (filters[1] || filters[2]) {
        for (const list of [getSuggestedFolders(), ...Object.values(cachedFolderData ?? {})]) {
            collectFiles(top, list, q, filters);
        }
    }

    return { results: top.results() };
}

/** A link's address without the scheme and "www.", what people type for it. */
function linkHost(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
}

/**
 * Pinned links, matched on their name or their address, whichever fits
 * better, "gh" finds a link named GitHub, and so does "github.com".
 */
function collectLinks(top, links, q) {
    for (const link of links ?? []) {
        if (typeof link?.shortcut !== "string" || !link.shortcut) continue;
        const item = { name: String(link.name || linkHost(link.shortcut) || link.shortcut), type: "link", path: link.shortcut };
        const host = linkHost(link.shortcut);
        const base = Math.max(scoreItem(item, q), host ? scoreItem({ name: host }, q) : 0);
        if (base > 0) top.offer(item, "links", base);
    }
}

/** "kill port 3000" → ["killport", "kill"]: the query with trailing words dropped. */
function leadingWordForms(query) {
    const words = String(query).trim().split(/\s+/);
    const forms = [];
    for (let n = words.length - 1; n >= 1; n--) {
        const form = normaliseString(words.slice(0, n).join(" "));
        if (form) forms.push(form);
    }
    return forms;
}

/**
 * Commands are scored on the whole query, so "restart windows explorer" can't
 * land on "Restart" through its first word. Only a command that takes
 * arguments may be followed by them, so those also match on the leading
 * words, "kill 3000" still finds "Kill Port {port}".
 */
function collectCommands(top, commands, q, query) {
    let heads = null;
    for (const cmd of commands ?? []) {
        let base = scoreItem(cmd, q);
        if (cmd.args?.length) {
            heads ??= leadingWordForms(query);
            for (const head of heads) base = Math.max(base, scoreItem(cmd, head));
        }
        if (base > 0) top.offer(cmd, "commands", base);
    }
}

// The hot loop: runs over the whole folder index on every keystroke.
function collectFiles(top, items, nq, filters) {
    for (const item of items ?? []) {
        // Score first: most items don't match, so only matches pay for the type check.
        const base = scoreItem(item, nq);
        if (base <= 0) continue;
        const isFolder = item.type === "folder";
        if (filters[isFolder ? 2 : 1]) top.offer(item, isFolder ? "folders" : "files", base, true);
    }
}
