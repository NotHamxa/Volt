const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
    setWindowHeight: (height) => ipcRenderer.send('set-window-height', height),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    searchApps: (query) => ipcRenderer.invoke('search-apps', query),
    searchFilesAndFolders: (baseDir, query) => ipcRenderer.invoke('search-files', baseDir, query),
    onWindowBlurred: (callback) => ipcRenderer.on('window-blurred', callback),
    openPath:(path) => ipcRenderer.send('open-path', path),
    openApp:(app,admin=false) => ipcRenderer.invoke('launch-app', app,admin),
    openInExplorer:(path)=>ipcRenderer.send('open-in-explorer', path),
    getGoogleSuggestions:(query)=>ipcRenderer.invoke('get-google-suggestions',query),
    getAppLogo: (path) => ipcRenderer.invoke('get-app-logo', path),
});
contextBridge.exposeInMainWorld('electronStore', {
    set: (key, value) => ipcRenderer.send('set-store', { key, value }),
    get: (key) => ipcRenderer.invoke('get-store', key),
});
