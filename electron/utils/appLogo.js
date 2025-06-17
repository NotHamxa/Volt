import extractIcon from 'extract-file-icon';
import sharp from 'sharp';
import fs from "fs";


export async function extractAppLogo(filePath){
    const rawSize = 48;
    const targetSize = 64;

    try {
        const iconBuffer = extractIcon(filePath, rawSize);
        if (!iconBuffer) throw new Error("No icon found for file");

        const resizedBuffer = await sharp(iconBuffer)
            .trim()
            .resize(targetSize, targetSize, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toBuffer();

        return `data:image/png;base64,${resizedBuffer.toString("base64")}`;
    } catch (err) {
        throw new Error(`Failed to extract or resize icon: ${err.message}`);
    }
}


export async function getAppLogo(app, appIconsCache) {
    try {
        const cachedIconPath = appIconsCache[app.name];

        if (cachedIconPath && fs.existsSync(cachedIconPath)) {
            const imageBuffer = fs.readFileSync(cachedIconPath);
            const base64 = imageBuffer.toString('base64');
            return `data:image/png;base64,${base64}`;
        }
        return await extractAppLogo(app.path);

    } catch (error) {
        return null;
    }
}
