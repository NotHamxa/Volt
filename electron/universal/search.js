import path from "path";
import os from "os";
import settings from "../data/settings.json" with { type: 'json' };
import { frecency } from "./usage.js";

const SEPARATORS = /[\s\-_.()[\]{}'"!?,:;/\\|]+/;

export const normaliseString = (str) => String(str ?? "").toLowerCase().replace(/[\s\-_.()[\]{}'"!?,:;/\\|]+/g, "");

/** Word pieces of a name, used for word-boundary and acronym matching. */
export const tokenise = (str) =>
    String(str ?? "").split(SEPARATORS).filter(Boolean).map(t => t.toLowerCase());

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
    folder: 0.9,
    file: 0.86,
};

const FRECENCY_BOOST = 0.6;        // ceiling on the usage bonus (+60%)
const FRECENCY_SATURATION = 3;     // ~3 recent launches earns half of it
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

const userHome = os.homedir();
const SUGGESTED_FOLDERS = [
    { name: "Downloads", type: "folder", path: path.join(userHome, "Downloads"), source: "PreDefined" },
    { name: "Documents", type: "folder", path: path.join(userHome, "Documents"), source: "PreDefined" },
    { name: "Desktop",   type: "folder", path: path.join(userHome, "Desktop"),   source: "PreDefined" },
];

const settingsIndex = settings.map(s => index({ ...s }));

// ─── simple lookups kept for direct IPC callers ──────────────────────────────

export function searchApps(appCache, query) {
    if (!appCache?.length) return [];
    // An empty query means "give me everything" — the renderer uses this to
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
    for (const folder of SUGGESTED_FOLDERS) {
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

const clean = ({ _normalized, _tokens, _acronym, ...rest }) => rest;

// Same ordering as String#localeCompare, without its per-call collator lookup.
const compareNames = new Intl.Collator().compare;

// Arrival order breaks the last tie, matching a stable sort over all matches.
const rank = (a, b) =>
    b.score - a.score ||
    a.item._normalized.length - b.item._normalized.length ||
    compareNames(String(a.item.name), String(b.item.name)) ||
    a.seq - b.seq;

/**
 * Keeps only each bucket's best TYPE_CAP entries while scoring. Nothing below
 * that could ever be shown, so a one-letter query over a large folder index no
 * longer materialises and sorts every match.
 */
class TopPerBucket {
    buckets = {};
    seq = 0;

    offer(item, bucket, base, usage, now) {
        const f = bucket === "apps" ? frecency(usage, item, now) : 0;
        const typeWeight = TYPE_WEIGHT[item.type] ?? 0.85;
        // The bonus saturates against an absolute scale rather than the
        // strongest candidate — otherwise the most-used item collects the full
        // boost even when its own score has decayed away to nothing.
        const boost = 1 + FRECENCY_BOOST * (f / (f + FRECENCY_SATURATION));
        const entry = { item, bucket, score: base * typeWeight * boost, seq: this.seq++ };

        const top = (this.buckets[bucket] ??= []);
        if (top.length === TYPE_CAP && rank(entry, top[TYPE_CAP - 1]) >= 0) return;
        let at = top.length;
        while (at > 0 && rank(entry, top[at - 1]) < 0) at--;
        top.splice(at, 0, entry);
        if (top.length > TYPE_CAP) top.pop();
    }

    // One list in score order — the strongest match first, whatever its type.
    results() {
        return Object.values(this.buckets).flat().sort(rank).slice(0, GLOBAL_LIMIT).map(e => clean(e.item));
    }
}

function collect(top, items, nq, bucket, usage, now) {
    for (const item of items ?? []) {
        const base = scoreItem(item, nq);
        if (base > 0) top.offer(item, bucket, base, usage, now);
    }
}

/**
 * Scores every candidate in one pool, then splits the winners back into the
 * buckets the renderer expects. Selection is global: a strong file result is no
 * longer discarded just because other categories happen to have matches.
 */
export function processSearchQuery(appCache, commandsCache, cachedFolderData, usage, query, filters, now = Date.now()) {
    const q = normaliseString(query).trim();
    if (!q) return { results: [] };

    // A command may be followed by positional arguments, so it is matched on
    // the first word only — otherwise typing arguments loses the command.
    const rawTokens = String(query).trim().split(/\s+/);
    const qCmd = rawTokens.length > 1 ? normaliseString(rawTokens[0]).trim() : q;

    const top = new TopPerBucket();
    if (filters[0]) collect(top, appCache, q, "apps", usage, now);
    if (filters[3]) collect(top, settingsIndex, q, "settings", usage, now);
    if (filters[4] && qCmd) collect(top, commandsCache, qCmd, "commands", usage, now);

    if (filters[1] || filters[2]) {
        for (const list of [SUGGESTED_FOLDERS, ...Object.values(cachedFolderData ?? {})]) {
            collectFiles(top, list, q, filters, usage, now);
        }
    }

    return { results: top.results() };
}

// The hot loop: runs over the whole folder index on every keystroke.
function collectFiles(top, items, nq, filters, usage, now) {
    for (const item of items ?? []) {
        // Score first: most items don't match, so only matches pay for the type check.
        const base = scoreItem(item, nq);
        if (base <= 0) continue;
        const isFolder = item.type === "folder";
        if (filters[isFolder ? 2 : 1]) top.offer(item, isFolder ? "folders" : "files", base, usage, now);
    }
}
