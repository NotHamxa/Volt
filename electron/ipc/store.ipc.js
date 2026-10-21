import { ipcMain, app } from "electron";

export function registerStoreIpc({ store, launchHotkeys }) {
    ipcMain.on("set-store", (_, { key, value }) => {
        store.set(key, value);
        // Links carry their own hotkeys, and the home view rewrites the list
        // whenever one is added, edited, removed or dragged.
        if (key === "linkShortcuts") launchHotkeys?.sync();
    });

    ipcMain.handle("get-store", (_, key) => {
        return store.get(key);
    });

    ipcMain.on("clear-store", () => {
        store.clear();
        app.relaunch();
        app.exit(0);
    });
}
