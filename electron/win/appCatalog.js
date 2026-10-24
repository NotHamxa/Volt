import fs from "fs";
import Store from "electron-store";
import { loadApps } from "./apps/enumerate.js";
import { loadSteamGames, cacheSteamPath } from "./apps/steam.js";
import { cacheAppIcon, cacheUwpIcon, iconFilePath, iconKey, ensureIconDir, normaliseIcon } from "./apps/iconCache.js";
import { extractShellIcons } from "./apps/shellIcon.js";
import { pruneUsage } from "../universal/usage.js";

const store = new Store();

// One catalog pass at a time. Installers touch the watched folders in bursts,
// often while the startup pass is still running, and overlapping passes raced
// on appIconsCache and spawned duplicate PowerShell jobs. A load requested
// while another is waiting to start folds into that one.
let queue = Promise.resolve();
let queuedLoad = null;
function enqueue(task) {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
}

// Enumerate every installed app (Start/AppsFolder, Steam), then cache their
// icons. Windows-specific: relies on PowerShell enumeration and native icon
// extraction. A port would reimplement this entry point per OS.
export function loadAppData(webContents, cache) {
    if (queuedLoad) return queuedLoad;
    queuedLoad = enqueue(async () => {
        queuedLoad = null;
        await refreshCatalog(webContents, cache);
    });
    return queuedLoad;
}

// After a failed or partial read, try again on our own rather than waiting for
// the next install to trip a watcher. Backs off and then stops: where the
// shell's list can never be read (a locked-down PowerShell), retrying forever
// would just spawn processes all session.
const RECOVERY_DELAYS_MS = [15000, 60000, 300000];
let recoveryTimer = null;
let recoveryAttempt = 0;
function scheduleRecovery(webContents, cache) {
    if (recoveryTimer || recoveryAttempt >= RECOVERY_DELAYS_MS.length) return;
    recoveryTimer = setTimeout(() => {
        recoveryTimer = null;
        loadAppData(webContents, cache).catch(() => {});
    }, RECOVERY_DELAYS_MS[recoveryAttempt++]);
}

// The window can be gone by the time a queued pass or timer finishes.
function notify(webContents, channel, ...args) {
    if (webContents && !webContents.isDestroyed()) webContents.send(channel, ...args);
}

async function refreshCatalog(webContents, cache) {
    try {
        const [{ apps, complete }, steamGames, steamPath] = await Promise.all([
            // Only a cold start may settle for the shortcut-only list.
            loadApps({ allowFallback: !cache.appCache?.length }),
            loadSteamGames(),
            cacheSteamPath(),
        ]);
        cache.steamPath = steamPath;

        // Deduplicate: Steam games that also appear as Start Menu shortcuts
        const steamNames = new Set(steamGames.map(g => g.name));
        const filteredApps = apps.filter(a => !steamNames.has(a.name));

        cache.appCache = [...filteredApps, ...steamGames];
        cache.appCatalogComplete = complete;
    } catch (error) {
        // Keep whatever list we had: a failed rescan shouldn't empty search.
        console.warn("App enumeration failed:", error?.message ?? error);
        scheduleRecovery(webContents, cache);
        return;
    }
    console.log(`App catalog: ${cache.appCache.length} apps${cache.appCatalogComplete ? "" : " (partial)"}`);
    // Saved icons serve a partial list too; only migrating and pruning wait.
    readIconCache(cache);
    if (cache.appCatalogComplete) {
        recoveryAttempt = 0;
        reconcilePinnedApps(cache.appCache);
        try { pruneUsage(cache.appCache); } catch (error) { console.error(error); }
    } else {
        scheduleRecovery(webContents, cache);
    }
    notify(webContents, 'reloaded-app-cache');
    // Icons for a partial list would be filed under stand-in keys and thrown
    // away by the recovery pass. Logos are extracted on demand meanwhile.
    if (!cache.appCatalogComplete) return;

    try {
        if (await loadAppIconsCache(webContents, cache)) notify(webContents, 'reloaded-app-cache');
    } catch (error) {
        console.warn("Icon caching failed:", error?.message ?? error);
    }
}

