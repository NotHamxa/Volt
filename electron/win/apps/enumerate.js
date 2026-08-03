import os from "os";
import path from "path";
import fs from "fs";
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
    async function collectShortcuts(dir) {
        if (!fs.existsSync(dir)) return;
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                await collectShortcuts(fullPath);
            } else if ([".lnk"].some(ext => fullPath.toLowerCase().endsWith(ext))) {
                results.push({
                    name: path.basename(fullPath, ".lnk"),
                    source: "StartMenu",
                    appId: "",
                    path: fullPath,
                    type: "app"
                });
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
                    const uwpApps = JSON.parse(trimmed);
                    const appList = Array.isArray(uwpApps) ? uwpApps : [uwpApps];
                    appList.forEach(app => {
                        if (app?.Name && !(app.AppID && app.AppID.startsWith("steam://"))) {
                            results.push({
                                name: app.Name,
                                source: "UWP",
                                appId: app.AppID || "",
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

    const deduped = new Map();
    for (const app of results) {
        const existing = deduped.get(app.name);
        if (!existing || (!existing.path && app.path)) {
            deduped.set(app.name, app);
        }
    }
    return Array.from(deduped.values());
}
