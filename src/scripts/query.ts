import {SearchQueryT} from "@/interfaces/searchQuery.ts";

type CombinedQuery = Awaited<ReturnType<typeof window.electron.searchQuery>>;

interface QueryData {
    query: string;
    setBestMatch: React.Dispatch<React.SetStateAction<SearchQueryT | null>>;
    searchQueryFilters: boolean[]
}

let _ipcInFlight = false;
let _pendingRun: (() => void) | null = null;
let _pendingCancel: (() => void) | null = null;

async function searchQuerySerialized(query: string): Promise<CombinedQuery | null> {
    if (_ipcInFlight) {
        _pendingCancel?.();
        return new Promise<CombinedQuery | null>(resolve => {
            _pendingRun = () => searchQuerySerialized(query).then(resolve);
            _pendingCancel = () => resolve(null);
        });
    }
    _ipcInFlight = true;
    try {
        return await window.electron.searchQuery(query);
    } finally {
        _ipcInFlight = false;
        if (_pendingRun) {
            const run = _pendingRun;
            _pendingRun = null;
            _pendingCancel = null;
            run();
        }
    }
}

// Cache for app launch stack to avoid repeated parsing
let cachedAppLaunchStack: string[] | null = null;
let lastAppLaunchStackFetch = 0;
const APP_LAUNCH_CACHE_DURATION = 5000; // 5 seconds

async function getAppLaunchStack(): Promise<string[]> {
    const now = Date.now();
    if (cachedAppLaunchStack && (now - lastAppLaunchStackFetch) < APP_LAUNCH_CACHE_DURATION) {
        return cachedAppLaunchStack;
    }

    const stack = JSON.parse((await window.electronStore.get("appLaunchStack")) ?? "[]");
    cachedAppLaunchStack = stack;
    lastAppLaunchStackFetch = now;
    return stack;
}

// Optimized sorting function
function sortAppsByLaunchHistory(apps: SearchQueryT[], appLaunchStack: string[]): SearchQueryT[] {
    // Create a map for O(1) lookup instead of indexOf which is O(n)
    const stackIndexMap = new Map<string, number>();
    appLaunchStack.forEach((name, index) => {
        stackIndexMap.set(name, index);
    });

    return apps.sort((a, b) => {
        const indexA = stackIndexMap.get(a.name);
        const indexB = stackIndexMap.get(b.name);

        if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
        if (indexA !== undefined) return -1;
        if (indexB !== undefined) return 1;
        return 0;
    });
}

// Optimized best match finder
function findBestMatch(
    items: SearchQueryT[],
    query: string,
    launchStack?: string[]
): SearchQueryT | undefined {
    const lowerQuery = query.toLowerCase();
    const matches = items.filter(item => item.name.toLowerCase().startsWith(lowerQuery));

    if (matches.length === 0) return undefined;
    if (matches.length === 1) return matches[0];

    // If we have launch history, use it
    if (launchStack && launchStack.length > 0) {
        const filteredStack = launchStack.filter(name =>
            name.toLowerCase().startsWith(lowerQuery)
        );

        if (filteredStack.length > 0) {
            // Find the most recently used match
            let best = matches[0];
            let bestIndex = launchStack.lastIndexOf(best.name);

            for (const match of matches.slice(1)) {
                const index = launchStack.lastIndexOf(match.name);
                if (index !== -1 && (bestIndex === -1 || index > bestIndex)) {
                    best = match;
                    bestIndex = index;
                }
            }

            return bestIndex !== -1 ? best : matches[0];
        }
    }

    return matches[0];
}

async function getQueryData({ query, setBestMatch, searchQueryFilters }: QueryData) {
    window.electron.log(`Querying : ${query}`);

    const start = performance.now();

    const queryData = await searchQuerySerialized(query);
    if (!queryData) return null; // superseded by a newer query

    const fetchTime = performance.now();
    console.log(`Data fetch: ${(fetchTime - start).toFixed(2)}ms`);

    let apps: SearchQueryT[] = queryData.apps;
    const allFilesAndFolders = queryData.files;
    const settings = queryData.settings;
    const commands = queryData.commands;

    // Split files and folders once
    const downloadFiles = allFilesAndFolders.filter(item => item.type === "file");
    const downloadFolders = allFilesAndFolders.filter(item => item.type === "folder");

    const splitTime = performance.now();
    console.log(`Split files/folders: ${(splitTime - fetchTime).toFixed(2)}ms`);

    let bestMatch: SearchQueryT | null = null;
    let filteredCommands = commands;
    let filteredSettings = settings;

    // Process apps if available
    if (apps.length > 0 && searchQueryFilters[0]) {
        const appLaunchStack = await getAppLaunchStack();
        apps = sortAppsByLaunchHistory(apps, appLaunchStack);

        const best = findBestMatch(apps, query, appLaunchStack);
        if (best) {
            bestMatch = best;
            // Remove best match from apps list
            apps = apps.filter(app => app !== best);
        }

        const appProcessTime = performance.now();
        console.log(`App processing: ${(appProcessTime - splitTime).toFixed(2)}ms`);
    }
    // Process commands if no app match
    else if (filteredCommands.length > 0 && searchQueryFilters[3]) {
        const best = findBestMatch(filteredCommands, query);
        if (best) {
            bestMatch = best;
            filteredCommands = filteredCommands.filter(cmd => cmd !== best);
        }
    }
    // Process settings if no command match
    else if (filteredSettings.length > 0 && searchQueryFilters[3]) {
        const best = findBestMatch(filteredSettings, query);
        if (best) {
            bestMatch = best;
            filteredSettings = filteredSettings.filter(setting => setting !== best);
        }
    }
    // Process folders if no setting match
    else if (downloadFolders.length > 0 && searchQueryFilters[2]) {
        const best = findBestMatch(downloadFolders, query);
        if (best) {
            bestMatch = best;
            const index = downloadFolders.indexOf(best);
            if (index > -1) {
                downloadFolders.splice(index, 1);
            }
        }
    }
    // Process files if no folder match
    else if (downloadFiles.length > 0 && searchQueryFilters[1]) {
        const best = findBestMatch(downloadFiles, query);
        if (best) {
            bestMatch = best;
            const index = downloadFiles.indexOf(best);
            if (index > -1) {
                downloadFiles.splice(index, 1);
            }
        }
    }

    setBestMatch(bestMatch);

    const totalTime = performance.now() - start;
    window.electron.log(`Query processing: ${totalTime.toFixed(2)}ms`);

    return {
        apps,
        folders: downloadFolders,
        files: downloadFiles,
        commands: filteredCommands,
        settings: filteredSettings,
    };
}

function getNameFromPath(path: string): string {
    const lastSlashIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return lastSlashIndex === -1 ? path : path.substring(lastSlashIndex + 1);
}

// Utility to clear cache if needed (call when app launch stack updates)
export function clearAppLaunchCache() {
    cachedAppLaunchStack = null;
}

export { getQueryData, getNameFromPath };