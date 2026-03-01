const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
    log:(data)=>{ipcRenderer.send("log",data)},
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
    setOpenBind:(binding)=>ipcRenderer.invoke("set-open-bind", binding),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    onWindowBlurred: (callback) => ipcRenderer.on('window-blurred', callback),
    onWindowLocked: (callback) => ipcRenderer.on('window-locked', callback),
    onWindowUnlocked: (callback) => ipcRenderer.on('window-unlocked', callback),
    getGoogleSuggestions:(query)=>ipcRenderer.invoke('get-google-suggestions',query),
    openUninstall:()=>ipcRenderer.send('open-uninstall'),
    getCacheLoadingStatus:()=>ipcRenderer.invoke('get-loading-cache-status'),
    setCacheLoadingBar: (callback) => {
        ipcRenderer.on('set-cache-loading-bar', (_event, currentNum, totalNum) => {
            callback(currentNum, totalNum);
        });
    },
    onCacheLoaded: (callback) => ipcRenderer.on('cache-loaded', callback),
    onCacheReload: (callback) => ipcRenderer.on('reloaded-app-cache', callback),
    executeCmd:(cmd)=>ipcRenderer.send('execute-cmd', cmd),
    selectFolder:()=>ipcRenderer.invoke('select-folder'),
    deleteFolder:(path)=>ipcRenderer.invoke('delete-folder',path),
    searchQuery:(query,filters)=>ipcRenderer.invoke('search-query',query,filters),
    toggleEscape:(state)=>ipcRenderer.send("toggle-esc-pause",state)
});
contextBridge.exposeInMainWorld("file",{
    searchFilesAndFolders: (baseDir, query) => ipcRenderer.invoke('search-files', baseDir, query),
    openPath:(path) => ipcRenderer.send('open-path', path),
    openInExplorer:(path)=>ipcRenderer.send('open-in-explorer', path),
    openFileWith:(path)=>ipcRenderer.send('open-file-with', path),
    cacheFolder:(path)=>ipcRenderer.invoke('cache-folder', path),
    getImageB64:(path,width=50)=>ipcRenderer.invoke('get-image-b64', path,width),
})

contextBridge.exposeInMainWorld("apps",{
    searchApps: (query) => ipcRenderer.invoke('search-apps', query),
    searchSettings: (query) => ipcRenderer.invoke('search-settings', query),
    searchCommands: (query) => ipcRenderer.invoke('search-commands', query),

    openApp:(app,admin=false) => ipcRenderer.invoke('launch-app', app,admin),
    openSetting:(setting)=>ipcRenderer.invoke('open-setting', setting),
    executeCommand:(path)=>ipcRenderer.send('execute-command', path),
    getAppLogo: (app) => ipcRenderer.invoke('get-app-logo', app),
    getUwpAppLogo: (appName)=>ipcRenderer.invoke('get-uwp-app-logo', appName),
    getLinkFavicon:(link)=>ipcRenderer.invoke('get-link-favicon', link),
})


contextBridge.exposeInMainWorld('electronStore', {
    set: (key, value) => ipcRenderer.send('set-store', { key, value }),
    get: (key) => ipcRenderer.invoke('get-store', key),
    clear:()=>ipcRenderer.send("clear-store")
});

contextBridge.exposeInMainWorld('notifAPI', {
    onNotify: (cb) => ipcRenderer.on('notify', (_, data) => cb(data)),
    onHide:   (cb) => ipcRenderer.on('notify-hide', () => cb()),
})