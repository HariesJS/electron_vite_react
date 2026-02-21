const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('aiChat', {
  sendMessage: (messages) => ipcRenderer.invoke('chat:send-message', messages),
})
