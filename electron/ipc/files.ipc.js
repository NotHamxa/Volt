import { ipcMain, shell, dialog } from "electron";
import {searchFilesAndFolders} from "../universal/search.js";
import {cacheFolder, deleteFolder} from "../universal/folderCache.js";
import {openFileWith, copyFileToClipboard} from "../platform.js";

export function registerFilesIpc({
                                     mainWindow,
                                     cache,
                                     appStates,
                                     folderWatcher,
                                     hideMainWindow,
                                 }) {
    // baseDir is accepted for call-site compatibility but unused: the cache is
    // already keyed by indexed root, and every caller passes the full set.
    ipcMain.handle("search-files", (_, _baseDir, query) => {
        return searchFilesAndFolders(query, cache.cachedFoldersData);
    });

    ipcMain.handle("get-folder-file-counts", () => {
        const counts = {};
        for (const [folder, files] of Object.entries(cache.cachedFoldersData)) {
            counts[folder] = Array.isArray(files) ? files.length : 0;
        }
        return counts;
    });

    ipcMain.on("open-path", async (_, filePath) => {
        await shell.openPath(filePath);
        hideMainWindow();
    });

    ipcMain.on("open-in-explorer", (_, filePath) => {
        shell.showItemInFolder(filePath);
        hideMainWindow();
    });

    ipcMain.on("open-file-with", async (_, filePath) => {
        openFileWith(filePath);
    });

    // Puts the actual file (not its path) on the clipboard so it can be pasted
    // into a file manager, an upload dialog, or apps like Claude.
    ipcMain.on("copy-file-clipboard", (_, filePath) => {
        copyFileToClipboard(filePath);
    });

    ipcMain.handle("set-folder-dialog-open", (_, isOpen) => {
        appStates.fixWindowOpen = isOpen;
        mainWindow.setAlwaysOnTop(!isOpen);
    });

    ipcMain.handle("show-folder-dialog", async () => {
        appStates.fixWindowOpen = true;
        appStates.dialogOpen = true;
        mainWindow.setAlwaysOnTop(false);
        const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
        mainWindow.setAlwaysOnTop(true);
        mainWindow.focus();
        appStates.dialogOpen = false;
        appStates.fixWindowOpen = false;
        return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.handle("cache-folder", async (_, folderPath) => {
        const ok = await cacheFolder(folderPath, cache);
        if (ok) folderWatcher.add(folderPath);
        return ok;
    });

    ipcMain.handle("delete-folder", (_, folderPath) => {
        return deleteFolder(folderPath, cache);
    });

}
