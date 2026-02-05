import { ipcMain, shell, dialog } from "electron";
import fs from "fs";
import path from "path";
import {searchFilesAndFolders} from "../utils/search.js";
import {cacheFolder, deleteFolder} from "../utils/cache.js";
import {Jimp} from "jimp";
import {openFileWith} from "../utils/openFileWith.js";

export function registerFilesIpc({
                                     mainWindow,
                                     cache,
                                     appStates,
                                     folderWatcher,
                                     hideMainWindow,
                                 }) {
    ipcMain.handle("search-files", (_,query) => {
        return searchFilesAndFolders(query, cache.cachedFoldersData);
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

    ipcMain.handle("select-folder", async () => {
        appStates.fixWindowOpen = true;
        const result = await dialog.showOpenDialog(mainWindow,{
            title: "Select Folder",
            properties: ["openDirectory"],
        });
        const dirPath = result.filePaths?.[0];
        mainWindow.focus()
        appStates.fixWindowOpen = false;
        if (!dirPath) return null;
        return dirPath;
    });

    ipcMain.handle("cache-folder", async (_, folderPath) => {
        const ok = await cacheFolder(folderPath, cache);
        if (ok) folderWatcher.add(folderPath);
        return ok;
    });

    ipcMain.handle("delete-folder", (_, folderPath) => {
        return deleteFolder(folderPath, cache);
    });

    ipcMain.handle("get-image-b64", async (_, imgPath, width = 50) => {
        try {
            const resolved = path.resolve(imgPath);
            if (!fs.existsSync(resolved)) return null;

            const image = await Jimp.read(resolved);
            image.resize(width, Jimp.AUTO).quality(30);
            const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);

            return `data:image/jpeg;base64,${buffer.toString("base64")}`;
        } catch {
            return null;
        }
    });
}
