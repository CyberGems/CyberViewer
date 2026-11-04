'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
// This sandbox has no filesystem, settings, or general-purpose IPC bridge.
contextBridge.exposeInMainWorld('youtubeHost', {
  onLoad: callback => ipcRenderer.on('youtube:load', (_event, value) => callback(value)),
  onCommand: callback => ipcRenderer.on('youtube:command', (_event, value) => callback(value)),
  report: value => ipcRenderer.send('youtube:state', value)
});

window.addEventListener('DOMContentLoaded', () => {
  const shield = window.document.createElement('div');
  shield.setAttribute('aria-hidden', 'true');
  shield.style.cssText = 'display:none;position:fixed;inset:0;z-index:2147483647;box-sizing:border-box;border:2px dashed #00d4ff;background:rgba(0,212,255,.07)';
  window.document.body.appendChild(shield);
  let hideTimer = null;
  const hide = () => { shield.style.display = 'none'; clearTimeout(hideTimer); };
  const acceptingFiles = event => event.dataTransfer && [...event.dataTransfer.types].includes('Files');
  const sendFiles = files => {
    const entries = [...files].map(file => ({
      path: webUtils.getPathForFile(file), name: file.name, size: file.size, type: file.type
    })).filter(file => file.path);
    if (entries.length) ipcRenderer.send('youtube:file-drop', entries);
  };
  window.addEventListener('message', event => {
    if (!['https://www.youtube.com', 'https://www.youtube-nocookie.com'].includes(event.origin)) return;
    if (event.source !== window.document.querySelector('iframe')?.contentWindow) return;
    if (event.data?.type === 'cyberviewer:file-drag') {
      shield.style.display = 'block';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 300);
    } else if (event.data?.type === 'cyberviewer:file-drop' && Array.isArray(event.data.files)) {
      hide();
      sendFiles(event.data.files);
    }
  });
  const accept = event => {
    if (!acceptingFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    shield.style.display = 'block';
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 300);
  };
  window.document.addEventListener('dragenter', accept, true);
  window.document.addEventListener('dragover', accept, true);
  window.document.addEventListener('drop', event => {
    if (!acceptingFiles(event)) return;
    event.preventDefault();
    hide();
    sendFiles(event.dataTransfer.files);
  }, true);
  window.document.addEventListener('dragend', hide, true);
});
