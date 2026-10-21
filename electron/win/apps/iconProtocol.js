import fsp from "fs/promises";
import { pathToFileURL } from "url";
import { net, protocol } from "electron";
import { iconKey } from "./iconCache.js";
import { steamIconPath } from "./steam.js";

/**
 * App logos by URL instead of by value.
 *
 * The home screen used to ask for every logo over IPC — ~200 round trips, each
 * reading its PNG synchronously and base64-encoding it on the main thread —
 * which froze the main process for 300–500 ms per refresh. Now the renderer
 * gets one list of volt-icon:// URLs and Chromium loads the files itself,
 * lazily and off the main thread.
 *
 * URLs name a cache key, never a file path, so only icons Volt itself cached
 * (or Steam's own library artwork) can be served.
 */
export const ICON_SCHEME = "volt-icon";

// Must run before the app is ready.
export function registerIconScheme() {
    protocol.registerSchemesAsPrivileged([
        { scheme: ICON_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
    ]);
}

function cachedIconPath(cache, key) {
    return cache.appIconsCache?.[key] ?? null;
}

export function handleIconProtocol(cache) {
    protocol.handle(ICON_SCHEME, async (request) => {
        const url = new URL(request.url);
        const id = decodeURIComponent(url.pathname.slice(1));
        let file = null;
        if (url.hostname === "app") file = cachedIconPath(cache, id);
        else if (url.hostname === "steam" && /^\d+$/.test(id)) file = await steamIconPath(id, cache.steamPath);
        if (!file) return new Response(null, { status: 404 });
        try {
            return await net.fetch(pathToFileURL(file).href);
        } catch {
            return new Response(null, { status: 404 });
        }
    });
}

/**
 * One URL per app (same order), or null where there is no cached artwork —
 * the renderer falls back to asking for those individually. The file's mtime
 * rides along so a re-extracted icon isn't served from Chromium's cache.
 */
export async function appLogoUrls(apps, cache) {
    return Promise.all((apps ?? []).map(async (app) => {
        try {
            if (app?.source === "Steam") {
                if (!app.appId || !/^\d+$/.test(app.appId)) return null;
                const file = await steamIconPath(app.appId, cache.steamPath);
                return file ? `${ICON_SCHEME}://steam/${app.appId}` : null;
            }
            // Name key: icons cached before the identity key, not yet migrated.
            const key = cachedIconPath(cache, iconKey(app)) ? iconKey(app) : (cache.appIconsCache?.[app?.name] ? app.name : null);
            if (!key) return null;
            const { mtimeMs } = await fsp.stat(cache.appIconsCache[key]);
            return `${ICON_SCHEME}://app/${encodeURIComponent(key)}?v=${Math.round(mtimeMs)}`;
        } catch {
            return null;
        }
    }));
}
