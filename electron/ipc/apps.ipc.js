import { ipcMain, shell, dialog } from "electron";
import {searchApps, searchCommands, searchSettings} from "../utils/search.js";
import {launchApp} from "../utils/apps/launchApp.js";
import {getAppLogo} from "../utils/apps/appLogo.js";
import {getUwpAppIcon} from "../utils/apps/uwpAppLogo.js";
import {fetchFavicon} from "../utils/linkFavicon.js";
import {executeCommand} from "../utils/runCommand.js";
import {addCustomCommand, removeCustomCommand, getCustomCommands, importCustomCommands} from "../utils/startup.js";
import fs from "fs";

export function registerAppsIpc({
                                    cache,
                                    hideMainWindow,
                                    store,
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

    ipcMain.handle("add-custom-command", (_, command) => {
        return addCustomCommand(cache, store, command);
    });

    ipcMain.handle("remove-custom-command", (_, commandName) => {
        return removeCustomCommand(cache, store, commandName);
    });

    ipcMain.handle("import-commands-file", async () => {
        const result = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "JSON Files", extensions: ["json"] }]
        });
        if (result.canceled || !result.filePaths.length) return null;
        try {
            const content = fs.readFileSync(result.filePaths[0], "utf-8");
            const parsed = JSON.parse(content);
            const commands = Array.isArray(parsed) ? parsed : [parsed];
            const validated = commands.filter(c => c.name && c.path).map(c => ({
                name: c.name,
                type: c.type === "commandConfirm" ? "commandConfirm" : "command",
                appId: null,
                path: c.path,
                source: "custom"
            }));
            if (!validated.length) return null;
            importCustomCommands(cache, store, validated);
            return validated;
        } catch {
            return null;
        }
    });

    ipcMain.handle("export-commands-file", async () => {
        const customCommands = getCustomCommands(store);
        if (!customCommands.length) return false;
        const result = await dialog.showSaveDialog({
            defaultPath: "commands.json",
            filters: [{ name: "JSON Files", extensions: ["json"] }]
        });
        if (result.canceled || !result.filePath) return false;
        const exportData = customCommands.map(({ _normalized, ...rest }) => rest);
        fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), "utf-8");
        return true;
    });

    ipcMain.handle("update-custom-command", (_, originalName, updatedCommand) => {
        let customCommands = JSON.parse(store.get("customCommands") ?? "[]");
        const idx = customCommands.findIndex(c => c.name === originalName);
        if (idx === -1) return null;
        customCommands[idx] = updatedCommand;
        store.set("customCommands", JSON.stringify(customCommands));
        const defaultCmds = JSON.parse(JSON.stringify(cache.commandsCache.filter(c => c.source !== "custom")));
        cache.commandsCache = [...defaultCmds, ...customCommands];
        return cache.commandsCache;
    });

    ipcMain.handle("launch-app", async (_, app, admin = false) => {
        const opened = await launchApp(app, admin);
        if (opened) hideMainWindow();
        return opened;
    });

    ipcMain.handle("open-setting", async (_, setting) => {
        await shell.openExternal(setting);
        return true;
    });

    ipcMain.on("execute-command", async (_, command) => {
        return await executeCommand(command);
    });

    ipcMain.handle("get-app-logo", (_, app) => {
        return getAppLogo(app, cache.appIconsCache);
    });

    ipcMain.handle("get-uwp-app-logo", (_, appName) => {
        return getUwpAppIcon(appName, cache.appIconsCache);
    });

    ipcMain.handle("get-link-favicon", (_, link) => {
        return fetchFavicon(link);
    });
}
