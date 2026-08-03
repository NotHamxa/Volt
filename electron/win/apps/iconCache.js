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
