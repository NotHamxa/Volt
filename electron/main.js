import { app, BrowserWindow, globalShortcut, ipcMain, shell } from "electron";
import Store from "electron-store";
import path from "path";
import { fileURLToPath } from "url";

const store = new Store();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let lastFocusedWindow = null;

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

const createWindow = () => {
    if (mainWindow) {
        mainWindow.loadURL("http://localhost:5173");
        return;
    }

    mainWindow = new BrowserWindow({
        width: 600,
        height: 100,
        transparent: true,
        frame: false,
        resizable:false,
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

    ipcMain.on('minimize', () => mainWindow?.minimize());
    ipcMain.on('maximize', () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow?.maximize();
        }
    });
    ipcMain.on('close', () => mainWindow?.close());
};

app.whenReady().then(() => {
    createWindow();

    globalShortcut.register('Alt+S', () => {
        if (!mainWindow) return;

        if (mainWindow.isVisible()) {
            mainWindow.hide();
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
