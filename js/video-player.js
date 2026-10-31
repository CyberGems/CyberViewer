/* global state, I18N, $, spinner, mainImg, setCyberTooltip,
   displayImage, setImageError, clearImageError, showToast,
   toggleFullscreen, openImageDialog, openPropertiesForCurrent */
'use strict';

// A single decoder is shared by all tabs. Inactive tabs retain only their time
// and viewport; changing tabs, closing, or suspending releases the media source.
window.CVVideo = (() => {
  const element = document.getElementById('main-video');
  let owner = null;
  let cleanup = null;
  let timeout = null;
  let generation = 0;
  let lastSavedSecond = -1;
  let idleTimer = null;
  let interacting = false;
  let keyboardFocus = false;
  let audioStatus = 'pending';
  let loadedAt = 0;
  const text = key => (I18N[state.settings.app.language || 'en'] || I18N.en)[key];
  const active = () => window.CVFormats.isVideo(state.images[state.current]);
  const imageActions = new Set(['save', 'save-as', 'export-pdf', 'print', 'copy',
    'rotate-left', 'rotate-right', 'crop', 'resize', 'adjust', 'flip-h', 'flip-v',
    'set-wallpaper', 'set-wallpaper-fill', 'set-wallpaper-fit', 'set-wallpaper-center', 'set-wallpaper-span',
    'start-slideshow', 'slideshow-loop', 'slideshow-interval']);
  const imageButtons = ['btn-rot-l', 'btn-rot-r', 'btn-crop', 'btn-resize', 'btn-adjust',
    'btn-copy', 'btn-print', 'btn-commit', 'btn-discard', 'btn-slideshow'];

  function syncTools() {
    const video = active();
    document.body.classList.toggle('video-active', video);
    const navigation = $('shortcuts-navigation-label');
    navigation.dataset.i18n = video ? 'video_seek_keys' : 'navigate_hint';
    navigation.textContent = text(navigation.dataset.i18n);
    imageButtons.forEach(id => {
      const button = $(id);
      if (button && video) { button.disabled = true; button.classList.add('is-disabled'); button.setAttribute('aria-disabled', 'true'); }
    });
    document.querySelectorAll('#main-menu [data-action]').forEach(item => {
      if (imageActions.has(item.dataset.action)) {
        const disabled = video || state.current < 0 || document.body.classList.contains('image-error');
        item.classList.toggle('disabled', disabled);
        item.setAttribute('aria-disabled', String(disabled));
      }
    });
    if (window.CVYouTubeSource.isYouTube(state.images[state.current])) {
      document.querySelectorAll('#main-menu [data-action]').forEach(item => {
        if (['properties', 'trash', 'show-folder', 'copy-path', 'favorite', 'original', 'fit'].includes(item.dataset.action)) {
          item.dataset.youtubeDisabled = '1';
          item.classList.add('disabled'); item.setAttribute('aria-disabled', 'true');
        }
      });
    } else {
      document.querySelectorAll('#main-menu [data-youtube-disabled]').forEach(item => {
        delete item.dataset.youtubeDisabled;
        const disabled = state.current < 0 || document.body.classList.contains('image-error');
        item.classList.toggle('disabled', disabled); item.setAttribute('aria-disabled', String(disabled));
      });
    }
  }

  function sync() {
    const playing = !!owner && !element.paused && !element.ended;
    $('video-controls').classList.toggle('video-playing', playing);
    $('video-controls').classList.toggle('video-muted', element.muted || element.volume === 0);
    $('video-play-label').textContent = text(playing ? 'video_pause' : 'video_play');
    setCyberTooltip($('video-play'), text(playing ? 'video_pause_shortcut' : 'video_play_shortcut'));
    $('video-mute-label').textContent = text(element.muted ? 'video_unmute' : 'video_mute');
    $('video-mute').setAttribute('aria-pressed', String(element.muted));
    $('video-loop').setAttribute('aria-pressed', String(element.loop));
    $('video-loop').classList.toggle('active', element.loop);
    $('video-autoplay').setAttribute('aria-checked', String(state.settings.app.videoAutoplay !== false));
    const duration = Number.isFinite(element.duration) ? element.duration : 0;
    const current = Number.isFinite(element.currentTime) ? element.currentTime : 0;
    $('video-time').textContent = `${window.CVFormats.formatTime(current)} / ${window.CVFormats.formatTime(duration)}`;
    const seek = $('video-seek');
    seek.disabled = !duration;
    seek.max = String(duration || 1);
    seek.value = String(current);
    seek.style.setProperty('--video-progress', `${duration ? current / duration * 100 : 0}%`);
    seek.setAttribute('aria-valuetext', $('video-time').textContent);
    $('video-volume').value = String(element.volume);
    $('video-volume').style.setProperty('--video-progress', `${element.muted ? 0 : element.volume * 100}%`);
    syncSiblings();
    syncSpeedUi();
    if (owner?.loaded && !element.seeking && state.images[state.current] === owner) {
      state.videoTime = current;
      owner.videoTime = current;
      const second = Math.floor(current);
      if (second !== lastSavedSecond) { lastSavedSecond = second; window.CVWorkspace.changed(); }
    }
    const played = element.played;
    let playedSeconds = 0;
    for (let i = 0; i < played.length; i++) playedSeconds += played.end(i) - played.start(i);
    // Decoded-byte counts cannot distinguish a silent file from an unsupported
    // audio codec. Keep this neutral diagnostic behind an explicit user action.
    audioStatus = !owner?.loaded ? 'pending' : element.webkitAudioDecodedByteCount > 0 ? 'available'
      : typeof element.webkitAudioDecodedByteCount === 'number' && (playedSeconds > .75 || (element.ended && playedSeconds > 0)) ? 'unavailable' : 'pending';
    const unavailable = audioStatus === 'unavailable';
    $('video-mute').disabled = unavailable;
    $('video-volume').disabled = unavailable;
    const sound = document.querySelector('.video-sound');
    sound.classList.toggle('audio-unavailable', unavailable);
    sound.setAttribute('aria-label', text(unavailable ? 'video_audio_unavailable' : 'video_volume'));
    if (unavailable) setCyberTooltip(sound, text('video_audio_unavailable'));
    else { sound.removeAttribute('data-tooltip'); sound.classList.remove('cyber-tooltip'); }
    const audioKey = audioStatus === 'available' ? 'video_audio_available'
      : unavailable ? 'video_no_audio' : 'video_audio_pending';
    $('video-audio-note').textContent = text(audioKey);
  }

  function setMenu(open) {
    $('video-menu').hidden = !open;
    $('video-more').setAttribute('aria-expanded', String(open));
    if (!open) {
      $('video-audio-note').hidden = true;
      $('video-audio-info').setAttribute('aria-expanded', 'false');
      setSpeedPanel(false);
    }
    reveal();
  }
  function setSpeedPanel(on) {
    $('video-menu-main').hidden = on;
    $('video-speed-panel').hidden = !on;
  }
  function closeMenu(restoreFocus = false) {
    if ($('video-menu').hidden) return false;
    setMenu(false);
    if (restoreFocus) $('video-more').focus();
    return true;
  }
  function reveal() {
    clearTimeout(idleTimer);
    document.body.classList.remove('video-idle');
    const controls = $('video-controls');
    controls.inert = false;
    $('ghost-close').inert = false;
    if (!active()) return;
    if (!state.isGhost) $('topbar').classList.remove('hud-hidden-top');
    controls.classList.remove('hud-hidden-fade');
    $('ghost-close').classList.remove('hud-hidden-fade');
    const fsKey = state.isGhost ? 'video_exit_fullscreen' : 'video_enter_fullscreen';
    if ($('video-fullscreen').dataset.fullscreenLabel !== fsKey) {
      $('video-fullscreen').dataset.fullscreenLabel = fsKey;
      $('video-fullscreen').setAttribute('aria-label', text(state.isGhost ? 'ghost_close_title' : 'menu_fullscreen'));
      setCyberTooltip($('video-fullscreen'), text(fsKey));
    }
    if (!owner?.loaded || element.paused || element.ended) return;
    const delay = state.settings.app.hudAutoHideDelay ?? 2000;
    idleTimer = setTimeout(() => {
      if (!active() || element.paused || element.ended || interacting || !$('video-menu').hidden) return;
      if (document.querySelector('.modal-overlay.active, #main-menu.open') || !$('shortcuts-popover').hidden) return;
      if (document.querySelector('.video-transport:hover, #ghost-close:hover')) return;
      if (keyboardFocus && (controls.contains(document.activeElement) || document.activeElement === $('ghost-close'))) return;
      document.body.classList.add('video-idle');
      controls.inert = true;
      $('ghost-close').inert = true;
    }, delay);
  }

  function unload() {
    generation++;
    clearTimeout(timeout);
    timeout = null;
    if (owner?.loaded && !element.seeking && Number.isFinite(element.currentTime)) owner.videoTime = element.currentTime;
    if (cleanup) cleanup();
    cleanup = null;
    owner = null;
    clearTimeout(idleTimer);
    interacting = false;
    closeMenu();
    document.body.classList.remove('video-idle');
    $('video-controls').inert = false;
    $('ghost-close').inert = false;
    keyboardFocus = false;
    element.pause();
    element.removeAttribute('src');
    element.load();
    element.hidden = true;
    element.classList.remove('loaded');
    $('video-controls').hidden = true;
    $('video-audio-note').hidden = true;
    mainImg.hidden = false;
    lastSavedSecond = -1;
  }

  function load(image, url, onReady) {
    const savedTime = window.CVWorkspace.viewFor(image)?.videoTime ?? image.videoTime ?? 0;
    unload();
    const token = generation;
    owner = image;
    mainImg.onload = null; mainImg.onerror = null; mainImg.removeAttribute('src');
    mainImg.hidden = true;
    element.hidden = false;
    element.setAttribute('aria-label', image.file.name);
    let finished = false;
    let restorePending = savedTime > 0;
    const live = () => token === generation && owner === image && state.images[state.current] === image;
    const fail = () => {
      if (!live()) return;
      clearTimeout(timeout);
      finished = true;
      image.loaded = false;
      element.pause();
      element.classList.remove('loaded');
      $('video-controls').hidden = true;
      spinner.classList.remove('active');
      state.transitioning = false;
      setImageError(image);
      onReady();
    };
    const ready = () => {
      if (!live() || finished || element.seeking || element.readyState < 2) return;
      // Some Matroska files cannot seek while the demuxer is still starting.
      // Decode the first frame before restoring the saved position, then wait
      // for that seek to finish before exposing the tab as ready.
      if (restorePending) {
        restorePending = false;
        if (Number.isFinite(element.duration)) {
          const position = Math.min(savedTime, Math.max(0, element.duration - 0.05));
          if (Math.abs(element.currentTime - position) > 0.05) {
            element.currentTime = position;
            return;
          }
        }
      }
      finished = true;
      clearTimeout(timeout);
      image.w = element.videoWidth; image.h = element.videoHeight;
      if (!image.w || !image.h) { fail(); return; }
      image.loaded = true;
      image.duration = element.duration;
      clearImageError();
      $('video-controls').hidden = false;
      displayImage(url, image.w, image.h, null);
      $('video-heading').textContent = image.file.name;
      element.pause();
      syncTools(); sync(); reveal();
      onReady();
      if (live() && state.settings.app.videoAutoplay !== false) void play();
    };
    element.addEventListener('loadeddata', ready);
    element.addEventListener('seeked', ready);
    element.addEventListener('error', fail);
    cleanup = () => {
      element.removeEventListener('loadeddata', ready);
      element.removeEventListener('seeked', ready); element.removeEventListener('error', fail);
    };
    timeout = setTimeout(fail, 20000);
    element.src = url;
    element.load();
    sync(); syncTools();
  }

  async function play() {
    if (!owner || !owner.loaded || document.body.classList.contains('image-error')) return;
    reveal();
    if (element.ended) element.currentTime = 0;
    try { await element.play(); }
    catch (error) {
      if (error.name !== 'AbortError') { console.error('Video playback failed:', error); showToast(text('video_play_error'), 'error'); }
    }
  }
  function toggle() {
    if (window.CVYouTube.active()) { window.CVYouTube.command('toggle'); return; }
    if (!element.paused) { element.pause(); return; }
    return play();
  }
  function toggleMute() {
    if (window.CVYouTube.active()) { window.CVYouTube.command('mute'); return; }
    if (audioStatus === 'unavailable') return;
    element.muted = !element.muted;
    reveal();
  }
  function seekBy(seconds) {
    if (window.CVYouTube.active()) { window.CVYouTube.command('seek', { seconds }); return; }
    reveal();
    if (owner && Number.isFinite(element.duration)) element.currentTime = Math.max(0, Math.min(element.duration, element.currentTime + seconds));
  }

  // ── Playback speed (YouTube-style panel + >/< shortcuts) ──
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3];
  function currentRate() {
    let saved = null;
    try { saved = parseFloat(localStorage.getItem('cv_video_rate')); } catch (_) { /* storage unavailable */ }
    return SPEEDS.includes(saved) ? saved : 1;
  }
  function syncSpeedUi() {
    const rate = currentRate();
    const value = $('video-speed-value');
    if (value) value.textContent = rate === 1 ? text('video_speed_normal') : `${rate}×`;
    document.querySelectorAll('#video-speed-panel .video-menu-rate').forEach((btn) => {
      btn.classList.toggle('active', parseFloat(btn.dataset.rate) === rate);
    });
  }
  function setPlaybackRate(rate) {
    if (!SPEEDS.includes(rate)) return;
    try { localStorage.setItem('cv_video_rate', String(rate)); } catch (_) { /* storage unavailable */ }
    if (!window.CVYouTube.active()) element.playbackRate = rate;
    syncSpeedUi();
    reveal();
  }
  function cyclePlaybackRate(direction) {
    const rate = window.CVYouTube.active() ? currentRate() : (element.playbackRate || currentRate());
    let index = SPEEDS.indexOf(rate);
    if (index === -1) index = SPEEDS.indexOf(1);
    index = Math.max(0, Math.min(SPEEDS.length - 1, index + direction));
    if (SPEEDS[index] !== rate) {
      setPlaybackRate(SPEEDS[index]);
      flashOverlay(`<span>${SPEEDS[index]}&#215;</span>`);
    }
  }

  // ── Prev/next video in the folder ──
  function videoSibling(direction) {
    const list = state.images || [];
    let index = state.current + direction;
    while (index >= 0 && index < list.length) {
      const candidate = list[index];
      if (candidate && candidate.file && candidate.file.path && window.CVFormats.isVideo(candidate.file.path)) return candidate;
      index += direction;
    }
    return null;
  }
  function syncSiblings() {
    const prev = $('video-prev');
    const next = $('video-next');
    if (!prev || !next) return;
    if (window.CVYouTube.active()) { prev.hidden = true; next.hidden = true; return; }
    prev.hidden = !videoSibling(-1);
    next.hidden = !videoSibling(1);
  }
  function openSibling(direction) {
    const sibling = videoSibling(direction);
    if (sibling && sibling.file.path && window.openImagePath) void window.openImagePath(sibling.file.path);
  }

  // ── Center overlay flash (YouTube-style play/pause and speed feedback) ──
  const FLASH_PLAY = '<svg class="menu-ico" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg>';
  const FLASH_PAUSE = '<svg class="menu-ico" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M8 5h3v14H8zM15 5h3v14h-3z"/></svg>';
  let flashEl = null;
  function flashOverlay(content) {
    if (window.CVYouTube.active()) return;
    const wrap = $('viewer-wrap');
    if (!wrap) return;
    if (!flashEl || !wrap.contains(flashEl)) {
      flashEl = document.createElement('div');
      flashEl.id = 'video-overlay-flash';
      flashEl.setAttribute('aria-hidden', 'true');
      wrap.appendChild(flashEl);
    }
    flashEl.innerHTML = content;
    flashEl.classList.remove('run');
    void flashEl.offsetWidth;
    flashEl.classList.add('run');
  }

  // ── Click on the video pauses; double-click fullscreens (YouTube) ──
  // The click acts immediately; a double-click undoes its pause and
  // fullscreens, so the net effect matches YouTube exactly.
  let videoClickToggledUntil = 0;
  let flashSuppressed = false;
  function handleVideoDblClick() {
    if (Date.now() < videoClickToggledUntil) {
      videoClickToggledUntil = 0;
      flashSuppressed = true;
      void toggle();
    }
    toggleFullscreen();
    reveal();
  }
  function localize() {
    for (const [id, key] of [['video-controls', 'video_controls'], ['video-seek', 'video_seek'], ['video-volume', 'video_volume']]) $(id).setAttribute('aria-label', text(key));
    setCyberTooltip($('video-mute'), text('video_mute_shortcut'));
    setCyberTooltip($('video-prev'), text('video_prev'));
    setCyberTooltip($('video-next'), text('video_next'));
    for (const [id, key] of [['video-back', 'video_back'], ['video-forward', 'video_forward'], ['video-more', 'video_more']]) {
      $(id).setAttribute('aria-label', text(key));
      setCyberTooltip($(id), text(key));
    }
    delete $('video-fullscreen').dataset.fullscreenLabel;
    sync();
    syncTools();
    reveal();
    if (active() && document.body.classList.contains('image-error')) setImageError(state.images[state.current]);
  }
  function initialize() {
    const controls = $('video-controls');
    controls.addEventListener('focusin', reveal);
    controls.addEventListener('focusout', () => {
      // Making idle controls inert releases mouse focus. That automatic blur
      // must not immediately reveal the controls we just hid.
      if (!document.body.classList.contains('video-idle')) reveal();
    });
    controls.addEventListener('pointerdown', () => { interacting = true; keyboardFocus = false; reveal(); });
    window.addEventListener('pointerup', () => { if (interacting) { interacting = false; reveal(); } });
    window.addEventListener('pointercancel', () => { interacting = false; reveal(); });
    controls.querySelector('.video-transport').addEventListener('mouseleave', reveal);
    window.addEventListener('keydown', event => { if (event.key === 'Tab') keyboardFocus = true; if (active()) reveal(); }, true);
    window.addEventListener('pointerdown', event => {
      keyboardFocus = false;
      if (!event.target.closest('#video-menu, #video-more')) closeMenu();
    }, true);
    $('video-play').addEventListener('click', () => void toggle());
    // Click on the video pauses immediately (YouTube); a double-click undoes
    // the pause and fullscreens. Bound on the wrap because #canvas-layer sits
    // above the video element and receives the clicks.
    $('viewer-wrap').addEventListener('click', (event) => {
      if (!active() || window.CVYouTube.active()) return;
      if (event.target.closest('#video-controls, #video-menu, #sidebar-handle, #kbd-hint, #nav-container, #topbar, #sidebar, #ghost-close')) return;
      // A second click inside the dblclick window belongs to the dblclick
      // handler: ignoring it keeps the first click's pause from toggling back.
      if (Date.now() < videoClickToggledUntil) return;
      void toggle();
      videoClickToggledUntil = Date.now() + 700;
    });
    element.addEventListener('play', () => {
      if (flashSuppressed) { flashSuppressed = false; return; }
      if (Date.now() - loadedAt > 400) flashOverlay(FLASH_PLAY);
    });
    element.addEventListener('pause', () => {
      if (flashSuppressed) { flashSuppressed = false; return; }
      flashOverlay(FLASH_PAUSE);
    });
    $('video-prev').addEventListener('click', () => openSibling(-1));
    $('video-next').addEventListener('click', () => openSibling(1));
    $('video-speed-row').addEventListener('click', () => setSpeedPanel(true));
    $('video-speed-back').addEventListener('click', () => setSpeedPanel(false));
    document.querySelectorAll('#video-speed-panel .video-menu-rate').forEach((btn) => {
      btn.addEventListener('click', () => {
        setPlaybackRate(parseFloat(btn.dataset.rate));
        setSpeedPanel(false);
        closeMenu();
      });
    });
    element.addEventListener('loadedmetadata', () => {
      if (!window.CVYouTube.active()) element.playbackRate = currentRate();
      try { $('video-preview').src = element.currentSrc || ''; } catch (_) { /* preview stays off */ }
      previewLast = -1;
      loadedAt = Date.now();
      sync();
    });
    $('video-back').addEventListener('click', () => seekBy(-5));
    $('video-forward').addEventListener('click', () => seekBy(5));
    $('video-mute').addEventListener('click', toggleMute);
    $('video-loop').addEventListener('click', () => { element.loop = !element.loop; sync(); });
    $('video-autoplay').addEventListener('click', () => {
      state.settings.app.videoAutoplay = state.settings.app.videoAutoplay === false;
      window.electronAPI?.saveSettings(state.settings.app);
      sync();
    });
    $('video-fullscreen').addEventListener('click', () => { toggleFullscreen(); reveal(); });
    $('video-more').addEventListener('click', () => setMenu($('video-menu').hidden));
    $('video-open').addEventListener('click', () => { closeMenu(); void openImageDialog(); });
    $('video-properties').addEventListener('click', () => { closeMenu(); openPropertiesForCurrent(); });
    $('video-audio-info').addEventListener('click', () => {
      $('video-audio-note').hidden = !$('video-audio-note').hidden;
      $('video-audio-info').setAttribute('aria-expanded', String(!$('video-audio-note').hidden));
      sync();
    });
    $('video-seek').addEventListener('input', event => {
      if (owner && Number.isFinite(element.duration)) element.currentTime = Math.max(0, Math.min(element.duration, Number(event.target.value)));
    });
    // Seek bar hover: timestamp chip plus a cheap frame preview from a muted
    // twin decoder, throttled so seeking stays light.
    let previewLast = -1;
    const previewBox = $('video-seek-preview');
    const previewVideo = $('video-preview');
    $('video-seek').addEventListener('mousemove', (event) => {
      if (window.CVYouTube.active() || !Number.isFinite(element.duration)) { previewBox.hidden = true; return; }
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const time = ratio * element.duration;
      previewBox.hidden = false;
      previewBox.style.left = `${Math.max(92, Math.min(rect.width - 92, event.clientX - rect.left))}px`;
      $('video-seek-preview-time').textContent = window.CVFormats.formatTime(time);
      if (previewVideo.src !== element.currentSrc) { try { previewVideo.src = element.currentSrc; } catch (_) {} }
      if (Math.abs(time - previewLast) > 0.35) {
        previewLast = time;
        try { previewVideo.currentTime = Math.min(time + 0.05, Math.max(0, (element.duration || 0) - 0.05)); } catch (_) { /* ignore */ }
      }
    });
    $('video-seek').addEventListener('mouseleave', () => { previewBox.hidden = true; });
    $('video-volume').addEventListener('input', event => {
      if (audioStatus === 'unavailable') return;
      element.volume = Number(event.target.value); element.muted = element.volume === 0;
    });
    ['timeupdate', 'play', 'pause', 'ended', 'volumechange', 'durationchange', 'seeked', 'loadedmetadata'].forEach(event => element.addEventListener(event, sync));
    ['play', 'pause', 'ended'].forEach(event => element.addEventListener(event, reveal));
    localize();
  }
  return { element, active, load, unload, toggle, toggleMute, seekBy, sync, syncTools, localize, initialize, imageActions, reveal, closeMenu, handleVideoDblClick, cyclePlaybackRate, setPlaybackRate };
})();
