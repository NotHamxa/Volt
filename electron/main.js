import {app, BrowserWindow, globalShortcut, ipcMain, shell} from "electron";
import Store from "electron-store";
import path from "path";
import {fileURLToPath} from "url";
import {exec} from "child_process";
import {getFileIconBase64} from "./utils/appLogo.js";
import {loadApps} from "./utils/cache.js";
import {searchApps, searchFilesAndFolders} from "./utils/search.js";
import {getGoogleSuggestions} from "./utils/autoSuggestion.js";
import {launchApp} from "./utils/launchApp.js";

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

ipcMain.handle('get-google-suggestions', async (_, query) => {
    return await getGoogleSuggestions(query);
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
    return await searchApps(appCache, pattern);
});
ipcMain.on('open-path', async (_, filePath) => {
    try {
        await shell.openPath(filePath);
        hideMainWindow();
    } catch {}
});
ipcMain.on('open-uninstall',async (_) => {
    await shell.openExternal('ms-settings:appsfeatures');
})
ipcMain.handle('launch-app', async (_, app, admin = false) => {
    const opened = await launchApp(app,admin)
    if (opened){
        hideMainWindow();
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
