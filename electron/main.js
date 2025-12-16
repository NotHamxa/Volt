import {app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, shell, Tray} from "electron";
import Store from "electron-store";
import path from "path";
import {fileURLToPath} from "url";
import {cacheFolder, deleteFolder} from "./utils/cache.js";
import {searchApps, searchFilesAndFolders, searchSettings} from "./utils/search.js";
import {getGoogleSuggestions} from "./utils/autoSuggestion.js";
import {launchApp} from "./utils/launchApp.js";
import {getAppLogo} from "./utils/appLogo.js";
import {openFileWith} from "./utils/openFileWith.js";
import {getUwpAppIcon} from "./utils/uwpAppLogo.js";
import chokidar from "chokidar";
import {executeUserCommand} from "./utils/cmd.js";
import os from "os";
import {fetchFavicon} from "./utils/linkFavicon.js";
import {loadAppData, loadFileData} from "./utils/startup.js";
import fs from "fs";
import sharp from "sharp";

if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}
const store = new Store();
// store.delete("cachedFoldersData")
// store.delete("cachedFolders")
// store.delete("firstTimeExperience")
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
let fixWindowOpen = false;
let windowLocked = false;
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
    return await getAppLogo(app,cache.appIconsCache);
});
ipcMain.handle('get-uwp-app-logo', async (_, app) => {
    return await getUwpAppIcon(app,cache.appIconsCache);
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
    return await searchFilesAndFolders(dir, pattern,cache.cachedFoldersData);
});
ipcMain.handle('search-apps', async (_, pattern) => {
    return await searchApps(cache.appCache, pattern);
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
    return cache.loadingAppCache;
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
    return dirPath;
});
ipcMain.handle("cache-folder",async (_, path) => {
    console.log(path);
    const before = process.memoryUsage().heapUsed;
    const result = await cacheFolder(path,cache);
    const after = process.memoryUsage().heapUsed;

    console.log(`Approx memory used by folder cache: ${(after - before)/1024/1024} MB`);

    if (!result) return false;
    folderWatcher.add(path);
    return true;

})
ipcMain.handle("delete-folder", async (_, path) => {
    return await deleteFolder(path,cache)
});
ipcMain.handle('get-image-b64', async (event, imgPath, width = 50) => {
    try {
        const resolvedPath = path.resolve(imgPath);
        if (!fs.existsSync(resolvedPath)) {
            return null
        }const buffer = await sharp(resolvedPath)
            .resize({ width })
            .jpeg({ quality: 30 })
            .toBuffer();
        return `data:image/jpeg;base64,${buffer.toString('base64')}`
    } catch (error) {
        return null;
    }
});


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
    await loadAppData(mainWindow.webContents,cache);
    await loadFileData(cache)
    folderWatcher.add(cache.cachedFolders)
    cache.loadingAppCache = false;
    mainWindow.webContents.send('cache-loaded');

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
