import os from "os";
import path from "path";
import fs from "fs";
import {exec} from "child_process";


function cacheFilesAndFolders(){

}


export async function loadApps() {
    const startMenuPaths = [
        path.join(os.homedir(), "AppData/Roaming/Microsoft/Windows/Start Menu/Programs"),
        "C:/ProgramData/Microsoft/Windows/Start Menu/Programs",
        "C:/Users/Public/Desktop"
    ];
    console.log(startMenuPaths);
    const results = [];
    async function collectShortcuts(dir) {
        if (!fs.existsSync(dir)) return;
        console.log(dir)
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
                        // console.log(app.Name, ": ",app.AppID)
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
