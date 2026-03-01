import { SearchQueryT } from "@/interfaces/searchQuery.ts";

export interface ProcessedQueryResult {
    bestMatch: SearchQueryT | null;
    apps:      SearchQueryT[];
    files:     SearchQueryT[];
    folders:   SearchQueryT[];
    settings:  SearchQueryT[];
    commands:  SearchQueryT[];
}

let _ipcInFlight = false;
let _pendingRun:    (() => void) | null = null;
let _pendingCancel: (() => void) | null = null;

async function searchQuerySerialized(query: string, filters: boolean[]): Promise<ProcessedQueryResult | null> {
    if (_ipcInFlight) {
        _pendingCancel?.();
        return new Promise<ProcessedQueryResult | null>(resolve => {
            _pendingRun    = () => searchQuerySerialized(query, filters).then(resolve);
            _pendingCancel = () => resolve(null);
        });
    }
    _ipcInFlight = true;
    try {
        return await window.electron.searchQuery(query, filters);
    } finally {
        _ipcInFlight = false;
        if (_pendingRun) {
            const run = _pendingRun;
            _pendingRun    = null;
            _pendingCancel = null;
            run();
        }
    }
}

export async function getQueryData(query: string, filters: boolean[]): Promise<ProcessedQueryResult | null> {
    return searchQuerySerialized(query, filters);
}

export function getNameFromPath(path: string): string {
    const lastSlashIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return lastSlashIndex === -1 ? path : path.substring(lastSlashIndex + 1);
}
