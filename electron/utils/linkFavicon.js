import fetch from 'node-fetch';
import fs from 'fs';
import { fileURLToPath, URL } from 'url';
import path from 'path';
import psl from 'psl';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const faviconDataPath = path.join(__dirname, 'appData', 'favicons');

export async function fetchFavicon(siteUrl) {
    try {
        if (!fs.existsSync(faviconDataPath)) {
            fs.mkdirSync(faviconDataPath, {recursive: true});
        }

        const parsed = new URL(siteUrl);
        const parsedDomain = psl.parse(parsed.hostname);
        const rootDomain = parsedDomain.domain || parsed.hostname;

        const fileName = rootDomain + '.png';
        const filePath = path.join(faviconDataPath, fileName);

        if (fs.existsSync(filePath)) {
            const fileBuffer = fs.readFileSync(filePath);
            return `data:image/png;base64,${fileBuffer.toString('base64')}`;
        }

        const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${rootDomain}`;
        const res = await fetch(faviconUrl);
        if (!res.ok) throw new Error(`Failed to fetch favicon: ${res.status}`);

        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        return `data:image/png;base64,${buffer.toString('base64')}`;

    }
    catch(error) {
        // console.error(error);
        return null;
    }
}
