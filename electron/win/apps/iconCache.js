import path from "path";
import fs from "fs";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import xml2js from "xml2js";
import { app } from "electron";
import { Jimp } from "jimp";
import { extractAppLogo } from "./appLogo.js";

const appDataPath = path.join(app.getPath('userData'), 'icons');
const parseString = promisify(xml2js.parseString);

const validImageExtensions = [".png", ".jpg", ".jpeg"];

export { appDataPath };

/**
 * Filename for an app's cached icon. Derived from name + identity so two apps
 * sharing a name get separate files, and hashed so characters that are illegal
 * in a filename (`/`, `:`, `?` …) can't produce an unwritable path.
 */
export function iconFileName(appData) {
    const identity = `${appData?.name ?? ""}|${appData?.appId ?? ""}|${appData?.path ?? ""}`.toLowerCase();
    const hash = createHash("sha1").update(identity).digest("hex").slice(0, 12);
    const readable = String(appData?.name ?? "app").replace(/[^a-z0-9._-]+/gi, "_").slice(0, 48);
    return `${readable}-${hash}.png`;
}

export function iconFilePath(appData) {
    return path.join(appDataPath, iconFileName(appData));
}

export function ensureIconDir() {
    if (!fs.existsSync(appDataPath)) fs.mkdirSync(appDataPath, { recursive: true });
    return appDataPath;
}

export const ICON_SIZE = 128;

/**
 * Trims the transparent margin an icon may be padded with, then scales it to a
 * common size. Without this, an app shipping a 16px icon inside a larger canvas
 * renders as a speck next to apps with full-bleed artwork.
 */
/**
 * Bounding box of the actual artwork.
 *
 * The shell centres a small source icon on a filled canvas, so the padding is
 * often opaque rather than transparent — autocrop alone can't see it, and a
 * faint 1px frame around the edge defeats it entirely. The background colour is
 * therefore sampled from a ring just inside the border, skipping that frame.
 */
