import fsp from "fs/promises";
import path from "path";
import { nativeImage, shell } from "electron";
import { lastUsed } from "./usage.js";
import { fileIcon } from "./fileIcons.js";

// Big enough to stay sharp in the preview pane at 2x scaling.
const THUMBNAIL_SIZE = { width: 480, height: 360 };
const TEXT_PREVIEW_BYTES = 16 * 1024;
const TEXT_PREVIEW_LINES = 40;
const TEXT_EXTENSIONS = new Set([
    "txt", "md", "markdown", "log", "csv", "tsv", "ini", "cfg", "conf", "toml", "yaml", "yml", "json", "xml",
    "js", "jsx", "mjs", "cjs", "ts", "tsx", "py", "java", "kt", "c", "h", "cpp", "hpp", "cs", "go", "rs",
    "rb", "php", "swift", "sql", "sh", "bat", "cmd", "ps1", "html", "htm", "css", "scss", "vue", "svelte",
]);

/**
 * What the shell itself would show for this path: a real thumbnail for
 * images, video, PDFs and Office files, and the file-type icon otherwise.
 * Null when Windows has nothing to draw.
 */
async function thumbnail(fullPath) {
    try {
        const image = await nativeImage.createThumbnailFromPath(fullPath, THUMBNAIL_SIZE);
        return image.isEmpty() ? null : image.toDataURL();
    } catch {
        return null;
    }
}

/** The first lines of a text file, or null for binary or unreadable content. */
async function textExcerpt(fullPath) {
    let handle;
    try {
        handle = await fsp.open(fullPath, "r");
        const buffer = Buffer.alloc(TEXT_PREVIEW_BYTES);
        const { bytesRead } = await handle.read(buffer, 0, TEXT_PREVIEW_BYTES, 0);
        const chunk = buffer.subarray(0, bytesRead);
        if (chunk.includes(0)) return null;
        const lines = chunk.toString("utf8").split(/\r?\n/);
        return {
            text: lines.slice(0, TEXT_PREVIEW_LINES).join("\n"),
            truncated: lines.length > TEXT_PREVIEW_LINES || bytesRead === TEXT_PREVIEW_BYTES,
        };
    } catch {
        return null;
    } finally {
        await handle?.close();
    }
}

async function fileSystemPreview(item) {
    const stat = await fsp.stat(item.path);
    const base = { modified: stat.mtimeMs, created: stat.birthtimeMs, lastUsed: lastUsed(item) };

    if (stat.isDirectory()) {
        let items = null;
        try { items = (await fsp.readdir(item.path)).length; } catch { /* unreadable */ }
        return { ...base, kind: "folder", items, icon: fileIcon(item, 256, { ownIcon: true }) };
    }

    const extension = path.extname(item.path).slice(1).toLowerCase();
    const [image, excerpt] = await Promise.all([
        thumbnail(item.path),
        TEXT_EXTENSIONS.has(extension) ? textExcerpt(item.path) : null,
    ]);
    // No thumbnail handler for this type (Markdown, most PDFs without a
    // reader that registers one): fall back to its large file-type icon.
    return { ...base, kind: "file", extension, size: stat.size, thumbnail: image, icon: image ? null : fileIcon(item, 256), excerpt };
}

function appPreview(item) {
    const preview = { kind: "app", source: item.source ?? null, appId: item.appId || null, lastUsed: lastUsed(item) };
    if (item.path?.toLowerCase().endsWith(".lnk")) {
        try {
            const link = shell.readShortcutLink(item.path);
            Object.assign(preview, { target: link.target || null, args: link.args || null, description: link.description || null });
        } catch { /* not a readable shortcut */ }
    } else if (item.path) {
        preview.target = item.path;
    }
    return preview;
}

// Bigger PDFs keep the file-type icon: parsing them for one page isn't worth it.
const MAX_PDF_PREVIEW_BYTES = 50 * 1024 * 1024;

/**
 * The raw bytes of a PDF, for the preview pane to render its first page with
 * pdf.js. Windows only thumbnails PDFs when a reader registers a handler for
 * it, which most machines don't have. Only .pdf files are served.
 */
export async function readPdf(filePath) {
    const fullPath = path.resolve(String(filePath ?? ""));
    if (path.extname(fullPath).toLowerCase() !== ".pdf") return null;
    try {
        const stat = await fsp.stat(fullPath);
        if (!stat.isFile() || stat.size > MAX_PDF_PREVIEW_BYTES) return null;
        return new Uint8Array(await fsp.readFile(fullPath));
    } catch {
        return null;
    }
}

/**
 * Details for the preview pane. Apps, files and folders are looked up on
 * disk; everything else (commands, settings, web rows) is described by the
 * result itself, so the renderer needs nothing extra.
 */
export async function getPreview(item) {
    // The shell APIs reject forward slashes, so normalise before anything else.
    if (item?.path && (item.type === "file" || item.type === "folder")) item = { ...item, path: path.resolve(item.path) };
    try {
        if (item?.type === "app") return appPreview(item);
        if ((item?.type === "file" || item?.type === "folder") && item.path) return await fileSystemPreview(item);
    } catch (err) {
        return { kind: item?.type ?? "unknown", error: err?.code === "ENOENT" ? "This item no longer exists." : "Couldn't read this item." };
    }
    return { kind: item?.type ?? "unknown" };
}
