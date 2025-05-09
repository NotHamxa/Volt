import {app, BrowserWindow, globalShortcut, ipcMain, shell} from "electron";
import Store from "electron-store";
import path from "path";
import {fileURLToPath} from "url";
import fg from "fast-glob";
import fs from "fs";
import os from "os";
import {exec} from "child_process";
import https from "https";
import {getFileIconBase64} from "./utils/appLogo.js";

const store = new Store();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let lastFocusedWindow = null;
let appCache = [];

const showMainWindow = () => {
    if (!mainWindow) return;
    lastFocusedWindow = BrowserWindow.getFocusedWindow();
    mainWindow.show();
    mainWindow.focus();
    console.log("shortcut added")
    globalShortcut.register("Esc", handleEsc);
};

const hideMainWindow = () => {
    if (!mainWindow) return;
    mainWindow.hide();
    globalShortcut.unregister("Esc");
    console.log("shortcut removed")
    mainWindow.webContents.send('window-blurred');
    if (lastFocusedWindow) {
        lastFocusedWindow.focus();
    }
};

const handleEsc = () => {
    console.log("shortcut")
    if (mainWindow?.isVisible()) {
        hideMainWindow();
    }
};

// exec('powershell -Command "Get-AppxPackage -Name Microsoft.Microsoft3DViewer | Select-Object -ExpandProperty InstallLocation"', (error, stdout) => {
//     const installLocation = stdout.trim();
//     if (!installLocation) return;
//     const iconPath = `${installLocation}\\Assets\\Logo.png`;
//     console.log(`Install Location: ${installLocation}`);
//     console.log(`Icon Path: ${iconPath}`);
// });

async function loadApps() {
    console.log(os.homedir())
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

async function searchApps(query) {
    if (!appCache || !Array.isArray(appCache)) return [];
    const lowerQuery = query.toLowerCase().trim();
    return appCache.filter(app => app.name.toLowerCase().includes(lowerQuery));
}

async function searchFilesAndFolders(baseDir, query) {
    const matches = await fg([`**/*`], {
        cwd: baseDir,
        absolute: true,
        onlyFiles: false,
        suppressErrors: true
    });
    const lowerQuery = query.toLowerCase();
    const results = [];
    for (const fullPath of matches) {
        try {
            const stat = fs.statSync(fullPath);
            const name = path.basename(fullPath);
            if (name.toLowerCase().includes(lowerQuery)) {
                results.push({
                    name,
                    type: stat.isFile() ? 'file' : 'folder',
                    path: fullPath
                });
            }
        } catch {}
    }
    return results;
}

ipcMain.handle('get-google-suggestions', async (_, query) => {
    return new Promise((resolve) => {
        const url = `https://www.google.com/complete/search?q=${encodeURIComponent(query)}&cp=${query.length}&client=gws-wiz-serp&xssi=t&hl=en-PK`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const cleaned = data.replace(/^\)\]\}'\n/, '');
                    const parsed = JSON.parse(cleaned);
                    resolve(parsed[0].map(item => item[0]));
                } catch {
                    resolve([]);
                }
            });
        }).on('error', () => resolve([]));
    });
});

ipcMain.handle('get-app-logo', async (_, path) => {
    return await getFileIconBase64(path);
});
ipcMain.handle('get-uwp-app-logo', async (_, appName) => {
    return await ""
})


ipcMain.on('set-store', (_, { key, value }) => store.set(key, value));
ipcMain.handle('get-store', (_, key) => store.get(key));

ipcMain.on('open-external', (_, url) => {
    shell.openExternal(url).then(() => hideMainWindow());
});

ipcMain.handle('search-files', async (_, dir, pattern) => {
    return await searchFilesAndFolders(dir, pattern);
});

ipcMain.handle('search-apps', async (_, pattern) => {
    return await searchApps(pattern);
});

ipcMain.on('open-path', async (_, filePath) => {
    try {
        await shell.openPath(filePath);
        hideMainWindow();
    } catch {}
});


ipcMain.handle('launch-app', async (_, app, admin = false) => {
    if (!app) return false;
    try {
        if (app.path) {
            if (admin) {
                const command = `powershell -Command "Start-Process -FilePath \\"${app.path}\\" -Verb RunAs"`;
                exec(command, err => { if (err) console.error('Admin launch failed:', err); });
            } else {
                exec(`start "" "${app.path}"`, err => { if (err) console.error('Regular launch failed:', err); });
            }
        } else if (app.source === "UWP" && app.appId) {
            exec(`start shell:AppsFolder\\${app.appId}`, err => { if (err) console.error('UWP launch failed:', err); });
        } else {
            return false;
        }
        hideMainWindow();
        return true;
    } catch (err) {
        console.error('Launch error:', err);
        return false;
    }
});

ipcMain.on('open-in-explorer', (_, path) => {
    try {
        shell.showItemInFolder(path);
        hideMainWindow();
    } catch {}
});

const createWindow = () => {
    if (mainWindow) {
        mainWindow.loadURL("http://localhost:5173");
        return;
    }

    mainWindow = new BrowserWindow({
        width: 800,
        height: 540,
        transparent: true,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        backgroundMaterial: 'none',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js"),
        },
        titleBarStyle: "hidden",
        titleBarOverlay: false,
    });

    const devServerURL = "http://localhost:5173";

    mainWindow.on('blur', () => {
        if (mainWindow?.isVisible()) hideMainWindow();
    });

    mainWindow.on('focus', () => {
        lastFocusedWindow = BrowserWindow.getFocusedWindow();
    });

    if (process.env.NODE_ENV === "development") {
        mainWindow.loadURL(devServerURL);
    } else {
        mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
    }

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
};

app.whenReady().then(async () => {
    try {
        appCache = await loadApps();
    } catch {
        appCache = [];
    }

    createWindow();

    globalShortcut.register('Ctrl+Space', () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) {
            hideMainWindow();
        } else {
            showMainWindow();
            if (process.env.NODE_ENV !== "development") {
                mainWindow.webContents.reloadIgnoringCache();
            }
        }
    });

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    if (process.env.NODE_ENV === "development") {
        setTimeout(() => {
            mainWindow?.webContents.reload();
        }, 500);
    }
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
