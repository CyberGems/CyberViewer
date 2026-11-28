/* global state, I18N, $, spinner, mainImg,
   displayImage, setImageError, clearImageError, showToast,
   toggleFullscreen, openImageDialog, openPropertiesForCurrent, showImage */
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
  let speedRepeatTimer = null;
  let audioStatus = 'pending';
  let previewLast = -1;
  let previewSeekTimer = 0;
  let previewIntentTimer = 0;
  let previewSettleTimer = 0;
  let previewRevealTimer = 0;
  let previewGeneration = 0;
  let previewStarted = false;
  let previewPendingTime = -1;
  let loadedAt = 0;
  // Timeline of the latest local media open, in ms since load() started:
  // metadata parsed, first frame decoded, saved position restored and the
  // moment the spinner gave way to the frame. Read it with
  // CVVideo.openTiming() or as the cv-media-open measure in DevTools.
  let openTiming = null;
  const text = key => (I18N[state.settings.app.language || 'en'] || I18N.en)[key];
  const active = () => window.CVFormats.isPlayable(state.images[state.current]);
  const imageActions = new Set(['save', 'save-as', 'export-pdf', 'print', 'copy',
    'rotate-left', 'rotate-right', 'crop', 'resize', 'adjust', 'flip-h', 'flip-v',
    'set-wallpaper', 'set-wallpaper-fill', 'set-wallpaper-fit', 'set-wallpaper-center', 'set-wallpaper-span',
    'start-slideshow', 'slideshow-loop', 'slideshow-interval']);
  const imageButtons = ['btn-rot-l', 'btn-rot-r', 'btn-crop', 'btn-resize', 'btn-adjust',
    'btn-copy', 'btn-print', 'btn-slideshow'];

  function syncTools() {
    const video = active();
    document.body.classList.toggle('video-active', video);
    const audio = window.CVFormats.isAudio(state.images[state.current]);
    document.body.classList.toggle('audio-active', audio);
    if (audio) $('video-fit').disabled = true;
    const navigation = $('shortcuts-navigation-label');
    navigation.dataset.i18n = video ? 'video_seek_keys' : 'navigate_hint';
    navigation.textContent = text(navigation.dataset.i18n);
    const navPrev = $('btn-prev');
    const navNext = $('btn-next');
    if (navPrev && navNext) {
      // In video/audio ←/→ seek, so the nav badges list only the keys that
      // still jump files; Space pauses playback instead of advancing.
      navPrev.dataset.tooltipKbd = video ? '↑ Backspace' : '← ↑ Backspace';
      navNext.dataset.tooltipKbd = video ? '↓' : '→ ↓ Space';
    }
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
    // Card tooltip (kbd badge comes from the static data-tooltip-kbd attribute).
    $('video-play').dataset.tooltip = text(playing ? 'video_pause_shortcut' : 'video_play_shortcut');
    $('video-mute-label').textContent = text(element.muted ? 'video_unmute' : 'video_mute');
    $('video-mute').setAttribute('aria-pressed', String(element.muted));
    $('video-loop').setAttribute('aria-checked', String(element.loop));
    $('video-autoplay').setAttribute('aria-checked', String(state.settings.app.videoAutoplay !== false));
    $('video-remember-state').setAttribute('aria-checked', String(state.settings.app.keepMediaPausedOnTabReturn !== false));
    $('video-sibling-tabs').setAttribute('aria-checked', String(state.settings.app.mediaSiblingsNewTab === true));
    const duration = Number.isFinite(element.duration) ? element.duration : 0;
    const current = Number.isFinite(element.currentTime) ? element.currentTime : 0;
    $('video-time').textContent = `${window.CVFormats.formatTime(current)} / ${window.CVFormats.formatTime(duration)}`;
    const seek = $('video-seek');
    seek.disabled = !duration;
    seek.max = String(duration || 1);
    seek.value = String(current);
    seek.style.setProperty('--video-progress', `${duration ? current / duration * 100 : 0}%`);
    seek.setAttribute('aria-valuetext', $('video-time').textContent);
    window.CVAudioWaveform.setProgress(current, duration);
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
    // audio codec. The container verdict from music-metadata (cached on the
    // tab) settles whether a track exists at all; once playback actually ran,
    // zero decoded bytes mean the codec cannot be played, so that evidence
    // wins over "a track exists" and still recovers if a delayed track starts.
    const decodedStatus = !owner?.loaded ? 'pending' : element.webkitAudioDecodedByteCount > 0 ? 'available'
      : typeof element.webkitAudioDecodedByteCount === 'number' && (playedSeconds > .75 || (element.ended && playedSeconds > 0)) ? 'unavailable' : 'pending';
    const probeStatus = owner && (owner.audioProbe === 'available' || owner.audioProbe === 'unavailable') ? owner.audioProbe : 'pending';
    audioStatus = probeStatus === 'unavailable' || decodedStatus === 'unavailable' ? 'unavailable'
      : probeStatus === 'available' ? 'available' : decodedStatus;
    const unavailable = audioStatus === 'unavailable';
    $('video-mute').disabled = unavailable;
    $('video-volume').disabled = unavailable;
    const equalizerAvailable = active() && !window.CVYouTubeSource.isYouTube(state.images[state.current]) && !unavailable;
    $('audio-equalizer-toggle').disabled = !equalizerAvailable;
    if (!equalizerAvailable) window.CVAudioEqualizer.setAvailable(false);
    else window.CVAudioEqualizer.setAvailable(true);
    const sound = document.querySelector('.video-sound');
    sound.classList.toggle('audio-unavailable', unavailable);
    sound.setAttribute('aria-label', text(unavailable ? 'video_audio_unavailable' : 'video_volume'));
    // Card-only hints: the old CSS bubble on the group overlapped the mute
    // button's badge card, so the unavailable notice now replaces the mute
    // hint (badge included) and marks the group's own card instead.
    if (unavailable) {
      sound.dataset.tooltip = text('video_audio_unavailable');
      $('video-mute').dataset.tooltip = text('video_audio_unavailable');
      delete $('video-mute').dataset.tooltipKbd;
    } else {
      delete sound.dataset.tooltip;
      $('video-mute').dataset.tooltip = text('video_mute_shortcut');
      $('video-mute').dataset.tooltipKbd = 'M';
    }
  }

  function setMenu(open) {
    $('video-menu').hidden = !open;
    $('video-more').setAttribute('aria-expanded', String(open));
    // The styled select floats in the body, so it must close with its menu.
    if (!open) window.CVConfigSelects.close();
    else { sync(); positionVideoMenu(); window.CVAudioEqualizer.setOpen(false); }
    setSpeedPanel(false);
    reveal();
  }
  function positionVideoMenu() {
    const menu = $('video-menu');
    const hostRect = (menu.offsetParent || document.body).getBoundingClientRect();
    const tabs = $('image-tabs');
    const tabsVisible = tabs && !tabs.hidden && getComputedStyle(tabs).display !== 'none';
    const topLimit = (tabsVisible ? tabs.getBoundingClientRect().bottom : hostRect.top) + 8;
    const bottomLimit = hostRect.bottom - 12;
    menu.style.maxHeight = `${Math.max(0, Math.floor(bottomLimit - topLimit))}px`;
    const height = menu.getBoundingClientRect().height;
    const preferredTop = $('video-more').getBoundingClientRect().top - height - 10;
    const top = Math.max(topLimit, Math.min(preferredTop, bottomLimit - height));
    menu.style.top = `${Math.round(top - hostRect.top)}px`;
    menu.style.bottom = 'auto';
  }
  function setSpeedPanel(on) {
    if (!on) stopSpeedRepeat();
    $('video-speed-panel').hidden = !on;
    $('video-speed').setAttribute('aria-expanded', String(on));
    if (on) { positionSpeedPanel(); window.CVAudioEqualizer.setOpen(false); }
  }
  // The popover floats above its transport bar button, so the button's live
  // viewport position decides `left` at open time (offsetParent-safe).
  function positionSpeedPanel() {
    const panel = $('video-speed-panel');
    const rect = $('video-speed').getBoundingClientRect();
    const width = panel.offsetWidth || 260;
    const hostRect = (panel.offsetParent || document.body).getBoundingClientRect();
    const center = rect.left - hostRect.left + rect.width / 2 - width / 2;
    const left = Math.max(8, Math.min(center, hostRect.width - width - 8));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.right = 'auto';
  }
  function closeMenu(restoreFocus = false) {
    const hadMenu = !$('video-menu').hidden;
    const hadPanel = !$('video-speed-panel').hidden;
    setSpeedPanel(false);
    if (hadMenu) setMenu(false);
    else if (!hadPanel) return false;
    if (restoreFocus) (hadMenu ? $('video-more') : $('video-speed')).focus();
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
      // Card tooltip; the Ctrl+F badge is static in the markup.
      $('video-fullscreen').dataset.tooltip = text(fsKey);
    }
    if (!owner?.loaded) return;
    const delay = state.settings.app.hudAutoHideDelay ?? 2000;
    idleTimer = setTimeout(() => {
      // Paused or ended playback idles too: the bar and the held pause badge
      // go away together with the rest of the chrome.
      if (!active() || interacting || !$('video-menu').hidden || !$('video-speed-panel').hidden || window.CVAudioEqualizer.isOpen()) return;
      if (document.querySelector('.modal-overlay.active, #main-menu.open') || !$('shortcuts-popover').hidden) return;
      if (document.querySelector('.video-transport:hover, #ghost-close:hover')) return;
      if (keyboardFocus && (controls.contains(document.activeElement) || document.activeElement === $('ghost-close'))) return;
      // Audio has no frame to reveal and its waveform is the content, so the bar
      // is useful at all times; only fullscreen keeps the auto-hide behaviour.
      if (window.CVFormats.isAudio(owner) && !state.isGhost) return;
      document.body.classList.add('video-idle');
      controls.inert = true;
      $('ghost-close').inert = true;
    }, delay);
  }

  function unload() {
    generation++;
    window.CVAudioVisuals.attach(null);
    window.CVAudioWaveform.attach(null);
    clearTimeout(timeout);
    timeout = null;
    if (owner) owner.pausedOnTabReturn = element.paused;
    if (owner?.loaded && !element.seeking && Number.isFinite(element.currentTime)) owner.videoTime = element.currentTime;
    if (cleanup) cleanup();
    cleanup = null;
    owner = null;
    clearTimeout(idleTimer);
    clearTimeout(previewSeekTimer);
    clearTimeout(previewIntentTimer);
    clearTimeout(previewSettleTimer);
    clearTimeout(previewRevealTimer);
    previewSeekTimer = 0;
    previewIntentTimer = 0;
    previewSettleTimer = 0;
    previewRevealTimer = 0;
    previewGeneration = 0;
    previewStarted = false;
    previewPendingTime = -1;
    previewLast = -1;
    interacting = false;
    closeMenu();
    window.CVAudioEqualizer.setOpen(false);
    clearFlash();
    document.body.classList.remove('video-idle');
    $('video-controls').inert = false;
    $('ghost-close').inert = false;
    keyboardFocus = false;
    element.pause();
    $('video-preview').removeAttribute('src');
    $('video-preview').load();
    $('video-seek-preview').classList.remove('preview-pending');
    $('video-seek-preview').hidden = true;
    element.removeAttribute('src');
    element.load();
    element.hidden = true;
    element.classList.remove('loaded');
    $('video-controls').hidden = true;
    mainImg.hidden = false;
    lastSavedSecond = -1;
  }

  function load(image, url, onReady) {
    const savedTime = window.CVWorkspace.viewFor(image)?.videoTime ?? image.videoTime ?? 0;
    unload();
    const token = generation;
    owner = image;
    // Cached probe results (or audio files) apply the right volume state the
    // moment the tab opens, without waiting for playback.
    audioStatus = image.audioProbe || 'pending';
    const audio = window.CVFormats.isAudio(image);
    window.CVAudioVisuals.attach(image);
    window.CVAudioWaveform.attach(image);
    mainImg.onload = null; mainImg.onerror = null; mainImg.removeAttribute('src');
    mainImg.hidden = true;
    element.hidden = false;
    element.setAttribute('aria-label', image.file.name);
    let finished = false;
    let restorePending = savedTime > 0;
    const openStart = performance.now();
    const timing = openTiming = { file: image.file.name, startedAt: Math.round(performance.timeOrigin + openStart),
      metadata: null, firstFrame: null, restored: null, ready: null, failed: false };
    const stamp = key => { if (timing[key] === null) timing[key] = Math.round(performance.now() - openStart); };
    const settle = () => {
      stamp('ready');
      try { performance.measure('cv-media-open', { start: openStart, detail: { ...timing } }); } catch (_) { /* diagnostics only */ }
      console.debug('[media-open]', JSON.stringify(timing));
    };
    const live = () => token === generation && owner === image && state.images[state.current] === image;
    const fail = () => {
      if (!live()) return;
      clearTimeout(timeout);
      finished = true;
      timing.failed = true;
      settle();
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
      stamp('firstFrame');
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
      if (savedTime > 0) stamp('restored');
      finished = true;
      clearTimeout(timeout);
      image.w = element.videoWidth; image.h = element.videoHeight;
      if (!audio && (!image.w || !image.h)) { fail(); return; }
      image.loaded = true;
      image.duration = element.duration;
      clearImageError();
      $('video-controls').hidden = false;
      displayImage(url, image.w, image.h, null);
      $('video-heading').textContent = image.file.name;
      element.pause();
      syncTools(); sync(); reveal();
      window.CVAudioVisuals.refresh();
      settle();
      onReady();
      // Defer container track probing until frame 0 is on screen so initial
      // module load and metadata reads never compete with opening the video.
      const probePath = image.file && image.file.path;
      if (probePath && window.electronAPI?.getVideoAudioCodec && !image.audioProbe) {
        window.electronAPI.getVideoAudioCodec(probePath).then(result => {
          if (!result || !result.ok || !live()) return;
          image.audioProbe = result.codec ? 'available' : 'unavailable';
          image.audioCodec = result.codec;
          audioStatus = image.audioProbe;
          sync();
        }).catch(() => { /* keep pending */ });
      }
      if (live() && window.CVMedia.shouldPlayMediaOnOpen(state.settings.app, image)) void play();
    };
    const metadata = () => { if (live()) stamp('metadata'); };
    element.addEventListener('loadedmetadata', metadata);
    element.addEventListener('loadeddata', ready);
    element.addEventListener('seeked', ready);
    element.addEventListener('error', fail);
    cleanup = () => {
      element.removeEventListener('loadedmetadata', metadata);
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
    const token = generation;
    reveal();
    if (element.ended) element.currentTime = 0;
    try {
      if (window.CVAudioEngine.isEnabled() || window.CVAudioEngine.isReady()) await window.CVAudioEngine.prepare();
      await window.CVAudioVisuals.prepare();
      if (token !== generation || !owner?.loaded) return;
      await element.play();
      if (token === generation) delete owner.suppressAutoplayUntilPlayed;
    }
    catch (error) {
      if (error.name !== 'AbortError') { console.error('Video playback failed:', error); showToast(text(window.CVFormats.isAudio(owner) ? 'audio_play_error' : 'video_play_error'), 'error'); }
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
    persistVideoPrefs();
    reveal();
  }

  // Loop, volume and mute survive sessions (YouTube behavior). Speed lives in
  // localStorage; autoplay in the regular settings.
  function persistVideoPrefs() {
    try {
      const app = state.settings.app;
      app.videoLoop = element.loop;
      if (!element.muted) app.videoVolume = element.volume;
      app.videoMuted = element.muted;
      if (window.electronAPI && window.electronAPI.saveSettings) window.electronAPI.saveSettings(app);
    } catch (_) { /* ignore */ }
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
    return Number.isFinite(saved) && saved >= 0.25 && saved <= 3 ? saved : 1;
  }
  function setSpeedVisual(rate) {
    const pct = (rate - 0.25) / 2.75 * 100;
    $('video-speed-fill').style.width = `${pct}%`;
    $('video-speed-thumb').style.left = `${pct}%`;
    const track = $('video-speed-track');
    track.setAttribute('aria-valuenow', String(rate));
    track.setAttribute('aria-valuetext', `${rate.toFixed(2)}×`);
  }
  function syncSpeedUi() {
    const rate = currentRate();
    $('video-speed-display').textContent = `${rate.toFixed(2)}×`;
    // Persistent top-left chip: only meaningful while the rate differs from 1×.
    const indicator = $('speed-indicator');
    if (indicator) {
      indicator.hidden = rate === 1;
      indicator.textContent = `${Math.round(rate * 100) / 100}×`;
    }
    setSpeedVisual(rate);
  }
  function setPlaybackRate(rate) {
    if (!Number.isFinite(rate)) return;
    rate = Math.max(0.25, Math.min(3, rate));
    rate = Number(rate.toFixed(2));
    try { localStorage.setItem('cv_video_rate', String(rate)); } catch (_) { /* storage unavailable */ }
    if (!window.CVYouTube.active()) element.playbackRate = rate;
    syncSpeedUi();
    reveal();
  }
  function stopSpeedRepeat() {
    clearTimeout(speedRepeatTimer);
    speedRepeatTimer = null;
  }
  function bindSpeedStep(button, direction) {
    const step = () => setPlaybackRate(currentRate() + direction * 0.05);
    const repeat = () => {
      const previous = currentRate();
      step();
      if (currentRate() !== previous) speedRepeatTimer = setTimeout(repeat, 80);
      else stopSpeedRepeat();
    };
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary) return;
      stopSpeedRepeat();
      try { button.setPointerCapture(event.pointerId); } catch (_) { /* optional */ }
      step();
      speedRepeatTimer = setTimeout(repeat, 350);
    });
    // Pointer input steps on press. Keyboard and accessible/programmatic clicks
    // retain native activation without adding another step when a hold ends.
    button.addEventListener('click', event => { if (event.detail === 0) step(); });
    button.addEventListener('lostpointercapture', stopSpeedRepeat);
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
      if (candidate && candidate.file && candidate.file.path && (window.CVFormats.isAudio(owner) ? window.CVFormats.isAudio(candidate.file.path) : window.CVFormats.isVideo(candidate.file.path))) return candidate;
      index += direction;
    }
    return null;
  }
  function syncSiblings() {
    const audio = window.CVFormats.isAudio(owner);
    const prev = $('video-prev');
    const next = $('video-next');
    if (!prev || !next) return;
    if (window.CVYouTube.active()) { prev.hidden = true; next.hidden = true; return; }
    // Both arrows stay visible: without a sibling they render disabled with
    // their own hint instead of vanishing from the bar. Card tooltips clamp
    // to the viewport, unlike the CSS bubble that clipped at the left edge.
    prev.hidden = false;
    next.hidden = false;
    const hasPrev = !!videoSibling(-1);
    const hasNext = !!videoSibling(1);
    prev.classList.toggle('is-disabled', !hasPrev);
    prev.setAttribute('aria-disabled', String(!hasPrev));
    prev.dataset.tooltip = hasPrev ? text(audio ? 'audio_prev' : 'video_prev') : text('video_no_prev');
    prev.querySelector('span').textContent = text(audio ? 'audio_prev' : 'video_prev');
    next.classList.toggle('is-disabled', !hasNext);
    next.setAttribute('aria-disabled', String(!hasNext));
    next.dataset.tooltip = hasNext ? text(audio ? 'audio_next' : 'video_next') : text('video_no_next');
    next.querySelector('span').textContent = text(audio ? 'audio_next' : 'video_next');
  }
  function openSibling(direction) {
    const sibling = videoSibling(direction);
    if (!sibling || !sibling.file.path) return;
    if (state.settings.app.mediaSiblingsNewTab) {
      void window.openImagePath(sibling.file.path, { reusePath: false });
      return;
    }
    // Same tab by default, including when another tab shows the target file.
    const index = state.images.indexOf(sibling);
    if (index >= 0 && showImage) showImage(index, direction > 0 ? 'left' : 'right');
    else void window.openImagePath(sibling.file.path);
  }

  // ── Center overlay flash (YouTube-style play/pause and speed feedback) ──
  const FLASH_PLAY = '<svg class="menu-ico" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg>';
  const FLASH_PAUSE = '<svg class="menu-ico" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M8 5h3v14H8zM15 5h3v14h-3z"/></svg>';
  let flashEl = null;
  // `hold` keeps the badge on screen (paused) instead of fading it out; the
  // badge then leaves with the rest of the chrome when the player idles.
  function flashOverlay(content, hold = false) {
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
    flashEl.classList.remove('run', 'held');
    void flashEl.offsetWidth;
    flashEl.classList.add(hold ? 'held' : 'run');
  }
  function clearFlash() {
    if (flashEl) flashEl.classList.remove('run', 'held');
  }

  // ── Click on the video pauses (delayed); double-click fullscreens ──
  // The short delay lets the dblclick handler cancel the pending pause, so
  // double-clicking fullscreens without flashing play/pause states.
  let videoClickTimer = null;
  function handleVideoDblClick() {
    if (videoClickTimer) { clearTimeout(videoClickTimer); videoClickTimer = null; }
    toggleFullscreen();
    reveal();
  }
  function localize() {
    for (const [id, key] of [['video-controls', 'video_controls'], ['video-seek', 'video_seek'], ['video-volume', 'video_volume']]) $(id).setAttribute('aria-label', text(key));
    // The sibling arrows' labels and tooltips belong to syncSiblings (card
    // tooltips); touching them here would re-arm the clipped CSS bubble.
    window.CVAudioVisuals.localize();
    for (const [id, key] of [['video-back', 'video_back'], ['video-forward', 'video_forward'], ['video-speed', 'video_speed'], ['video-more', 'video_more']]) {
      $(id).setAttribute('aria-label', text(key));
      $(id).dataset.tooltip = text(key);
    }
    // video-fit shares the image fit pipeline (B); its kbd badge is static in
    // the markup. The fullscreen label swaps with the ghost state in reveal().
    $('video-fit').setAttribute('aria-label', text('menu_fit'));
    $('video-fit').dataset.tooltip = text('menu_fit');
    delete $('video-fullscreen').dataset.fullscreenLabel;
    sync();
    syncTools();
    reveal();
    if (active() && document.body.classList.contains('image-error')) setImageError(state.images[state.current]);
  }
  function initialize() {
    window.CVAudioVisuals.initialize(element);
    window.CVAudioWaveform.initialize();
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
    let menuDismissClick = false;
    window.addEventListener('pointerdown', event => {
      keyboardFocus = false;
      // The visualizer select lives inside the menu, but its popup is appended
      // to the body, so a press on either belongs to the select, not to a
      // dismissal of the player menu.
      const overSelect = !!event.target.closest('.cfg-select-shell, .cfg-select-menu');
      const overPopup = !!event.target.closest('#video-menu, #video-more, #video-speed, #video-speed-panel, #audio-equalizer-toggle, #audio-equalizer-panel') || overSelect;
      // The shared context menu belongs to the same family: a press that
      // dismisses it is not a play/pause press either.
      const overContext = !!event.target.closest('#custom-ctx-menu, .submenu-portal');
      if (overContext) menuDismissClick = false;
      else menuDismissClick = (($('video-menu') && !$('video-menu').hidden) ||
        ($('video-speed-panel') && !$('video-speed-panel').hidden) ||
        !!document.querySelector('#custom-ctx-menu.open')) && !overPopup;
      if (!overPopup) { closeMenu(); window.CVAudioEqualizer.setOpen(false); }
    }, true);
    $('video-play').addEventListener('click', () => void toggle());
    // A pan on the zoomed frame also ends with a click on the wrap. That
    // release belongs to the drag, not to play/pause, so only a press that
    // stays within the click slop counts as a click.
    const CLICK_SLOP_PX = 4;
    let pressOrigin = null;
    let pressPanned = false;
    $('viewer-wrap').addEventListener('mousedown', (event) => {
      pressOrigin = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
      pressPanned = false;
    });
    window.addEventListener('mousemove', (event) => {
      if (!pressOrigin || pressPanned) return;
      if (Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > CLICK_SLOP_PX) pressPanned = true;
    });
    window.addEventListener('mouseup', () => { pressOrigin = null; });
    // Click on the video pauses immediately (YouTube); a double-click undoes
    // the pause and fullscreens. Bound on the wrap because #canvas-layer sits
    // above the video element and receives the clicks.
    $('viewer-wrap').addEventListener('click', (event) => {
      if (!active() || window.CVYouTube.active()) return;
      if (event.target.closest('#video-controls, #video-menu, #sidebar-handle, #kbd-hint, #nav-container, #topbar, #sidebar, #ghost-close')) return;
      // A press that just dismissed the More menu belongs to the dismissal,
      // not to play/pause. The same applies to a press that panned the frame.
      if (pressPanned) { pressPanned = false; menuDismissClick = false; return; }
      if (menuDismissClick) { menuDismissClick = false; return; }
      if (videoClickTimer) return;
      videoClickTimer = setTimeout(() => {
        videoClickTimer = null;
        void toggle();
      }, 230);
    });
    element.addEventListener('play', () => { if (Date.now() - loadedAt > 400) flashOverlay(FLASH_PLAY); });
    // Only a user-visible pause of a loaded tab holds the badge; the pause()
    // that loading and unloading perform must not leave a stale pause badge.
    element.addEventListener('pause', () => { if (owner?.loaded) flashOverlay(FLASH_PAUSE, true); });
    $('video-prev').addEventListener('click', () => openSibling(-1));
    $('video-next').addEventListener('click', () => openSibling(1));
    $('video-speed').addEventListener('click', () => {
      setSpeedPanel($('video-speed-panel').hidden);
      reveal();
    });
    // YouTube-style track: pointer-driven with 0.05 snapping, fully controlled
    // visuals so the fill and the thumb can never drift apart. The move
    // tracking lives on window so the drag survives capture quirks and
    // overlays; the pointer only needs to START on the track.
    let speedDragging = false;
    const speedTrack = $('video-speed-track');
    const speedFromEvent = (event) => {
      const rect = speedTrack.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const rate = Math.max(0.25, Math.min(3, 0.25 + Math.round((ratio * 2.75) / 0.05) * 0.05));
      if (rate !== currentRate()) setPlaybackRate(rate);
    };
    speedTrack.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      speedDragging = true;
      try { speedTrack.setPointerCapture(event.pointerId); } catch (_) { /* optional */ }
      speedFromEvent(event);
    });
    window.addEventListener('pointermove', (event) => { if (speedDragging) speedFromEvent(event); });
    window.addEventListener('pointerup', () => { speedDragging = false; });
    speedTrack.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        setPlaybackRate(currentRate() + (event.key === 'ArrowRight' ? 0.05 : -0.05));
      }
    });
    bindSpeedStep($('video-speed-minus'), -1);
    bindSpeedStep($('video-speed-plus'), 1);
    window.addEventListener('pointerup', stopSpeedRepeat);
    window.addEventListener('pointercancel', stopSpeedRepeat);
    window.addEventListener('blur', stopSpeedRepeat);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopSpeedRepeat(); });
    document.querySelectorAll('#video-speed-presets .video-menu-rate').forEach((btn) => {
      btn.addEventListener('click', () => setPlaybackRate(parseFloat(btn.dataset.rate)));
    });
    element.addEventListener('loadedmetadata', () => {
      if (!window.CVYouTube.active()) element.playbackRate = currentRate();
      // Restore the persisted playback prefs before the first sync paints them.
      const prefs = state.settings.app;
      element.loop = prefs.videoLoop === true;
      if (Number.isFinite(prefs.videoVolume)) element.volume = Math.max(0, Math.min(1, prefs.videoVolume));
      element.muted = prefs.videoMuted === true;
      $('video-preview').removeAttribute('src');
      previewLast = -1;
      loadedAt = Date.now();
      sync();
    });
    $('video-back').addEventListener('click', () => seekBy(-5));
    $('video-forward').addEventListener('click', () => seekBy(5));
    $('video-mute').addEventListener('click', toggleMute);
    $('video-loop').addEventListener('click', () => { element.loop = !element.loop; persistVideoPrefs(); sync(); });
    $('video-autoplay').addEventListener('click', () => {
      state.settings.app.videoAutoplay = state.settings.app.videoAutoplay === false;
      window.electronAPI?.saveSettings(state.settings.app);
      sync();
    });
    $('video-remember-state').addEventListener('click', () => {
      state.settings.app.keepMediaPausedOnTabReturn = state.settings.app.keepMediaPausedOnTabReturn === false;
      window.electronAPI?.saveSettings(state.settings.app);
      sync();
    });
    $('video-sibling-tabs').addEventListener('click', () => {
      state.settings.app.mediaSiblingsNewTab = !state.settings.app.mediaSiblingsNewTab;
      window.electronAPI?.saveSettings(state.settings.app);
      sync();
    });
    $('video-fullscreen').addEventListener('click', () => { toggleFullscreen(); reveal(); });
    // Same fit-to-window pipeline as the image viewer HUD button; only enabled
    // while the video zoom has been adjusted away from fit (see syncViewModeButtons).
    $('video-fit').addEventListener('click', () => {
      if (window.CVYouTube.active()) return;
      const fit = $('btn-fit-hud');
      if (fit && !fit.disabled) fit.click();
      reveal();
    });
    $('video-more').addEventListener('click', () => setMenu($('video-menu').hidden));
    window.addEventListener('resize', () => {
      if (!$('video-menu').hidden) positionVideoMenu();
    });
    $('video-open').addEventListener('click', () => { closeMenu(); void openImageDialog(); });
    $('video-properties').addEventListener('click', () => { closeMenu(); openPropertiesForCurrent(); });
    $('video-seek').addEventListener('input', event => {
      if (owner && Number.isFinite(element.duration)) element.currentTime = Math.max(0, Math.min(element.duration, Number(event.target.value)));
    });
    // Seek bar hover: timestamp chip plus a cheap frame preview from a muted
    // twin decoder. The chip follows the cursor live, but the twin is only
    // asked for a frame after a short hover intent and then at most ~4 times
    // per second, always landing on the latest hovered position. High-quality
    // files pay decoder time for every keyframe seek, so generating fewer
    // thumbnails keeps playback smooth; the 160px hint does not need more.
    const previewBox = $('video-seek-preview');
    const previewVideo = $('video-preview');
    const PREVIEW_INTENT_MS = 200;
    const PREVIEW_SEEK_MS = 250;
    const PREVIEW_MIN_DELTA = 0.15;
    // QHD and above: decoding another full-resolution frame on every sweep
    // step is what makes 4K playback stutter, so those files only get a thumb
    // once the pointer settles. While it moves, the stale frame hides and the
    // live timestamp chip stays; the new frame appears when its seek completes.
    // 1080p and below keep the live cadence.
    const PREVIEW_SETTLE_MS = 160;
    const PREVIEW_REVEAL_MS = 700;
    const PREVIEW_BULK_PIXELS = 2560 * 1440;
    const previewSettlesOnly = () => (element.videoWidth || 0) * (element.videoHeight || 0) >= PREVIEW_BULK_PIXELS;
    const seekPreviewTo = (time) => {
      if (window.CVFormats.isAudio(owner)) return;
      try {
        const assigned = previewVideo.src !== element.currentSrc;
        if (assigned) previewVideo.src = element.currentSrc;
        const target = Math.min(time + 0.05, Math.max(0, (element.duration || 0) - 0.05));
        if (assigned || previewVideo.readyState < 1) previewVideo.currentTime = target;
        else if (typeof previewVideo.fastSeek === 'function') previewVideo.fastSeek(target);
        else previewVideo.currentTime = target;
        previewLast = time;
      } catch (_) { /* ignore */ }
    };
    const revealPreview = (generation) => {
      clearTimeout(previewRevealTimer);
      previewRevealTimer = 0;
      if (generation !== previewGeneration) return;
      previewBox.classList.remove('preview-pending');
    };
    const seekSettledPreview = (time) => {
      const generation = previewGeneration;
      const onSeeked = () => {
        previewVideo.removeEventListener('seeked', onSeeked);
        revealPreview(generation);
      };
      previewVideo.addEventListener('seeked', onSeeked);
      seekPreviewTo(time);
      clearTimeout(previewRevealTimer);
      previewRevealTimer = setTimeout(() => {
        previewVideo.removeEventListener('seeked', onSeeked);
        revealPreview(generation);
      }, PREVIEW_REVEAL_MS);
    };
    const pumpPreview = () => {
      previewSeekTimer = 0;
      if (previewPendingTime < 0 || Math.abs(previewPendingTime - previewLast) < PREVIEW_MIN_DELTA) return;
      seekPreviewTo(previewPendingTime);
      previewSeekTimer = setTimeout(pumpPreview, PREVIEW_SEEK_MS);
    };
    $('video-seek').addEventListener('mousemove', (event) => {
      if (window.CVYouTube.active() || !Number.isFinite(element.duration)) { previewBox.hidden = true; return; }
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const time = ratio * element.duration;
      previewBox.hidden = false;
      previewBox.style.left = `${Math.max(92, Math.min(rect.width - 92, event.clientX - rect.left))}px`;
      $('video-seek-preview-time').textContent = window.CVFormats.formatTime(time);
      if (window.CVFormats.isAudio(owner)) return;
      previewPendingTime = time;
      if (previewSettlesOnly()) {
        previewGeneration++;
        previewBox.classList.add('preview-pending');
        clearTimeout(previewSettleTimer);
        previewSettleTimer = setTimeout(() => {
          previewSettleTimer = 0;
          const generation = previewGeneration;
          if (previewPendingTime >= 0 && Math.abs(previewPendingTime - previewLast) >= PREVIEW_MIN_DELTA) seekSettledPreview(previewPendingTime);
          else if (generation === previewGeneration) previewBox.classList.remove('preview-pending');
        }, PREVIEW_SETTLE_MS);
        return;
      }
      if (previewStarted) {
        if (!previewSeekTimer) {
          seekPreviewTo(previewPendingTime);
          previewSeekTimer = setTimeout(pumpPreview, PREVIEW_SEEK_MS);
        }
        return;
      }
      if (!previewIntentTimer) {
        previewIntentTimer = setTimeout(() => {
          previewIntentTimer = 0;
          previewStarted = true;
          if (previewPendingTime < 0) return;
          seekPreviewTo(previewPendingTime);
          previewSeekTimer = setTimeout(pumpPreview, PREVIEW_SEEK_MS);
        }, PREVIEW_INTENT_MS);
      }
    });
    $('video-seek').addEventListener('mouseleave', () => {
      clearTimeout(previewIntentTimer);
      previewIntentTimer = 0;
      clearTimeout(previewSettleTimer);
      previewSettleTimer = 0;
      clearTimeout(previewRevealTimer);
      previewRevealTimer = 0;
      previewGeneration++;
      previewBox.classList.remove('preview-pending');
      previewStarted = false;
      clearTimeout(previewSeekTimer);
      previewSeekTimer = 0;
      previewPendingTime = -1;
      previewLast = -1;
      previewVideo.pause();
      previewBox.hidden = true;
    });
    $('video-volume').addEventListener('input', event => {
      if (audioStatus === 'unavailable') return;
      element.volume = Number(event.target.value); element.muted = element.volume === 0;
      persistVideoPrefs();
    });
    ['timeupdate', 'play', 'pause', 'ended', 'volumechange', 'durationchange', 'seeked', 'loadedmetadata'].forEach(event => element.addEventListener(event, sync));
    ['play', 'pause', 'ended'].forEach(event => element.addEventListener(event, reveal));
    localize();
  }
  return { element, active, load, unload, toggle, toggleMute, seekBy, sync, syncTools, localize, initialize, imageActions, reveal, closeMenu, handleVideoDblClick, cyclePlaybackRate, setPlaybackRate,
    openTiming: () => (openTiming ? { ...openTiming } : null) };
})();
