import extractIcon from 'extract-file-icon';
import fs from "fs";
import {Jimp} from "jimp";
import {iconKey} from "./iconCache.js";



export async function extractAppLogo(filePath) {
    const rawSize = 48;
    const targetSize = 64;

    try {
        const iconBuffer = extractIcon(filePath, rawSize);
        if (!iconBuffer) {
            throw new Error("No icon found for file");
        }

        const image = await Jimp.read(iconBuffer);

        image.resize({
            w: targetSize,
            h: targetSize
        });

        const buffer = await image.getBuffer("image/png");

        return `data:image/png;base64,${buffer.toString("base64")}`;
    } catch (err) {
        throw new Error(`Failed to extract or resize icon: ${err.message}`);
    }
}

export async function getAppLogo(app, appIconsCache) {
    try {
        // Name key: icons cached before the identity key, not yet migrated.
        const cachedIconPath = appIconsCache[iconKey(app)] ?? appIconsCache[app.name];

        if (cachedIconPath && fs.existsSync(cachedIconPath)) {
            const imageBuffer = fs.readFileSync(cachedIconPath);
            const base64 = imageBuffer.toString('base64');
            return `data:image/png;base64,${base64}`;
        }
        const source = app.path || app.target;
        return source ? await extractAppLogo(source) : null;

    } catch (error) {
        return null;
    }
}
