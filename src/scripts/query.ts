import { SearchQueryT } from "@/interfaces/searchQuery.ts";

/** Results in score order, strongest match first, regardless of type. */
export interface ProcessedQueryResult {
    results: SearchQueryT[];
}

type Search = { key: string; promise: Promise<ProcessedQueryResult | null> };

// One search in flight and at most one waiting; a newer query replaces the
// waiting one, whose caller gets null.
let inFlight: Search | null = null;
let queued: (Search & { run: () => void; cancel: () => void }) | null = null;

function send(key: string, query: string, filters: boolean[]): Promise<ProcessedQueryResult | null> {
    const promise: Promise<ProcessedQueryResult | null> = Promise.resolve()
        .then(() => window.electron.searchQuery(query, filters))
        .catch(() => null)
        .finally(() => {
            if (inFlight?.promise === promise) inFlight = null;
            const next = queued;
            queued = null;
            next?.run();
        });
    inFlight = { key, promise };
    return promise;
}

/**
 * Results for `query`, or null if the search failed or a newer one replaced
 * it before it was sent. Asking for a search that's already in flight or
 * waiting shares it rather than replacing it, Enter on a stale list asks
 * for exactly what the debounce is about to.
 */
export function getQueryData(query: string, filters: boolean[]): Promise<ProcessedQueryResult | null> {
    const key = JSON.stringify([query, filters]);
    if (inFlight?.key === key) return inFlight.promise;
    if (queued?.key === key) return queued.promise;
    if (!inFlight) return send(key, query, filters);

    queued?.cancel();
    let resolve!: (result: ProcessedQueryResult | null) => void;
    const promise = new Promise<ProcessedQueryResult | null>(r => { resolve = r; });
    queued = {
        key,
        promise,
        run: () => { send(key, query, filters).then(resolve); },
        cancel: () => resolve(null),
    };
    return promise;
}

export function getNameFromPath(path: string): string {
    const lastSlashIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return lastSlashIndex === -1 ? path : path.substring(lastSlashIndex + 1);
}
