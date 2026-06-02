const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize:       () => ipcRenderer.send('win-minimize'),
  maximize:       () => ipcRenderer.send('win-maximize'),
  close:          () => ipcRenderer.send('win-close'),
  onWinState:     (cb) => ipcRenderer.on('win-state', (_, state) => cb(state)),
  
  getSettings:    () => ipcRenderer.invoke('get-settings'),
  getVersion:     () => ipcRenderer.invoke('get-version'),
  saveSettings:   (settings) => ipcRenderer.send('save-settings', settings),
  
  showContextMenu: (props) => ipcRenderer.send('show-context-menu', props),
  openDevTools:   () => ipcRenderer.send('win-devtools'),
  onOpenFile:     (cb) => ipcRenderer.on('open-file', (e, path) => cb(path)),
  scanFolder:     (path) => ipcRenderer.invoke('scan-folder', path),
  getThumbnail:   (path) => ipcRenderer.invoke('get-thumbnail', path),
  onMenuAction:   (cb) => ipcRenderer.on('menu-action', (e, data) => cb(data)),
  getMonitors:    () => ipcRenderer.invoke('get-monitors'),
  openFile:       () => ipcRenderer.invoke('open-file-dialog'),
  saveImage:      (data) => ipcRenderer.invoke('save-image', data),
  copyImage:      (path) => ipcRenderer.send('copy-image', path),
  moveToTrash:    (path) => ipcRenderer.invoke('move-to-trash', path),
  moveToTrashDirect: (path) => ipcRenderer.invoke('move-to-trash-direct', path),
  onOpenSettings: (cb) => ipcRenderer.on('open-settings', () => cb()),
  showItemInFolder: (path) => ipcRenderer.send('show-item-in-folder', path),
  openNativeProperties: (path) => ipcRenderer.send('open-native-properties', path),
  getFileInfo:    (path) => ipcRenderer.invoke('get-file-info', path),
  validatePaths:  (paths) => ipcRenderer.invoke('validate-paths', paths),
  registerContextMenu: (enable, lang) => ipcRenderer.invoke('register-context-menu', enable, lang)
});

// Listener para el menú contextual nativo en campos de texto
window.addEventListener('contextmenu', (e) => {
  if (e.target.closest('input, textarea, [contenteditable="true"]')) {
    const props = {
      isEditable: true,
      selectionText: window.getSelection().toString()
    };
    ipcRenderer.send('show-context-menu', props);
  }
});
