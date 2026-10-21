import os from "os";
import path from "path";
import fsp from "fs/promises";
import { execFile } from "child_process";

// Locations holding the .lnk files behind Start's desktop-app entries. Watched
// at runtime so newly (un)installed apps refresh the cache. Windows-specific.
export const startMenuPaths = [
    path.join(os.homedir(), "AppData/Roaming/Microsoft/Windows/Start Menu/Programs"),
    "C:/ProgramData/Microsoft/Windows/Start Menu/Programs",
    "C:/Users/Public/Desktop"
];

// Alias used by the platform contract (main.js watches these for changes).
export const appWatchPaths = startMenuPaths;

// Store apps never touch the Start Menu folders, but every package installed
// for the user gets a folder here, removed again on uninstall. Only the top
// level is meaningful: apps write their data further down, constantly.
export const packageWatchPath = path.join(os.homedir(), "AppData/Local/Packages");

// Start runs these at sign-in rather than listing them, and so does AppsFolder.
const isStartupDir = (dir) => /[\\/]Startup$/i.test(dir);

// AppsFolder is the list Start's "All apps" shows: display names rather than
// .lnk file names, uninstallers and Startup items already dropped, packaged and
// desktop apps side by side. The extended properties come from the same pass at
// no extra cost — the exe behind a shortcut, and a packaged app's install
// folder, which previously took a separate registry lookup.
const APPS_FOLDER_SCRIPT = String.raw`
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$items = (New-Object -ComObject Shell.Application).NameSpace('shell:AppsFolder').Items()
$apps = foreach ($it in $items) {
    [pscustomobject]@{
        name = $it.Name
        appId = $it.Path
        target = $it.ExtendedProperty('System.Link.TargetParsingPath')
        args = $it.ExtendedProperty('System.Link.Arguments')
        installLocation = $it.ExtendedProperty('System.AppUserModel.PackageInstallPath')
    }
}
ConvertTo-Json -Compress -InputObject @($apps)
`;

function readAppsFolderOnce() {
    return new Promise((resolve, reject) => {
        execFile(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-Command", APPS_FOLDER_SCRIPT],
            { windowsHide: true, timeout: 20000, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
            (err, stdout, stderr) => {
                if (err) return reject(new Error(String(stderr || "").trim().split(/\r?\n/)[0] || err.message));
                try {
                    const parsed = JSON.parse((stdout || "").trim() || "[]");
                    const list = Array.isArray(parsed) ? parsed : [parsed];
                    // An empty list is a failed read, not a machine with no apps.
                    if (!list.length) return reject(new Error("AppsFolder returned no items"));
                    resolve(list);
                } catch (parseErr) {
                    reject(parseErr);
                }
            }
        );
    });
}

// The shell's list is briefly unreadable while a package is being removed —
// seen live during an uninstall, where one read failed and the next, two
// seconds later, was fine. Retry before treating it as a real failure.
async function readAppsFolder() {
    const delays = [750, 2000];
    for (let attempt = 0; ; attempt++) {
        try {
            return await readAppsFolderOnce();
        } catch (err) {
            if (attempt >= delays.length) throw err;
            await new Promise(resolve => setTimeout(resolve, delays[attempt]));
        }
    }
}

// Every filesystem call is guarded individually: one unreadable folder or
// broken entry must not empty the whole list.
async function collectShortcuts(dir, out) {
    if (isStartupDir(dir)) return;
    let items;
    try {
        items = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of items) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) await collectShortcuts(fullPath, out);
        else if (entry.name.toLowerCase().endsWith(".lnk")) out.push(fullPath);
    }
}

const lnkName = (lnkPath) => path.basename(lnkPath, path.extname(lnkPath));

// Web links (docs, "Visit our website") and other protocol handlers aren't
// apps. Steam's are skipped too: steam.js reads them straight from the library.
const URL_LIKE = /^[a-z][a-z0-9+.-]+:\/\//i;
// Start lists some uninstallers ("Uninstall Node.js"). The exe check is kept
// to the standard names (Inno Setup's unins000.exe, uninstall.exe): a looser
// pattern hid real apps like BCUninstaller.exe and UninstallView.exe.
const isUninstaller = (name, target = "") =>
    /^uninstall\b/i.test(name) || /(^|[\\/])(unins\d{3}|uninstall)\.exe$/i.test(target);

