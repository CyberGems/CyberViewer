/* global state, I18N, $, mainImg, spinner, openModal, closeModal,
   syncFilenameDisplays, toggleFullscreen, applyImmersiveFullscreen, showToast */
'use strict';
window.CVYouTube = (() => {
  let owner = null, id = 0, timeout = null, error = null, blocked = false, info = null, frame = null, lastBounds = '';
  let onReady = null;
  const text = key => (I18N[state.settings.app.language || 'en'] || I18N.en)[key];
  const active = () => window.CVYouTubeSource.isYouTube(state.images[state.current]);
  function bounds() {
    const rect = $('youtube-slot').getBoundingClientRect();
    const overlay = document.querySelector('.modal-overlay.active, #main-menu.open, #about-overlay.active, #tab-switcher:not([hidden]), #shortcuts-popover:not([hidden])');
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: !!owner && !$('youtube-panel').hidden && !overlay && !document.hidden };
  }
  function resize() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (!owner) return;
      const value = bounds(), key = JSON.stringify(value);
      if (key !== lastBounds) { lastBounds = key; window.electronAPI.youtube.resize(id, value); }
    });
  }
  function command(action, extra = {}) { if (owner) window.electronAPI.youtube.command(id, { action, ...extra }); }
  function status() {
    if (!owner) return;
    $('youtube-title').textContent = owner.file.name;
    const key = error === 'network' ? 'youtube_network_error' : [100].includes(error) ? 'youtube_missing_error'
      : [101, 150].includes(error) ? 'youtube_embed_error' : error ? 'youtube_play_error'
      : blocked ? 'youtube_autoplay_blocked' : !info?.ready ? 'youtube_loading' : info.count ? 'youtube_playlist_status' : 'youtube_ready';
    $('youtube-status').textContent = text(key).replace('{current}', (info?.index || 0) + 1).replace('{total}', info?.count || 0);
    $('youtube-retry').hidden = !error;
    $('youtube-previous').disabled = !info?.ready || !window.CVYouTubeSource.from(owner)?.playlistId;
    $('youtube-next').disabled = $('youtube-previous').disabled;
    $('youtube-loop').disabled = $('youtube-previous').disabled;
  }
  function unload() {
    clearTimeout(timeout);
    if (owner) window.electronAPI.youtube.close(id);
    owner = null; info = null; error = null; onReady = null; lastBounds = '';
    $('youtube-panel').hidden = true;
    document.body.classList.remove('youtube-active');
  }
  function load(image, callback) {
    unload(); owner = image; id++; onReady = callback; blocked = false;
    const source = image.file.youtube || window.CVYouTubeSource.from(image);
    const view = window.CVWorkspace.viewFor(image);
    image.w = 16; image.h = 9; image.loaded = true;
    mainImg.hidden = true; spinner.classList.remove('active');
    document.body.classList.add('youtube-active');
    $('youtube-panel').hidden = false;
    $('youtube-loop').checked = false;
    window.CVWorkspace.restoreView(0, 0);
    state.transitioning = false;
    window.CVVideo.syncTools(); status();
    const value = { ...source, videoId: view?.youtubeVideoId || source.videoId,
      index: view?.youtubeIndex ?? source.index, startSeconds: view?.videoTime ?? source.startSeconds,
      autoplay: state.settings.app.videoAutoplay !== false, language: state.settings.app.language };
    const current = id;
    window.electronAPI.youtube.open(current, value, bounds()).then(result => {
      if (id === current && owner === image && !result.ok) receive({ id: current, error: 'network' });
      resize();
    }).catch(() => receive({ id: current, error: 'network' }));
    timeout = setTimeout(() => receive({ id: current, error: 'network' }), 30000);
  }
  function receive(value) {
    if (!owner || value.id !== id) return;
    if (value.error) {
      error = value.error; clearTimeout(timeout);
      if (state.isGhost) applyImmersiveFullscreen(false);
    } else if (value.blocked) { blocked = true; clearTimeout(timeout); }
    else if (value.ready) {
      clearTimeout(timeout); error = null; info = value;
      if (value.state === 1) blocked = false;
      if (value.videoId && [0, 1, 2, 5].includes(value.state)) {
        state.videoTime = value.time; state.youtubeIndex = value.index; state.youtubeVideoId = value.videoId;
      }
      if (value.title && owner.file.name !== value.title) { owner.file.name = value.title; syncFilenameDisplays(owner); window.CVWorkspace.render(); }
      window.CVWorkspace.changed();
    }
    if (onReady && (value.ready || value.error)) { const done = onReady; onReady = null; done(); }
    status();
  }
  function openDialog() {
    if (window.CVWorkspace.isEditing() && !$('modal-youtube').classList.contains('active')) { showToast(text('tabs_finish_edit'), 'info'); return; }
    $('youtube-url-error').hidden = true;
    $('youtube-autoplay').checked = state.settings.app.videoAutoplay !== false;
    openModal('modal-youtube');
    setTimeout(() => { $('youtube-url').focus(); $('youtube-url').select(); }, 0); resize();
  }
  function initialize() {
    window.electronAPI.youtube.onState(receive);
    new ResizeObserver(resize).observe($('youtube-slot'));
    new MutationObserver(resize).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'hidden'] });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', resize);
    $('video-youtube').addEventListener('click', () => { window.CVVideo.closeMenu(); openDialog(); });
    $('youtube-form').addEventListener('submit', async event => {
      event.preventDefault();
      const value = $('youtube-url').value.trim();
      if (!window.CVYouTubeSource.parse(value)) { $('youtube-url-error').textContent = text('youtube_invalid_url'); $('youtube-url-error').hidden = false; return; }
      state.settings.app.videoAutoplay = $('youtube-autoplay').checked;
      window.electronAPI.saveSettings(state.settings.app);
      closeModal('modal-youtube');
      await window.CVWorkspace.openYouTube(value);
    });
    $('youtube-previous').addEventListener('click', () => command('previous'));
    $('youtube-next').addEventListener('click', () => command('next'));
    $('youtube-loop').addEventListener('change', () => command('loop', { enabled: $('youtube-loop').checked }));
    $('youtube-retry').addEventListener('click', () => { if (owner) void window.CVWorkspace.activate(window.CVWorkspace.model.activeId, { force: true }); });
    $('youtube-browser').addEventListener('click', () => {
      if (!owner) return;
      const url = new URL(owner.file.path);
      if (info?.videoId) { url.pathname = '/watch'; url.searchParams.set('v', info.videoId); }
      if (info?.time > 0) url.searchParams.set('t', Math.floor(info.time) + 's');
      void window.electronAPI.openExternal(url.href);
    });
    $('youtube-fullscreen').addEventListener('click', toggleFullscreen);
  }
  return { active, load, unload, resize, command, openDialog, initialize, localize: status, get info() { return info; } };
})();
