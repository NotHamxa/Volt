import { cacheFolder } from "./folderCache.js";
import { app } from "electron";
import Store from "electron-store";
import defaultCommands from "../data/commands.json" with { type: 'json' };
import { sanitiseCommand, commandNameKey } from "./commandSchema.js";

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
    const customCommands = getCustomCommands(store);
    cache.commandsCache = [...defaultCommands, ...customCommands];
}

function saveCustomCommands(cache, store, customCommands) {
    store.set("customCommands", JSON.stringify(customCommands));
    cache.commandsCache = [...defaultCommands, ...customCommands];
    return cache.commandsCache;
}

/**
 * Names are how commands are found, run and edited, so two that differ only
 * in case would be indistinguishable. Built-ins count too.
 */
function assertNameFree(customCommands, name, ignoreIndex = -1) {
    const key = commandNameKey(name);
    const builtIn = defaultCommands.find(c => commandNameKey(c.name) === key);
    if (builtIn) throw new Error(`"${builtIn.name}" is a built-in command. Choose another name.`);
    const clash = customCommands.find((c, i) => i !== ignoreIndex && commandNameKey(c.name) === key);
    if (clash) throw new Error(`A command named "${clash.name}" already exists.`);
}

// Throws with a message meant for the person saving: the IPC layer passes it
// to the renderer as the rejection.
export function addCustomCommand(cache, store, raw) {
    const command = sanitiseCommand(raw);
    if (!command) throw new Error("A command needs a name and a script.");
    const customCommands = getCustomCommands(store);
    assertNameFree(customCommands, command.name);
    customCommands.push(command);
    return saveCustomCommands(cache, store, customCommands);
}

/** null when there's no custom command by that name to update. */
export function updateCustomCommand(cache, store, originalName, raw) {
    const customCommands = getCustomCommands(store);
    const idx = customCommands.findIndex(c => c.name === originalName);
    if (idx === -1) return null;
    const command = sanitiseCommand(raw);
    if (!command) throw new Error("A command needs a name and a script.");
    // Only a rename is checked: a clash saved before names had to be unique
    // shouldn't stop someone fixing the script.
    if (commandNameKey(command.name) !== commandNameKey(originalName)) {
        assertNameFree(customCommands, command.name, idx);
    }
    customCommands[idx] = command;
    return saveCustomCommands(cache, store, customCommands);
}

export function removeCustomCommand(cache, store, commandName) {
    const customCommands = getCustomCommands(store).filter(c => c.name !== commandName);
    return saveCustomCommands(cache, store, customCommands);
}

// Stored before sanitising existed, or edited by hand, either way, only
// well-formed commands make it into the running list.
export function getCustomCommands(store) {
    let stored;
    try {
        stored = JSON.parse(store.get("customCommands") ?? "[]");
    } catch {
        stored = [];
    }
    return Array.isArray(stored) ? stored.map(sanitiseCommand).filter(Boolean) : [];
}

/**
 * The commands from an import file that would actually be new: valid, first
 * of their name within the file, and not clashing with a built-in or an
 * existing custom command. Nothing is saved here, the renderer shows these
 * for review and adds the ones the person confirms.
 */
export function newCommandsFrom(store, rawCommands) {
    const taken = new Set([...defaultCommands, ...getCustomCommands(store)].map(c => commandNameKey(c.name)));
    const fresh = [];
    for (const command of rawCommands.map(sanitiseCommand).filter(Boolean)) {
        const key = commandNameKey(command.name);
        if (taken.has(key)) continue;
        taken.add(key);
        fresh.push(command);
    }
    return fresh;
}
