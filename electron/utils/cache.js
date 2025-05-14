import os from "os";
import path from "path";
import fs from "fs";
import {exec} from "child_process";
import {extractAppLogo, getAppLogo} from "./appLogo.js";
import {fileURLToPath} from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDataPath = path.join(__dirname, 'appData/icons');


function cacheFilesAndFolders(){

}


export async function loadApps() {
    const startMenuPaths = [
        path.join(os.homedir(), "AppData/Roaming/Microsoft/Windows/Start Menu/Programs"),
        "C:/ProgramData/Microsoft/Windows/Start Menu/Programs",
        "C:/Users/Public/Desktop"
    ];
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
