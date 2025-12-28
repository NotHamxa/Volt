import fetch from 'node-fetch';
import fs from 'fs';
import { fileURLToPath, URL } from 'url';
import path from 'path';
import psl from 'psl';
import {app} from "electron";

const faviconDataPath = path.join(app.getPath('userData'), 'favicons');

export async function fetchFavicon(siteUrl) {
    try {
        console.log(siteUrl);
        if (!fs.existsSync(faviconDataPath)) {
            fs.mkdirSync(faviconDataPath, {recursive: true});
        }
        console.log(faviconDataPath)
        const parsed = new URL(siteUrl);
        const parsedDomain = psl.parse(parsed.hostname);
        const rootDomain = parsedDomain.domain || parsed.hostname;
        const fileName = rootDomain + '.png';
        const filePath = path.join(faviconDataPath, fileName);

        if (fs.existsSync(filePath)) {
            const fileBuffer = fs.readFileSync(filePath);
            console.log(filePath);
            return `data:image/png;base64,${fileBuffer.toString('base64')}`;
        }

        const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${rootDomain}`;
        const res = await fetch(faviconUrl);
        if (!res.ok) throw new Error(`Failed to fetch favicon: ${res.status}`);

        const buffer = Buffer.from(await res.arrayBuffer());
        console.log("Saving: ",filePath);

        fs.writeFileSync(filePath, buffer);
        console.log("Saved");
        return `data:image/png;base64,${buffer.toString('base64')}`;

    }
    catch(error) {
        console.error(error);
        return null;
    }
}