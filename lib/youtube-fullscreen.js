'use strict';

// Runs in the official embed with DOM APIs only, without a preload or IPC bridge.
function installFullscreenControls(window, document) {
  if (window.__cyberviewerFullscreenInstalled) return;
  window.__cyberviewerFullscreenInstalled = true;
  let changing = false;
  document.addEventListener('dblclick', event => {
    if (event.button !== 0 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (!target?.closest || target.closest('button, a, input, select, textarea, [role="button"], [role="slider"], [role="menu"], [contenteditable="true"]')) return;
    const video = document.querySelector('video');
    if (!video) return;
    const rect = video.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    // Capture the gesture once, including on older embeds with their own handler.
    // Fullscreen the document so YouTube's controls remain available.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (changing) return;
    changing = true;
    const change = document.fullscreenElement
      ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    void change.catch(error => console.error('YouTube fullscreen failed:', error)).finally(() => { changing = false; });
  }, true);
}

function isPlayerFrame(frame, contents) {
  if (!frame) return false;
  try {
    if (frame.parent !== contents.mainFrame) return false;
    const url = new URL(frame.url);
    return url.protocol === 'https:' && ['www.youtube.com', 'www.youtube-nocookie.com'].includes(url.host) && url.pathname.startsWith('/embed/');
  } catch (_) { return false; }
}

module.exports = { FULLSCREEN_CONTROLS: `(${installFullscreenControls.toString()})(window, document)`, isPlayerFrame };
