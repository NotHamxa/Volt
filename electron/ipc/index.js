import { registerElectronIpc } from "./electron.ipc.js";
import { registerFilesIpc } from "./files.ipc.js";
import { registerAppsIpc } from "./apps.ipc.js";
import { registerStoreIpc } from "./store.ipc.js";

export function registerIpc(deps) {
    registerElectronIpc(deps);
    registerFilesIpc(deps);
    registerAppsIpc(deps);
    registerStoreIpc(deps);
}
