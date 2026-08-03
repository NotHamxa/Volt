const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('notifAPI', {
    onNotify: (cb) => ipcRenderer.on('notify', (_, data) => cb(data)),
    onHide:   (cb) => ipcRenderer.on('notify-hide', () => cb()),
})
