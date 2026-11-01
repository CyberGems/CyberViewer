/* global state, I18N */
'use strict';

// One small canvas and one lazily created audio graph, shared with the existing
// media element. No decoded song buffers, hidden players or external libraries.
window.CVAudioVisuals = (() => {
  const stage = document.getElementById('audio-stage');
  const canvas = document.getElementById('audio-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const select = document.getElementById('audio-visualizer');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const styles = new Set(['spectrum', 'waveform', 'radial', 'particles', 'off']);
  const peaks = new Float32Array(64);
  const particles = Array.from({ length: 64 }, (_, i) => ({
    angle: i * 2.399963, radius: 0.12 + (i % 13) / 16, size: 1 + i % 3
  }));
  let mode = reducedMotion.matches ? 'off' : 'spectrum';
  try {
    const saved = localStorage.getItem('cv_audio_visualizer');
    if (styles.has(saved)) mode = saved;
  } catch (_) { /* preferences are optional when storage is unavailable */ }
  let media = null;
  let image = null;
  let context = null;
  let source = null;
  let analyser = null;
  let frequencies = null;
  let waveform = null;
  let frame = 0;
  let lastPaint = 0;
  let accent = '0, 210, 240';
  let elapsed = 0;

  const text = key => (I18N[state.settings.app.language || 'en'] || I18N.en)[key];
  const enabled = () => !!image && mode !== 'off' && !reducedMotion.matches;
  const animating = () => enabled() && image.loaded && !document.hidden && !media.paused && !media.ended;

  function wire() {
    if (!source) return;
    source.disconnect();
    analyser.disconnect();
    if (enabled()) {
      source.connect(analyser);
      analyser.connect(context.destination);
    } else source.connect(context.destination);
  }

  async function prepare() {
    if (enabled() && !context) {
      context = new window.AudioContext();
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      frequencies = new Uint8Array(analyser.frequencyBinCount);
      waveform = new Uint8Array(analyser.fftSize);
      source = context.createMediaElementSource(media);
      wire();
    }
    // Once the shared media element is routed through Web Audio, ordinary
    // videos and effects-off playback also need the context to be running.
    if (context?.state === 'suspended') await context.resume();
  }

  function resize() {
    if (!image || document.hidden) return;
    if (mode === 'off') { canvas.width = 1; canvas.height = 1; return; }
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5, 1600 / rect.width, 900 / rect.height);
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
    }
    accent = getComputedStyle(document.documentElement).getPropertyValue('--cyber-accent-rgb').trim() || accent;
    if (!frame) paint(false, 0);
  }

  function paint(live, delta) {
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h * 0.48, unit = Math.min(w, h);
    ctx.fillStyle = '#05090f'; ctx.fillRect(0, 0, w, h);
    if (mode === 'off') return;
    const wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, unit * 0.66);
    wash.addColorStop(0, `rgba(${accent}, .085)`); wash.addColorStop(1, `rgba(${accent}, 0)`);
    ctx.fillStyle = wash; ctx.fillRect(0, 0, w, h);
    if (live && analyser) {
      analyser.getByteFrequencyData(frequencies);
      if (mode === 'waveform') analyser.getByteTimeDomainData(waveform);
    }
    let energy = 0;
    if (live && frequencies) {
      for (let i = 1; i < 48; i++) energy += frequencies[i] / (255 * 47);
    }
    elapsed += delta;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(${accent}, .9)`;
    ctx.fillStyle = `rgba(${accent}, .85)`;
    ctx.lineWidth = Math.max(1.5, unit * 0.003);

    if (mode === 'spectrum') {
      const count = peaks.length, span = w * 0.76, step = span / count;
      const baseline = h * 0.63;
      const gradient = ctx.createLinearGradient(0, h * 0.28, 0, baseline);
      gradient.addColorStop(0, '#e2fcff'); gradient.addColorStop(0.25, `rgb(${accent})`);
      gradient.addColorStop(1, `rgba(${accent}, .16)`);
      for (let i = 0; i < count; i++) {
        const bin = Math.min(511, Math.floor(Math.pow(i / (count - 1), 2) * 430) + 1);
        const value = live ? frequencies[bin] / 255 : 0;
        const bar = Math.max(unit * 0.006, value * h * 0.37);
        peaks[i] = live ? Math.max(bar, peaks[i] - delta * h * 0.18) : bar;
        const x = (w - span) / 2 + i * step;
        ctx.fillStyle = gradient; ctx.fillRect(x, baseline - bar, step * 0.58, bar);
        ctx.fillStyle = `rgba(${accent}, .1)`; ctx.fillRect(x, baseline + 6, step * 0.58, bar * 0.18);
        ctx.fillStyle = '#d4faff'; ctx.fillRect(x, baseline - peaks[i] - 5, step * 0.58, 2);
      }
    } else if (mode === 'waveform') {
      ctx.strokeStyle = `rgba(${accent}, .08)`; ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(w * 0.1, cy + i * h * 0.09); ctx.lineTo(w * 0.9, cy + i * h * 0.09); ctx.stroke();
      }
      for (const layer of [1, 0]) {
        ctx.lineWidth = layer ? 8 : 2;
        ctx.strokeStyle = `rgba(${accent}, ${layer ? 0.1 : 0.95})`;
        ctx.beginPath();
        for (let i = 0; i < 512; i++) {
          const sample = live ? (waveform[i * 2] - 128) / 128 : 0;
          const x = w * 0.1 + i / 511 * w * 0.8;
          const y = cy + sample * h * 0.28;
          if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (mode === 'radial') {
      const radius = unit * (0.16 + energy * 0.025);
      ctx.strokeStyle = `rgba(${accent}, .15)`;
      for (const factor of [0.7, 1, 1.15]) {
        ctx.beginPath(); ctx.arc(cx, cy, radius * factor, 0, Math.PI * 2); ctx.stroke();
      }
      for (let i = 0; i < 96; i++) {
        const angle = i / 96 * Math.PI * 2 - Math.PI / 2;
        const value = live ? frequencies[1 + Math.floor(i / 96 * 160)] / 255 : 0;
        const outer = radius + unit * (0.018 + value * 0.16);
        ctx.strokeStyle = `rgba(${accent}, ${0.35 + value * 0.65})`;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer); ctx.stroke();
      }
    } else if (mode === 'particles') {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i], value = live ? frequencies[1 + i * 3] / 255 : 0;
        const angle = p.angle + elapsed * (0.07 + i % 3 * 0.02);
        const radius = unit * p.radius * (0.35 + value * 0.12);
        const x = cx + Math.cos(angle) * radius * 1.35, y = cy + Math.sin(angle) * radius;
        ctx.strokeStyle = `rgba(${accent}, ${0.025 + value * 0.12})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = `rgba(${accent}, ${0.25 + value * 0.75})`;
        ctx.beginPath(); ctx.arc(x, y, (p.size + value * 4) * unit / 650, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function tick(now) {
    frame = 0;
    if (!animating()) return;
    if (now - lastPaint >= 1000 / 30) {
      paint(true, Math.min(0.1, (now - lastPaint) / 1000)); lastPaint = now;
    }
    frame = requestAnimationFrame(tick);
  }

  function refresh() {
    cancelAnimationFrame(frame); frame = 0;
    if (media?.paused && context?.state === 'running') void context.suspend().catch(console.error);
    if (!image) return;
    localize();
    if (document.hidden) return;
    resize();
    if (animating() && analyser) { lastPaint = performance.now(); frame = requestAnimationFrame(tick); }
    else paint(false, 0);
  }

  function localize() {
    select.value = mode;
    canvas.hidden = mode === 'off';
    select.setAttribute('aria-label', text('audio_visualizer'));
    const key = mode === 'off' ? 'audio_effects_off' : reducedMotion.matches ? 'audio_motion_reduced'
      : media?.paused ? 'audio_paused' : `audio_${mode}`;
    document.getElementById('audio-visual-status').textContent = text(key);
  }

  function attach(next) {
    image = next && window.CVFormats.isAudio(next) ? next : null;
    stage.hidden = !image;
    document.getElementById('audio-visualizer-row').hidden = !image;
    peaks.fill(0); elapsed = 0;
    if (image) {
      document.getElementById('audio-name').textContent = image.file.name;
      document.getElementById('audio-format').textContent = image.file.name.split('.').pop().toUpperCase();
    }
    wire(); refresh();
  }

  function initialize(element) {
    media = element;
    select.value = mode;
    select.addEventListener('change', async () => {
      mode = styles.has(select.value) ? select.value : 'off';
      try { localStorage.setItem('cv_audio_visualizer', mode); } catch (_) { /* optional */ }
      wire();
      try { if (!media.paused) await prepare(); }
      catch (error) { console.error('Audio visualization failed:', error); }
      refresh();
    });
    ['playing', 'pause', 'ended', 'emptied'].forEach(event => media.addEventListener(event, refresh));
    document.addEventListener('visibilitychange', refresh);
    reducedMotion.addEventListener('change', async () => {
      wire();
      try { if (media && !media.paused) await prepare(); }
      catch (error) { console.error('Audio visualization failed:', error); }
      refresh();
    });
    new ResizeObserver(resize).observe(stage);
    new MutationObserver(resize).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] });
  }
  return { initialize, attach, prepare, refresh, localize };
})();
