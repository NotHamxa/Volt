import {cacheAppIcon, cacheFolder, cacheUwpIcon, loadApps} from "./cache.js";
import {app} from "electron";
import Store from "electron-store";
import {getUwpInstallLocations} from "./uwpAppLogo.js";

const store = new Store();
export async function loadFileData(cache){
    cache.firstTimeExperience = store.get("firstTimeExperience") ?? true;

    cache.cachedFolders = JSON.parse(await store.get("cachedFolders") ?? "[]");
    if (cache.firstTimeExperience) {
        const desktopPath = app.getPath("desktop");
        const downloadsPath = app.getPath("downloads");
        cache.cachedFolders.push(desktopPath);
        cache.cachedFolders.push(downloadsPath);
        store.set("cachedFolders", JSON.stringify(cache.cachedFolders));
        store.set("firstTimeExperience", false);
    }
    for (const path of cache.cachedFolders){
        await cacheFolder(path, cache,false);
    }
}

export async function loadAppData(webContents,cache) {
    try {
        console.log("collecting")
        cache.appCache = await loadApps();
        setTimeout(async ()=>{
            await validateCache(webContents,cache.appCache);
            await loadAppIconsCache(webContents,cache);
        }, 1);
    } catch(error) {
        cache.appCache = [];
    }
}
async function validateCache(webContents,appCache){
    try {
        let appLaunchStack = JSON.parse((await store.get("appLaunchStack")) ?? "[]");
        let pApps = JSON.parse((await store.get("pinnedApps")) ?? "[]")
        pApps = pApps.filter(app => appCache.some(aCache=>aCache.name===app.name));
        console.log("appLaunchStack = ", appLaunchStack);
        appLaunchStack = appLaunchStack.filter(app => appCache.some(aCache=>aCache.name===app));
        console.log("appLaunchStack = ", appLaunchStack);
        store.set("appLaunchStack", JSON.stringify(appLaunchStack));
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
    for (const appData of cache.appCache) {
        if (!(appData.name in cache.appIconsCache) && appData.path) {
            console.log("Caching")
            cache.appIconsCache = await cacheAppIcon(appData, cache.appIconsCache);
            currentNumber = currentNumber+1
            webContents.send("set-cache-loading-bar",currentNumber,totalApps)
        }
        else if (appData.source==="UWP" && !(appData.name in cache.appIconsCache)) {
            uwpIconsToCache.push(appData)
        }
    }
    if (uwpIconsToCache.length > 0) {
        const uwpIconsInstallPath = await getUwpInstallLocations(uwpIconsToCache);
        const diff = uwpIconsToCache.length - uwpIconsInstallPath.length;
        currentNumber = currentNumber+diff
        webContents.send("set-cache-loading-bar",currentNumber,totalApps)
        for (const uwpApp of uwpIconsInstallPath) {
            if (uwpApp.installLocation){
                console.log("Caching")
                cache.appIconsCache = await cacheUwpIcon(uwpApp.installLocation,uwpApp.name,cache.appIconsCache)
                currentNumber = currentNumber+1
                webContents.send("set-cache-loading-bar",currentNumber,totalApps)
            }
        }
    }
    store.set("appIconsCache", JSON.stringify(cache.appIconsCache));
}
