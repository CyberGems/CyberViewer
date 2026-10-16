'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// This sandbox has no filesystem, settings, or general-purpose IPC bridge.
contextBridge.exposeInMainWorld('youtubeHost', {
  onLoad: callback => ipcRenderer.on('youtube:load', (_event, value) => callback(value)),
  onCommand: callback => ipcRenderer.on('youtube:command', (_event, value) => callback(value)),
  report: value => ipcRenderer.send('youtube:state', value)
});
