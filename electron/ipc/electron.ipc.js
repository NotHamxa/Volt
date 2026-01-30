import { ipcMain, shell } from "electron";
import {getGoogleSuggestions} from "../utils/autoSuggestion.js";
import {executeUserCommand} from "../utils/cmd.js";

export function registerElectronIpc({
                                        hideMainWindow,
                                        cache,
                                    }) {
    ipcMain.on("log", (_, data) => console.log(data));

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
}
