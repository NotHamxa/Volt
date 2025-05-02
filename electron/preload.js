const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
    setWindowHeight: (height) => ipcRenderer.send('set-window-height', height),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    searchApps: (query) => ipcRenderer.invoke('search-apps', query),
    searchFilesAndFolders: (baseDir, query) => ipcRenderer.invoke('search-files', baseDir, query),
    onWindowBlurred: (callback) => ipcRenderer.on('window-blurred', callback),
    openPath:(path) => ipcRenderer.send('open-path', path),
    openApp:(app) => ipcRenderer.invoke('launch-app', app),
    openInExplorer:(path)=>ipcRenderer.send('open-in-explorer', path),
});
contextBridge.exposeInMainWorld('electronStore', {
    set: (key, value) => ipcRenderer.send('set-store', { key, value }),
    get: (key) => ipcRenderer.invoke('get-store', key),
});
