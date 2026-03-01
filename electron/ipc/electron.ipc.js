import { app, ipcMain, shell } from "electron";
import { getGoogleSuggestions } from "../utils/autoSuggestion.js";
import { executeUserCommand } from "../utils/cmd.js";
import { processSearchQuery } from "../utils/search.js";

export function registerElectronIpc({ hideMainWindow, cache, store }) {
    ipcMain.on("log", (_, data) => console.log(data));

    ipcMain.handle("search-query", (_, query, searchFilters = []) => {
        return processSearchQuery(
            cache.appCache,
            cache.cachedFoldersData,
            store.get("appLaunchStack"),
            query,
            searchFilters,
        );
    });

    ipcMain.handle("get-google-suggestions", (_, query) => {
        return getGoogleSuggestions(query);
    });

    ipcMain.on("open-external", async (_, url) => {
        await shell.openExternal(url);
        hideMainWindow();
    });

    ipcMain.handle("get-loading-cache-status", () => {
        return cache.loadingAppCache;
    });

    ipcMain.on("execute-cmd", async (_, cmd) => {
        executeUserCommand(cmd);
    });

    ipcMain.on("open-uninstall", async () => {
        try {
            await shell.openExternal("ms-settings:appsfeatures");
            return true;
        } catch {
            return false;
        }
    });

    ipcMain.handle("get-open-on-startup", () => {
        return app.getLoginItemSettings().openAtLogin;
    });

    ipcMain.handle("set-open-on-startup", (_, enabled) => {
        app.setLoginItemSettings({ openAtLogin: enabled });
        store.set("openOnStartup", enabled);
        return true;
    });
}
