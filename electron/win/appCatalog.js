import fs from "fs";
import Store from "electron-store";
import { loadApps } from "./apps/enumerate.js";
import { getUwpInstallLocations } from "./apps/uwpAppLogo.js";
import { loadSteamGames, cacheSteamPath } from "./apps/steam.js";
import { cacheAppIcon, cacheUwpIcon } from "./apps/iconCache.js";
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
    if (uwpIconsToCache.length > 0) {
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

// Background pass: drop icons for apps no longer present, and re-extract icons
// whose source file has been updated (or whose cached PNG was deleted). UWP
// apps have no stable source file to stat, so they fall back to a TTL refresh.
const UWP_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
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
            let srcMtime = 0;
            try { srcMtime = fs.statSync(appData.path).mtimeMs; } catch { continue; }
            if (!pngMtime || srcMtime > pngMtime) stale.push(appData);
        } else if (appData.source === "UWP") {
            if (!pngMtime || (Date.now() - pngMtime) > UWP_REFRESH_MS) uwpStale.push(appData);
        }
    }

    for (const appData of stale) {
        const before = cache.appIconsCache[appData.name];
        delete cache.appIconsCache[appData.name];
        cache.appIconsCache = await cacheAppIcon(appData, cache.appIconsCache);
        if (cache.appIconsCache[appData.name] !== before) changed = true;
    }

    if (uwpStale.length > 0) {
        try {
            const locations = await getUwpInstallLocations(uwpStale);
            for (const uwp of locations) {
                if (!uwp.installLocation) continue;
                const before = cache.appIconsCache[uwp.name];
                delete cache.appIconsCache[uwp.name];
                cache.appIconsCache = await cacheUwpIcon(uwp.installLocation, uwp.name, cache.appIconsCache);
                if (cache.appIconsCache[uwp.name] !== before) changed = true;
            }
        } catch (err) {
            console.warn("UWP icon revalidation failed:", err.message);
        }
    }

    if (changed) {
        store.set("appIconsCache", JSON.stringify(cache.appIconsCache));
        webContents.send('reloaded-app-cache');
    }
}
