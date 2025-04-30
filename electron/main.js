import { app, BrowserWindow, globalShortcut, ipcMain, shell } from "electron";
import Store from "electron-store";
import path from "path";
import { fileURLToPath } from "url";
import fg from "fast-glob";
import fs from "fs";
import os from "os";
const store = new Store();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let lastFocusedWindow = null;

async function searchApps(query) {
    const startMenuPaths = [
        path.join(os.homedir(), "AppData/Roaming/Microsoft/Windows/Start Menu/Programs"),
        "C:/ProgramData/Microsoft/Windows/Start Menu/Programs",
        "C:/Users/Public/Desktop"
    ];
    const results = [];
    function collectShortcuts(dir) {
        if (!fs.existsSync(dir)) return;

        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                collectShortcuts(fullPath);
            } else if (fullPath.toLowerCase().endsWith(".lnk")) {
                results.push(fullPath);
            }
        }
    }
    for (const dir of startMenuPaths) {
        collectShortcuts(dir);
    }
    return results.filter(filePath =>
        path.basename(filePath).toLowerCase().includes(query.toLowerCase())
    );
}
async function searchFilesAndFolders(baseDir, query) {
    console.log(query);
    const matches = await fg([`**/*${query}*`], {
        cwd: baseDir,
        absolute: true,
        onlyFiles: false,
        suppressErrors: true
    });

    const files = [];
    const folders = [];

    for (const fullPath of matches) {
        try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) files.push(fullPath);
            else if (stat.isDirectory()) folders.push(fullPath);
        } catch (err) {}
    }
    return { files, folders };
}
ipcMain.handle('get-file-icon', async (event, filePath) => {
    try {
        const icon = await app.getFileIcon(filePath, { size: 'normal' });
        return icon.toDataURL();
    } catch (error) {
        console.error('Error retrieving file icon:', error);
        return null;
    }
});
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
        await shell.openPath(filePath)
        if (mainWindow?.isVisible()) {
            mainWindow.webContents.send('window-blurred');
            mainWindow.hide();
        }
    } catch (error) {
        console.error(`Failed to open path: ${filePath}`, error);
    }
});
ipcMain.on('open-in-explorer', async (event, path) => {
    try {
        shell.showItemInFolder(path);
    } catch (error) {
    }
});
const createWindow = () => {
    if (mainWindow) {
        mainWindow.loadURL("http://localhost:5173");
        return;
    }

    mainWindow = new BrowserWindow({
        width: 600,
        height: 125,
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
    globalShortcut.register("Esc",()=>{
        if (mainWindow.isVisible()){
            mainWindow.hide();
            mainWindow.webContents.send('window-blurred');
            if (lastFocusedWindow) {
                lastFocusedWindow.focus();
            }
        }
    })
    globalShortcut.register('Alt+S', () => {
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