/**
 * Pins are stored as full app objects, so they go stale whenever an app's
 * details change. Point each one at its current catalog entry by identity and
 * drop pins for apps that are gone.
 *
 * Name is only a last resort for pins with no identity at all: two apps can
 * share one (Google's and Samsung's Quick Share), so a pin with an ID or path
 * must never slide onto a namesake. A shortcut pin that no longer matches an
 * entry, its file name differs from Start's display name, stays as it is
 * while the shortcut exists, since it still launches.
 */
function reconcilePinnedApps(appCache) {
    try {
        const pins = JSON.parse(store.get("pinnedApps") ?? "[]");
        const lower = s => String(s ?? "").toLowerCase();
        const find = pin =>
            (pin.appId && appCache.find(a => a.source === pin.source && a.appId === pin.appId))
            || (pin.path && appCache.find(a => lower(a.path) === lower(pin.path)))
            || (pin.appId && appCache.find(a => a.appId === pin.appId))
            || (!pin.appId && !pin.path && appCache.find(a => a.name === pin.name))
            || (pin.path && pin.source !== "Steam" && fs.existsSync(pin.path) && pin);
        const seen = new Set();
        const next = [];
        for (const pin of Array.isArray(pins) ? pins : []) {
            const app = pin && find(pin);
            if (!app || seen.has(app)) continue;
            seen.add(app);
            next.push(app);
        }
        store.set("pinnedApps", JSON.stringify(next));
    } catch (error) {
        console.error(error);
    }
}

function readIconCache(cache) {
    if (cache.appIconsCache && Object.keys(cache.appIconsCache).length) return;
    try {
        cache.appIconsCache = JSON.parse(store.get("appIconsCache") ?? "{}") ?? {};
    } catch {
        cache.appIconsCache = {};
    }
}

/**
 * Icons used to be cached by app name. Carry those entries over to the
 * identity key, only where the name is unambiguous, since a shared name is
 * exactly the case the old key got wrong.
 */
function adoptNameKeyedIcons(cache) {
    const nameCount = new Map();
    for (const app of cache.appCache) nameCount.set(app.name, (nameCount.get(app.name) ?? 0) + 1);
    let changed = false;
    for (const app of cache.appCache) {
        if (app.source === "Steam") continue;
        const key = iconKey(app);
        const legacy = cache.appIconsCache[app.name];
        if (!legacy || key === app.name || nameCount.get(app.name) !== 1) continue;
        if (!(key in cache.appIconsCache)) cache.appIconsCache[key] = legacy;
        delete cache.appIconsCache[app.name];
        changed = true;
    }
    return changed;
}

const hasCachedIcon = (cache, app) => {
    const existing = cache.appIconsCache[iconKey(app)];
    return !!existing && fs.existsSync(existing);
};

/** @returns whether any icon changed */
async function loadAppIconsCache(webContents, cache) {
    readIconCache(cache);
    // A partial list keys apps by shortcut rather than their real ID, so
    // migrating against it would file icons under keys that won't last.
    let changed = cache.appCatalogComplete ? adoptNameKeyedIcons(cache) : false;

    // Steam icons are read directly from Steam's library cache, no extraction needed
    const missing = cache.appCache.filter(app => app.source !== "Steam" && !hasCachedIcon(cache, app));

    // Progress counts only the icons actually being made, and an icon is done
    // once it's written (or every route has failed), so the bar moves through
    // the whole pass and always ends at 100%.
    let done = 0;
    const reportProgress = () => {
        cache.cacheProgress = { current: done, total: missing.length };
        notify(webContents, "set-cache-loading-bar", done, missing.length);
    };
    reportProgress();

    if (missing.length) {
        changed = (await fillIcons(cache, missing, () => { done++; reportProgress(); })) || changed;
    }
    if (changed) store.set("appIconsCache", JSON.stringify(cache.appIconsCache));
    return changed;
}

/**
 * Caches icons for `apps`, calling onDone once per app when it's settled.
 *
 * The shell is the primary source: it produces full-bleed, correctly-sized
 * artwork for every AppsFolder entry. File extraction and the package manifest
 * only handle what it couldn't draw, rather than claiming apps first with a
 * worse icon. The manifest's Properties.Logo is the StoreLogo, a solid
 * branded tile rather than the transparent icon Start actually shows.
 *
 * @returns whether any icon was written
 */
