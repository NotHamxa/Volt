import os from "os";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { exec, execFile } from "child_process";

// Locations Volt scans for installed applications. Also watched at runtime so
// newly (un)installed apps refresh the cache. Windows-specific paths.
export const startMenuPaths = [
    path.join(os.homedir(), "AppData/Roaming/Microsoft/Windows/Start Menu/Programs"),
    "C:/ProgramData/Microsoft/Windows/Start Menu/Programs",
    "C:/Users/Public/Desktop"
];

// Alias used by the platform contract (main.js watches these for changes).
export const appWatchPaths = startMenuPaths;

// Resolve a .lnk shortcut to its target executable via WScript.Shell. Kept
// available for callers that need the real target path.
export function resolveLnk(lnkPath) {
    const escapedPath = lnkPath.replace(/'/g, "''");
    return new Promise((resolve, reject) => {
        execFile(
            "powershell.exe",
            [
                "-NoProfile",
                "-Command",
                `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${escapedPath}'); $s.TargetPath`
            ],
            { windowsHide: true, timeout: 10000, encoding: "utf8" },
            (err, stdout) => {
                if (err) return reject(err);
                resolve((stdout || "").trim());
            }
        );
    });
}

export async function loadApps() {
    const results = [];
    // Every filesystem call is guarded individually: this walks hundreds of
    // entries, and a single unreadable file or broken link used to throw all
    // the way out and leave the app cache empty.
    async function collectShortcuts(dir) {
        let items;
        try {
            items = await fsp.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of items) {
            const fullPath = path.join(dir, entry.name);
            try {
                if (entry.isDirectory()) {
                    await collectShortcuts(fullPath);
                } else if (entry.name.toLowerCase().endsWith(".lnk")) {
                    results.push({
                        name: path.basename(entry.name, path.extname(entry.name)),
                        source: "StartMenu",
                        appId: "",
                        path: fullPath,
                        type: "app"
                    });
                }
            } catch (err) {
                console.warn("Skipping unreadable entry:", fullPath, err?.message);
            }
        }
    }
    function collectUWPApps() {
        return new Promise((resolve, reject) => {
            exec('powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-StartApps | ConvertTo-Json"', { timeout: 15000, encoding: "utf8" }, (error, stdout) => {
                if (error) return reject(error);
                const trimmed = (stdout || "").trim();
                if (!trimmed) return resolve();
                try {
                    const startApps = JSON.parse(trimmed);
                    const appList = Array.isArray(startApps) ? startApps : [startApps];
                    appList.forEach(app => {
                        if (app?.Name && !(app.AppID && app.AppID.startsWith("steam://"))) {
                            const appId = app.AppID || "";
                            results.push({
                                name: app.Name,
                                // Get-StartApps returns the whole AppsFolder list, not
                                // just packaged apps. Only an AppID containing "!" is a
                                // real package — mislabelling the rest as UWP sent them
                                // down an icon path that could never resolve them.
                                source: appId.includes("!") ? "UWP" : "StartApps",
                                appId,
                                path: "",
                                type: "app"
                            });
                        }
                    });
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    for (const dir of startMenuPaths) {
        await collectShortcuts(dir);
    }
    try {
        await collectUWPApps();
    } catch (err) {
        console.warn("Failed to collect UWP apps (PowerShell may be unavailable):", err.message);
    }

    // Merge rather than discard: the .lnk gives a launchable path, Get-StartApps
    // gives the AppUserModelID the shell needs to render an icon. Keeping only
    // one of the two threw away half of what each app needs.
    const merged = new Map();
    for (const app of results) {
        const key = app.name.toLowerCase();
        const existing = merged.get(key);
        if (!existing) {
            merged.set(key, { ...app });
            continue;
        }
        if (!existing.path && app.path) existing.path = app.path;
        if (!existing.appId && app.appId) existing.appId = app.appId;
        // A packaged app is the more specific classification, so let it win.
        if (app.source === "UWP") existing.source = "UWP";
        else if (existing.source === "StartApps" && app.source === "StartMenu") existing.source = "StartMenu";
    }
    return Array.from(merged.values());
}