function contentBounds(image) {
    const { width: w, height: h, data } = image.bitmap;
    const at = (x, y) => {
        const i = (y * w + x) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };

    // Inset past any border frame before sampling the background.
    const inset = Math.max(2, Math.floor(Math.min(w, h) * 0.04));
    const samples = [at(inset, inset), at(w - 1 - inset, inset), at(inset, h - 1 - inset), at(w - 1 - inset, h - 1 - inset)];
    const bg = samples[0];
    const near = (p, q, tol) =>
        Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol &&
        Math.abs(p[2] - q[2]) <= tol && Math.abs(p[3] - q[3]) <= tol;

    // If the corners disagree there is no uniform padding to trim.
    if (!samples.every(s => near(s, bg, 12))) return null;

    // Only neutral padding is trimmed. A saturated background is part of the
    // design (a solid-colour app tile), not padding.
    const isTransparent = bg[3] < 16;
    const isNeutral = Math.max(bg[0], bg[1], bg[2]) - Math.min(bg[0], bg[1], bg[2]) < 18;
    if (!isTransparent && !isNeutral) return null;

    // Scaled-up icons carry a faint alpha halo far beyond the artwork. Counting
    // it as content makes the bounding box the whole canvas, so only pixels
    // solid enough to actually see are considered.
    const ALPHA_FLOOR = 48;
    const isContent = isTransparent
        ? (p) => p[3] >= ALPHA_FLOOR
        : (p) => p[3] >= ALPHA_FLOOR && !near(p, bg, 24);

    // The shell draws a faint 1px frame around the canvas. It clears the alpha
    // floor, so scanning the full bitmap makes the bounding box the whole image
    // and nothing ever gets trimmed — skip the border ring entirely.
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = inset; y < h - inset; y++) {
        for (let x = inset; x < w - inset; x++) {
            if (!isContent(at(x, y))) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Trims padding around an icon, then scales it to a common size, so an app
 * shipping a 16px icon doesn't render as a speck beside full-bleed artwork.
 */
export async function normaliseIcon(filePath, size = ICON_SIZE) {
    try {
        const image = await Jimp.read(filePath);
        const { width: w, height: h } = image.bitmap;
        if (!w || !h) return false;

        const box = contentBounds(image);
        // Only crop when the artwork genuinely occupies a small part of the
        // canvas; anything larger is a design choice rather than padding.
        if (box && Math.max(box.w, box.h) / Math.max(w, h) < 0.75) {
            const pad = Math.round(Math.max(box.w, box.h) * 0.04);
            const x = Math.max(0, box.x - pad);
            const y = Math.max(0, box.y - pad);
            image.crop({
                x, y,
                w: Math.min(w - x, box.w + pad * 2),
                h: Math.min(h - y, box.h + pad * 2),
            });
        }

        image.scaleToFit({ w: size, h: size });
        await image.write(filePath);
        return true;
    } catch (err) {
        console.warn("normaliseIcon failed:", filePath, err?.message);
        return false;
    }
}

export async function cacheAppIcon(app, appIconsCache) {
    if (!app.path)
        return appIconsCache;
    try {
        const appIcon = await extractAppLogo(app.path);
        if (!appIcon || !appIcon.startsWith('data:image')) {
            return appIconsCache;
        }
        const base64Data = appIcon.split(',')[1];
        const iconPath = iconFilePath(app);
        ensureIconDir();
        fs.writeFileSync(iconPath, Buffer.from(base64Data, 'base64'));
        await normaliseIcon(iconPath);
        appIconsCache[app.name] = iconPath;
        return appIconsCache
    } catch (error) {
        console.log(error);
        return appIconsCache;
    }

}
async function copyAppLogo(targetPath, endPath, width = 64) {
    try {
        const image = await Jimp.read(targetPath);

        image.resize({
            w: width
        });
        const buffer = await image.getBuffer("image/png");
        fs.writeFileSync(endPath, buffer);
        return true;
    } catch (error) {
        console.error("copyAppLogo failed:", error);
        return false;
    }
}
export async function cacheUwpIcon(installPath, name, appIconsCache) {
    const manifestPath = path.join(installPath, "AppxManifest.xml");
    if (!fs.existsSync(manifestPath)) {
        return appIconsCache
    }
    const xml = fs.readFileSync(manifestPath, "utf8");
    let manifest;
    try {
        manifest = await parseString(xml);
    } catch (err) {
        return appIconsCache
    }
    let logoRelativePath;
    try {
        logoRelativePath = manifest?.Package?.Properties?.[0]?.Logo?.[0];
        if (!logoRelativePath) {
            return appIconsCache;
        }
        const normalizedLogoPath = path.normalize(logoRelativePath);
        const logoFullPath = path.join(installPath, normalizedLogoPath);
        const assetsFolder = path.dirname(logoFullPath);
        const logoBaseName = path.basename(logoFullPath, path.extname(logoFullPath));
        if (!fs.existsSync(assetsFolder)) {
            return appIconsCache;
        }
        const files = fs.readdirSync(assetsFolder);
        const icons = []
        files.forEach(file => {
            const ext = path.extname(file).toLowerCase();
            const base = path.basename(file, ext);
            if (base.startsWith(logoBaseName) && validImageExtensions.includes(ext)) {
                icons.push(path.join(assetsFolder, file));
            }
        });
        if (icons.length>0){
            const scoredIcons = icons.map(file => {
                const name = path.basename(file).toLowerCase();
                let score = 0;

                const targetSizeMatch = name.match(/targetsize-(\d+)/);
                const scaleMatch = name.match(/scale-(\d+)/);

                if (targetSizeMatch) {
                    score = 10000 + parseInt(targetSizeMatch[1]);
                } else if (scaleMatch) {
                    score = 5000 + parseInt(scaleMatch[1]);
                } else if (name === `${logoBaseName.toLowerCase()}.png`) {
                    score = 1;
                }

                return { file, score };
            });
            scoredIcons.sort((a, b) => b.score - a.score);
            const iconPath = scoredIcons[0].file;

            const targetPath = path.join(appDataPath, iconFileName({ name, appId: "", path: installPath }));
            ensureIconDir();
            if (await copyAppLogo(iconPath,targetPath)){
                await normaliseIcon(targetPath);
                appIconsCache[name] = targetPath;
                return appIconsCache;
            }
            else{
                return appIconsCache;
            }
        }
        return appIconsCache;

    } catch (err) {
        return appIconsCache;
    }
}
