import { ipcMain, app } from "electron";

export function registerStoreIpc({ store }) {
    ipcMain.on("set-store", (_, { key, value }) => {
        store.set(key, value);
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
