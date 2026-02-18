import path from "path";
import os from "os";
import settings from "../data/settings.json" with { type: 'json' };
import commands from "../data/commands.json" with { type: 'json' };

const normaliseString = (str) => str.toLowerCase().replace(/\s+/g, "");

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
            if (!item._normalized) item._normalized = normaliseString(item.name);
            if (item._normalized.startsWith(query)) startMatches.push(item);
            else if (item._normalized.includes(query)) includeMatches.push(item);
        }
    }

    return [...startMatches, ...includeMatches];
}

export function searchQuery(appCache, cachedFolderData, query) {
    const q = normaliseString(query).trim();
    if (!q) return { apps: [], settings: [], commands: [], files: [] };

    return {
        apps:     searchApps(appCache, q),
        settings: searchSettings(q),
        commands: searchCommands(q),
        files:    searchFilesAndFolders(q, cachedFolderData),
    };
}