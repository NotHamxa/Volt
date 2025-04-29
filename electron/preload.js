const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
    ipcRenderer: {
        invoke: (channel, data) => ipcRenderer.invoke(channel, data),
    },
    setWindowHeight: (height) => ipcRenderer.send("set-window-height", height),
    openExternal: (url) => ipcRenderer.send('open-external', url)
});
contextBridge.exposeInMainWorld('electronStore', {
    set: (key, value) => ipcRenderer.send('set-store', { key, value }),
    get: (key) => ipcRenderer.invoke('get-store', key),
});
contextBridge.exposeInMainWorld('fileSearch', {
    searchApps:(query) => ipcRenderer.send('search-apps', query),
    searchFilesAndFolders: (baseDir,query) => ipcRenderer.send('search-files', {baseDir, query}),
})
