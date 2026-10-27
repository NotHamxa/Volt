import { nativeImage } from "electron";

/**
 * Pictures a tool looked at, as small thumbnails for its step.
 *
 * Kept small on purpose: they're saved with the chat, and the step only needs
 * to show which picture it was. A step keeps at most a couple.
 */
const SIZE = 480;
const MAX_IMAGES = 2;

function thumbnail(image) {
    if (!image || image.isEmpty()) return null;
    const { width, height } = image.getSize();
    const scale = Math.min(1, SIZE / Math.max(width, height));
    const sized = scale < 1
        ? image.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: "good" })
        : image;
    return `data:image/jpeg;base64,${sized.toJPEG(80).toString("base64")}`;
}

/** The images in a Claude tool result (base64 content blocks). */
export function resultImages(content) {
    if (!Array.isArray(content)) return [];
    return content
        .filter(block => block?.type === "image" && block.source?.type === "base64" && typeof block.source.data === "string")
        .slice(0, MAX_IMAGES)
        .map(block => {
            try {
                return thumbnail(nativeImage.createFromBuffer(Buffer.from(block.source.data, "base64")));
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

/** An image file on disk, as Codex reports viewing one by path. */
export function fileImages(file) {
    if (typeof file !== "string" || !file) return [];
    try {
        const url = thumbnail(nativeImage.createFromPath(file));
        return url ? [url] : [];
    } catch {
        return [];
    }
}
