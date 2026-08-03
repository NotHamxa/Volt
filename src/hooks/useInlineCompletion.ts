import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getSearchHistory } from "@/scripts/bangs.ts";
import { SearchQueryT } from "@/interfaces/searchQuery.ts";

/**
 * Browser-address-bar style inline completion.
 *
 * As the user types, the remainder of the best matching candidate is appended
 * to the input and left selected, so continuing to type overwrites it and
 * Enter / ArrowRight accepts it. Completion is suppressed while deleting —
 * otherwise backspace would immediately re-add what was just removed.
 */
export function useInlineCompletion(
    inputRef: React.RefObject<HTMLInputElement | null>,
    setQuery: React.Dispatch<React.SetStateAction<string>>,
    apps: SearchQueryT[],
) {
    const [historyTerms, setHistoryTerms] = useState<string[]>([]);
    // Length of what the user actually typed, ignoring any completion we added.
    const typedLenRef = useRef(0);
    const pendingSelectionRef = useRef<[number, number] | null>(null);

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

    // Applied after render so it lands on the value React just committed.
    useLayoutEffect(() => {
        const selection = pendingSelectionRef.current;
        if (!selection || !inputRef.current) return;
        inputRef.current.setSelectionRange(selection[0], selection[1]);
        pendingSelectionRef.current = null;
    });

    const findCompletion = useCallback((typed: string): string | null => {
        const prefix = typed.toLowerCase();
        if (!prefix.trim()) return null;

        let best: string | null = null;
        const consider = (candidate: string) => {
            if (candidate.length <= typed.length) return;
            if (!candidate.toLowerCase().startsWith(prefix)) return;
            // Shortest completion is the least surprising one.
            if (!best || candidate.length < best.length) best = candidate;
        };

        // Apps win over history: launching is the more common intent.
        for (const app of apps) consider(app.name);
        if (best) return best;
        for (const term of historyTerms) consider(term);
        return best;
    }, [apps, historyTerms]);

    /** Drop-in replacement for the input's onChange. */
    const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const typed = event.target.value;
        const deleting = typed.length < typedLenRef.current;
        typedLenRef.current = typed.length;

        if (deleting) {
            setQuery(typed);
            return;
        }

        const completion = findCompletion(typed);
        if (completion) {
            pendingSelectionRef.current = [typed.length, completion.length];
            setQuery(completion);
        } else {
            setQuery(typed);
        }
    }, [findCompletion, setQuery]);

    /** Keeps the tracker honest when the query is changed programmatically. */
    const resetTypedLength = useCallback((length: number) => {
        typedLenRef.current = length;
    }, []);

    return { handleChange, resetTypedLength };
}
