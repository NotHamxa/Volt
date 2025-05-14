const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    onWindowBlurred: (callback) => ipcRenderer.on('window-blurred', callback),
    getGoogleSuggestions:(query)=>ipcRenderer.invoke('get-google-suggestions',query),
    openUninstall:()=>ipcRenderer.send('open-uninstall'),
    getCacheLoadingStatus:()=>ipcRenderer.invoke('get-loading-cache-status'),
    onCacheLoaded: (callback) => ipcRenderer.on('cache-loaded', callback),

});
contextBridge.exposeInMainWorld("file",{
    searchFilesAndFolders: (baseDir, query) => ipcRenderer.invoke('search-files', baseDir, query),
    openPath:(path) => ipcRenderer.send('open-path', path),
    openInExplorer:(path)=>ipcRenderer.send('open-in-explorer', path),
    openFileWith:(path)=>ipcRenderer.send('open-file-with', path),
})

contextBridge.exposeInMainWorld("apps",{
    searchApps: (query) => ipcRenderer.invoke('search-apps', query),
    openApp:(app,admin=false) => ipcRenderer.invoke('launch-app', app,admin),
    getAppLogo: (app) => ipcRenderer.invoke('get-app-logo', app),
    getUwpAppLogo: (appName)=>ipcRenderer.invoke('get-uwp-app-logo', appName),
})


contextBridge.exposeInMainWorld('electronStore', {
    set: (key, value) => ipcRenderer.send('set-store', { key, value }),
    get: (key) => ipcRenderer.invoke('get-store', key),
});
