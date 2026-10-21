import { SearchQueryT } from "@/interfaces/searchQuery.ts";

/**
 * App logos, batched.
 *
 * Several views ask for logos at once — All Apps mounts ~200 tiles, each with
 * its own request — and one IPC call per app froze the main process for
 * hundreds of milliseconds. Requests made in the same tick go out as a single
 * call; cached artwork comes back as volt-icon:// URLs that Chromium loads off
 * the main thread. Only apps with no cached icon fall back to a one-off
 * request, which extracts it on demand.
 */
type Pending = { app: SearchQueryT; resolve: (logo: string | null) => void };

let queue: Pending[] = [];
let scheduled = false;

async function extractLogo(app: SearchQueryT): Promise<string | null> {
    try {
        if (app.source === "Steam" && app.appId) return await window.apps.getSteamGameLogo(app.appId);
        if (app.source === "UWP") return (await window.apps.getUwpAppLogo(app)) || null;
        return (await window.apps.getAppLogo(app)) || null;
    } catch {
        return null;
    }
}

async function flush() {
    const batch = queue;
    queue = [];
    scheduled = false;
    let urls: (string | null)[] = [];
    try {
        urls = await window.apps.getAppLogoUrls(batch.map(p => p.app));
    } catch { /* every app falls back below */ }
    // Resolved one by one, so a slow extraction doesn't hold up cached logos.
    batch.forEach((p, i) => {
        const url = urls[i];
        if (url) p.resolve(url);
        else extractLogo(p.app).then(p.resolve);
    });
}

export function appLogo(app: SearchQueryT): Promise<string | null> {
    return new Promise(resolve => {
        queue.push({ app, resolve });
        if (!scheduled) {
            scheduled = true;
            setTimeout(flush, 0);
        }
    });
}

export function appLogos(apps: SearchQueryT[]): Promise<(string | null)[]> {
    return Promise.all(apps.map(appLogo));
}
