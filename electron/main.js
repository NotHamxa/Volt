import {app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray} from "electron";
import pkg from "electron-updater"
const {autoUpdater} = pkg;
import Store from "electron-store";
import path from "path";
import {fileURLToPath} from "url";
import {deleteFolder} from "./utils/cache.js";
import chokidar from "chokidar";
import os from "os";
import {loadAppData, loadFileData} from "./utils/startup.js";
import { registerIpc } from "./ipc/index.js";
import {setupAutoUpdater} from "./utils/updater.js";
import {createNotificationWindow} from "./utils/notification.js";
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
let lastFocusedWindow = null;
const cache = {
    appCache:[],
    appIconsCache:{},
    cachedFolders:[],
    cachedFoldersData:{},
    loadingAppCache:true,
    firstTimeExperience:false
}
const appStates = {
    fixWindowOpen:false,
    windowLocked:false,
    pauseEscape:false,
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
            type: "file"
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
    lastFocusedWindow = BrowserWindow.getFocusedWindow();

    mainWindow.setOpacity(0);
    mainWindow.show();
    mainWindow.focus();

    setTimeout(() => {
        mainWindow.setOpacity(1);
    }, 50);

    globalShortcut.register("Esc", handleEsc);
};
const hideMainWindow = () => {
    if (!mainWindow || appStates.fixWindowOpen || appStates.windowLocked) return;
    mainWindow.hide();
    globalShortcut.unregister("Esc");
    mainWindow.webContents.send('window-blurred');
    appStates.pauseEscape = false;
    if (lastFocusedWindow) {
        lastFocusedWindow.focus();
    }
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
        if (!mainWindow) return;
        if (mainWindow.isVisible()) {
            hideMainWindow();
        } else {
            showMainWindow();
            // if (process.env.NODE_ENV !== "development") {
            //     mainWindow.webContents.reloadIgnoringCache();
            // }
        }
    });
    openShortcut = binding;
    store.set("openWindowBind", binding);
    return true
}
const handleEsc = () => {
    if (mainWindow?.isVisible() && !appStates.pauseEscape) {
        hideMainWindow();
    }
};


ipcMain.handle("set-open-bind", (_, binding) => {
    return changeOpenBind(binding);
});
ipcMain.on("toggle-esc-pause", (_, state) => {
    appStates.pauseEscape = state;
    if (state){
        globalShortcut.unregister("Esc");
    }
    else{
        globalShortcut.register("Esc", handleEsc);
    }
})


const createWindow = async () => {
    if (mainWindow) {
        mainWindow.loadURL("http://localhost:5173");
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
        if (appStates.fixWindowOpen) mainWindow.focus();
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
    mainWindow.hide();

};

app.whenReady().then(async () => {
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
    await loadAppData(mainWindow.webContents,cache);
    await loadFileData(cache)
    if (process.env.NODE_ENV !== "development") {
        setupAutoUpdater(mainWindow);
    }
    folderWatcher.add(cache.cachedFolders)
    cache.loadingAppCache = false;
    mainWindow.webContents.send('cache-loaded');

    const appsWatcher = chokidar.watch(startMenuPaths,{
        persistent: true,
        ignoreInitial: true
    });
    globalShortcut.register(openShortcut, () => {
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


    globalShortcut.register("Ctrl+L",handleWindowLock)

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
