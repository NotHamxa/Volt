import os from "os";
import path from "path";
import fs from "fs";
import { readdir } from 'fs/promises';
import {exec, execFile} from "child_process";
import {extractAppLogo} from "./appLogo.js";
import {promisify} from "node:util";
import xml2js from "xml2js";
import Store from "electron-store";
import {app} from "electron";
import {Jimp} from "jimp";
const appDataPath = path.join(app.getPath('userData'), 'icons');
const parseString = promisify(xml2js.parseString)

const validImageExtensions = [".png", ".jpg", ".jpeg"];
const store = new Store();
const startMenuPaths = [
    path.join(os.homedir(), "AppData/Roaming/Microsoft/Windows/Start Menu/Programs"),
    "C:/ProgramData/Microsoft/Windows/Start Menu/Programs",
    "C:/Users/Public/Desktop"
];
const excludedExtensions = [
    // --- OS & system ---
    "sys", "dll", "ocx", "cpl", "drv", "mui", "cat", "efi",
    "kext", "dylib",
    "so", "ko",

    // --- executables & installers ---
    "app", "bin", "run", "out", "elf",
    "deb", "rpm", "pkg", "snap", "flatpak",
    "appx", "msix",

    // --- config & metadata ---
    "ini", "cfg", "conf", "reg", "dat", "inf",
    "plist", "json", "yaml", "yml", "toml","xml",

    // --- cache, temp, logs ---
    "tmp", "temp", "log", "cache", "bak", "old",
    "swp", "swo", "part", "crdownload",

    // --- disk & virtual images ---
    "iso", "img", "dmg", "vhd", "vhdx", "qcow", "raw",

    // --- databases & indexes ---
    "db", "sqlite", "sqlite3", "idx", "index",

    // --- security / certs ---
    "key", "pem", "crt", "cer", "pfx", "p12", "der",
    "gpg", "asc", "sig",

    // --- developer & build artifacts ---
    "o", "obj", "class", "map", "ilk", "lock",

    // --- python interpreter & tooling ---
    "pyc", "pyo", "pyd", "egg", "whl", "manifest", "spec",

];
const excludedFolders = [
    // IDEs
    ".idea", ".vscode", ".vs", ".eclipse", ".netbeans", ".atom",
    // Python
    ".venv", "venv", "env", ".env", "__pycache__",
    ".pytest_cache", ".tox", ".nox", ".ipynb_checkpoints",
    // Node / deps
    "node_modules", ".npm", ".yarn", ".pnpm", "vendor",
    // Build artifacts
    "build", "dist", "out", "target", "bin", "obj",
    // Cache / logs
    ".cache", ".tmp", "temp", "logs", "log", "coverage", ".nyc_output",
    // VCS
    ".git", ".svn", ".hg",
    // OS noise
    ".DS_Store", "Thumbs.db", "$RECYCLE.BIN", "System Volume Information",
    // Containers / infra
    ".docker", ".vagrant", ".terraform"
];
function resolveLnk(lnkPath) {
    return new Promise((resolve, reject) => {
        execFile(
            "powershell.exe",
            [
                "-NoProfile",
                "-Command",
                `
        $s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnkPath}');
        $s.TargetPath
        `
            ],
            { windowsHide: true },
            (err, stdout) => {
                if (err) return reject(err);
                resolve(stdout.trim());
            }
        );
    });
}
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
                // const target = await resolveLnk(fullPath);
                // console.log(`[${target}] ${fullPath}`);
                // if (!target.toLowerCase().endsWith(".exe"))
                //     return;
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
    if (!app.path)
        return appIconsCache;
    try {
        const appIcon = await extractAppLogo(app.path);
        if (!appIcon || !appIcon.startsWith('data:image')) {
            return appIconsCache;
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
        console.log(error);
        return appIconsCache;
    }

}
async function copyAppLogo(targetPath, endPath) {
    try {
        // Resize the image and get it as a Buffer
        const image = await Jimp.read(resolvedPath);
        image.resize(width, Jimp.AUTO).quality(30);

        const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
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
export async function cacheFolder(dirPath,cache,newFolder=true) {
    const filesArray = [];
    const extL = {}
    async function readDirRecursive(currentPath) {
        const entries = await readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                console.log(entry.name);
                if (excludedFolders.includes(entry.name)) continue;
                await readDirRecursive(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).replace(".","");
                if (ext === "" || excludedExtensions.includes(ext)) continue;
                if (Object.keys(extL).includes(ext)) extL[ext] += 1;
                else extL[ext] = 1;
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
    cache.cachedFoldersData[dirPath] = filesArray;
    console.log(extL);
    if (newFolder) {
        cache.cachedFolders.push(dirPath);
        store.set("cachedFolders",JSON.stringify(cache.cachedFolders))
    }
    return true
}
export async function deleteFolder(dirPath,cache) {
    if (!cache.cachedFolders.includes(dirPath)) return false;
    const normalPath=dirPath.replace("\\\\","//");
    cache.cachedFoldersData[normalPath] = null;
    delete cache.cachedFoldersData[normalPath];

    cache.cachedFolders = cache.cachedFolders.filter(folder => folder !== dirPath);
    store.set("cachedFolders", JSON.stringify(cache.cachedFolders));
    return true;
}
