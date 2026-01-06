import extractIcon from 'extract-file-icon';
import fs from "fs";
import {Jimp} from "jimp";


export async function extractAppLogo(filePath){
    const rawSize = 48;
    try {
        const iconBuffer = extractIcon(filePath, rawSize);
        if (!iconBuffer) throw new Error("No icon found for file");
        const image = await Jimp.read(resolvedPath);
        image.resize(width, Jimp.AUTO).quality(30);

        const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
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
