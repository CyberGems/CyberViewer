/* global state, I18N, $, spinner, mainImg, setCyberTooltip,
   displayImage, setImageError, clearImageError, showToast */
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
  }

  function sync() {
    const playing = !!owner && !element.paused && !element.ended;
    $('video-play-label').textContent = text(playing ? 'video_pause' : 'video_play');
    $('video-play-icon').textContent = playing ? 'Ⅱ' : '▶';
    $('video-mute-label').textContent = text(element.muted ? 'video_unmute' : 'video_mute');
    $('video-mute').setAttribute('aria-pressed', String(element.muted));
    $('video-loop').setAttribute('aria-pressed', String(element.loop));
    $('video-loop').classList.toggle('active', element.loop);
    const duration = Number.isFinite(element.duration) ? element.duration : 0;
    const current = Number.isFinite(element.currentTime) ? element.currentTime : 0;
    $('video-time').textContent = `${window.CVFormats.formatTime(current)} / ${window.CVFormats.formatTime(duration)}`;
    const seek = $('video-seek');
    seek.disabled = !duration;
    seek.max = String(duration || 1);
    seek.value = String(current);
    seek.setAttribute('aria-valuetext', $('video-time').textContent);
    $('video-volume').value = String(element.volume);
    if (owner?.loaded && !element.seeking && state.images[state.current] === owner) {
      state.videoTime = current;
      owner.videoTime = current;
      const second = Math.floor(current);
      if (second !== lastSavedSecond) { lastSavedSecond = second; window.CVWorkspace.changed(); }
    }
    const played = element.played;
    const hasPlayed = played.length > 0 && played.end(played.length - 1) - played.start(played.length - 1) > 0.5;
    const noAudio = owner && hasPlayed && element.webkitAudioDecodedByteCount === 0;
    $('video-audio-note').hidden = !noAudio;
    if (noAudio) $('video-audio-note').textContent = text('video_no_audio');
  }

  function unload() {
    generation++;
    clearTimeout(timeout);
    timeout = null;
    if (owner?.loaded && !element.seeking && Number.isFinite(element.currentTime)) owner.videoTime = element.currentTime;
    if (cleanup) cleanup();
    cleanup = null;
    owner = null;
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
      finished = true;
      clearTimeout(timeout);
      image.w = element.videoWidth; image.h = element.videoHeight;
      if (!image.w || !image.h) { fail(); return; }
      image.loaded = true;
      image.duration = element.duration;
      clearImageError();
      $('video-controls').hidden = false;
      displayImage(url, image.w, image.h, null);
      element.pause();
      syncTools(); sync();
      onReady();
    };
    const metadata = () => {
      if (live() && savedTime > 0 && Number.isFinite(element.duration)) {
        element.currentTime = Math.min(savedTime, Math.max(0, element.duration - 0.05));
      }
    };
    element.addEventListener('loadedmetadata', metadata);
    element.addEventListener('loadeddata', ready);
    element.addEventListener('seeked', ready);
    element.addEventListener('error', fail);
    cleanup = () => {
      element.removeEventListener('loadedmetadata', metadata); element.removeEventListener('loadeddata', ready);
      element.removeEventListener('seeked', ready); element.removeEventListener('error', fail);
    };
    timeout = setTimeout(fail, 20000);
    element.src = url;
    element.load();
    sync(); syncTools();
  }

  async function toggle() {
    if (!owner || !owner.loaded || document.body.classList.contains('image-error')) return;
    $('video-controls').classList.remove('hud-hidden-fade');
    if (!element.paused) { element.pause(); return; }
    if (element.ended) element.currentTime = 0;
    try { await element.play(); }
    catch (error) {
      if (error.name !== 'AbortError') { console.error('Video playback failed:', error); showToast(text('video_play_error'), 'error'); }
    }
  }
  function seekBy(seconds) {
    $('video-controls').classList.remove('hud-hidden-fade');
    if (owner && Number.isFinite(element.duration)) element.currentTime = Math.max(0, Math.min(element.duration, element.currentTime + seconds));
  }
  function localize() {
    for (const [id, key] of [['video-controls', 'video_controls'], ['video-seek', 'video_seek'], ['video-volume', 'video_volume']]) $(id).setAttribute('aria-label', text(key));
    setCyberTooltip($('video-play'), text('video_play_shortcut'));
    setCyberTooltip($('video-mute'), text('video_mute_shortcut'));
    sync();
    syncTools();
    if (active() && document.body.classList.contains('image-error')) setImageError(state.images[state.current]);
  }
  function initialize() {
    $('video-controls').addEventListener('focusin', () => $('video-controls').classList.remove('hud-hidden-fade'));
    $('video-play').addEventListener('click', () => void toggle());
    $('video-mute').addEventListener('click', () => { element.muted = !element.muted; });
    $('video-loop').addEventListener('click', () => { element.loop = !element.loop; sync(); });
    $('video-seek').addEventListener('input', event => {
      if (owner && Number.isFinite(element.duration)) element.currentTime = Math.max(0, Math.min(element.duration, Number(event.target.value)));
    });
    $('video-volume').addEventListener('input', event => { element.volume = Number(event.target.value); element.muted = element.volume === 0; });
    ['timeupdate', 'play', 'pause', 'ended', 'volumechange', 'durationchange', 'seeked'].forEach(event => element.addEventListener(event, sync));
    localize();
  }
  return { element, active, load, unload, toggle, seekBy, sync, syncTools, localize, initialize, imageActions };
})();
