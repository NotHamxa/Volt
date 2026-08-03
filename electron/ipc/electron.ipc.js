import { app, ipcMain, shell } from "electron";
import { getGoogleSuggestions } from "../universal/autoSuggestion.js";
import { processSearchQuery } from "../universal/search.js";
import { loadUsage } from "../universal/usage.js";
import { showNotification } from "../universal/notification.js";
import { checkForUpdates } from "../universal/updater.js";
import { executeUserCommand } from "../platform.js";

// shell.openExternal hands the string to the OS, which on Windows will launch
// any registered protocol handler — not just a browser. Everything the renderer
// legitimately opens is a web link, so anything else is rejected.
const EXTERNAL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function openExternalSafely(rawUrl, allowedSchemes) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) return false;
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        console.warn("Blocked openExternal for unparseable URL:", rawUrl);
        return false;
    }
    if (!allowedSchemes.has(parsed.protocol)) {
        console.warn("Blocked openExternal for disallowed scheme:", parsed.protocol);
        return false;
    }
    shell.openExternal(parsed.href).catch(err =>
        console.error("openExternal failed:", err?.message ?? err)
    );
    return true;
}

export { openExternalSafely };

export function registerElectronIpc({ hideMainWindow, cache, store }) {
    ipcMain.on("log", (_, data) => console.log(data));

    ipcMain.on("notify", (_, title, message) => {
        showNotification({ title, message });
    });

    ipcMain.handle("search-query", (_, query, searchFilters = []) => {
        return processSearchQuery(
            cache.appCache,
            cache.commandsCache,
            cache.cachedFoldersData,
            loadUsage(),
            query,
            searchFilters,
        );
    });

    ipcMain.handle("get-google-suggestions", (_, query) => {
        return getGoogleSuggestions(query);
    });

    ipcMain.on("open-external", (_, url) => {
        if (openExternalSafely(url, EXTERNAL_SCHEMES)) hideMainWindow();
    });

    ipcMain.handle("get-loading-cache-status", () => {
        return {
            loading: cache.loadingAppCache,
            current: cache.cacheProgress?.current ?? 0,
            total: cache.cacheProgress?.total ?? 0,
        };
    });

    ipcMain.on("execute-cmd", (_, cmd) => {
        if (executeUserCommand(cmd)) hideMainWindow();
    });

    ipcMain.on("open-uninstall", async () => {
        try {
            await shell.openExternal("ms-settings:appsfeatures");
            return true;
        } catch {
            return false;
        }
    });

    ipcMain.handle("get-app-version", () => {
        return app.getVersion();
    });

    ipcMain.handle("get-open-on-startup", () => {
        return app.getLoginItemSettings().openAtLogin;
    });

    ipcMain.handle("set-open-on-startup", (_, enabled) => {
        app.setLoginItemSettings({ openAtLogin: enabled });
        store.set("openOnStartup", enabled);
        return true;
    });

    ipcMain.handle("check-for-updates", () => {
        checkForUpdates();
        return true;
    });

    ipcMain.handle("get-update-modal-info", () => {
        if (cache.showUpdateModal) {
            cache.showUpdateModal = false;
            return { show: true, previousVersion: cache.previousVersion, currentVersion: app.getVersion() };
        }
        return { show: false };
    });
}
