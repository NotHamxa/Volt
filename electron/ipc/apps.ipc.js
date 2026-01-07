import { ipcMain, shell } from "electron";
import {searchApps, searchSettings} from "../utils/search.js";
import {launchApp} from "../utils/launchApp.js";
import {getAppLogo} from "../utils/appLogo.js";
import {getUwpAppIcon} from "../utils/uwpAppLogo.js";
import {fetchFavicon} from "../utils/linkFavicon.js";

export function registerAppsIpc({
                                    cache,
                                    hideMainWindow,
                                }) {
    ipcMain.handle("search-apps", (_, query) => {
        return searchApps(cache.appCache, query);
    });

    ipcMain.handle("search-settings", (_, query) => {
        return searchSettings(query);
    });

    ipcMain.handle("launch-app", async (_, app, admin = false) => {
        const opened = await launchApp(app, admin);
        if (opened) hideMainWindow();
        return opened;
    });

    ipcMain.on("open-setting", (_, setting) => {
        shell.openExternal(setting);
    });

    ipcMain.on("launch-command", async (_, command) => {

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
