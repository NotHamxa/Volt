import { dialog, ipcMain } from "electron";
import pkg from "electron-updater";

const { autoUpdater } = pkg;

export function setupAutoUpdater(mainWindow) {
    if (!mainWindow) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("checking-for-update", () => {
        console.log("Checking for updates...");
    });

    autoUpdater.on("update-available", () => {
        console.log("Update available, downloading...");
    });

    autoUpdater.on("update-not-available", () => {
        mainWindow.webContents.send("update-not-available");
        console.log("No updates found");
    });

    autoUpdater.on("error", (err) => {
        console.error("Error:", err);
    });

    autoUpdater.on("download-progress", (progress) => {
        mainWindow.webContents.send("update-progress", {
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total,
        });
    });
    autoUpdater.on("update-downloaded", () => {
        mainWindow.webContents.send("update-downloaded");
    });

    ipcMain.on("quit-and-install", () => {
        autoUpdater.quitAndInstall(true, true);
    });

    autoUpdater.checkForUpdates();
}
export function checkForUpdates() {
    autoUpdater.checkForUpdates();
}
