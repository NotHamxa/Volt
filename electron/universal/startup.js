import { cacheFolder } from "./folderCache.js";
import { app } from "electron";
import Store from "electron-store";
import defaultCommands from "../data/commands.json" with { type: 'json' };

const store = new Store();

// Synchronous, fast: reads flags + handles first-time / version-change so the
// window can be shown/hidden and the update modal can be computed before the
// slow caching work runs.
export function initStoreState(cache) {
    cache.firstTimeExperience = store.get("firstTimeExperience") ?? true;
    cache.cachedFolders = JSON.parse(store.get("cachedFolders") ?? "[]");

    if (!store.get("version")) {
        store.set("version", app.getVersion());
        store.set("showIntroModal", "true");
    }

    const storedVersion = store.get("version");
    const currentVersion = app.getVersion();
    if (storedVersion && storedVersion !== currentVersion && !cache.firstTimeExperience) {
        cache.showUpdateModal = true;
        cache.previousVersion = storedVersion;
        store.set("version", currentVersion);
    } else {
        cache.showUpdateModal = false;
    }

    if (cache.firstTimeExperience) {
        const desktopPath = app.getPath("desktop");
        const downloadsPath = app.getPath("downloads");
        cache.cachedFolders.push(desktopPath);
        cache.cachedFolders.push(downloadsPath);
        store.set("cachedFolders", JSON.stringify(cache.cachedFolders));
        store.set("showIntroModal", "true");
        store.set("firstTimeExperience", false);
        store.set("version", currentVersion);
        if (process.env.NODE_ENV !== "development") {
            app.setLoginItemSettings({ openAtLogin: true });
            store.set("openOnStartup", true);
        }
    }
}

export async function loadFolderCache(cache) {
    for (const path of cache.cachedFolders) {
        await cacheFolder(path, cache, false);
    }
}

export function loadCommandsData(cache, store) {
    const customCommands = JSON.parse(store.get("customCommands") ?? "[]");
    cache.commandsCache = [...defaultCommands, ...customCommands];
}

export function addCustomCommand(cache, store, command) {
    const customCommands = JSON.parse(store.get("customCommands") ?? "[]");
    customCommands.push(command);
    store.set("customCommands", JSON.stringify(customCommands));
    cache.commandsCache = [...defaultCommands, ...customCommands];
    return cache.commandsCache;
}

export function removeCustomCommand(cache, store, commandName) {
    let customCommands = JSON.parse(store.get("customCommands") ?? "[]");
    customCommands = customCommands.filter(c => c.name !== commandName);
    store.set("customCommands", JSON.stringify(customCommands));
    cache.commandsCache = [...defaultCommands, ...customCommands];
    return cache.commandsCache;
}

export function getCustomCommands(store) {
    return JSON.parse(store.get("customCommands") ?? "[]");
}

export function importCustomCommands(cache, store, commands) {
    const customCommands = JSON.parse(store.get("customCommands") ?? "[]");
    const existingNames = new Set(customCommands.map(c => c.name));
    const newCommands = commands.filter(c => !existingNames.has(c.name));
    customCommands.push(...newCommands);
    store.set("customCommands", JSON.stringify(customCommands));
    cache.commandsCache = [...defaultCommands, ...customCommands];
    return cache.commandsCache;
}
