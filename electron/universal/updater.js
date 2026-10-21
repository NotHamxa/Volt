import { dialog, ipcMain } from "electron";
import pkg from "electron-updater";

const { autoUpdater } = pkg;

export function setupAutoUpdater(mainWindow) {
    if (!mainWindow) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.disableDifferentialDownload = true;

    // On quit the window can be torn down before the updater's last event.
    const send = (channel, payload) => {
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
    };

    autoUpdater.on("checking-for-update", () => {
        console.log("Checking for updates...");
    });

    autoUpdater.on("update-available", () => {
        console.log("Update available, downloading...");
    });

    autoUpdater.on("update-not-available", () => {
        send("update-not-available");
        console.log("No updates found");
    });

    // Without this the renderer never hears about a failure and sits on
    // "Checking" (or a download percentage) forever.
    autoUpdater.on("error", (err) => {
        console.error("Error:", err);
        send("update-error", { message: err?.message ?? String(err) });
    });

    autoUpdater.on("download-progress", (progress) => {
        send("update-progress", {
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total,
        });
    });
    autoUpdater.on("update-downloaded", () => {
        send("update-downloaded");
    });

    ipcMain.on("quit-and-install", () => {
        autoUpdater.quitAndInstall(true, true);
    });

    // The "error" event above has already told the renderer; this only keeps
    // the rejection from going unhandled.
    autoUpdater.checkForUpdates().catch(err => console.error("Update check failed:", err?.message ?? err));
}

/**
 * Starts a check. Resolves with whether one actually began: electron-updater
 * quietly skips unpackaged builds (resolving null, with no event to follow),
 * and a failure is reported here as well as through "update-error".
 */
export async function checkForUpdates() {
    try {
        const result = await autoUpdater.checkForUpdates();
        if (!result) return { ok: false, message: "Updates are only checked in the installed app." };
        return { ok: true };
    } catch (err) {
        console.error("Update check failed:", err?.message ?? err);
        return { ok: false, message: err?.message ?? "Couldn't check for updates." };
    }
}
