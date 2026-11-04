'use strict';

// The OS sends drag events to the cross-origin embed, not its file:// host.
// Signal the host early so its shield can receive the eventual drop.
function installFileDragBridge(window, document) {
  if (window.__cyberviewerFileDragBridge) return;
  window.__cyberviewerFileDragBridge = true;
  const isFileDrag = event => event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files');
  const forward = event => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    window.parent.postMessage({ type: 'cyberviewer:file-drag' }, '*');
  };
  document.addEventListener('dragenter', forward, true);
  document.addEventListener('dragover', forward, true);
  document.addEventListener('drop', event => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    // Covers a fast drop before the host shield receives the drag signal.
    window.parent.postMessage({ type: 'cyberviewer:file-drop', files: Array.from(event.dataTransfer.files) }, '*');
  }, true);
}

module.exports = { FILE_DRAG_BRIDGE: `(${installFileDragBridge.toString()})(window, document)` };
