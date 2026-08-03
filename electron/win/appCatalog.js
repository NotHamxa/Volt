import fs from "fs";
import Store from "electron-store";
import { loadApps } from "./apps/enumerate.js";
import { getUwpInstallLocations } from "./apps/uwpAppLogo.js";
import { loadSteamGames, cacheSteamPath } from "./apps/steam.js";
import { cacheAppIcon, cacheUwpIcon, iconFilePath, ensureIconDir, normaliseIcon } from "./apps/iconCache.js";
import { extractShellIcons } from "./apps/shellIcon.js";
import { pruneUsage } from "../universal/usage.js";

const store = new Store();

// Enumerate every installed app (Start Menu, UWP, Steam), dedupe, then cache
// their icons. Windows-specific: relies on PowerShell/registry enumeration and
// native icon extraction. A port would reimplement this entry point per OS.
export async function loadAppData(webContents,cache) {
    try {
        console.log("collecting")
        const [apps, steamGames, steamPath] = await Promise.all([
            loadApps(),
            loadSteamGames(),
            cacheSteamPath(),
        ]);
        cache.steamPath = steamPath;

        // Deduplicate: Steam games that also appear as Start Menu shortcuts
        const steamNames = new Set(steamGames.map(g => g.name));
        const filteredApps = apps.filter(a => !steamNames.has(a.name));

        cache.appCache = [...filteredApps, ...steamGames];
        await validateCache(webContents,cache.appCache);
        await loadAppIconsCache(webContents,cache);
    } catch(error) {
        console.log(error)
        cache.appCache = [];
    }
}
async function validateCache(webContents,appCache){
    try {
        let pApps = JSON.parse((await store.get("pinnedApps")) ?? "[]")
        pApps = pApps.filter(app => appCache.some(aCache=>aCache.name===app.name));
        pruneUsage(appCache);
        store.set("pinnedApps", JSON.stringify(pApps));
        webContents.send('reloaded-app-cache')
    }
    catch(error) {
        console.error(error);
    }
}
async function loadAppIconsCache(webContents,cache) {
    cache.appIconsCache = store.get("appIconsCache");
    if (cache.appIconsCache) {
        cache.appIconsCache = JSON.parse(cache.appIconsCache);
    }
    else{
        cache.appIconsCache = {}
    }
    const uwpIconsToCache = []
    let totalApps = cache.appCache.length;
    let currentNumber = 0;
    const reportProgress = () => {
        cache.cacheProgress = { current: currentNumber, total: totalApps };
        webContents.send("set-cache-loading-bar", currentNumber, totalApps);
    };
    reportProgress();

    // The shell is the primary source: it produces full-bleed, correctly-sized
    // artwork for every AppsFolder entry. The routes below now only handle what
    // it couldn't draw, rather than claiming apps first with a worse icon.
    await fillMissingIconsFromShell(cache);

    for (const appData of cache.appCache) {
        if (appData.source === "Steam") {
            // Steam icons are read directly from Steam's library cache, no extraction needed
            currentNumber = currentNumber+1
            reportProgress();
            continue;
        }
        if (!(appData.name in cache.appIconsCache) && appData.path) {
            console.log("Caching")
            cache.appIconsCache = await cacheAppIcon(appData, cache.appIconsCache);
            currentNumber = currentNumber+1
            reportProgress();
        }
        else if (appData.source==="UWP" && !(appData.name in cache.appIconsCache)) {
            uwpIconsToCache.push(appData)
        }
        else {
            currentNumber = currentNumber+1
            reportProgress();
        }
    }
    // Only fall back to the manifest for packaged apps the shell couldn't draw.
    // Its Properties.Logo is the StoreLogo — a solid branded tile rather than
    // the transparent icon Start actually shows.
    const uwpStillMissing = uwpIconsToCache.filter(a => {
        const existing = cache.appIconsCache[a.name];
        return !existing || !fs.existsSync(existing);
    });

    if (uwpStillMissing.length > 0) {
        const uwpIconsToCache = uwpStillMissing;
        let uwpIconsInstallPath = [];
        try {
            uwpIconsInstallPath = await getUwpInstallLocations(uwpIconsToCache);
        } catch (err) {
            console.warn("Failed to get UWP install locations:", err.message);
        }
        const diff = uwpIconsToCache.length - uwpIconsInstallPath.length;
        currentNumber = currentNumber+diff
        reportProgress();
        for (const uwpApp of uwpIconsInstallPath) {
            if (uwpApp.installLocation){
                console.log("Caching")
                cache.appIconsCache = await cacheUwpIcon(uwpApp.installLocation,uwpApp.name,cache.appIconsCache)
            }
            currentNumber = currentNumber+1
            reportProgress();
        }
    }
    store.set("appIconsCache", JSON.stringify(cache.appIconsCache));
}

