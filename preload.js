const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipy', {
  getHistory: () => ipcRenderer.invoke('clipboard:get-history'),
  getMaxItems: () => ipcRenderer.invoke('clipboard:get-max-items'),
  setMaxItems: (n) => ipcRenderer.invoke('clipboard:set-max-items', n),
  selectItem: (text) => ipcRenderer.invoke('clipboard:select', text),
  getTheme: () => ipcRenderer.invoke('theme:get'),
  onHistory: (cb) => {
    const listener = (_event, items) => cb(items);
    ipcRenderer.on('clipboard-history', listener);
    return () => ipcRenderer.removeListener('clipboard-history', listener);
  },
  onTheme: (cb) => {
    const listener = (_event, theme) => cb(theme);
    ipcRenderer.on('theme-changed', listener);
    return () => ipcRenderer.removeListener('theme-changed', listener);
  },
});
