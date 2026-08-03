import { useEffect, useMemo, useState } from "react";
import { getSearchHistory } from "@/scripts/bangs.ts";
import { SearchQueryT } from "@/interfaces/searchQuery.ts";

/**
 * Suggests the rest of an app name or past search as *ghost text*.
 *
 * The suggestion is never written into the input's value — the field always
 * holds exactly what was typed. That makes it impossible for a completion to
 * swallow the query, which is what happens when you push it into the value and
 * rely on a text selection to undo it.
 */
/**
 * Picks the completion for `query`, or null when nothing sensibly extends it.
 * Pure so the typing behaviour can be exercised directly.
 */
export function pickCompletion(
    query: string,
    appNames: string[],
    historyTerms: string[],
): string | null {
    // Nothing to complete mid-bang, or once a word has been finished.
    if (!query.trim() || query.includes("!") || /\s$/.test(query)) return null;

    const prefix = query.toLowerCase();
    let best: string | null = null;
    const consider = (candidate: string) => {
        if (candidate.length <= query.length) return;
        if (!candidate.toLowerCase().startsWith(prefix)) return;
        // Shortest completion is the least surprising one.
        if (best === null || candidate.length < best.length) best = candidate;
    };

    // Apps win over history: launching is the more common intent.
    for (const name of appNames) consider(name);
    if (best === null) for (const term of historyTerms) consider(term);
    return best;
}

export function useInlineCompletion(query: string, apps: SearchQueryT[]) {
    const [historyTerms, setHistoryTerms] = useState<string[]>([]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const history = await getSearchHistory();
            if (cancelled) return;
            setHistoryTerms(history.map(h => h.searchTerm).filter(Boolean));
        };
        load();
        window.addEventListener("searchHistoryChanged", load);
        return () => {
            cancelled = true;
            window.removeEventListener("searchHistoryChanged", load);
        };
    }, []);

    const appNames = useMemo(() => apps.map(a => a.name), [apps]);

    const completion = useMemo(
        () => pickCompletion(query, appNames, historyTerms),
        [query, appNames, historyTerms]
    );

    // Keeps whatever casing was typed, appending only the remainder.
    const suffix = completion ? completion.slice(query.length) : "";

    return { completion, suffix };
}