/**
 * Last-resort icon pass, batched into a single PowerShell run. Steam keeps its
 * own artwork, so it is skipped; everything else that reached this point has
 * exhausted the file-extraction and manifest routes.
 */
async function fillMissingIconsFromShell(cache) {
    const pending = [];
    for (const appData of cache.appCache) {
        if (appData.source === "Steam") continue;
        const existing = cache.appIconsCache[appData.name];
        if (existing && fs.existsSync(existing)) continue;

        // A shell item needs something to parse: an AppUserModelID for
        // AppsFolder entries, or the shortcut/executable path otherwise.
        const parsingName = appData.appId
            ? `shell:AppsFolder\\${appData.appId}`
            : appData.path;
        if (!parsingName) continue;

        pending.push({
            key: appData.name,
            parsingName,
            outPath: iconFilePath(appData),
        });
    }

    if (!pending.length) return;
    ensureIconDir();

    try {
        const written = await extractShellIcons(pending);
        for (const entry of pending) {
            if (!written.has(entry.key)) continue;
            await normaliseIcon(entry.outPath);
            cache.appIconsCache[entry.key] = entry.outPath;
        }
        console.log(`Shell icons: ${written.size}/${pending.length} extracted`);
    } catch (err) {
        console.warn("Shell icon pass failed:", err?.message);
    }
}

// Background pass: drop icons for apps no longer present, and re-extract icons
// whose source file has been updated (or whose cached PNG was deleted). UWP
// apps have no stable source file to stat, so they fall back to a TTL refresh.
const SHELL_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
export async function revalidateAppIcons(webContents, cache) {
    if (!cache.appIconsCache) return;
    const appsByName = new Map(cache.appCache.map(a => [a.name, a]));
    const stale = [];
    const uwpStale = [];
    let changed = false;

    for (const [name, iconPath] of Object.entries(cache.appIconsCache)) {
        const appData = appsByName.get(name);
        if (!appData) {
            try { fs.unlinkSync(iconPath); } catch { /* ignore */ }
            delete cache.appIconsCache[name];
            changed = true;
            continue;
        }

        let pngMtime = 0;
        try { pngMtime = fs.statSync(iconPath).mtimeMs; } catch { /* missing */ }

        if (appData.path) {
            // A shortcut or executable can be stat'd, so an app that updates
            // itself is caught the moment its file is rewritten.
            let srcMtime = 0;
            try { srcMtime = fs.statSync(appData.path).mtimeMs; } catch { continue; }
            if (!pngMtime || srcMtime > pngMtime) stale.push(appData);
        } else if (!pngMtime || (Date.now() - pngMtime) > SHELL_REFRESH_MS) {
            // Nothing on disk to compare against — AppsFolder entries and
            // packaged apps are re-asked periodically instead. Both routes go
            // through the shell now, so they share one staleness rule.
            uwpStale.push(appData);
        }
    }

    // Re-ask the shell for everything that went stale, source file or not. It
    // redraws whatever the app currently ships, so an app that changes its icon
    // picks the new one up here.
    const refresh = [...stale, ...uwpStale];
    for (const appData of refresh) {
        delete cache.appIconsCache[appData.name];
        changed = true;
    }
    if (refresh.length > 0) {
        await fillMissingIconsFromShell(cache);

        // Anything the shell still won't draw falls back to file extraction.
        for (const appData of refresh) {
            if (cache.appIconsCache[appData.name] || !appData.path) continue;
            cache.appIconsCache = await cacheAppIcon(appData, cache.appIconsCache);
        }
        console.log(`Revalidated ${refresh.length} icon(s)`);
    }

    if (changed) {
        store.set("appIconsCache", JSON.stringify(cache.appIconsCache));
        webContents.send('reloaded-app-cache');
    }
}
