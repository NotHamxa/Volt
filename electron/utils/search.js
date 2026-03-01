import path from "path";
import os from "os";
import settings from "../data/settings.json" with { type: 'json' };
import commands from "../data/commands.json" with { type: 'json' };

export const normaliseString = (str) => str.toLowerCase().replace(/\s+/g, "");

const settingsIndex = settings.map(s => ({
    item: s,
    normalized: normaliseString(s.name)
}));

const commandsIndex = commands.map(c => ({
    item: c,
    normalized: normaliseString(c.name)
}));

const userHome = os.homedir();
const SUGGESTED_FOLDERS = [
    { name: "Downloads", type: "folder", path: path.join(userHome, "Downloads"), source: "PreDefined", normalized: "downloads" },
    { name: "Documents", type: "folder", path: path.join(userHome, "Documents"), source: "PreDefined", normalized: "documents" },
    { name: "Desktop",   type: "folder", path: path.join(userHome, "Desktop"),   source: "PreDefined", normalized: "desktop"   },
];

export function searchApps(appCache, query) {
    if (!appCache?.length) return [];
    const results = [];
    for (const app of appCache) {
        if (!app._normalized) app._normalized = normaliseString(app.name);
        if (app._normalized.includes(query)) results.push(app);
    }
    return results;
}

export function searchSettings(query) {
    const results = [];
    for (const { item, normalized } of settingsIndex) {
        if (normalized.includes(query)) results.push(item);
    }
    return results;
}

export function searchCommands(query) {
    const results = [];
    for (const { item, normalized } of commandsIndex) {
        if (normalized.includes(query)) results.push(item);
    }
    return results;
}

export function searchFilesAndFolders(query, cachedFolderData) {
    const startMatches = [];
    const includeMatches = [];
    for (const { normalized } of SUGGESTED_FOLDERS) {
        if (normalized.startsWith(query)) startMatches.push({ ...SUGGESTED_FOLDERS.find(f => f.normalized === normalized) });
    }
    for (const list of Object.values(cachedFolderData)) {
        for (const item of list) {
            if (item.normalisedName.startsWith(query)) startMatches.push(item);
            else if (item.normalisedName.includes(query)) includeMatches.push(item);
        }
    }
    return [...startMatches, ...includeMatches];
}

// ─── processing helpers ──────────────────────────────────────────────────────

function sortByLaunchHistory(apps, stack) {
    if (!stack.length) return apps;
    const idx = new Map();
    stack.forEach((name, i) => idx.set(name, i));
    return apps.sort((a, b) => {
        const ia = idx.get(a.name), ib = idx.get(b.name);
        if (ia !== undefined && ib !== undefined) return ia - ib;
        if (ia !== undefined) return -1;
        if (ib !== undefined) return 1;
        return 0;
    });
}

function findBestMatch(items, query, stack) {
    const lq = query.toLowerCase();
    const matches = items.filter(item => item.name.toLowerCase().startsWith(lq));
    if (!matches.length) return null;
    if (matches.length === 1) return matches[0];

    if (stack?.length) {
        const stackHasMatch = stack.some(n => n.toLowerCase().startsWith(lq));
        if (stackHasMatch) {
            let best = matches[0];
            let bestIdx = stack.lastIndexOf(best.name);
            for (const m of matches.slice(1)) {
                const i = stack.lastIndexOf(m.name);
                if (i !== -1 && (bestIdx === -1 || i > bestIdx)) { best = m; bestIdx = i; }
            }
            return bestIdx !== -1 ? best : matches[0];
        }
    }
    return matches[0];
}

function computeLimit(appsLen, foldersLen, filesLen, settingsLen, commandsLen, filters) {
    const nullSets = [appsLen, foldersLen, filesLen, settingsLen, commandsLen].filter(l => l === 0).length;
    const selected = filters.filter(Boolean).length;
    if (selected >= 3 || nullSets === 1) return 5;
    if (selected === 2 || nullSets === 2) return 7;
    if (selected === 1 || nullSets === 3) return Math.min(Math.max(appsLen, foldersLen, filesLen, settingsLen, commandsLen), 15);
    return 3;
}

const clean = ({ _normalized, ...rest }) => rest;

export function processSearchQuery(appCache, cachedFolderData, rawStack, query, filters) {
    const x = performance.now()
    const q = normaliseString(query).trim();
    if (!q) return { bestMatch: null, apps: [], files: [], folders: [], settings: [], commands: [] };

    const stack = rawStack ? JSON.parse(rawStack) : [];

    let apps     = filters[0] ? searchApps(appCache, q) : [];
    let files    = [];
    let folders  = [];
    if (filters[1] || filters[2]) {
        const allFF = searchFilesAndFolders(q, cachedFolderData);
        if (filters[1]) files   = allFF.filter(f => f.type === "file");
        if (filters[2]) folders = allFF.filter(f => f.type === "folder");
    }
    let settings = filters[3] ? searchSettings(q) : [];
    let commands = filters[4] ? searchCommands(q) : [];

    if (apps.length) apps = sortByLaunchHistory(apps, stack);

    let bestMatch = null;
    if (apps.length && filters[0]) {
        bestMatch = findBestMatch(apps, query, stack);
        if (bestMatch) apps = apps.filter(a => a !== bestMatch);
    } else if (commands.length && filters[4]) {
        bestMatch = findBestMatch(commands, query, null);
        if (bestMatch) commands = commands.filter(c => c !== bestMatch);
    } else if (settings.length && filters[3]) {
        bestMatch = findBestMatch(settings, query, null);
        if (bestMatch) settings = settings.filter(s => s !== bestMatch);
    } else if (folders.length && filters[2]) {
        bestMatch = findBestMatch(folders, query, null);
        if (bestMatch) folders = folders.filter(f => f !== bestMatch);
    } else if (files.length && filters[1]) {
        bestMatch = findBestMatch(files, query, null);
        if (bestMatch) files = files.filter(f => f !== bestMatch);
    }

    const limit = computeLimit(apps.length, folders.length, files.length, settings.length, commands.length, filters);

    const y = performance.now()
    console.log("IPC Search Call: "+(y-x)+"ms")
    return {
        bestMatch: bestMatch ? clean(bestMatch) : null,
        apps:      apps.slice(0, limit).map(clean),
        files:     files.slice(0, limit).map(clean),
        folders:   folders.slice(0, limit).map(clean),
        settings:  settings.slice(0, limit),
        commands:  commands.slice(0, limit),
    };
}
