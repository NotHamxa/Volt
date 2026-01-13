import { dialog } from "electron";
import pkg from "electron-updater";

const { autoUpdater } = pkg;

export function setupAutoUpdater(mainWindow) {
    if (!mainWindow) return;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("checking-for-update", () => {
        console.log("Checking for updates...");
    });

    autoUpdater.on("update-available", () => {
        console.log("Update available");

        dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "Update Available",
            message: "A new version of Volt is available.",
            detail: "Do you want to download it now?",
            buttons: ["Download", "Later"],
            defaultId: 0,
            cancelId: 1,
        }).then(result => {
            if (result.response === 0) {
                autoUpdater.downloadUpdate();
            }
        });
    });

    autoUpdater.on("update-not-available", () => {
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
        dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "Update Ready",
            message: "Update downloaded. Restart to apply it?",
            buttons: ["Restart Now"],
        }).then(() => {
            autoUpdater.quitAndInstall();
        });
    });
    autoUpdater.checkForUpdates();
}
export function checkForUpdates() {
    autoUpdater.checkForUpdates();
}
