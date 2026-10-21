import { ipcMain, dialog } from "electron";
import { sanitiseCommand } from "../universal/commandSchema.js";
import { openExternalSafely } from "./electron.ipc.js";
import {searchApps, searchCommands, searchSettings} from "../universal/search.js";
import {fetchFavicon} from "../universal/linkFavicon.js";
import {addCustomCommand, updateCustomCommand, removeCustomCommand, getCustomCommands, newCommandsFrom} from "../universal/startup.js";
import {launchApp, getAppLogo, getUwpAppIcon, getSteamGameIcon, executeCommand} from "../platform.js";
import fs from "fs";

export function registerAppsIpc({
                                    mainWindow,
                                    cache,
                                    appStates,
                                    hideMainWindow,
                                    store,
                                    launchHotkeys,
                                }) {
    ipcMain.handle("search-apps", (_, query) => {
        return searchApps(cache.appCache, query);
    });

    ipcMain.handle("search-settings", (_, query) => {
        return searchSettings(query);
    });

    ipcMain.handle("search-commands", (_, query) => {
        return searchCommands(cache.commandsCache, query);
    })

    ipcMain.handle("get-custom-commands", () => {
        return getCustomCommands(store);
    });

    ipcMain.handle("get-preset-commands", () => {
        const all = cache.commandsCache ?? [];
        return all
            .filter(c => c.source === "predefined")
            .map(({ _normalized, ...rest }) => rest);
    });

    // Both reject with a readable message (duplicate name, missing fields)
    // that the settings page shows as-is.
    ipcMain.handle("add-custom-command", (_, command) => {
        return addCustomCommand(cache, store, command);
    });

    ipcMain.handle("update-custom-command", (_, originalName, updatedCommand) => {
        return updateCustomCommand(cache, store, originalName, updatedCommand);
    });

    ipcMain.handle("remove-custom-command", (_, commandName) => {
        return removeCustomCommand(cache, store, commandName);
    });

    /**
     * Holds the launcher open and un-pinned while a native dialog is up, and
     * always puts it back — left set, the window could never hide again.
     */
    const withDialog = async (show) => {
        appStates.fixWindowOpen = true;
        appStates.dialogOpen = true;
        mainWindow.setAlwaysOnTop(false);
        try {
            return await show();
        } finally {
            mainWindow.setAlwaysOnTop(true);
            mainWindow.focus();
            appStates.dialogOpen = false;
            appStates.fixWindowOpen = false;
        }
    };

    ipcMain.handle("import-script-file", async () => {
        const result = await withDialog(() => dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [
                { name: "Scripts", extensions: ["ps1", "bat", "cmd", "sh", "vbs"] },
                { name: "All Files", extensions: ["*"] }
            ]
        }));
        if (result.canceled || !result.filePaths.length) return null;
        try {
            const filePath = result.filePaths[0];
            const content = fs.readFileSync(filePath, "utf-8");
            const fileName = filePath.replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");
            return { content, fileName, filePath };
        } catch {
            return null;
        }
    });

    // Parses and validates only. The renderer shows the result for review and
    // saves what the person confirms through add-custom-command, so an import
    // file can't put anything in the list unseen. null means cancelled; a bad
    // file rejects with the reason.
    ipcMain.handle("import-commands-file", async () => {
        const result = await withDialog(() => dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "JSON Files", extensions: ["json"] }]
        }));
        if (result.canceled || !result.filePaths.length) return null;
        let parsed;
        try {
            parsed = JSON.parse(fs.readFileSync(result.filePaths[0], "utf-8"));
        } catch (err) {
            throw new Error(`Couldn't read that file: ${err?.message ?? err}`);
        }
        const commands = Array.isArray(parsed) ? parsed : [parsed];
        // Same validator the AI drafting path uses — one way in.
        if (!commands.some(c => sanitiseCommand(c))) {
            throw new Error("The file doesn't contain any valid commands.");
        }
        return newCommandsFrom(store, commands);
    });

    ipcMain.handle("export-commands-file", async () => {
        const customCommands = getCustomCommands(store);
        if (!customCommands.length) return false;
        const result = await withDialog(() => dialog.showSaveDialog({
            defaultPath: "commands.json",
            filters: [{ name: "JSON Files", extensions: ["json"] }]
        }));
        if (result.canceled || !result.filePath) return false;
        try {
            fs.writeFileSync(result.filePath, JSON.stringify(customCommands, null, 2), "utf-8");
        } catch (err) {
            throw new Error(`Couldn't save the file: ${err?.message ?? err}`);
        }
        return true;
    });

    ipcMain.handle("launch-app", async (_, app, admin = false) => {
        const opened = await launchApp(app, admin);
        if (opened) hideMainWindow();
        return opened;
    });

    // Every entry in data/settings.json is an ms-settings: URI. Nothing else
    // should reach the OS through this channel.
    ipcMain.handle("open-setting", (_, setting) => {
        return openExternalSafely(setting, new Set(["ms-settings:"]));
    });

    // `handle`, not `on`: the renderer needs the outcome so it can report it and
    // avoid re-running. Dismissing on success mirrors launching an app.
    //
    // Only the name is taken from the renderer. The script that runs is the
    // one in the command list, so nothing the renderer sends can be executed
    // unless it was already saved there.
    ipcMain.handle("execute-command", async (_, requested, argValues) => {
        const all = cache.commandsCache ?? [];
        const command = all.find(c => c.name === requested?.name && c.source === requested?.source)
            ?? all.find(c => c.name === requested?.name);
        if (!command) {
            return { ok: false, detail: `No command named "${requested?.name ?? ""}" exists.` };
        }
        const values = {};
        if (argValues && typeof argValues === "object") {
            for (const arg of command.args ?? []) {
                if (argValues[arg.name] != null) values[arg.name] = String(argValues[arg.name]);
            }
        }
        const result = await executeCommand(command, values);
        if (result?.ok) hideMainWindow();
        return result ?? { ok: false, detail: "No result" };
    });

    ipcMain.handle("get-launch-hotkeys", () => launchHotkeys.list());

    // Answers null when the hotkey took, otherwise a message the settings row
    // shows as-is. An empty combo clears it.
    ipcMain.handle("set-launch-hotkey", (_, target, combo) => {
        return launchHotkeys.set(target, typeof combo === "string" ? combo : "");
    });

    ipcMain.handle("get-app-logo", (_, app) => {
        return getAppLogo(app, cache.appIconsCache);
    });

    ipcMain.handle("get-uwp-app-logo", (_, appName) => {
        return getUwpAppIcon(appName, cache.appIconsCache);
    });

    ipcMain.handle("get-steam-game-logo", (_, appId) => {
        return getSteamGameIcon(appId, cache.steamPath);
    });

    ipcMain.handle("get-link-favicon", (_, link) => {
        return fetchFavicon(link);
    });
}
