import {app, BrowserWindow, globalShortcut, ipcMain, shell, Tray, Menu, dialog} from "electron";
import Store from "electron-store";
import path from "path";
import {fileURLToPath} from "url";
import {cacheAppIcon, cacheFolder, cacheUwpIcon, loadApps} from "./utils/cache.js";
import {searchApps, searchFilesAndFolders, searchSettings} from "./utils/search.js";
import {getGoogleSuggestions} from "./utils/autoSuggestion.js";
import {launchApp} from "./utils/launchApp.js";
import {getAppLogo} from "./utils/appLogo.js";
import {openFileWith} from "./utils/openFileWith.js";
import {getUwpAppIcon, getUwpInstallLocations} from "./utils/uwpAppLogo.js";
import chokidar from "chokidar";
import {executeUserCommand} from "./utils/cmd.js";
import os from "os";
import {fetchFavicon} from "./utils/linkFavicon.js";

if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}
const store = new Store();
store.delete("cachedFoldersData")
store.delete("cachedFolders")
store.delete("firstTimeExperience")
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
let appCache = [];
let appIconsCache = {}
let cachedFolders = [];
let cachedFoldersData = {};
let loadingAppCache = true;
let fixWindowOpen = false;
let windowLocked = false;
let firstTimeExperience = false;
const folderWatcher = chokidar.watch([],{
    persistent: true,
    ignoreInitial: true
})
folderWatcher.on("add", path => {
    let folder = null;
    for (let i=0; i<cachedFolders.length; i++) {
        if (path.startsWith(cachedFolders[i])) {
            folder = cachedFolders[i];
        }
    }
    if (folder && cachedFoldersData[folder]) {
        cachedFoldersData[folder].push(path);
        store.set("cachedFoldersData", folder);
    }
})
folderWatcher.on("unlink", path => {
    console.log(path);
})
folderWatcher.on("unlinkDir", path => {
    console.log(path);
})

