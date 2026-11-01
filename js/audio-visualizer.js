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
  const styles = new Set(['spectrum', 'waveform', 'radial', 'particles', 'aurora',
    'tunnel', 'terrain', 'helix', 'grid', 'flares', 'off']);
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
  let energy = 0, bass = 0, highs = 0, waveGain = 1, spin = 0, flow = 0;
  let palette = null, backdrop = null, barGradient = null, ribbonGradient = null;
  let auroraGradients = [];
  const tau = Math.PI * 2;
  // Fireworks launch sites: fixed positions, periods and particle angles keep
  // every burst a pure function of elapsed, so pauses stay perfectly static.
  const bursts = Array.from({ length: 6 }, (_, i) => ({
    x: .2 + (i % 3) * .3, y: .2 + Math.floor(i / 3) * .23,
    period: 2.4 + (i % 3) * .55, offset: i * .19, bin: 5 + i * 9,
    angles: Array.from({ length: 22 }, (_, j) => j / 22 * tau + (i % 3 - 1) * .17 + (j % 4) * .05),
    reach: Array.from({ length: 22 }, (_, j) => .65 + ((j * 7 + i * 3) % 5) * .1)
  }));
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
    if (mode === 'waveform' || mode === 'helix') {
      analyser.getByteTimeDomainData(waveform);
      if (mode === 'waveform') {
        let amplitude = .015;
        for (let i = 0; i < waveform.length; i += 4) amplitude = Math.max(amplitude, Math.abs(waveform[i] - 128) / 128);
        waveGain += (Math.min(8, .35 / amplitude) - waveGain) * (1 - Math.exp(-delta / .15));
      }
    }
    let sum = 0, low = 0, top = 0;
    for (let i = 0; i < bands.length; i++) {
      const start = Math.max(1, Math.floor(Math.pow(440, i / bands.length)));
      const end = Math.min(511, Math.max(start + 1, Math.floor(Math.pow(440, (i + 1) / bands.length))));
      let value = 0;
      for (let j = start; j < end; j++) value = Math.max(value, frequencies[j] / 255);
      const smooth = 1 - Math.exp(-delta / (value > bands[i] ? .045 : .18));
      bands[i] += (value - bands[i]) * smooth;
      peaks[i] = Math.max(bands[i], peaks[i] - delta * .45);
      sum += bands[i]; if (i < 25) low += bands[i]; if (i >= 44) top += bands[i];
    }
    energy += (sum / bands.length - energy) * (1 - Math.exp(-delta / .12));
    bass += (low / 25 - bass) * (1 - Math.exp(-delta / .1));
    highs += (top / (bands.length - 44) - highs) * (1 - Math.exp(-delta / .1));
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
    // A gentle sway keeps the whole array breathing with the track's energy.
    const sway = Math.sin(elapsed * .7) * unit * .012 * (.25 + energy) * level;
    ctx.fillStyle = palette.soft; ctx.fillRect(w * .1, baseline + 1, span, 1);
    ctx.fillStyle = color(palette.hue, .08 + bass * level * .4);
    ctx.fillRect(w * .1, baseline + 3, span, unit * .005);
    for (let i = 0; i < bands.length; i++) {
      const value = bands[i] * level, bar = unit * .006 + Math.pow(value, 1.3) * h * .38;
      const x = (w - span) / 2 + i * step + sway, width = Math.max(2, step * .64);
      ctx.fillStyle = barGradient; ctx.fillRect(x, baseline - bar, width, bar);
      // A bounded reflection and two crisp facets give depth without blurs.
      ctx.globalAlpha = .15; ctx.fillRect(x, baseline + 5, width, bar * .24); ctx.globalAlpha = 1;
      ctx.fillStyle = color(palette.hue, .2 + value * .45, 92);
      ctx.fillRect(x, baseline - bar, Math.max(1, width * .12), bar);
      // Caps flare up while a band is still touching its recent peak.
      const hot = 1 - Math.min(1, (peaks[i] - bands[i]) * 4);
      ctx.fillStyle = palette.white;
      ctx.globalAlpha = .2 + level * .5 + hot * .3;
      ctx.fillRect(x, baseline - unit * .006 - peaks[i] * level * h * .38 - 5, width, 2);
      ctx.globalAlpha = 1;
      // Dark crosscuts make these feel like stacked luminous cells.
      ctx.fillStyle = '#05090f';
      const segments = Math.min(22, Math.floor(bar / (unit * .015)));
      for (let j = 1; j <= segments; j++) ctx.fillRect(x, baseline - j * unit * .015, width, 1);
    }
  }

  function ribbon(w, h, unit) {
    // Bass lifts the whole ribbon; the envelope math stays untouched.
    const cy = h * .41 - (bass - .25) * unit * .08 * level, n = wavePoints.length;
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
    line(n, top, Math.max(1.5, unit * .003 * (1 + bass * .9)), palette.ink);
    line(n, i => cy - wavePoints[i] * h * .2, Math.max(1, unit * .002), palette.secondary);
    line(n, i => cy + wavePoints[i] * h * .1, 1, color(palette.hue + 35, .3));
    // Echo ghosts trail the crests so the ribbon reads as moving energy.
    line(n, i => cy + wavePoints[i] * h * .33 * .62 + unit * .012, 1, color(palette.hue + 20, .2 + level * .16));
    line(n, i => cy - wavePoints[i] * h * .2 * .5 - unit * .012, 1, color(palette.hue + 65, .14 + level * .12));
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
    // Strong bass sends a faint pressure ring past the crown.
    const shock = Math.max(0, bass - .3);
    if (shock > 0) {
      ctx.strokeStyle = palette.secondary; ctx.globalAlpha = shock * 1.1 * level;
      ctx.lineWidth = unit * .004;
      ctx.beginPath(); ctx.arc(cx, cy, radius * 1.3 + shock * unit * .12, 0, tau); ctx.stroke();
    }
    for (let i = 0; i < count; i++) {
      // Mirrored frequency arcs form a balanced crown instead of one spike.
      const bin = Math.floor((i < count / 2 ? i : count - 1 - i) / (count / 2) * 63);
      const value = bands[bin] * level, angle = i / count * tau - Math.PI / 2;
      const outer = radius * 1.12 + unit * (.008 + value * .15);
      ctx.strokeStyle = i < count / 2 ? palette.ink : palette.secondary;
      ctx.globalAlpha = .18 + value * .8; ctx.lineWidth = Math.max(1.5, unit * .003);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * radius * 1.12, cy + Math.sin(angle) * radius * 1.12);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer); ctx.stroke();
      if (value > .55 && i % 12 === 0) {
        ctx.fillStyle = palette.white; ctx.globalAlpha = value * level * .8;
        ctx.beginPath(); ctx.arc(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer, unit * .004, 0, tau); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // A dashed halo slowly orbiting the eclipse speeds up with the energy.
    ctx.setLineDash([unit * .012, unit * .02]);
    ctx.lineDashOffset = -spin * unit * .6;
    ctx.strokeStyle = palette.ink; ctx.globalAlpha = .1 + level * .3;
    ctx.lineWidth = Math.max(1, unit * .002);
    ctx.beginPath(); ctx.arc(cx, cy, radius * 1.34, 0, tau); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
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
      // Each star twists a little further when its own band gets loud.
      const angle = p.angle + elapsed * (.045 + p.depth * .04) + bands[i] * .3;
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
      const twinkle = .8 + .2 * Math.sin(elapsed * 2.5 + i * 1.7);
      ctx.fillStyle = palette.stars[i % 3];
      ctx.globalAlpha = (.08 + p.depth * .16 + value * .7) * twinkle;
      ctx.beginPath(); ctx.arc(x, y, unit * (.0015 + p.size * .001 + value * .006), 0, tau); ctx.fill();
      if (i % 4 === 0) {
        const size = unit * (.004 + value * .016);
        ctx.strokeStyle = palette.stars[i % 3]; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y);
        ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); ctx.stroke();
      }
    }
    // A calm core keeps the constellation anchored and pulses with the bass.
    ctx.fillStyle = palette.ink; ctx.globalAlpha = .1 + bass * level * .45;
    ctx.beginPath(); ctx.arc(cx, cy, unit * (.004 + bass * level * .011), 0, tau); ctx.fill();
    ctx.strokeStyle = palette.ink; ctx.globalAlpha = .08 + bass * level * .3; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, unit * (.011 + bass * level * .03), 0, tau); ctx.stroke();
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
      // Crests glow brighter when cymbals and highs carry the track.
      ctx.globalAlpha = .1 + level * .45 + highs * .5;
      line(count, heightAt, Math.max(1, unit * .002), palette.stars[layer]);
    }
    // Treble-driven speckles shimmer over the curtains.
    for (let i = 0; i < 30; i++) {
      const x = w * (.12 + ((i * 61) % 76) / 100), y = h * (.16 + ((i * 37) % 28) / 100);
      const shimmer = .5 + .5 * Math.sin(elapsed * 1.4 + i * 2.4);
      ctx.fillStyle = palette.stars[i % 3];
      ctx.globalAlpha = (.08 + .42 * shimmer * shimmer) * (.25 + highs * 1.5) * level;
      ctx.beginPath(); ctx.arc(x, y, unit * .0018, 0, tau); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Concentric rings stream outward; the stream speed rides the energy.
  function tunnel(w, h, unit) {
    const cx = w * .5, cy = h * .4, count = 14;
    ctx.fillStyle = palette.ink; ctx.globalAlpha = .1 + bass * level * .5;
    ctx.beginPath(); ctx.arc(cx, cy, unit * (.005 + bass * level * .014), 0, tau); ctx.fill();
    ctx.globalAlpha = 1;
    for (let i = 0; i < count; i++) {
      const progress = (i / count + flow * .45) % 1;
      const value = bands[(i * 4) % bands.length] * level;
      const alpha = Math.sin(progress * Math.PI) * (.08 + value * .8) * level;
      if (alpha < .01) continue;
      const radius = unit * (.02 + Math.pow(progress, .85) * .5);
      ctx.strokeStyle = i % 2 ? palette.ink : palette.secondary;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = Math.max(1, unit * (.0015 + progress * .004 + value * .003));
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, tau); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Layered ridges scroll at parallax speeds with the spectrum as skyline.
  function terrain(w, h, unit) {
    const rows = 7, cols = 72, left = w * .08, span = w * .84, floor = h * .68;
    for (let r = 0; r < rows; r++) {
      const depth = r / (rows - 1);
      const cy = h * (.32 + depth * .3);
      const t0 = flow * (.1 + depth * .45) + r * .41;
      const amp = h * (.04 + depth * .12) * level;
      ctx.beginPath(); ctx.moveTo(left, floor);
      for (let c = 0; c < cols; c++) {
        const x = left + span * c / (cols - 1);
        const t = (c / (cols - 1) * 1.6 + t0) % 1;
        const index = t * 63, base = Math.floor(index), frac = index - base;
        const value = (bands[base] * (1 - frac) + bands[(base + 1) % 64] * frac) * level;
        ctx.lineTo(x, cy - (Math.sin(t * tau * 2 + r * 2.1) * .35 + value * .85) * amp);
      }
      ctx.lineTo(left + span, floor); ctx.closePath();
      ctx.fillStyle = color(palette.hue, 1, 11);
      ctx.globalAlpha = .45 + depth * .5;
      ctx.fill();
      ctx.strokeStyle = r % 2 ? palette.ink : palette.secondary;
      ctx.globalAlpha = .12 + depth * (.2 + level * .5);
      ctx.lineWidth = Math.max(1, unit * (.0012 + depth * .0022));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Twin strands rotate through each other, amplitude riding the waveform.
  function helix(w, h, unit) {
    const n = 96, cy = h * .4, left = w * .08, span = w * .84;
    const amp = h * .15 * level;
    const sway = i => {
      const x = i / (n - 1);
      return Math.sin(x * tau * 1.6 - spin * 2.4) * Math.sin(x * Math.PI);
    };
    const wave = i => {
      const x = i / (n - 1);
      const sample = waveform ? (waveform[Math.floor(x * (waveform.length - 1))] - 128) / 128 : 0;
      return sample * Math.sin(x * Math.PI);
    };
    const xAt = i => left + span * i / (n - 1);
    const strandA = i => cy + (sway(i) * .6 + wave(i) * .5) * amp;
    const strandB = i => cy + (-sway(i) * .6 + wave(i) * .5) * amp;
    for (let i = 4, j = 0; i < n - 4; i += 6, j++) {
      const value = bands[Math.floor(i * .7) % bands.length] * level;
      ctx.strokeStyle = color(palette.hue + (j % 2 ? 65 : 0), .1 + value * .8);
      ctx.lineWidth = Math.max(1, unit * .0018);
      ctx.beginPath(); ctx.moveTo(xAt(i), strandA(i)); ctx.lineTo(xAt(i), strandB(i)); ctx.stroke();
    }
    line(n, strandA, Math.max(1.5, unit * .0035), palette.ink);
    line(n, strandB, Math.max(1, unit * .0025), palette.secondary);
    for (let i = 11; i < n; i += 24) {
      ctx.fillStyle = palette.white; ctx.globalAlpha = .25 + level * .55;
      ctx.beginPath(); ctx.arc(xAt(i), strandA(i), unit * .0025, 0, tau); ctx.fill();
      ctx.beginPath(); ctx.arc(xAt(i), strandB(i), unit * .0025, 0, tau); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // An LED wall: columns climb per frequency, caps fall, top cells blink.
  function ledGrid(w, h, unit) {
    const cols = 16, rows = 8, gap = unit * .012;
    const cell = Math.min(w * .78 / cols - gap, unit * .34 / rows - gap, unit * .045);
    const left = (w - (cols * (cell + gap) - gap)) / 2;
    const bottom = h * .56;
    ctx.fillStyle = palette.soft;
    ctx.fillRect(left - gap, bottom + gap * .5, cols * (cell + gap), Math.max(1, unit * .002));
    for (let c = 0; c < cols; c++) {
      const index = Math.floor(c / cols * 63), value = bands[index] * level;
      const peak = Math.min(rows, Math.max(.5, peaks[index] * level * rows + .5));
      const x = left + c * (cell + gap), lit = value * rows;
      ctx.fillStyle = barGradient;
      for (let r = 0; r < rows; r++) {
        let alpha = Math.min(1, Math.max(0, lit - r)) * (.25 + r / rows * .65);
        if (alpha <= 0) continue;
        if (r === Math.floor(lit - 1)) alpha *= .6 + .4 * Math.sin(elapsed * 5 + c * 1.3);
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, bottom - (r + 1) * (cell + gap) + gap, cell, cell);
      }
      ctx.fillStyle = palette.white;
      ctx.globalAlpha = .3 + level * .4;
      ctx.fillRect(x, bottom - peak * (cell + gap) + gap * .25, cell, Math.max(1.5, unit * .0025));
    }
    ctx.globalAlpha = 1;
  }

  // Fixed launch sites cycle through a rocket climb and a fading burst.
  function flares(w, h, unit) {
    for (let i = 0; i < bursts.length; i++) {
      const site = bursts[i], x = w * site.x;
      const value = bands[site.bin] * level;
      const phase = (elapsed / site.period + site.offset) % 1;
      if (phase < .18) {
        const rise = phase / .18, startY = h * .64;
        const y = startY - (startY - h * site.y) * rise;
        ctx.strokeStyle = color(palette.hue + i * 30, (.2 + value * .6) * (1 - rise * .3));
        ctx.lineWidth = Math.max(1, unit * .0022);
        ctx.beginPath(); ctx.moveTo(x, y + unit * .02); ctx.lineTo(x, y); ctx.stroke();
        continue;
      }
      const q = (phase - .18) / .82, fade = 1 - q;
      const alpha = fade * fade * (.12 + value * .88) * level;
      if (alpha < .012) continue;
      const reach = unit * (.09 + value * .16), droop = q * q * unit * .07;
      ctx.strokeStyle = color(palette.hue + i * 30, alpha);
      ctx.lineWidth = Math.max(1, unit * .002);
      ctx.beginPath();
      for (let j = 0; j < site.angles.length; j++) {
        const angle = site.angles[j], cos = Math.cos(angle), sin = Math.sin(angle);
        const r1 = reach * site.reach[j] * Math.pow(q, .8);
        const r2 = r1 + unit * (.004 + fade * .008);
        ctx.moveTo(x + cos * r1, h * site.y + sin * r1 * .85 + droop);
        ctx.lineTo(x + cos * r2, h * site.y + sin * r2 * .85 + droop);
      }
      ctx.stroke();
      ctx.fillStyle = color(palette.hue + i * 30, alpha * .9);
      ctx.beginPath(); ctx.arc(x, h * site.y, unit * .0025 * fade, 0, tau); ctx.fill();
    }
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
    else if (mode === 'tunnel') tunnel(w, h, unit);
    else if (mode === 'terrain') terrain(w, h, unit);
    else if (mode === 'helix') helix(w, h, unit);
    else if (mode === 'grid') ledGrid(w, h, unit);
    else if (mode === 'flares') flares(w, h, unit);
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
      // Reactive motion phases. Both freeze with level, so a paused canvas
      // stays byte-stable across idle repaints.
      spin += delta * level * (.14 + energy * .55);
      flow += delta * level * (.3 + energy * .85);
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
    stopFrames(); level = 0; elapsed = 0; energy = 0; bass = 0; highs = 0;
    waveGain = 1; spin = 0; flow = 0;
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
