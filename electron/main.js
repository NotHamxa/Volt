import {app, BrowserWindow, globalShortcut, ipcMain, shell} from "electron";
import Store from "electron-store";
import path from "path";
import {fileURLToPath} from "url";
import fg from "fast-glob";
import fs from "fs";
import os from "os";
import {exec} from 'child_process';
import {promisify} from 'util';
import {execSync} from "child_process";


const execAsync = promisify(exec);
const store = new Store();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let lastFocusedWindow = null;
let appCache = [];



async function loadApps() {
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
                collectShortcuts(fullPath);
            } else if (fullPath.toLowerCase().endsWith(".lnk")) {
                const appName = path.basename(fullPath, ".lnk");
                results.push({
                    name: appName,
                    source: "StartMenu",
                    appId: "",
                    path: fullPath,
                    type:"app"
                });
            }
        }
    }
    function collectUWPApps() {
        return new Promise((resolve, reject) => {
            exec('powershell -Command "Get-StartApps | ConvertTo-Json"', (error, stdout, stderr) => {
                if (error) {
                    console.error("Error executing PowerShell:", error);
                    return reject(error);
                }
                if (stderr) {
                    console.error("PowerShell stderr:", stderr);
                    // This might just be warnings — don't reject unless necessary
                }
                try {
                    const uwpApps = JSON.parse(stdout);
                    const appList = Array.isArray(uwpApps) ? uwpApps : [uwpApps];
                    appList.forEach(app => {
                        results.push({
                            name: app.Name,
                            source: "UWP",
                            appId: app.AppID,
                            path: "",
                            type:"app"
                        });
                    });
                    resolve();
                } catch (parseError) {
                    console.error("Failed to parse JSON from PowerShell:", parseError);
                    reject(parseError);
                }
            });
        });
    }
    for (const dir of startMenuPaths) {
        await collectShortcuts(dir);
    }
    console.log(results.length);
    await collectUWPApps();
    console.log(results.length);
    const deduped = new Map();

    for (const app of results) {
        const existing = deduped.get(app.name);

        if (!existing || (!existing.path && app.path)) {
            deduped.set(app.name, app);
        }
    }

    return Array.from(deduped.values());
}

loadApps()
    .then(apps => {
        appCache = apps;
    })
    .catch((err) => {
        appCache = [];
    });


async function searchApps(query) {
    if (!appCache || !Array.isArray(appCache)) return [];
    const lowerQuery = query.toLowerCase().trim();
    appCache.forEach((app) => {

    })
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
                    type: stat.isFile() ? 'file' :'folder',
                    path: fullPath
                });
            }
        } catch (err) {
        }
    }
    return results;
}
ipcMain.on('set-store', (event, { key, value }) => {
    store.set(key, value);
});

ipcMain.handle('get-store', (event, key) => {
    return store.get(key);
});

ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

ipcMain.on('set-window-height', (event, targetHeight) => {
    if (!mainWindow || typeof targetHeight !== 'number') return;

    const [width, currentHeight] = mainWindow.getSize();

    if (targetHeight !== currentHeight) {
        mainWindow.setResizable(true);
        mainWindow.setSize(width, targetHeight);
        mainWindow.setResizable(false);
    }
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
        if (mainWindow?.isVisible()) {
            mainWindow.webContents.send('window-blurred');
            mainWindow.hide();
        }
    } catch (error) {
        console.error(`Failed to open path: ${filePath}`, error);
    }
});
ipcMain.handle('launch-app', async (event, app) => {
    if (!app){
        return false
    }
    console.log(app)
    try {
        if (app.path) {
            exec(`start "" "${app.path}"`, (err) => {
                if (err) {
                    console.error(`Error launching app from path: ${err}`);
                    return false;
                }
            });
        } else if (app.source === "UWP" && app.appId) {
            const command = `start shell:AppsFolder\\${app.appId}`;
            exec(command, (err) => {
                if (err) {
                    console.error(`Error launching UWP app: ${err}`);
                    return false;
                }
            });
        } else {
            console.warn("App object is missing launch information.");
            return false;
        }
        return true;
    } catch (error) {
        console.error("Unexpected error launching app:", error);
        return false;
    }
});

ipcMain.on('open-in-explorer', async (event, path) => {
    try {
        shell.showItemInFolder(path);
    } catch (error) {}
});

const createWindow = () => {
    if (mainWindow) {
        mainWindow.loadURL("http://localhost:5173");
        return;
    }

    mainWindow = new BrowserWindow({
        width: 800,
        height: 500,
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
        if (mainWindow?.isVisible()) {
            mainWindow.webContents.send('window-blurred');
            mainWindow.hide();
        }
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

app.whenReady().then(() => {
    createWindow();
    globalShortcut.register("Esc", () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
            mainWindow.webContents.send('window-blurred');
            if (lastFocusedWindow) {
                lastFocusedWindow.focus();
            }
        }
    });

    globalShortcut.register('Ctrl+Space', () => {
        if (!mainWindow) return;

        if (mainWindow.isVisible()) {
            mainWindow.hide();
            mainWindow.webContents.send('window-blurred');
            if (lastFocusedWindow) {
                lastFocusedWindow.focus();
            }
        } else {
            lastFocusedWindow = BrowserWindow.getFocusedWindow();
            mainWindow.show();
            mainWindow.focus();
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