async function fillIcons(cache, apps, onDone = () => {}) {
    const byKey = new Map(apps.map(app => [iconKey(app), app]));
    const pending = [];
    for (const [key, app] of byKey) {
        // A shell item needs something to parse: an AppUserModelID for
        // AppsFolder entries, or the shortcut/executable path otherwise.
        const parsingName = app.appId ? `shell:AppsFolder\\${app.appId}` : app.path;
        if (parsingName) pending.push({ key, parsingName, outPath: iconFilePath(app) });
    }

    const settled = new Set();
    const settle = key => {
        if (settled.has(key)) return;
        settled.add(key);
        onDone();
    };
    let wrote = false;

    if (pending.length) {
        ensureIconDir();
        // Trim/rescale each icon as soon as the shell hands it over, rather
        // than in one silent batch after the whole pass.
        const normalising = [];
        const written = await extractShellIcons(pending, {
            onEntry: (entry, ok) => {
                if (!ok) return;
                normalising.push(normaliseIcon(entry.outPath).then(() => {
                    cache.appIconsCache[entry.key] = entry.outPath;
                    wrote = true;
                    settle(entry.key);
                }));
            },
        });
        await Promise.all(normalising);
        console.log(`Shell icons: ${written.size}/${pending.length} extracted`);
    }

    for (const [key, app] of byKey) {
        if (settled.has(key)) continue;
        try {
            // A stale entry can still be sitting under this key, so only a
            // changed value counts as a write.
            const before = cache.appIconsCache[key];
            if (app.path || app.target) {
                cache.appIconsCache = await cacheAppIcon(app, cache.appIconsCache);
            } else if (app.installLocation) {
                cache.appIconsCache = await cacheUwpIcon(app, cache.appIconsCache);
            }
            if (cache.appIconsCache[key] && cache.appIconsCache[key] !== before) wrote = true;
        } catch (error) {
            console.warn("Icon fallback failed:", app.name, error?.message);
        }
        settle(key);
    }
    return wrote;
}

// Background pass: drop icons for apps no longer present, and re-extract icons
// whose source file has been updated (or whose cached PNG was deleted). Apps
// with no file to stat fall back to a TTL refresh.
const SHELL_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
export function revalidateAppIcons(webContents, cache) {
    return enqueue(() => revalidate(webContents, cache));
}

async function revalidate(webContents, cache) {
    if (!cache.appIconsCache) return;
    const appsByKey = new Map(cache.appCache.filter(a => a.source !== "Steam").map(a => [iconKey(a), a]));
    const refresh = [];
    let changed = false;

    for (const [key, iconPath] of Object.entries(cache.appIconsCache)) {
        const appData = appsByKey.get(key);
        if (!appData) {
            // A partial list is missing apps that are still installed.
            if (!cache.appCatalogComplete) continue;
            delete cache.appIconsCache[key];
            // Another key may still point at the same file.
            if (!Object.values(cache.appIconsCache).includes(iconPath)) {
                try { fs.unlinkSync(iconPath); } catch { /* ignore */ }
            }
            changed = true;
            continue;
        }

        let pngMtime = 0;
        try { pngMtime = fs.statSync(iconPath).mtimeMs; } catch { /* missing */ }

        const source = appData.path || appData.target;
        let srcMtime = 0;
        if (source) {
            try { srcMtime = fs.statSync(source).mtimeMs; } catch { /* unreadable */ }
        }
        if (srcMtime) {
            // A shortcut or executable can be stat'd, so an app that updates
            // itself is caught the moment its file is rewritten.
            if (!pngMtime || srcMtime > pngMtime) refresh.push(appData);
        } else if (!pngMtime || (Date.now() - pngMtime) > SHELL_REFRESH_MS) {
            // Nothing on disk to compare against, packaged apps and
            // AppsFolder-only entries are re-asked periodically instead.
            refresh.push(appData);
        }
    }

    // Re-ask the shell for everything that went stale. It redraws whatever the
    // app currently ships, so an app that changes its icon picks the new one up.
    for (const appData of refresh) delete cache.appIconsCache[iconKey(appData)];
    if (refresh.length > 0) {
        changed = true;
        await fillIcons(cache, refresh);
        console.log(`Revalidated ${refresh.length} icon(s)`);
    }

    if (changed) {
        store.set("appIconsCache", JSON.stringify(cache.appIconsCache));
        notify(webContents, 'reloaded-app-cache');
    }
}
