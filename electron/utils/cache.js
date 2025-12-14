import os from "os";
import path from "path";
import fs from "fs";
import { readdir } from 'fs/promises';
import {exec} from "child_process";
import {extractAppLogo} from "./appLogo.js";
import {fileURLToPath} from "url";
import {promisify} from "node:util";
import xml2js from "xml2js";
import sharp from "sharp";
import Store from "electron-store";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDataPath = path.join(__dirname, 'appData/icons');
const parseString = promisify(xml2js.parseString)

const validImageExtensions = [".png", ".jpg", ".jpeg"];
const store = new Store();
const startMenuPaths = [
    path.join(os.homedir(), "AppData/Roaming/Microsoft/Windows/Start Menu/Programs"),
    "C:/ProgramData/Microsoft/Windows/Start Menu/Programs",
    "C:/Users/Public/Desktop"
];

export async function loadApps() {

    const results = [];
    async function collectShortcuts(dir) {
        if (!fs.existsSync(dir)) return;
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                await collectShortcuts(fullPath);
            } else if ([".lnk"].some(ext => fullPath.toLowerCase().endsWith(ext))) {
                results.push({
                    name: path.basename(fullPath, ".lnk"),
                    source: "StartMenu",
                    appId: "",
                    path: fullPath,
                    type: "app"
                });
            }
        }
    }
    function collectUWPApps() {
        return new Promise((resolve, reject) => {
            exec('powershell -Command "Get-StartApps | ConvertTo-Json"', (error, stdout) => {
                if (error) return reject(error);
                try {
                    const uwpApps = JSON.parse(stdout);
                    const appList = Array.isArray(uwpApps) ? uwpApps : [uwpApps];
                    appList.forEach(app => {
                        results.push({
                            name: app.Name,
                            source: "UWP",
                            appId: app.AppID,
                            path: "",
                            type: "app"
                        });
                    });
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    for (const dir of startMenuPaths) {
        await collectShortcuts(dir);
    }
    await collectUWPApps();

    const deduped = new Map();
    for (const app of results) {
        const existing = deduped.get(app.name);
        if (!existing || (!existing.path && app.path)) {
            deduped.set(app.name, app);
        }
    }
    return Array.from(deduped.values());
}
export async function cacheAppIcon(app, appIconsCache) {
    if (app.path) {
        try {
            const appIcon = await extractAppLogo(app.path);
            if (!appIcon || !appIcon.startsWith('data:image')) {
                return;
            }
            const base64Data = appIcon.split(',')[1];
            const iconPath = path.join(appDataPath, `${app.name}.png`);
            if (!fs.existsSync(appDataPath)) {
                fs.mkdirSync(appDataPath, { recursive: true });
            }
            fs.writeFileSync(iconPath, Buffer.from(base64Data, 'base64'));
            appIconsCache[app.name] = iconPath;
            return appIconsCache
        } catch (error) {
            return appIconsCache;
        }
    }
}
async function copyAppLogo(targetPath, endPath) {
    try {
        // Resize the image and get it as a Buffer
        const buffer = await sharp(targetPath)
            .resize(64, 64, {
                fit: "inside",
                withoutEnlargement: true
            })
            .toFormat("png")
            .toBuffer();

        // Convert buffer to base64
        const base64 = buffer.toString("base64");

        // Convert base64 back to binary buffer
        const binaryBuffer = Buffer.from(base64, "base64");
        await fs.writeFileSync(endPath, binaryBuffer);

        return true;
    } catch (error) {
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

            const targetPath = path.join(appDataPath, `${name}.png`);
            if (!fs.existsSync(appDataPath)) {
                fs.mkdirSync(appDataPath, { recursive: true });
            }
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
export async function cacheFolder(dirPath,cachedFolders,cachedFoldersData,newFolder=true) {
    console.time("timeStart")
    const filesArray = [];

    async function readDirRecursive(currentPath) {
        const entries = await readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                await readDirRecursive(fullPath);
            } else if (entry.isFile()) {

                filesArray.push({
                    name: entry.name,
                    source: "",
                    appId: "",
                    path: fullPath,
                    type: "file"
                });
            }
        }
    }
    await readDirRecursive(dirPath);
    console.timeEnd("timeStart")
    cachedFoldersData[dirPath] = filesArray;
    if (newFolder) cachedFolders.push(dirPath);

    return true
}
