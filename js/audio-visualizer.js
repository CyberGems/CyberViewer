/* global state, I18N */
'use strict';

// One bounded canvas and one lazy audio graph. Gradients, bands and particle
// links are reused; the 30 fps loop runs only during playback or a short release.
window.CVAudioVisuals = (() => {
  const stage = document.getElementById('audio-stage');
  const canvas = document.getElementById('audio-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const select = document.getElementById('audio-visualizer');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const styles = new Set(['spectrum', 'waveform', 'radial', 'particles', 'aurora', 'off']);
  const bands = new Float32Array(64);
  const peaks = new Float32Array(64);
  const wavePoints = new Float32Array(192);
  const stars = Array.from({ length: 64 }, (_, i) => ({
    angle: i * 2.399963, radius: 0.16 + (i % 17) / 21,
    depth: 0.35 + (i % 5) * 0.16, size: 1 + i % 3
  }));
  const starX = new Float32Array(stars.length);
  const starY = new Float32Array(stars.length);
  const links = stars.map((_, i) => [i, (i + 13) % stars.length]);
  let mode = reducedMotion.matches ? 'off' : 'spectrum';
  try {
    const saved = localStorage.getItem('cv_audio_visualizer');
    if (styles.has(saved)) mode = saved;
  } catch (_) { /* optional preferences */ }
  let media = null, image = null, context = null, source = null, analyser = null;
  let frequencies = null, waveform = null;
  let frame = 0, lastPaint = 0, elapsed = 0, level = 0;
  let energy = 0, bass = 0, waveGain = 1;
  let palette = null, backdrop = null, barGradient = null, ribbonGradient = null;
  let auroraGradients = [];
  const tau = Math.PI * 2;
  const frameMs = 1000 / 30;
  const text = key => (I18N[state.settings.app.language || 'en'] || I18N.en)[key];
  const enabled = () => !!image && mode !== 'off' && !reducedMotion.matches;
  const visible = () => enabled() && !document.hidden;
  const playing = () => visible() && image.loaded && !media.paused && !media.ended && !!analyser;

  function wire() {
    if (!source) return;
    source.disconnect(); analyser.disconnect();
    if (enabled()) { source.connect(analyser); analyser.connect(context.destination); }
    else source.connect(context.destination);
  }

  async function prepare() {
    if (enabled() && !context) {
      context = new window.AudioContext();
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.65;
      frequencies = new Uint8Array(analyser.frequencyBinCount);
      waveform = new Uint8Array(analyser.fftSize);
      waveform.fill(128);
      source = context.createMediaElementSource(media);
      wire();
    }
    // The shared element remains routed through this graph for ordinary video
    // and effects-off playback too. Resuming it must never depend on a style.
    if (context?.state === 'suspended') await context.resume();
  }

  function color(hue, alpha = 1, lightness = 64) {
    return `hsla(${hue}, ${palette.gray ? 0 : 88}%, ${lightness}%, ${alpha})`;
  }

  function rebuildPalette() {
    const css = getComputedStyle(document.documentElement);
    const rgb = (css.getPropertyValue('--cyber-accent-rgb').match(/[\d.]+/g) || [0, 212, 255]).map(Number);
    const [r, g, b] = rgb.map(n => n / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let hue = !d ? 195 : max === r ? 60 * ((g - b) / d % 6)
      : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    hue = (hue + 360) % 360;
    palette = { hue, gray: document.documentElement.dataset.theme === 'gray' };
    palette.ink = color(hue); palette.soft = color(hue, .15);
    palette.secondary = color(hue + 65); palette.white = '#e9faff';
    palette.stars = Array.from({ length: 3 }, (_, i) => color(hue + i * 42));
    const w = canvas.width, h = canvas.height, unit = Math.min(w, h);
    backdrop = ctx.createRadialGradient(w * .5, h * .4, 0, w * .5, h * .4, unit * .72);
    backdrop.addColorStop(0, color(hue, .1, 30)); backdrop.addColorStop(1, '#05090f');
    barGradient = ctx.createLinearGradient(0, h * .19, 0, h * .61);
    barGradient.addColorStop(0, '#e9faff'); barGradient.addColorStop(.25, color(hue + 60));
    barGradient.addColorStop(.65, color(hue)); barGradient.addColorStop(1, color(hue, .15));
    ribbonGradient = ctx.createLinearGradient(w * .1, 0, w * .9, 0);
    ribbonGradient.addColorStop(0, color(hue + 65, .08));
    ribbonGradient.addColorStop(.35, color(hue + 65, .7));
    ribbonGradient.addColorStop(.7, color(hue, .85)); ribbonGradient.addColorStop(1, color(hue, .05));
    auroraGradients = [0, 1, 2].map(i => {
      const gradient = ctx.createLinearGradient(0, h * .15, 0, h * .64);
      gradient.addColorStop(0, color(hue + i * 50, 0));
      gradient.addColorStop(.5, color(hue + i * 50, .08));
      gradient.addColorStop(1, color(hue + i * 50, .65));
      return gradient;
    });
  }

  function resize() {
    if (!image || document.hidden) return;
    if (mode === 'off') { canvas.width = 1; canvas.height = 1; return; }
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.min(window.devicePixelRatio || 1, 1.25, 1440 / rect.width, 810 / rect.height);
    const w = Math.max(1, Math.round(rect.width * scale)), h = Math.max(1, Math.round(rect.height * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    rebuildPalette();
    if (!frame) paint();
  }

  function sample(delta) {
    analyser.getByteFrequencyData(frequencies);
    if (mode === 'waveform') {
      analyser.getByteTimeDomainData(waveform);
      let amplitude = .015;
      for (let i = 0; i < waveform.length; i += 4) amplitude = Math.max(amplitude, Math.abs(waveform[i] - 128) / 128);
      waveGain += (Math.min(8, .35 / amplitude) - waveGain) * (1 - Math.exp(-delta / .15));
    }
    let sum = 0, low = 0;
    for (let i = 0; i < bands.length; i++) {
      const start = Math.max(1, Math.floor(Math.pow(440, i / bands.length)));
      const end = Math.min(511, Math.max(start + 1, Math.floor(Math.pow(440, (i + 1) / bands.length))));
      let value = 0;
      for (let j = start; j < end; j++) value = Math.max(value, frequencies[j] / 255);
      const smooth = 1 - Math.exp(-delta / (value > bands[i] ? .045 : .18));
      bands[i] += (value - bands[i]) * smooth;
      peaks[i] = Math.max(bands[i], peaks[i] - delta * .45);
      sum += bands[i]; if (i < 25) low += bands[i];
    }
    energy += (sum / bands.length - energy) * (1 - Math.exp(-delta / .12));
    bass += (low / 25 - bass) * (1 - Math.exp(-delta / .1));
  }

  function line(points, yFor, width, stroke) {
    ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const x = canvas.width * (.1 + .8 * i / (points - 1)), y = yFor(i);
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function spectrum(w, h, unit) {
    const span = w * .8, step = span / bands.length, baseline = h * .6;
    ctx.fillStyle = palette.soft; ctx.fillRect(w * .1, baseline + 1, span, 1);
    for (let i = 0; i < bands.length; i++) {
      const value = bands[i] * level, bar = unit * .006 + Math.pow(value, 1.3) * h * .38;
      const x = (w - span) / 2 + i * step, width = Math.max(2, step * .64);
      ctx.fillStyle = barGradient; ctx.fillRect(x, baseline - bar, width, bar);
      // A bounded reflection and two crisp facets give depth without blurs.
      ctx.globalAlpha = .15; ctx.fillRect(x, baseline + 5, width, bar * .24); ctx.globalAlpha = 1;
      ctx.fillStyle = color(palette.hue, .2 + value * .45, 92);
      ctx.fillRect(x, baseline - bar, Math.max(1, width * .12), bar);
      ctx.fillStyle = palette.white;
      ctx.globalAlpha = .25 + level * .65;
      ctx.fillRect(x, baseline - unit * .006 - peaks[i] * level * h * .38 - 5, width, 2);
      ctx.globalAlpha = 1;
      // Dark crosscuts make these feel like stacked luminous cells.
      ctx.fillStyle = '#05090f';
      const segments = Math.min(22, Math.floor(bar / (unit * .015)));
      for (let j = 1; j <= segments; j++) ctx.fillRect(x, baseline - j * unit * .015, width, 1);
    }
  }

  function ribbon(w, h, unit) {
    const cy = h * .41, n = wavePoints.length;
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1), edge = Math.sin(x * Math.PI);
      const actual = waveform ? (waveform[Math.floor(i / n * (waveform.length - 1))] - 128) / 128 : 0;
      wavePoints[i] = (actual * waveGain * 1.4 + Math.sin(x * tau * 2 + elapsed * 1.4) * energy * .7) * edge * level;
    }
    ctx.fillStyle = ribbonGradient; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = w * (.1 + .8 * i / (n - 1));
      const y = cy + wavePoints[i] * h * .33;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(w * (.1 + .8 * i / (n - 1)), cy - wavePoints[i] * h * .2);
    ctx.closePath(); ctx.fill();
    const top = i => cy + wavePoints[i] * h * .33;
    line(n, top, unit * .014, color(palette.hue, .08));
    line(n, top, Math.max(1.5, unit * .003), palette.ink);
    line(n, i => cy - wavePoints[i] * h * .2, Math.max(1, unit * .002), palette.secondary);
    line(n, i => cy + wavePoints[i] * h * .1, 1, color(palette.hue + 35, .3));
    for (const x of [w * .1, w * .9]) {
      ctx.fillStyle = palette.white; ctx.beginPath(); ctx.arc(x, cy, unit * .003, 0, tau); ctx.fill();
    }
  }

  function eclipse(w, h, unit) {
    const cx = w * .5, cy = h * .4, radius = unit * (.16 + bass * level * .025);
    const count = 96;
    ctx.fillStyle = '#080f1a'; ctx.beginPath(); ctx.arc(cx, cy, radius * .96, 0, tau); ctx.fill();
    ctx.strokeStyle = palette.soft; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, radius * 1.12, 0, tau); ctx.stroke();
    for (let i = 0; i < count; i++) {
      // Mirrored frequency arcs form a balanced crown instead of one spike.
      const bin = Math.floor((i < count / 2 ? i : count - 1 - i) / (count / 2) * 63);
      const value = bands[bin] * level, angle = i / count * tau - Math.PI / 2;
      const outer = radius * 1.12 + unit * (.008 + value * .15);
      ctx.strokeStyle = i < count / 2 ? palette.ink : palette.secondary;
      ctx.globalAlpha = .18 + value * .8; ctx.lineWidth = Math.max(1.5, unit * .003);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * radius * 1.12, cy + Math.sin(angle) * radius * 1.12);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      const angle = elapsed * (.16 + i * .04) * (i % 2 ? -1 : 1) + i * 2.1;
      ctx.strokeStyle = i % 2 ? palette.secondary : palette.ink;
      ctx.globalAlpha = .16 + level * .55; ctx.lineWidth = unit * (i ? .002 : .005);
      ctx.beginPath(); ctx.arc(cx, cy, radius * (.77 + i * .115), angle, angle + Math.PI * (1.05 + energy * level)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.ink; ctx.globalAlpha = .2 + bass * level;
    ctx.beginPath(); ctx.arc(cx, cy, unit * (.006 + bass * level * .015), 0, tau); ctx.fill(); ctx.globalAlpha = 1;
  }

  function constellation(w, h, unit) {
    const cx = w * .5, cy = h * .4;
    for (let i = 0; i < stars.length; i++) {
      const p = stars[i], value = bands[i] * level;
      const angle = p.angle + elapsed * (.045 + p.depth * .04);
      const radius = unit * p.radius * (.32 + value * .07 + bass * level * .035);
      starX[i] = cx + Math.cos(angle) * radius * 1.6;
      starY[i] = cy + Math.sin(angle) * radius * .75;
    }
    ctx.strokeStyle = palette.ink; ctx.lineWidth = 1;
    // Fixed sparse links replace any quadratic nearest-neighbour search.
    for (const [a, b] of links) {
      ctx.globalAlpha = .035 + (bands[a] + bands[b]) * level * .12;
      ctx.beginPath(); ctx.moveTo(starX[a], starY[a]); ctx.lineTo(starX[b], starY[b]); ctx.stroke();
    }
    for (let i = 0; i < stars.length; i++) {
      const p = stars[i], value = bands[i] * level, x = starX[i], y = starY[i];
      ctx.fillStyle = palette.stars[i % 3];
      ctx.globalAlpha = .08 + p.depth * .16 + value * .7;
      ctx.beginPath(); ctx.arc(x, y, unit * (.0015 + p.size * .001 + value * .006), 0, tau); ctx.fill();
      if (i % 4 === 0) {
        const size = unit * (.004 + value * .016);
        ctx.strokeStyle = palette.stars[i % 3]; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y);
        ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function aurora(w, h, unit) {
    const count = 112;
    for (let layer = 2; layer >= 0; layer--) {
      const cy = h * (.34 + layer * .055);
      const heightAt = i => {
        const x = i / (count - 1), edge = Math.pow(Math.sin(x * Math.PI), .7);
        const value = bands[Math.floor(x * 63)] * .15 + bass * (1 - x) * .5 + energy * x * .8;
        return cy + edge * (Math.sin(x * 5 + elapsed * .4 + layer * 1.2) * .06
          + Math.sin(x * 11 - elapsed * .25 + layer) * .025
          + value * .11) * h * level;
      };
      ctx.fillStyle = auroraGradients[layer]; ctx.globalAlpha = .15 + level * .7;
      ctx.beginPath(); ctx.moveTo(w * .1, cy - unit * .16 * level);
      for (let i = 0; i < count; i++) ctx.lineTo(w * (.1 + .8 * i / (count - 1)), heightAt(i));
      for (let i = count - 1; i >= 0; i--) {
        const edge = Math.sin(i / (count - 1) * Math.PI);
        ctx.lineTo(w * (.1 + .8 * i / (count - 1)), heightAt(i) - unit * (.05 + energy * .2) * edge * level);
      }
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = .12 + level * .6;
      line(count, heightAt, Math.max(1, unit * .002), palette.stars[layer]);
    }
    ctx.globalAlpha = 1;
  }

  function paint() {
    if (!palette) return;
    const w = canvas.width, h = canvas.height, unit = Math.min(w, h);
    ctx.globalAlpha = 1; ctx.fillStyle = '#05090f'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = backdrop; ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (mode === 'spectrum') spectrum(w, h, unit);
    else if (mode === 'waveform') ribbon(w, h, unit);
    else if (mode === 'radial') eclipse(w, h, unit);
    else if (mode === 'particles') constellation(w, h, unit);
    else if (mode === 'aurora') aurora(w, h, unit);
    ctx.globalAlpha = 1;
  }

  function stopFrames() { cancelAnimationFrame(frame); frame = 0; }
  function tick(now) {
    frame = 0;
    if (!visible()) return;
    const live = playing();
    if (now - lastPaint + .5 >= frameMs) {
      const wallDelta = Math.max(0, (now - lastPaint) / 1000);
      const delta = Math.min(.08, wallDelta);
      lastPaint = now;
      // Attack ~350 ms; release settles in <800 ms. Pause tails reuse the last
      // samples, so the audio context can sleep immediately, without more FFTs.
      level += ((live ? 1 : 0) - level) * (1 - Math.exp(-wallDelta / (live ? .1 : .13)));
      if (!live && level < .004) level = 0;
      if (live) sample(delta);
      elapsed += delta * level;
      paint();
    }
    if (live || level > 0) frame = requestAnimationFrame(tick);
  }

  function refresh() {
    if (media?.paused && context?.state === 'running') void context.suspend().catch(console.error);
    if (!image) { stopFrames(); level = 0; return; }
    localize();
    if (!visible()) {
      stopFrames(); level = 0;
      if (!document.hidden) { resize(); paint(); }
      return;
    }
    if (!palette) resize();
    if (playing() || level > 0) {
      if (!frame) { lastPaint = performance.now(); frame = requestAnimationFrame(tick); }
    } else paint();
  }

  function localize() {
    select.value = mode; canvas.hidden = mode === 'off';
    select.setAttribute('aria-label', text('audio_visualizer'));
    const key = mode === 'off' ? 'audio_effects_off' : reducedMotion.matches ? 'audio_motion_reduced'
      : media?.paused || media?.ended ? 'audio_paused' : `audio_${mode}`;
    document.getElementById('audio-visual-status').textContent = text(key);
  }

  function attach(next) {
    stopFrames(); level = 0; elapsed = 0; energy = 0; bass = 0; waveGain = 1;
    bands.fill(0); peaks.fill(0); waveform?.fill(128);
    image = next && window.CVFormats.isAudio(next) ? next : null;
    stage.hidden = !image;
    document.getElementById('audio-visualizer-row').hidden = !image;
    if (image) {
      document.getElementById('audio-name').textContent = image.file.name;
      document.getElementById('audio-format').textContent = image.file.name.split('.').pop().toUpperCase();
    }
    wire(); resize(); refresh();
  }

  async function updateMode() {
    wire();
    try { if (media && !media.paused) await prepare(); }
    catch (error) { console.error('Audio visualization failed:', error); }
    resize(); refresh();
  }
  function initialize(element) {
    media = element; select.value = mode;
    select.addEventListener('change', () => {
      mode = styles.has(select.value) ? select.value : 'off';
      try { localStorage.setItem('cv_audio_visualizer', mode); } catch (_) { /* optional */ }
      void updateMode();
    });
    ['playing', 'pause', 'ended', 'emptied'].forEach(event => media.addEventListener(event, refresh));
    document.addEventListener('visibilitychange', () => { resize(); refresh(); });
    reducedMotion.addEventListener('change', () => { void updateMode(); });
    new ResizeObserver(resize).observe(stage);
    new MutationObserver(resize).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] });
  }
  return { initialize, attach, prepare, refresh, localize };
})();