function fromShortcutsOnly(lnks) {
    return lnks
        .filter(p => !isUninstaller(lnkName(p)))
        .map(p => ({ name: lnkName(p), source: "StartMenu", appId: "", path: p, type: "app" }));
}

/**
 * @param allowFallback when the shell's list can't be read, return the bare
 *        shortcuts instead of throwing. That list has no packaged apps and
 *        shortcut file names rather than Start's names, so it is only worth
 *        having when there is no earlier list to keep.
 * @returns {{ apps: object[], complete: boolean }} complete is false for the
 *          shortcut fallback — callers must not prune pins, usage or icons
 *          against it, or every Store app would look uninstalled.
 */
export async function loadApps({ allowFallback = false } = {}) {
    const lnks = [];
    for (const dir of startMenuPaths) await collectShortcuts(dir, lnks);

    let entries;
    try {
        entries = await readAppsFolder();
    } catch (err) {
        if (!allowFallback) throw err;
        console.warn("AppsFolder enumeration failed, falling back to shortcuts:", err?.message);
        return { apps: fromShortcutsOnly(lnks), complete: false };
    }

    // A desktop entry's name is its shortcut's display name, which for almost
    // every app is the .lnk file name. Joining on it keeps the shortcut as the
    // launch path (arguments, working directory, admin launch) without paying
    // to resolve every .lnk. Earlier folders win, matching Start's precedence.
    const lnkByName = new Map();
    for (const p of lnks) {
        const key = lnkName(p).toLowerCase();
        if (!lnkByName.has(key)) lnkByName.set(key, p);
    }
    // When two Start entries share a name, a name can't say which shortcut is
    // whose — joining would hand both the same path. Those launch by ID.
    const entriesPerName = new Map();
    for (const entry of entries) {
        const key = entry?.name?.trim().toLowerCase();
        if (key) entriesPerName.set(key, (entriesPerName.get(key) ?? 0) + 1);
    }
    const usedLnks = new Set();

    const apps = [];
    for (const entry of entries) {
        const name = entry?.name?.trim();
        const appId = entry?.appId ?? "";
        if (!name || !appId) continue;

        // An AppUserModelID containing "!" isn't proof of a package: some
        // desktop apps borrow the format, and those have an exe target instead.
        const installLocation = entry.installLocation || "";
        const target = entry.target || "";
        if (installLocation || (appId.includes("!") && !target)) {
            apps.push({ name, source: "UWP", appId, path: "", installLocation, type: "app" });
            continue;
        }

        if (URL_LIKE.test(appId) || URL_LIKE.test(target)) continue;
        if (isUninstaller(name, target)) continue;

        const lnk = entriesPerName.get(name.toLowerCase()) === 1 ? lnkByName.get(name.toLowerCase()) : undefined;
        if (lnk) usedLnks.add(lnk);
        apps.push({
            name,
            // "StartMenu" when a shortcut backs the entry, "StartApps" when the
            // shell is the only way in — launched through its AppUserModelID.
            source: lnk ? "StartMenu" : "StartApps",
            appId,
            path: lnk ?? "",
            target,
            targetArgs: entry.args || "",
            type: "app",
        });
    }

    // AppsFolder doesn't list desktop shortcuts, so keep the ones that aren't
    // already represented by a Start entry.
    const publicDesktop = path.normalize(startMenuPaths[2]).toLowerCase();
    for (const p of lnks) {
        if (usedLnks.has(p) || !p.toLowerCase().startsWith(publicDesktop)) continue;
        if (lnkByName.get(lnkName(p).toLowerCase()) !== p) continue;
        if (apps.some(a => a.name.toLowerCase() === lnkName(p).toLowerCase())) continue;
        if (isUninstaller(lnkName(p))) continue;
        apps.push({ name: lnkName(p), source: "StartMenu", appId: "", path: p, type: "app" });
    }
    return { apps, complete: true };
}
