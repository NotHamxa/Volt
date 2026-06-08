import {app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray} from "electron";
import pkg from "electron-updater"
const {autoUpdater} = pkg;
import Store from "electron-store";
import path from "path";
import {fileURLToPath} from "url";
import {deleteFolder} from "./utils/cache.js";
import { initWindowFocusTracker, captureForegroundWindow, restoreForegroundWindow } from "./utils/windowFocus.js";
import chokidar from "chokidar";
import os from "os";
import {loadAppData, initStoreState, loadFolderCache, loadCommandsData, revalidateAppIcons} from "./utils/startup.js";
import {sendInstallTelemetryIfNeeded} from "./utils/telemetry.js";
import { registerIpc } from "./ipc/index.js";
import {setupAutoUpdater} from "./utils/updater.js";
import {createNotificationWindow} from "./utils/notification.js";
import {normaliseString} from "./utils/search.js";
if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}
const store = new Store();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const startMenuPaths = [
    path.join(os.homedir(), "AppData/Roaming/Microsoft/Windows/Start Menu/Programs"),
    "C:/ProgramData/Microsoft/Windows/Start Menu/Programs",
    "C:/Users/Public/Desktop"
];
let openShortcut = store.get("openWindowBind");
if (!openShortcut) {
    store.set("openWindowBind", "Ctrl+Space");
    openShortcut = "Ctrl+Space";
}
let mainWindow = null;
const cache = {
    appCache:[],
    appIconsCache:{},
    commandsCache:[],
    cachedFolders:[],
    cachedFoldersData:{},
    loadingAppCache:true,
    firstTimeExperience:false,
    cacheProgress: { current: 0, total: 0 },
}
const appStates = {
    fixWindowOpen:false,
    windowLocked:false,
    dialogOpen:false,
}

const folderWatcher = chokidar.watch([],{
    persistent: true,
    ignoreInitial: true
})
const getBaseFolder = (path) => {
    let folder = null;
    let charLen = 0;
    for (const dir of cache.cachedFolders) {
        if (path.startsWith(dir) && charLen <= dir.length) {
            charLen = dir.length;
            folder = dir;
        }
    }
    console.log(folder);
    return folder;
}
folderWatcher.on("add", filePath => {
    console.log("Adding...",filePath);
    const folder = getBaseFolder(filePath);
    if (folder && cache.cachedFoldersData[folder]) {
        cache.cachedFoldersData[folder].push({
            name: path.basename(filePath),
            source: "",
            appId: "",
            path: filePath,
            type: "file",
            normalisedName:normaliseString(filePath)
        });
        store.set("cachedFoldersData", folder);
    }
})
folderWatcher.on("unlink", filePath => {
    const folder = getBaseFolder(filePath);
    if (folder && cache.cachedFoldersData[folder]) {
        cache.cachedFoldersData[folder] = cache.cachedFoldersData[folder].filter(file=>file.path!==filePath)
    }
})
folderWatcher.on("unlinkDir", async (dirPath) => {
    if (cache.cachedFolders.includes(dirPath)) {
        await deleteFolder(dirPath,cache);
    }
    else{
        const folder = getBaseFolder(path);
        if (folder && cache.cachedFoldersData[folder]) {
            cache.cachedFoldersData[folder] = cache.cachedFoldersData[folder].filter(file=>file.path.startsWith(dirPath));
        }
    }
})
const showMainWindow = () => {
    if (!mainWindow) return;
    captureForegroundWindow();

    mainWindow.setOpacity(0);
    mainWindow.show();
    mainWindow.focus();

    setTimeout(() => {
        mainWindow.setOpacity(1);
    }, 50);
};
const hideMainWindow = () => {
    if (!mainWindow || appStates.fixWindowOpen || appStates.windowLocked) return;
    mainWindow.hide();
    mainWindow.webContents.send('window-blurred');
    restoreForegroundWindow();
};
const handleWindowLock = ()=>{
    appStates.windowLocked = !appStates.windowLocked;
    if (appStates.windowLocked) mainWindow.webContents.send('window-locked')
    else mainWindow.webContents.send('window-unlocked');
    console.log(process.memoryUsage().heapUsed/8/1024/1024)
}
const changeOpenBind = async (binding)=>{
    globalShortcut.unregister(openShortcut);
    globalShortcut.register(binding, () => {
        if (!mainWindow || cache.loadingAppCache) return;
        if (mainWindow.isVisible()) {
            hideMainWindow();
        } else {
            showMainWindow();
        }
    });
    openShortcut = binding;
    store.set("openWindowBind", binding);
    return true
}
ipcMain.handle("set-open-bind", (_, binding) => {
    return changeOpenBind(binding);
});
ipcMain.on("hide-window", () => {
    hideMainWindow();
});


