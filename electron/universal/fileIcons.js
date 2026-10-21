import os from "os";
import path from "path";
import extractIcon from "extract-file-icon";

// These carry their own icon, so each file is looked up individually. Every
// other type shares its extension's icon, so a folder of 500 PDFs costs one
// lookup.
const OWN_ICON = new Set(["exe", "lnk", "ico", "url", "msc", "cpl", "appref-ms"]);

// Per-file entries (every .exe, every folder previewed) would otherwise grow
// for as long as Volt runs. Large icons are ~10-100 KB of base64 each, so
// they get a much smaller budget than row-sized ones.
const SMALL_LIMIT = 1000;
const LARGE_LIMIT = 40;
const LARGE_FROM = 64;
const small = new Map();
const large = new Map();

// Any plain folder's icon stands in for every folder. Taken from the temp
// folder rather than whichever folder is asked for first — that could be
// Downloads or Desktop, whose own icon would then show on every folder.
const GENERIC_FOLDER = os.tmpdir();

/** Cache key for an item's icon: its extension, or its own path when the icon is per-file. */
function iconKey(item) {
    if (item?.type === "folder") return "<folder>";
    const ext = path.extname(item?.path ?? "").slice(1).toLowerCase();
    return !ext || OWN_ICON.has(ext) ? String(item?.path ?? "").toLowerCase() : `.${ext}`;
}

function extract(fullPath, size) {
    if (!fullPath) return null;
    try {
        const png = extractIcon(path.resolve(fullPath), size);
        if (png?.length) return `data:image/png;base64,${png.toString("base64")}`;
    } catch { /* no icon for this path */ }
    return null;
}

/**
 * The icon Windows shows for this file or folder, as a PNG data URL — the
 * associated app's artwork, so a .docx gets Word's icon and a .pdf whatever
 * reads PDFs here. Null if the shell has nothing for it. `ownIcon` skips the
 * shared per-type icon, for folders like Downloads that have their own.
 */
export function fileIcon(item, size = 32, { ownIcon = false } = {}) {
    const key = `${ownIcon ? String(item?.path).toLowerCase() : iconKey(item)}|${size}`;
    const [cache, limit] = size > LARGE_FROM ? [large, LARGE_LIMIT] : [small, SMALL_LIMIT];
    if (cache.has(key)) {
        // Re-inserted so the map's order is least recently used first.
        const url = cache.get(key);
        cache.delete(key);
        cache.set(key, url);
        return url;
    }
    const shared = !ownIcon && item?.type === "folder";
    const url = (shared ? extract(GENERIC_FOLDER, size) : null) ?? extract(item?.path ?? "", size);
    if (cache.size >= limit) cache.delete(cache.keys().next().value);
    cache.set(key, url);
    return url;
}

/** Icons for a batch of results, keyed by each item's path. */
export function fileIcons(items, size = 32) {
    const icons = {};
    for (const item of items ?? []) {
        if (item?.path && (item.type === "file" || item.type === "folder")) icons[item.path] = fileIcon(item, size);
    }
    return icons;
}
