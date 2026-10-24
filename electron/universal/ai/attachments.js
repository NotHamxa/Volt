import path from "path";
import fs from "fs";
import { randomUUID } from "node:crypto";
import { app, nativeImage } from "electron";
import { isChatId } from "./chatStore.js";

/**
 * Files attached to a prompt.
 *
 * A file from disk is referenced where it lives, copying a 2 GB video so the
 * chat can mention it would be absurd. Pasted data (a screenshot) has nowhere
 * to live, so it is written under the chat's own folder and deleted with it.
 *
 * How a file reaches the model is up to each provider: images go natively
 * where the provider takes them, text is inlined, and the CLIs are given the
 * path to read anything else themselves.
 */

const IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
};
const EXT_FOR = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([ext, type]) => [type, ext]));

export const MAX_ATTACHMENTS = 10;
/** The Anthropic API's own ceiling per image; larger ones go by path. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Pasted data is held in memory on its way here. */
const MAX_PASTED_BYTES = 20 * 1024 * 1024;
/** Inlined text past this is cut, with the path given for the rest. */
const MAX_INLINE_CHARS = 100_000;

function rootDir() {
    return path.join(app.getPath("userData"), "ai-attachments");
}

function chatDir(chatId) {
    if (!isChatId(chatId)) throw new Error("Invalid chat id");
    return path.join(rootDir(), chatId);
}

/** Text is anything whose first few KB hold no NUL byte. */
function looksLikeText(file) {
    let fd;
    try {
        fd = fs.openSync(file, "r");
        const buffer = Buffer.alloc(8192);
        const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
        return !buffer.subarray(0, read).includes(0);
    } catch {
        return false;
    } finally {
        if (fd !== undefined) try { fs.closeSync(fd); } catch { /* closed */ }
    }
}

/** What a file on disk is, as far as sending it goes. Null if it isn't one. */
function describe(file, name) {
    let stat;
    try {
        stat = fs.statSync(file);
    } catch {
        return null;
    }
    if (!stat.isFile()) return null;
    const ext = path.extname(file).toLowerCase();
    const image = IMAGE_TYPES[ext];
    const kind = image && stat.size <= MAX_IMAGE_BYTES ? "image" : looksLikeText(file) ? "text" : "file";
    return {
        name: String(name || path.basename(file)).slice(0, 200),
        path: file,
        mimeType: image ?? (kind === "text" ? "text/plain" : "application/octet-stream"),
        size: stat.size,
        kind,
    };
}

/**
 * Turns what the view sent into stored attachments: `{ path }` for a file on
 * disk, `{ name, mimeType, data }` (base64) for pasted data. Anything that
 * isn't a readable file is dropped rather than failing the whole prompt.
 */
export function saveAttachments(chatId, items) {
    const saved = [];
    for (const item of (Array.isArray(items) ? items : []).slice(0, MAX_ATTACHMENTS)) {
        if (typeof item?.path === "string" && item.path) {
            if (!path.isAbsolute(item.path)) continue;
            const found = describe(path.normalize(item.path), item.name);
            if (found) saved.push(found);
            continue;
        }
        if (typeof item?.data !== "string") continue;
        try {
            const bytes = Buffer.from(item.data, "base64");
            if (!bytes.length || bytes.length > MAX_PASTED_BYTES) continue;
            const dir = chatDir(chatId);
            fs.mkdirSync(dir, { recursive: true });
            const ext = EXT_FOR[item.mimeType] ?? (path.extname(String(item.name ?? "")).toLowerCase() || ".bin");
            const file = path.join(dir, `${randomUUID()}${ext.replace(/[^.\w]/g, "")}`);
            fs.writeFileSync(file, bytes);
            const found = describe(file, item.name || `Pasted image${ext}`);
            if (found) saved.push(found);
        } catch (err) {
            console.error("Could not save an attachment:", err?.message ?? err);
        }
    }
    return saved;
}

/**
 * Re-checks attachments arriving with a turn. They name files on disk, so
 * each is described afresh, one moved or deleted since is simply left out.
 */
export function resolveAttachments(list) {
    if (!Array.isArray(list)) return [];
    return list
        .slice(0, MAX_ATTACHMENTS)
        .filter(a => typeof a?.path === "string" && path.isAbsolute(a.path))
        .map(a => describe(path.normalize(a.path), a.name))
        .filter(Boolean);
}

