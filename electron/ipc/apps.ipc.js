import { ipcMain, shell } from "electron";
import {searchApps, searchCommands, searchSettings} from "../utils/search.js";
import {launchApp} from "../utils/apps/launchApp.js";
import {getAppLogo} from "../utils/apps/appLogo.js";
import {getUwpAppIcon} from "../utils/apps/uwpAppLogo.js";
import {fetchFavicon} from "../utils/linkFavicon.js";
import {executeCommand} from "../utils/runCommand.js";

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

    ipcMain.handle("search-commands", (_, query) => {
        return searchCommands(query);
    })

    ipcMain.handle("launch-app", async (_, app, admin = false) => {
        const opened = await launchApp(app, admin);
        if (opened) hideMainWindow();
        return opened;
    });

    ipcMain.on("open-setting", (_, setting) => {
        shell.openExternal(setting);
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
