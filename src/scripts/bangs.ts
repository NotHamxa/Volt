import bangs from "@/data/bangs.json";
import { BangData } from "@/interfaces/bang.ts";
import { SearchHistoryT } from "@/interfaces/history.ts";

const HISTORY_KEY = "searchHistory";
const HISTORY_LIMIT = 20;
const DEFAULT_BANG_TOKEN = "g";

export type ResolvedSearch = {
    /** The bang that will be used — falls back to the default when none was typed. */
    bang: BangData;
    /** What the user is actually searching for, with the bang token removed. */
    searchTerm: string;
    /** Fully built destination URL. */
    url: string;
    /** True only when the user typed a `!token` that matched a known bang. */
    hasExplicitBang: boolean;
    /**
     * True when the query is itself a navigable address (`hamzahmed.com`,
     * `localhost:3000`) — the url then points straight at it rather than at a
     * search for it.
     */
    isDirectUrl: boolean;
    /** Hostname of a direct url, used for display and history. */
    host?: string;
};

/**
 * Treats a bare query as an address when it plausibly is one. Requires either
 * an explicit protocol, a dot (domain or IP), or localhost — so ordinary
 * searches are not hijacked.
 */
export function asDirectUrl(raw: string): string | null {
    const url = raw.trim();
    if (!url || /\s/.test(url)) return null;

    const hasProtocol = /^https?:\/\//i.test(url);
    const isLocalhost = /^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(url);
    if (!hasProtocol && !isLocalhost && !url.includes(".")) return null;

    try {
        const normalized = hasProtocol ? url
            : isLocalhost ? `http://${url}`
            : `https://${url}`;
        const { hostname } = new URL(normalized);
        if (
            hostname === "localhost" ||
            /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) ||
            hostname.includes(".")
        ) {
            return normalized;
        }
        return null;
    } catch {
        return null;
    }
}

const defaultBang = () => bangs.find(b => b.t === DEFAULT_BANG_TOKEN) as BangData | undefined;

function buildUrl(bang: BangData, searchTerm: string) {
    return bang.u.replace("{{{s}}}", encodeURIComponent(searchTerm));
}

/**
 * Pure: works out which bang (if any) a query is using and what it would open.
 * No history writes, no navigation — so callers can preview a result without
 * committing to it.
 *
 * A bang is only recognised as the final token. When the query has no bang the
 * *whole* query is the search term (the old handleBangs dropped the last word
 * here, which was unreachable because every caller appended a bang first).
 */
export function resolveBang(query: string): ResolvedSearch | null {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const words = trimmed.split(/\s+/);
    const lastWord = words[words.length - 1];
    const token = lastWord.startsWith("!") ? lastWord.slice(1) : null;
    const matched = token ? (bangs.find(b => b.t === token) as BangData | undefined) : undefined;

    const bang = matched ?? defaultBang();
    if (!bang) return null;

    // Strip the token only when it actually resolved to something, or when the
    // user typed a bang-looking token at all — an unknown `!foo` still isn't
    // part of what they meant to search for.
    const searchTerm = token !== null ? words.slice(0, -1).join(" ") : trimmed;

    // An explicit bang means "search this site", so a URL-looking query is only
    // treated as an address when no bang was given.
    const direct = matched ? null : asDirectUrl(trimmed);
    if (direct) {
        return {
            bang,
            searchTerm: trimmed,
            url: direct,
            hasExplicitBang: false,
            isDirectUrl: true,
            host: new URL(direct).hostname,
        };
    }

    return {
        bang,
        searchTerm,
        url: buildUrl(bang, searchTerm),
        hasExplicitBang: Boolean(matched),
        isDirectUrl: false,
    };
}

/** Builds a history entry for an arbitrary term against a known bang. */
export function searchWith(bang: BangData, searchTerm: string): SearchHistoryT {
    return {
        searchTerm,
        searchUrl: buildUrl(bang, searchTerm),
        site: bang.s,
    };
}

/** Turns a resolved search into the shape stored in history. */
export function toHistoryEntry(resolved: ResolvedSearch): SearchHistoryT {
    return {
        searchTerm: resolved.searchTerm,
        searchUrl: resolved.url,
        site: resolved.isDirectUrl ? (resolved.host ?? resolved.searchTerm) : resolved.bang.s,
    };
}

async function readHistory(): Promise<SearchHistoryT[]> {
    const stored = await window.electronStore.get(HISTORY_KEY);
    if (!stored) return [];
    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

// Identity is the destination. Comparing the label too would let the same URL
// pile up under different site names as the resolver changes.
function isSameEntry(a: SearchHistoryT, b: SearchHistoryT) {
    return a.searchUrl === b.searchUrl;
}

/** Moves `entry` to the front of history, de-duplicating and capping the list. */
export async function recordSearch(entry: SearchHistoryT): Promise<void> {
    const history = (await readHistory()).filter(item => !isSameEntry(item, entry));
    const updated = [entry, ...history].slice(0, HISTORY_LIMIT);
    window.electronStore.set(HISTORY_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("searchHistoryChanged"));
}

/** Records the search, then hands the URL to the OS browser. */
export async function openSearch(entry: SearchHistoryT): Promise<void> {
    await recordSearch(entry);
    window.electron.openExternal(entry.searchUrl);
}

export async function getSearchHistory(): Promise<SearchHistoryT[]> {
    return readHistory();
}

export async function deleteHistoryEntry(entry: SearchHistoryT): Promise<SearchHistoryT[]> {
    const updated = (await readHistory()).filter(item => !isSameEntry(item, entry));
    window.electronStore.set(HISTORY_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("searchHistoryChanged"));
    return updated;
}

/**
 * The bang the user has explicitly typed, or null. Used for the input favicon
 * chip, so it deliberately does *not* fall back to the default bang.
 */
async function getBangData(query: string): Promise<BangData | null> {
    const words = query.trim().split(/\s+/);
    const possibleBang = words[words.length - 1];
    const shortcut = possibleBang.startsWith("!") ? possibleBang.slice(1) : null;
    if (!shortcut) return null;
    return (bangs.find(bang => bang.t === shortcut) as BangData) ?? null;
}

export { getBangData };
