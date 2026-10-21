import fs from "fs";
import { iconKey } from "./iconCache.js";

export async function getUwpAppIcon(uwpApp, appIconsCache) {
    try {
        // Name key: icons cached before the identity key, not yet migrated.
        const cachedIconPath = appIconsCache[iconKey(uwpApp)] ?? appIconsCache[uwpApp.name];
        if (cachedIconPath && fs.existsSync(cachedIconPath)) {
            const imageBuffer = fs.readFileSync(cachedIconPath);
            const base64 = imageBuffer.toString('base64');
            return `data:image/png;base64,${base64}`;
        }
        return null;

    } catch (error) {
        return null;
    }
}
