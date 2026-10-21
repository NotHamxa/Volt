import {app, BrowserWindow, globalShortcut, ipcMain, Menu, shell, Tray} from "electron";
import Store from "electron-store";
import fs from "fs";
import path from "path";
import {fileURLToPath, pathToFileURL} from "url";
import {deleteFolder, indexPath} from "./universal/folderCache.js";
import {FolderWatcher, watchTree} from "./universal/folderWatcher.js";
import {initStoreState, loadFolderCache, loadCommandsData} from "./universal/startup.js";
import {sendInstallTelemetryIfNeeded} from "./universal/telemetry.js";
import {createLaunchHotkeys} from "./universal/launchHotkeys.js";
import { registerIpc } from "./ipc/index.js";
import {createNotificationWindow, showNotification} from "./universal/notification.js";
import {
    initWindowFocusTracker,
    setOwnWindowHandle,
    captureForegroundWindow,
    restoreForegroundWindow,
    loadAppData,
    revalidateAppIcons,
    appWatchPaths,
    packageWatchPath,
    registerIconScheme,
    handleIconProtocol,
    appLogoUrls,
} from "./platform.js";
registerIconScheme();
if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}
// Launching Volt again (Start menu, desktop shortcut) while it's already
// running in the background should bring it up, not silently do nothing.
app.on("second-instance", () => showMainWindow());
const store = new Store();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let openShortcut = store.get("openWindowBind");
if (!openShortcut) {
    store.set("openWindowBind", "Ctrl+Space");
    openShortcut = "Ctrl+Space";
}
let mainWindow = null;
let tray = null;
const LOADER_MAX_MS = 30000;
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
    // AI mode keeps the window open like fixWindowOpen, but without stealing
    // focus back on blur — you should be able to click away and read something
    // while an answer streams.
    aiMode:false,
    // Whether the AI view holds the window open on blur. On unless the pin
    // in the AI view is switched off.
    aiKeepOpen:true,
    dialogOpen:false,
}