/** Just the fields kept on a stored message. */
export function sanitizeAttachments(list) {
    if (!Array.isArray(list)) return [];
    return list
        .filter(a => typeof a?.path === "string" && typeof a?.name === "string")
        .slice(0, MAX_ATTACHMENTS)
        .map(({ name, path: file, mimeType, size, kind }) => ({ name, path: file, mimeType, size, kind }));
}

function readText(file) {
    try {
        const text = fs.readFileSync(file, "utf8");
        return text.length > MAX_INLINE_CHARS
            ? { text: text.slice(0, MAX_INLINE_CHARS), cut: true }
            : { text, cut: false };
    } catch {
        return null;
    }
}

function readBase64(file) {
    try {
        return fs.readFileSync(file).toString("base64");
    } catch {
        return null;
    }
}

/**
 * A prompt and its attachments, split into what the provider sends natively
 * and the text that carries the rest.
 *
 * `images`: the provider takes images itself, so they come back as base64.
 * `paths`: the provider can open files on disk (the CLIs), so anything not
 * inlined is given by path; otherwise it is named as left out, so the model
 * doesn't answer as if it had seen it.
 */
export function expandAttachments(prompt, attachments, { images = false, paths = false } = {}) {
    const native = [];
    const blocks = [];
    for (const attachment of attachments ?? []) {
        const { name, path: file, kind, mimeType } = attachment;
        if (kind === "image" && images) {
            const data = readBase64(file);
            if (data) {
                native.push({ ...attachment, mimeType, data });
                continue;
            }
        }
        if (kind === "text") {
            const read = readText(file);
            if (read) {
                const note = read.cut ? (paths ? ` (truncated; the full file is at ${file})` : " (truncated)") : "";
                blocks.push(`<attachment name="${name}"${paths ? ` path="${file}"` : ""}>${note}\n${read.text}\n</attachment>`);
                continue;
            }
        }
        blocks.push(paths
            ? `Attached file "${name}": ${file}`
            : `[The attached file "${name}" could not be sent: this provider only takes images and text files.]`);
    }
    const text = String(prompt ?? "").trim() || (attachments?.length ? "See the attached files." : "");
    return { text: blocks.length ? `${text}\n\n${blocks.join("\n\n")}` : text, images: native };
}

/** A message counts as said if it has words or files. */
export const hasContent = (m) => Boolean(m?.content?.trim() || m?.attachments?.length);

/**
 * An attached image for the view to show, as a data URL, the renderer can't
 * load files off disk itself. Scaled down to `maxSize` on its longest side,
 * so a thumbnail doesn't ship a 5 MB photo over IPC. Null when the file is
 * gone or isn't a picture.
 */
export function imagePreview(file, maxSize) {
    const limit = Math.min(Math.max(Number(maxSize) || 0, 64), 4096);
    const mimeType = IMAGE_TYPES[path.extname(file).toLowerCase()];
    if (!mimeType) return null;
    try {
        const image = nativeImage.createFromPath(file);
        if (!image.isEmpty()) {
            const { width, height } = image.getSize();
            const scale = limit / Math.max(width, height);
            if (scale < 1) {
                const sized = image.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: "good" });
                // JPEG for photos; PNG keeps a transparent background.
                const url = mimeType === "image/png"
                    ? sized.toDataURL()
                    : `data:image/jpeg;base64,${sized.toJPEG(88).toString("base64")}`;
                return { url, width, height };
            }
            return { url: `data:${mimeType};base64,${fs.readFileSync(file).toString("base64")}`, width, height };
        }
    } catch { /* fall through to the file as it is */ }
    // GIF and WebP aren't decoded by nativeImage. They're shown as they are,
    // which is fine at the size an attached image is capped to.
    try {
        if (fs.statSync(file).size > MAX_IMAGE_BYTES) return null;
        return { url: `data:${mimeType};base64,${fs.readFileSync(file).toString("base64")}`, width: null, height: null };
    } catch {
        return null;
    }
}

export function deleteChatAttachments(chatId) {
    try { fs.rmSync(chatDir(chatId), { recursive: true, force: true }); } catch { /* none */ }
}

export function deleteAllAttachments() {
    try { fs.rmSync(rootDir(), { recursive: true, force: true }); } catch { /* none */ }
}
