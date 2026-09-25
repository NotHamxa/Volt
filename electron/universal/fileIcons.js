import path from "path";
import extractIcon from "extract-file-icon";

// These carry their own icon, so each file is looked up individually. Every
// other type shares its extension's icon, so a folder of 500 PDFs costs one
// lookup.
const OWN_ICON = new Set(["exe", "lnk", "ico", "url", "msc", "cpl", "appref-ms"]);

const cache = new Map();

/** Cache key for an item's icon: its extension, or its own path when the icon is per-file. */
function iconKey(item) {
    if (item?.type === "folder") return "<folder>";
    const ext = path.extname(item?.path ?? "").slice(1).toLowerCase();
    return !ext || OWN_ICON.has(ext) ? String(item?.path ?? "").toLowerCase() : `.${ext}`;
}

/**
 * The icon Windows shows for this file or folder, as a PNG data URL — the
 * associated app's artwork, so a .docx gets Word's icon and a .pdf whatever
 * reads PDFs here. Null if the shell has nothing for it. `ownIcon` skips the
 * shared per-type icon, for folders like Downloads that have their own.
 */
export function fileIcon(item, size = 32, { ownIcon = false } = {}) {
    const key = `${ownIcon ? String(item?.path).toLowerCase() : iconKey(item)}|${size}`;
    if (!cache.has(key)) {
        let url = null;
        try {
            const png = extractIcon(path.resolve(item.path), size);
            if (png?.length) url = `data:image/png;base64,${png.toString("base64")}`;
        } catch { /* no icon for this path */ }
        cache.set(key, url);
    }
    return cache.get(key);
}

/** Icons for a batch of results, keyed by each item's path. */
export function fileIcons(items, size = 32) {
    const icons = {};
    for (const item of items ?? []) {
        if (item?.path && (item.type === "file" || item.type === "folder")) icons[item.path] = fileIcon(item, size);
    }
    return icons;
}
