/* global OfflineAudioContext */
'use strict';

// Full-track waveform for the audio seek bar: the whole file, not the live
// analyser. The file is decoded once at 8 kHz, so a normal track costs a few
// megabytes while decoding and leaves a small peak array cached per file.
//
// Decoding waits until the duration is known, and long tracks are skipped on
// purpose: decoding an hour of audio still allocates a large buffer, and a
// missing waveform is better than a stalled UI. The plain range stays usable
// either way.
window.CVAudioWaveform = (() => {
  const canvas = document.getElementById('audio-track-waveform');
  const ctx = canvas ? canvas.getContext('2d') : null;
  // Peak resolution kept per track. Well above the bar's pixel width, so
  // resizing the window never re-decodes the file.
  const BUCKETS = 1500;
  // Peak memory of a full decode is the Float32 PCM at 8 kHz, about 110 MB per
  // hour, and it is released as soon as the 6 KB peak array exists. Above this
  // cap the file is skipped: a three-hour audiobook would stall for a shape a
  // few hundred pixels wide, and the plain bar stays perfectly usable.
  //
  // Decoding in byte ranges was measured and rejected: Chromium only accepts a
  // mid-file slice for raw ADTS AAC. FLAC, Ogg/Opus and MP4 need their stream
  // header, so chunking would work for one format out of five.
  const MAX_DECODE_BYTES = 160 * 1024 * 1024;
  const MAX_CACHE = 8;
  const cache = new Map();
  let peaks = null;
  let file = null;
  let token = 0;
  let started = false;
  let progress = 0;
  let shape = null;
  let shapeKey = '';
  let ready = false;

  const keyOf = value => `${value.path}|${value.size}|${value.lastModified || 0}`;

  function remember(key, value) {
    cache.set(key, value);
    while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  }

  // Reduce a decoded buffer to BUCKETS peak values. Peak (not RMS) matches what
  // audio editors draw: the transients that define the shape of a track.
  function reduce(samples, channels) {
    const buckets = new Float32Array(BUCKETS);
    const per = samples / BUCKETS;
    let max = 0;
    for (let i = 0; i < BUCKETS; i++) {
      const start = Math.floor(i * per);
      const end = Math.min(samples, Math.max(start + 1, Math.floor((i + 1) * per)));
      let peak = 0;
      for (let j = start; j < end; j++) {
        const value = Math.abs(channels[j]);
        if (value > peak) peak = value;
      }
      buckets[i] = peak;
      if (peak > max) max = peak;
    }
    // Normalize so a quiet master still fills the bar.
    if (max > 0) for (let i = 0; i < BUCKETS; i++) buckets[i] /= max;
    return buckets;
  }

  async function decode(target) {
    const url = window.CVMedia.mediaUrl(target.path);
    if (!url) return null;
    const response = await fetch(url);
    if (!response.ok) throw new Error('waveform fetch failed: ' + response.status);
    // 8 kHz is the lowest practical rate for a few hundred pixel columns and it
    // resamples on decode, so the buffer stays small even for long tracks.
    const offline = new OfflineAudioContext(1, 1, 8000);
    const buffer = await offline.decodeAudioData(await response.arrayBuffer());
    return reduce(buffer.length, buffer.getChannelData(0));
  }

  function measure() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return `${w}x${h}`;
  }

  function accentRgb() {
    const css = getComputedStyle(document.documentElement);
    return (css.getPropertyValue('--cyber-accent-rgb').match(/[\d.]+/g) || [0, 212, 255]).map(Number);
  }

  // Build one offscreen silhouette; each progress update then costs a couple of
  // clipped blits instead of redrawing a thousand columns.
  function build() {
    if (!peaks) return;
    const key = measure() + '|' + (document.documentElement.dataset.theme || '');
    if (shape && shapeKey === key) return;
    const w = canvas.width, h = canvas.height, mid = h / 2;
    const amplitude = h * .46;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const octx = off.getContext('2d');
    const [r, g, b] = accentRgb();
    // Half a pixel of floor keeps silent gaps readable as a thin line.
    const at = x => peaks[Math.min(BUCKETS - 1, Math.floor(x / w * BUCKETS))] * amplitude;
    octx.beginPath();
    octx.moveTo(.5, mid - Math.max(.5, at(0)));
    for (let x = 1; x < w; x++) octx.lineTo(x + .5, mid - Math.max(.5, at(x)));
    for (let x = w - 1; x >= 0; x--) octx.lineTo(x + .5, mid + Math.max(.5, at(x)));
    octx.closePath();
    octx.fillStyle = `rgba(${r}, ${g}, ${b}, 1)`;
    octx.fill();
    shape = off;
    shapeKey = key;
  }

  function paint() {
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!shape) return;
    // The unplayed part stays dim so the shape reads as structure, not as
    // progress; the played part is a clipped copy of the same silhouette.
    ctx.globalAlpha = .3;
    ctx.drawImage(shape, 0, 0);
    ctx.globalAlpha = 1;
    const at = Math.round(w * Math.min(1, Math.max(0, progress)));
    if (at > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, at, h); ctx.clip();
      ctx.drawImage(shape, 0, 0);
      ctx.restore();
    }
    // A thin playhead replaces the hidden native thumb at the exact position.
    const width = Math.max(1, Math.round(w / Math.max(1, canvas.getBoundingClientRect().width)));
    ctx.fillStyle = '#f5fbff';
    ctx.fillRect(Math.min(w - width, Math.max(0, at - width / 2)), 0, width, h);
  }

  function reset() {
    peaks = null; shape = null; shapeKey = ''; ready = false; progress = 0; started = false;
    document.body.classList.remove('waveform-ready');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function load(target) {
    const current = ++token;
    started = true;
    if (target.size > MAX_DECODE_BYTES) return;
    const key = keyOf(target);
    let result = cache.get(key);
    if (!result) {
      try {
        result = await decode(target);
      } catch (error) {
        // A missing waveform must never break playback: the plain range stays.
        console.warn('Audio waveform unavailable:', error.message);
        return;
      }
      if (current !== token || file !== target) return;
      if (result) remember(key, result);
    }
    if (!result) return;
    peaks = result;
    ready = true;
    document.body.classList.add('waveform-ready');
    build();
    paint();
  }

  // The player calls this on every timeline sync, so decoding starts as soon as
  // the duration is known and never blocks the attach.
  function setProgress(current, duration) {
    if (!started && file && duration > 0) void load(file);
    if (!ready) return;
    const next = duration > 0 ? current / duration : 0;
    if (Math.abs(next - progress) < .0005) return;
    progress = next;
    paint();
  }

  function attach(next) {
    reset();
    token++;
    file = next?.file && window.CVFormats.isAudio(next) ? next.file : null;
    if (!file) started = true;
  }

  function initialize() {
    if (!canvas) return;
    // Theme switches change the accent; window size changes the pixel width.
    new ResizeObserver(() => { if (!ready) return; shape = null; build(); paint(); }).observe(canvas);
    new MutationObserver(() => { if (!ready) return; shape = null; build(); paint(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] });
  }

  return { initialize, attach, setProgress };
})();