const showMainWindow = () => {
    if (!mainWindow) return;
    lastFocusedWindow = BrowserWindow.getFocusedWindow();
    mainWindow.show();
    mainWindow.focus();
    globalShortcut.register("Esc", handleEsc);
};
const hideMainWindow = () => {
    if (!mainWindow || fixWindowOpen || windowLocked) return;
    console.log(fixWindowOpen)
    mainWindow.hide();
    globalShortcut.unregister("Esc");
    mainWindow.webContents.send('window-blurred');
    if (lastFocusedWindow) {
        lastFocusedWindow.focus();
    }
};
const handleWindowLock = ()=>{
    windowLocked = !windowLocked;
    if (windowLocked) mainWindow.webContents.send('window-locked')
    else mainWindow.webContents.send('window-unlocked');
}
const changeOpenBind = async (binding)=>{
    globalShortcut.unregister(openShortcut);
    globalShortcut.register(binding, () => {
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
    openShortcut = binding;
    store.set("openWindowBind", binding);
    return true
}
const handleEsc = () => {
    if (mainWindow?.isVisible()) {
        hideMainWindow();
    }
};

ipcMain.on("log",async (_,data)=>{
    console.log(data)
})
ipcMain.handle('set-open-bind',async (_,binding)=>{
    return await changeOpenBind(binding);
})
ipcMain.handle('get-google-suggestions', async (_, query) => {
    return await getGoogleSuggestions(query);
});
ipcMain.handle('get-app-logo', async (_, app) => {
    return await getAppLogo(app,appIconsCache);
});
ipcMain.handle('get-uwp-app-logo', async (_, app) => {
    return await getUwpAppIcon(app,appIconsCache);
})
ipcMain.handle('get-link-favicon', async (_, link) => {
    return await fetchFavicon(link);
})
ipcMain.on('set-store', (_, { key, value }) => store.set(key, value));
ipcMain.handle('get-store', (_, key) => store.get(key));
ipcMain.on("clear-store", (_) => {
    store.clear();
    app.relaunch();
    app.exit(0);
});
ipcMain.on('open-external', (_, url) => {
    shell.openExternal(url).then(() => hideMainWindow());
});
ipcMain.handle('search-files', async (_, dir, pattern) => {
    return await searchFilesAndFolders(dir, pattern,cachedFoldersData);
});
ipcMain.handle('search-apps', async (_, pattern) => {
    return await searchApps(appCache, pattern);
});
ipcMain.handle('search-settings',async (_, pattern) => {
    return await searchSettings(pattern);
})
ipcMain.on('open-setting',async (_,setting) => {
   await shell.openExternal(setting);

})
ipcMain.on('open-path', async (_, filePath) => {
    try {
        await shell.openPath(filePath);
        hideMainWindow();
    } catch {}
});
ipcMain.on('open-uninstall',async (_) => {
    try{
        await shell.openExternal('ms-settings:appsfeatures');
        return true
    }
    catch{
        return false;
    }
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
ipcMain.on('open-file-with',async (_, path) => {
    await openFileWith(path);
})
ipcMain.handle('get-loading-cache-status',(_)=>{
    return loadingAppCache;
})
ipcMain.on("execute-cmd",async (_,cmd)=>{
    await executeUserCommand(cmd);
})
ipcMain.handle("select-folder", async () => {
    fixWindowOpen = true;
    const result = await dialog.showOpenDialog(mainWindow,{
        title: "Select Folder",
        properties: ["openDirectory"],
    });
    const dirPath = result.filePaths?.[0];
    mainWindow.focus()
    fixWindowOpen = false;
    if (!dirPath) return null;
    console.log("Starting Cache")
    await cacheFolder(dirPath, cachedFolders, cachedFoldersData)
    return dirPath;
});
ipcMain.handle("delete-folder", async (_, path) => {
    if (!cachedFolders.includes(path)) return false;
    delete cachedFoldersData[path];
    const updatedFolders = cachedFolders.filter(folder => folder !== path);
    store.set("cachedFoldersData", cachedFoldersData);
    store.set("cachedFolders", JSON.stringify(updatedFolders));
    return true;
});

const createWindow = () => {
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
const loadAppIconsCache = async ()=> {
    appIconsCache = store.get("appIconsCache");
    if (appIconsCache) {
        appIconsCache = JSON.parse(appIconsCache);
    }
    else{
        appIconsCache = {}
    }
    const uwpIconsToCache = []
    let totalApps = appCache.length;
    let currentNumber = 0;
    for (const appData of appCache) {
        if (!(appData.name in appIconsCache) && appData.path) {
            appIconsCache = await cacheAppIcon(appData, appIconsCache);
            currentNumber = currentNumber+1
            mainWindow.webContents.send("set-cache-loading-bar",currentNumber,totalApps)
        }
        else if (appData.source==="UWP" && !(appData.name in appIconsCache)) {
            uwpIconsToCache.push(appData)
        }
    }
    if (uwpIconsToCache.length > 0) {
        const uwpIconsInstallPath = await getUwpInstallLocations(uwpIconsToCache);
        const diff = uwpIconsToCache.length - uwpIconsInstallPath.length;
        currentNumber = currentNumber+diff
        mainWindow.webContents.send("set-cache-loading-bar",currentNumber,totalApps)
        for (const uwpApp of uwpIconsInstallPath) {
            if (uwpApp.installLocation){
                appIconsCache = await cacheUwpIcon(uwpApp.installLocation,uwpApp.name,appIconsCache)
                currentNumber = currentNumber+1
                mainWindow.webContents.send("set-cache-loading-bar",currentNumber,totalApps)
            }
        }
    }
    store.set("appIconsCache", JSON.stringify(appIconsCache));
    loadingAppCache = false
    mainWindow.webContents.send('cache-loaded');

}
app.whenReady().then(async () => {
    const loadData = async ()=>{
        try {
            firstTimeExperience = store.get("firstTimeExperience") ?? true;
            console.log(firstTimeExperience);
            appCache = await loadApps();
            cachedFolders = JSON.parse(await store.get("cachedFolders") ?? "[]");
            if (firstTimeExperience) {
                const desktopPath = app.getPath("desktop");
                const downloadsPath = app.getPath("downloads");
                cachedFolders.push(desktopPath);
                cachedFolders.push(downloadsPath);
                store.set("cachedFolders", JSON.stringify(cachedFolders));
            }
            for (const path of cachedFolders){
                await cacheFolder(path, cachedFolders,cachedFoldersData, false);
                folderWatcher.add(path);
            }
            setTimeout(async ()=>{
                await validateCache();
                await loadAppIconsCache();
            }, 1);
            store.set("firstTimeExperience", false);
        } catch(error) {
            appCache = [];
        }
    }
    const validateCache = async ()=> {
        try {
            let appLaunchStack = JSON.parse((await store.get("appLaunchStack")) ?? "[]");
            let pApps = JSON.parse((await store.get("pinnedApps")) ?? "[]")
            pApps = pApps.filter(app => appCache.some(aCache=>aCache.name===app.name));
            appLaunchStack = appLaunchStack.filter(app => appCache.some(aCache=>aCache.name===app));
            store.set("appLaunchStack", JSON.stringify(appLaunchStack));
            store.set("pinnedApps", JSON.stringify(pApps));
            mainWindow.webContents.send('reloaded-app-cache')
        }
        catch(error) {
            console.error(error);
        }
    }
    await loadData();

    createWindow();
    const appsWatcher = chokidar.watch(startMenuPaths,{
        persistent: true,
        ignoreInitial: true
    });
    appsWatcher.on("add",async _=>{
        console.log("Adding...");
        await loadData();

    })
    appsWatcher.on("unlink",async _=>{
        console.log("Unlinking...");
        setTimeout(loadData, 5000);
    })
    appsWatcher.on("unlinkDir",async _=>{
        await loadData()
    })

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