const createWindow = async () => {
    if (mainWindow) {
        if (process.env.NODE_ENV === "development") {
            mainWindow.loadURL("http://localhost:5173");
        } else {
            mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
        }
        return;
    }
    mainWindow = new BrowserWindow({
        width: 800,
        height: 550,
        transparent: true,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        backgroundMaterial: 'none',
        // icon:path.join(__dirname, "assets/appLogo2CroppedNoBg.png"),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js"),
            // Production builds: DevTools and its keyboard shortcuts
            // (F12 / Ctrl+Shift+I) are unavailable. Stays on in dev.
            devTools: process.env.NODE_ENV === "development",
        },
        titleBarStyle: "hidden",
        titleBarOverlay: false,
    });

    const tray = new Tray(path.join(__dirname, "Assets/appLogo2CroppedNoBg.png"));
    tray.setToolTip("Volt")
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Quit',
            click: () => {
                app.quit();
                process.exit(0);

            },
        },
    ]);
    tray.setContextMenu(contextMenu);

    const devServerURL = "http://localhost:5173";

    mainWindow.on('blur', () => {
        if (appStates.fixWindowOpen && !appStates.dialogOpen) mainWindow.focus();
        else if (mainWindow?.isVisible()) hideMainWindow();
    });

    mainWindow.webContents.on('before-input-event', (_, input) => {
        if (input.type === 'keyDown' && input.key === 'F4' && input.alt) {
            app.quit();
        }
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
    initWindowFocusTracker();
    await createWindow();
    createNotificationWindow();
    registerIpc({
        mainWindow,
        hideMainWindow,
        cache,
        appStates,
        folderWatcher,
        store,
    });

    // Lightweight sync setup so we can hide the window + register the
    // re-open hotkey before the slow disk/PowerShell work runs.
    initStoreState(cache);
    loadCommandsData(cache, store);

    if (!cache.firstTimeExperience)
        hideMainWindow()
    else
        showMainWindow()

    globalShortcut.register(openShortcut, () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) {
            hideMainWindow();
        } else {
            showMainWindow();
        }
    });
    globalShortcut.register("Ctrl+L",handleWindowLock)

    if (process.env.NODE_ENV !== "development") {
        setupAutoUpdater(mainWindow);
    }

    // One-time install ping. Retries on every launch until the server
    // acknowledges — only then is the "sent" flag flipped in the store.
    sendInstallTelemetryIfNeeded(store).catch(() => { /* swallowed */ });

    // Heavy caching in the background: the window is already dismissible.
    (async () => {
        await loadFolderCache(cache);
        await loadAppData(mainWindow.webContents, cache);
        folderWatcher.add(cache.cachedFolders);
        cache.loadingAppCache = false;
        mainWindow.webContents.send('cache-loaded');

        // Freshness pass: prune dead entries and re-extract icons whose
        // source file has changed since the cached PNG was written.
        revalidateAppIcons(mainWindow.webContents, cache).catch(err =>
            console.warn("revalidateAppIcons failed:", err?.message ?? err)
        );
    })();

    const appsWatcher = chokidar.watch(startMenuPaths,{
        persistent: true,
        ignoreInitial: true
    });
    appsWatcher.on("add",async _=>{
        console.log("Adding...");
        await loadAppData(mainWindow.webContents,cache);

    })
    appsWatcher.on("unlink",async _=>{
        console.log("Unlinking...");
        setTimeout(async ()=>await loadAppData(mainWindow.webContents,cache), 5000);
    })
    appsWatcher.on("unlinkDir",async _=>{
        await loadAppData(mainWindow.webContents,cache);
    })

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