// cachedFoldersData is derived state — rebuilt from disk on every launch by
// loadFolderCache — so the watcher only patches it in memory.
const folderWatcher = new FolderWatcher();
folderWatcher.on("add", async (root, addedPaths) => {
    const found = [];
    for (const addedPath of addedPaths) found.push(...await indexPath(addedPath));
    const entries = cache.cachedFoldersData[root];
    if (!entries) return;
    // Saves often arrive as a re-create of an existing file, so skip known paths.
    const known = new Set(entries.map(entry => entry.path));
    for (const entry of found) {
        if (known.has(entry.path)) continue;
        known.add(entry.path);
        entries.push(entry);
    }
})
folderWatcher.on("remove", async (root, removedPaths) => {
    if (removedPaths.includes(root)) {
        folderWatcher.unwatch(root);
        await deleteFolder(root,cache);
        return;
    }
    const entries = cache.cachedFoldersData[root];
    if (!entries) return;
    // A removed folder takes everything under it, so check each entry's ancestors.
    const gone = new Set(removedPaths);
    const isGone = entryPath => {
        for (let p = entryPath; p.length > root.length; p = path.dirname(p)) {
            if (gone.has(p)) return true;
        }
        return false;
    };
    cache.cachedFoldersData[root] = entries.filter(entry => !isGone(entry.path));
})
const showMainWindow = () => {
    if (!mainWindow) return;
    captureForegroundWindow();

    mainWindow.setOpacity(0);
    // Dismissing minimises before hiding, so the window can come back from a
    // minimised state — show() alone doesn't always undo that on Windows.
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();

    setTimeout(() => {
        mainWindow.setOpacity(1);
    }, 50);
};
let hidingWindow = false;
const hideMainWindow = (restoreFocus = true) => {
    // aiMode is deliberately not checked here: it only suppresses the *blur*
    // auto-hide (handled in the blur listener). An explicit hide — the hotkey,
    // Escape, tray — must still work while the AI view is open.
    if (!mainWindow || appStates.fixWindowOpen || appStates.windowLocked) return;
    if (hidingWindow) return;
    hidingWindow = true;
    // hide() on its own just drops Volt off the screen: Windows is free to hand
    // the foreground to the desktop instead of whatever the window was covering.
    // Minimising first makes it promote the next window in the z-order — the app
    // you were using before you opened Volt. SetForegroundWindow on the captured
    // hwnd is the belt-and-braces pass for the cases where that isn't enough.
    if (restoreFocus && mainWindow.isVisible()) mainWindow.minimize();
    mainWindow.hide();
    mainWindow.webContents.send('window-blurred');
    if (restoreFocus) restoreForegroundWindow();
    hidingWindow = false;
};
const handleWindowLock = ()=>{
    appStates.windowLocked = !appStates.windowLocked;
    if (appStates.windowLocked) mainWindow.webContents.send('window-locked')
    else mainWindow.webContents.send('window-unlocked');
    console.log(process.memoryUsage().heapUsed/8/1024/1024)
}
const toggleMainWindow = () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
        hideMainWindow();
    } else {
        showMainWindow();
    }
};
const launchHotkeys = createLaunchHotkeys({
    store,
    cache,
    getOpenShortcut: () => openShortcut,
    // No focus restore: whatever the hotkey opens is about to take the front.
    hideIfShown: () => { if (mainWindow?.isVisible()) hideMainWindow(false); },
});
// The hotkey is the only way into Volt, so a new one must be registered
// before the old one is let go. Windows refuses combos another app owns, and
// Electron throws on names it can't parse — either way the old key stays.
const changeOpenBind = async (binding)=>{
    if (binding === openShortcut) return true;
    // Already Volt's own, as an app or link hotkey.
    if (launchHotkeys.owner(binding)) return false;
    let registered = false;
    try {
        registered = globalShortcut.register(binding, toggleMainWindow);
    } catch (err) {
        console.warn("Could not register hotkey:", binding, err?.message);
    }
    if (!registered) return false;
    globalShortcut.unregister(openShortcut);
    openShortcut = binding;
    store.set("openWindowBind", binding);
    return true;
}
ipcMain.handle("set-open-bind", (_, binding) => {
    return changeOpenBind(binding);
});
ipcMain.handle("get-app-logo-urls", (_, apps) => appLogoUrls(apps, cache));
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
        // Hidden until startup decides: at login it would otherwise flash up
        // and take focus from whatever the user had open.
        show: false,
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

    const nativeHandle = mainWindow.getNativeWindowHandle();
    setOwnWindowHandle(
        nativeHandle.length >= 8
            ? Number(nativeHandle.readBigUInt64LE(0))
            : nativeHandle.readUInt32LE(0)
    );

    // Module-level: a Tray only referenced from here can be garbage-collected
    // and vanish from the notification area.
    tray = new Tray(path.join(__dirname, "Assets/appLogo2CroppedNoBg.png"));
    tray.setToolTip("Volt")
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Open Volt', click: () => showMainWindow() },
        { type: 'separator' },
        {
            label: 'Quit',
            // No process.exit: electron-updater installs a downloaded update
            // on the 'quit' event, which exiting outright would skip.
            click: () => app.quit(),
        },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', () => showMainWindow());

    const devServerURL = "http://localhost:5173";

    mainWindow.on('blur', () => {
        // AI mode keeps the window open but must not grab focus back — you
        // should be able to click away and read while an answer streams.
        if (appStates.aiMode && appStates.aiKeepOpen) return;
        if (appStates.fixWindowOpen && !appStates.dialogOpen) mainWindow.focus();
        // No focus restore here: blur means the user has already put something
        // else in front, and pulling the *previous* window forward would steal
        // focus from whatever they just clicked.
        else if (mainWindow?.isVisible()) hideMainWindow(false);
    });

    // Volt is a fixed-size launcher, so zooming only breaks the layout. Covers
    // Ctrl +/-/0 (with or without Shift, and the numpad variants).
    const ZOOM_KEYS = new Set(['+', '=', '-', '_', '0', 'Add', 'Subtract']);

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'F4' && input.alt) {
            app.quit();
            return;
        }
        // Lock is a Volt-only shortcut. Registered globally it stole Ctrl+L
        // from every other app (a browser's address bar) and silently locked
        // Volt open behind the user's back.
        if (input.type === 'keyDown' && input.control && !input.alt && !input.shift && input.key.toLowerCase() === 'l') {
            event.preventDefault();
            handleWindowLock();
            return;
        }
        if ((input.control || input.meta) && ZOOM_KEYS.has(input.key)) {
            event.preventDefault();
        }
    });

    // Ctrl+wheel and pinch bypass the keyboard entirely.
    mainWindow.webContents.on('zoom-changed', () => {
        mainWindow.webContents.setZoomFactor(1);
    });

    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.setZoomFactor(1);
        mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
    });

    // The renderer only ever loads the local bundle (or the dev server). Any
    // other navigation would inherit the preload bridge, so refuse it and hand
    // the URL to the OS browser instead. Same for window.open. Only the app's
    // own index.html counts: any file:// page — say an .html dropped onto the
    // window — would otherwise load with the bridge attached.
    const indexURL = pathToFileURL(path.join(__dirname, "../dist/index.html")).href;
    const isInternalURL = (url) =>
        url.split("#")[0].split("?")[0] === indexURL ||
        (process.env.NODE_ENV === "development" && url.startsWith(devServerURL));

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (isInternalURL(url)) return;
        event.preventDefault();
        console.warn("Blocked in-window navigation to:", url);
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) shell.openExternal(url).catch(() => {});
        return { action: "deny" };
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
    handleIconProtocol(cache);
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
        launchHotkeys,
    });

    // Lightweight sync setup so we can hide the window + register the
    // re-open hotkey before the slow disk/PowerShell work runs.
    initStoreState(cache);
    loadCommandsData(cache, store);

    if (!cache.firstTimeExperience)
        hideMainWindow(false)
    else
        showMainWindow()

    let hotkeyRegistered = false;
    try {
        hotkeyRegistered = globalShortcut.register(openShortcut, toggleMainWindow);
    } catch (err) {
        console.warn("Invalid stored hotkey:", openShortcut, err?.message);
    }
    if (!hotkeyRegistered) {
        // Another app holds the combo (or it's unparseable). The tray and a
        // second launch still open Volt; tell the user how to get back in.
        console.warn("Could not register hotkey:", openShortcut);
        setTimeout(() => showNotification({
            title: "Volt's shortcut is unavailable",
            message: `${openShortcut} is in use by another app. Open Volt from the tray icon to pick a new one.`,
        }), 2000);
    }
    launchHotkeys.sync();

    if (process.env.NODE_ENV !== "development") {
        // Loaded on demand: electron-updater is a large module graph, and
        // importing it up front added ~80ms to every startup.
        import("./universal/updater.js")
            .then(({ setupAutoUpdater }) => setupAutoUpdater(mainWindow))
            .catch(err => console.warn("Auto-updater unavailable:", err?.message));
    }

    // One-time install ping. Retries on every launch until the server
    // acknowledges — only then is the "sent" flag flipped in the store.
    sendInstallTelemetryIfNeeded(store).catch(() => { /* swallowed */ });

    // Heavy caching in the background: the window is already dismissible.
    // The file index doesn't gate the loader — a large indexed folder used to
    // hold it on an unmoving "Loading" for as long as the walk took.
    loadFolderCache(cache)
        .then(() => folderWatcher.add(cache.cachedFolders))
        .catch(err => console.warn("Folder indexing failed:", err?.message ?? err));

    (async () => {
        try {
            // A first run extracts every icon; past this cap the loader lets go
            // and the icons land when the pass finishes ('reloaded-app-cache').
            await Promise.race([
                loadAppData(mainWindow.webContents, cache),
                new Promise(resolve => setTimeout(resolve, LOADER_MAX_MS)),
            ]);
        } catch (err) {
            console.warn("loadAppData failed:", err?.message ?? err);
        } finally {
            // Always release the loader, whatever happened above.
            cache.loadingAppCache = false;
            mainWindow?.webContents.send('cache-loaded');
        }

        // Freshness pass: prune dead entries and re-extract icons whose
        // source file has changed since the cached PNG was written.
        revalidateAppIcons(mainWindow.webContents, cache).catch(err =>
            console.warn("revalidateAppIcons failed:", err?.message ?? err)
        );
    })();

    // Installers touch several shortcuts at once, so let a burst settle into a
    // single rescan. Removals keep their longer grace period.
    let appReloadTimer = null;
    const reloadAppsSoon = (delayMs) => {
        clearTimeout(appReloadTimer);
        appReloadTimer = setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) loadAppData(mainWindow.webContents, cache).catch(() => {});
        }, delayMs);
    };
    for (const dir of appWatchPaths) {
        watchTree(dir, events => {
            if (events.some(e => e.type === "delete")) reloadAppsSoon(5000);
            else if (events.some(e => e.type === "create")) reloadAppsSoon(1000);
        });
    }

    // Store installs and uninstalls add or remove a package folder. Top level
    // only, and only "rename" (added/removed): "change" fires whenever an app
    // is merely opened. A package install brings its frameworks along a second
    // earlier, which the debounce folds into the same rescan.
    try {
        fs.watch(packageWatchPath, { recursive: false }, (type) => {
            if (type === "rename") reloadAppsSoon(2000);
        }).on("error", err => console.warn("Package watcher stopped:", err?.message));
    } catch (err) {
        console.warn("Could not watch installed packages:", err?.message);
    }

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
