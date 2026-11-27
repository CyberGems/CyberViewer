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
  const styles = new Set(['spectrum', 'waveform', 'envelope', 'radial', 'particles', 'aurora',
    'tunnel', 'terrain', 'helix', 'grid', 'prism', 'off']);
  const bands = new Float32Array(64);
  const peaks = new Float32Array(64);
  // RMS per slice plus its held peak; both accumulate only while playing, so a
  // paused canvas keeps the exact envelope it froze at.
  const slices = new Float32Array(64);
  const slicePeaks = new Float32Array(64);
  const wavePoints = new Float32Array(192);
  const prismTipsX = new Float32Array(48);
  const prismTipsY = new Float32Array(48);
  const tunnelRings = 18, tunnelSegments = 64;
  const tunnelX = new Float32Array(tunnelRings * tunnelSegments);
  const tunnelY = new Float32Array(tunnelRings * tunnelSegments);
  const tunnelRingValues = new Float32Array(tunnelRings);
  const tunnelProgress = new Float32Array(tunnelRings);
  const tunnelOrder = Array.from({ length: tunnelRings }, (_, i) => i);
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
    if (saved === 'flares') {
      mode = 'prism';
      localStorage.setItem('cv_audio_visualizer', mode);
    } else if (styles.has(saved)) mode = saved;
  } catch (_) { /* optional preferences */ }
  let media = null, image = null, context = null, source = null, analyser = null;
  let frequencies = null, waveform = null;
  let frame = 0, lastPaint = 0, elapsed = 0, level = 0;
  let energy = 0, bass = 0, highs = 0, waveGain = 1, spin = 0, flow = 0;
  let envelopeClock = 0;
  // Style-name flash shown after stepping with the arrows or the keyboard. It
  // is a DOM layer over the canvas, so painting stays free of UI state.
  const flash = document.getElementById('audio-visual-flash');
  let flashTimer = 0;
  const flashMs = 1150;
  // One envelope column every 1/24 s keeps the scroll time-accurate even when
  // frames are dropped; 64 columns hold roughly the last 2.7 seconds.
  const envelopeStep = 1 / 24;
  let palette = null, backdrop = null, barGradient = null, ribbonGradient = null;
  let envelopeGradient = null, prismGradient = null;
  let auroraGradients = [];
  const tau = Math.PI * 2;
  // Horizontal inset of every composition. The canvas spans the whole viewer;
  // this keeps the drawn shapes off the very edge without shrinking them into
  // the caption's narrow column, which the earlier 10% inset did by accident.
  const inset = .04;
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
    // Autoplay policy: without a prior user gesture an AudioContext starts
    // (and stays) suspended, and awaiting resume() hangs forever — a session
    // restore auto-resuming playback would then never call element.play().
    // Until any interaction has happened, play through the element natively;
    // the graph wires up on the next play() after the first gesture.
    if (!context) {
      if (!enabled()) return;
      if (!navigator.userActivation?.hasBeenActive) return;
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
    // and effects-off playback too, so a suspended context must still resume
    // even with the visualizer off. Sticky activation (any past interaction)
    // makes resume() resolve.
    if (context.state === 'suspended') await context.resume().catch(() => {});
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
    // A near-black neutral field with a faint vignette. Earlier this was an
    // accent wash at 10% lightness, which read as a coloured patch behind every
    // shape and competed with the composition itself. The ground is now a pure
    // grey ramp (R=G=B), so it carries no hue of its own and the accent lives
    // only in the shapes.
    backdrop = ctx.createRadialGradient(w * .5, h * .42, 0, w * .5, h * .42, unit * .78);
    backdrop.addColorStop(0, '#070707');
    backdrop.addColorStop(.55, '#050505');
    backdrop.addColorStop(1, '#020202');
    barGradient = ctx.createLinearGradient(0, h * .19, 0, h * .61);
    barGradient.addColorStop(0, '#e9faff'); barGradient.addColorStop(.25, color(hue + 60));
    barGradient.addColorStop(.65, color(hue)); barGradient.addColorStop(1, color(hue, .15));
    ribbonGradient = ctx.createLinearGradient(w * inset, 0, w * (1 - inset), 0);
    ribbonGradient.addColorStop(0, color(hue + 65, .08));
    ribbonGradient.addColorStop(.35, color(hue + 65, .7));
    ribbonGradient.addColorStop(.7, color(hue, .85)); ribbonGradient.addColorStop(1, color(hue, .05));
    // Mirrored halves meet at the centre axis, so both read as one shape.
    envelopeGradient = ctx.createLinearGradient(0, h * .09, 0, h * .73);
    envelopeGradient.addColorStop(0, color(hue, .9, 72));
    envelopeGradient.addColorStop(.42, color(hue, .78));
    envelopeGradient.addColorStop(.5, color(hue + 20, .28, 88));
    envelopeGradient.addColorStop(.58, color(hue, .78));
    envelopeGradient.addColorStop(1, color(hue, .9, 72));
    prismGradient = ctx.createLinearGradient(w * .4, h * .25, w * .5, h * .52);
    prismGradient.addColorStop(0, color(hue + 65, .22, 78));
    prismGradient.addColorStop(.45, color(hue, .12, 42));
    prismGradient.addColorStop(1, color(hue, .03, 16));
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
    if (mode === 'waveform' || mode === 'helix' || mode === 'envelope' || mode === 'prism') {
      analyser.getByteTimeDomainData(waveform);
      if (mode !== 'helix') {
        let amplitude = .015;
        for (let i = 0; i < waveform.length; i += 4) amplitude = Math.max(amplitude, Math.abs(waveform[i] - 128) / 128);
        waveGain += (Math.min(8, .35 / amplitude) - waveGain) * (1 - Math.exp(-delta / .15));
      }
    }
    if (mode === 'envelope') {
      const last = slices.length - 1;
      // Body is RMS (perceived loudness), the silhouette is true peak: the
      // pairing audio editors use. waveGain normalizes both to the frame.
      let sum = 0, peak = 0;
      for (let i = 0; i < waveform.length; i += 2) {
        const value = (waveform[i] - 128) / 128;
        sum += value * value;
        peak = Math.max(peak, Math.abs(value));
      }
      const rms = Math.sqrt(sum / (waveform.length / 2));
      const body = Math.min(1, rms * waveGain * 2.6);
      const crest = Math.min(1, peak * waveGain * 2.4);
      envelopeClock += delta;
      while (envelopeClock >= envelopeStep) {
        envelopeClock -= envelopeStep;
        // Shift first, then write. Columns the history has not reached yet stay
        // empty and grow in from the right, so the opening reads as a waveform
        // building up instead of a uniform block.
        slices.copyWithin(0, 1); slicePeaks.copyWithin(0, 1);
        slices[last] = body; slicePeaks[last] = crest;
      }
      // Between steps the newest column keeps the loudest sample of its own
      // window; it resets on the next shift, so nothing accumulates across
      // columns the way a running maximum would.
      slices[last] = Math.max(slices[last], body);
      slicePeaks[last] = Math.max(slicePeaks[last], crest);
      // Caps fall at a fixed rate instead of with the level, so transients
      // leave a short readable trail behind the scrolling shape.
      for (let i = 0; i < slices.length; i++) {
        slicePeaks[i] = Math.max(slices[i], slicePeaks[i] - delta * .5);
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
      const x = canvas.width * (inset + (1 - inset * 2) * i / (points - 1)), y = yFor(i);
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function spectrum(w, h, unit) {
    const span = w * (1 - inset * 2), step = span / bands.length, baseline = h * .6;
    // A gentle sway keeps the whole array breathing with the track's energy.
    const sway = Math.sin(elapsed * .7) * unit * .012 * (.25 + energy) * level;
    ctx.fillStyle = palette.soft; ctx.fillRect(w * inset, baseline + 1, span, 1);
    ctx.fillStyle = color(palette.hue, .08 + bass * level * .4);
    ctx.fillRect(w * inset, baseline + 3, span, unit * .005);
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
      ctx.fillStyle = '#020202';
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
      const x = w * (inset + (1 - inset * 2) * i / (n - 1));
      const y = cy + wavePoints[i] * h * .33;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(w * (inset + (1 - inset * 2) * i / (n - 1)), cy - wavePoints[i] * h * .2);
    ctx.closePath(); ctx.fill();
    const top = i => cy + wavePoints[i] * h * .33;
    line(n, top, unit * .014, color(palette.hue, .08));
    line(n, top, Math.max(1.5, unit * .003 * (1 + bass * .9)), palette.ink);
    line(n, i => cy - wavePoints[i] * h * .2, Math.max(1, unit * .002), palette.secondary);
    line(n, i => cy + wavePoints[i] * h * .1, 1, color(palette.hue + 35, .3));
    // Echo ghosts trail the crests so the ribbon reads as moving energy.
    line(n, i => cy + wavePoints[i] * h * .33 * .62 + unit * .012, 1, color(palette.hue + 20, .2 + level * .16));
    line(n, i => cy - wavePoints[i] * h * .2 * .5 - unit * .012, 1, color(palette.hue + 65, .14 + level * .12));
    for (const x of [w * inset, w * (1 - inset)]) {
      ctx.fillStyle = palette.white; ctx.beginPath(); ctx.arc(x, cy, unit * .003, 0, tau); ctx.fill();
    }
  }

  // A scrolling audio-envelope view: the classic editor waveform, full peak
  // silhouette around a centre axis with the RMS body traced inside it.
  function envelope(w, h, unit) {
    const span = w * (1 - inset * 2), step = span / (slices.length - 1), axis = h * .41;
    const max = h * .3;
    const xAt = i => w * inset + i * step;
    // The history enters at the right edge and scrolls left. While a track
    // starts, the columns it has not reached hold zero and simply show the
    // axis, so the shape visibly grows out of the right side.
    ctx.fillStyle = palette.soft; ctx.fillRect(w * inset, axis, span, 1);
    // A low glow pulses with the bass, grounding the shape to the mix.
    ctx.fillStyle = color(palette.hue, .05 + bass * level * .22);
    ctx.fillRect(w * inset, axis + unit * .004, span, unit * .008);
    const top = i => axis - Math.min(1, slicePeaks[i] * level) * max;
    const bottom = i => axis + Math.min(1, slicePeaks[i] * level) * max;
    // One closed silhouette: up along the peaks, back along their mirror.
    ctx.fillStyle = envelopeGradient; ctx.globalAlpha = .5 + level * .45;
    ctx.beginPath();
    ctx.moveTo(xAt(0), top(0));
    for (let i = 1; i < slices.length; i++) ctx.lineTo(xAt(i), top(i));
    for (let i = slices.length - 1; i >= 0; i--) ctx.lineTo(xAt(i), bottom(i));
    ctx.closePath(); ctx.fill();
    // The RMS body sits inside as a brighter, narrower band.
    const rmsTop = i => axis - Math.min(1, slices[i] * level) * max * .82;
    const rmsBottom = i => axis + Math.min(1, slices[i] * level) * max * .82;
    ctx.fillStyle = color(palette.hue + 25, .55, 80);
    ctx.globalAlpha = .35 + level * .5;
    ctx.beginPath();
    ctx.moveTo(xAt(0), rmsTop(0));
    for (let i = 1; i < slices.length; i++) ctx.lineTo(xAt(i), rmsTop(i));
    for (let i = slices.length - 1; i >= 0; i--) ctx.lineTo(xAt(i), rmsBottom(i));
    ctx.closePath(); ctx.fill();
    // Crisp crest and mirror lines keep the silhouette legible at a glance.
    ctx.globalAlpha = .55 + level * .45;
    line(slices.length, top, Math.max(1.5, unit * .0028), palette.white);
    ctx.globalAlpha = .3 + level * .35;
    line(slices.length, bottom, Math.max(1, unit * .002), palette.ink);
    ctx.globalAlpha = .22 + level * .3;
    line(slices.length, rmsTop, 1, color(palette.hue + 65, .85));
    ctx.globalAlpha = 1;
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
      ctx.beginPath(); ctx.moveTo(w * inset, cy - unit * .16 * level);
      for (let i = 0; i < count; i++) ctx.lineTo(w * (inset + (1 - inset * 2) * i / (count - 1)), heightAt(i));
      for (let i = count - 1; i >= 0; i--) {
        const edge = Math.sin(i / (count - 1) * Math.PI);
        ctx.lineTo(w * (inset + (1 - inset * 2) * i / (count - 1)), heightAt(i) - unit * (.05 + energy * .2) * edge * level);
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

  // A spectral wireframe tunnel: every ring is deformed by its own frequency
  // band, while bass drives the forward rush and highs light the outer sparks.
  function tunnel(w, h, unit) {
    const cx = w * .5 + Math.sin(elapsed * .21) * unit * .012 * level;
    const cy = h * .4 + Math.cos(elapsed * .17) * unit * .01 * level;
    const travel = flow * (.24 + bass * .32) + spin * .035;
    for (let i = 0; i < tunnelRings; i++) {
      const progress = (i / tunnelRings + travel) % 1;
      tunnelProgress[i] = progress;
      tunnelOrder[i] = i;
      const depth = Math.pow(progress, 1.6);
      const baseRadius = unit * (.018 + depth * .63);
      const ringBand = (i * 3) % bands.length;
      let total = 0, peak = 0;
      for (let s = 0; s < tunnelSegments; s++) {
        const mirrored = s <= tunnelSegments / 2 ? s : tunnelSegments - s;
        const band = (ringBand + Math.floor(mirrored * .55)) % bands.length;
        const value = bands[band] * level;
        const transient = Math.max(0, peaks[band] - bands[band]) * level;
        const angle = s / tunnelSegments * tau + spin * (.45 + progress * .8);
        const flutter = Math.sin(angle * 3 + progress * 9 - spin * 1.7) * energy * level * .035;
        const deformation = (Math.pow(value, .85) * .16 + transient * .09 + flutter) * (.25 + progress * .75);
        const radius = baseRadius * (1 + deformation);
        const offset = i * tunnelSegments + s;
        tunnelX[offset] = cx + Math.cos(angle) * radius;
        tunnelY[offset] = cy + Math.sin(angle) * radius;
        total += value; peak = Math.max(peak, value);
      }
      tunnelRingValues[i] = total / tunnelSegments;
      const fade = Math.sin(progress * Math.PI);
      const value = tunnelRingValues[i];
      ctx.strokeStyle = i % 3 === 1 ? palette.secondary : i % 3 === 2 ? palette.white : palette.ink;
      ctx.globalAlpha = fade * (.045 + value * .82 + peak * .22) * (.3 + level * .7);
      ctx.lineWidth = Math.max(1, unit * (.0011 + progress * .0032 + value * .0035));
      ctx.beginPath();
      for (let s = 0; s < tunnelSegments; s++) {
        const offset = i * tunnelSegments + s;
        if (!s) ctx.moveTo(tunnelX[offset], tunnelY[offset]); else ctx.lineTo(tunnelX[offset], tunnelY[offset]);
      }
      ctx.closePath(); ctx.stroke();
    }

    tunnelOrder.sort((a, b) => tunnelProgress[a] - tunnelProgress[b]);
    for (let s = 0; s < tunnelSegments; s += 4) {
      const band = Math.floor((s % (tunnelSegments / 2)) / (tunnelSegments / 2) * 63);
      const value = bands[band] * level;
      ctx.strokeStyle = color(palette.hue + band / 63 * 80);
      ctx.globalAlpha = .012 + value * .24 * level;
      ctx.lineWidth = Math.max(1, unit * (.0009 + value * .0014));
      ctx.beginPath();
      for (let r = 0; r < tunnelRings; r++) {
        const offset = tunnelOrder[r] * tunnelSegments + s;
        if (!r) ctx.moveTo(tunnelX[offset], tunnelY[offset]); else ctx.lineTo(tunnelX[offset], tunnelY[offset]);
      }
      ctx.stroke();
    }

    const outer = tunnelOrder[tunnelRings - 1];
    if (highs * level > .04) {
      ctx.fillStyle = palette.white;
      for (let s = 0; s < tunnelSegments; s += 4) {
        const band = Math.floor((s % (tunnelSegments / 2)) / (tunnelSegments / 2) * 63);
        const value = bands[band] * level;
        if (value < .28) continue;
        const offset = outer * tunnelSegments + s;
        ctx.globalAlpha = (.12 + highs * .58) * value * level;
        ctx.beginPath(); ctx.arc(tunnelX[offset], tunnelY[offset], unit * (.0014 + value * .0022), 0, tau); ctx.fill();
      }
    }
    ctx.fillStyle = palette.ink;
    ctx.globalAlpha = .1 + bass * level * .58;
    ctx.beginPath(); ctx.arc(cx, cy, unit * (.01 + bass * level * .042 + energy * level * .012), 0, tau); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Layered ridges scroll at parallax speeds with the spectrum as skyline.
  function terrain(w, h, unit) {
    const rows = 7, cols = 72, left = w * inset, span = w * (1 - inset * 2), floor = h * .68;
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
    const n = 96, cy = h * .4, left = w * inset, span = w * (1 - inset * 2);
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
    const rows = 8, gap = unit * .012;
    let cell = Math.min(unit * .34 / rows - gap, unit * .045);
    // Square cells never stretch: wider windows get more columns instead of
    // wider cells. The cap is the spectrum resolution (64 bands), so a wide
    // window fills its width with real data rather than leaving side margins.
    let cols = Math.round((w * (1 - inset * 2) + gap) / (cell + gap));
    cols = Math.max(16, Math.min(64, cols));
    cell = Math.min(cell, (w * (1 - inset * 2) + gap) / cols - gap);
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

  function prism(w, h, unit) {
    const cx = w * .43, cy = h * .4, radius = unit * (.052 + bass * level * .024);
    const apexX = cx - radius, faceX = cx + radius * .72;
    const faceTop = cy - radius * .9, faceBottom = cy + radius * .9;
    const count = prismTipsX.length, spread = .62 + energy * level * .22;
    const maxReach = Math.min(w * .54, unit * .78);
    const beamLeft = w * .055, beamPoints = 96;

    ctx.beginPath();
    for (let i = 0; i < beamPoints; i++) {
      const t = i / (beamPoints - 1);
      const actual = waveform ? (waveform[Math.floor(t * (waveform.length - 1))] - 128) / 128 : 0;
      const ripple = actual * waveGain * .8 + Math.sin(t * tau * 2 + elapsed * 1.2) * energy * .18;
      const x = beamLeft + (apexX - beamLeft) * t;
      const y = cy + ripple * unit * .028 * level;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = palette.ink; ctx.globalAlpha = .035 + level * .14;
    ctx.lineWidth = unit * .012; ctx.stroke();
    ctx.strokeStyle = palette.white; ctx.globalAlpha = .14 + level * .52;
    ctx.lineWidth = Math.max(1, unit * .0022); ctx.stroke();

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1), value = bands[Math.floor(t * 63)] * level;
      const angle = (t - .5) * spread * 2 + Math.sin(elapsed * .45) * .018 * level
        + Math.sin(elapsed * .6 + t * 5) * energy * level * .012;
      const originY = faceTop + (faceBottom - faceTop) * t;
      const reach = maxReach * (.34 + Math.pow(value, .8) * .66 + bass * level * .04);
      const x = faceX + Math.cos(angle) * reach;
      const y = originY + Math.sin(angle) * reach * .62;
      prismTipsX[i] = x; prismTipsY[i] = y;
      ctx.strokeStyle = color(palette.hue + t * 110);
      ctx.globalAlpha = .025 + value * .11;
      ctx.lineWidth = unit * (.007 + value * .009);
      ctx.beginPath(); ctx.moveTo(faceX, originY); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = .08 + value * .78;
      ctx.lineWidth = Math.max(1, unit * (.0012 + value * .0018));
      ctx.beginPath(); ctx.moveTo(faceX, originY); ctx.lineTo(x, y); ctx.stroke();
      if (t > .55 && value > .32) {
        const shimmer = .5 + .5 * Math.sin(elapsed * 4 + i * 1.9);
        ctx.fillStyle = palette.white;
        ctx.globalAlpha = (.2 + value * .6) * shimmer;
        ctx.beginPath(); ctx.arc(x, y, unit * (.0015 + value * .003), 0, tau); ctx.fill();
      }
    }

    ctx.beginPath(); ctx.moveTo(prismTipsX[0], prismTipsY[0]);
    for (let i = 1; i < count; i++) ctx.lineTo(prismTipsX[i], prismTipsY[i]);
    ctx.strokeStyle = color(palette.hue + 55, .1 + highs * level * .35, 82);
    ctx.lineWidth = Math.max(1, unit * .002); ctx.stroke();

    ctx.fillStyle = palette.ink; ctx.globalAlpha = .06 + bass * level * .32;
    ctx.beginPath(); ctx.arc(cx, cy, radius * (1.3 + bass * level * .35), 0, tau); ctx.fill();
    ctx.fillStyle = prismGradient; ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(apexX, cy); ctx.lineTo(faceX, faceTop); ctx.lineTo(faceX, faceBottom); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = palette.white; ctx.globalAlpha = .24 + level * .5;
    ctx.lineWidth = Math.max(1, unit * .0025); ctx.stroke();
    ctx.strokeStyle = palette.ink; ctx.globalAlpha = .2 + level * .45;
    ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(apexX, cy); ctx.lineTo(faceX, cy);
    ctx.moveTo(faceX, faceTop); ctx.lineTo(cx + radius * .1, cy); ctx.lineTo(faceX, faceBottom);
    ctx.stroke(); ctx.globalAlpha = 1;
  }

  function paint() {
    if (!palette) return;
    const w = canvas.width, h = canvas.height, unit = Math.min(w, h);
    ctx.globalAlpha = 1; ctx.fillStyle = '#020202'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = backdrop; ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (mode === 'spectrum') spectrum(w, h, unit);
    else if (mode === 'waveform') ribbon(w, h, unit);
    else if (mode === 'envelope') envelope(w, h, unit);
    else if (mode === 'radial') eclipse(w, h, unit);
    else if (mode === 'particles') constellation(w, h, unit);
    else if (mode === 'aurora') aurora(w, h, unit);
    else if (mode === 'tunnel') tunnel(w, h, unit);
    else if (mode === 'terrain') terrain(w, h, unit);
    else if (mode === 'helix') helix(w, h, unit);
    else if (mode === 'grid') ledGrid(w, h, unit);
    else if (mode === 'prism') prism(w, h, unit);
    ctx.globalAlpha = 1;
  }

  // A brief style name over the composition, so stepping with the arrows or V
  // confirms itself without looking at the menu. It lives in its own DOM layer
  // instead of the canvas: the canvas stays a pure function of the audio state,
  // so the "paused means a frozen frame" invariant is untouched, and the label
  // can still fade while paused.
  function flashName(next) {
    flash.textContent = text(next === 'off' ? 'audio_effects_off' : 'audio_' + next);
    flash.classList.remove('is-visible');
    // Restart the CSS animation on every step, even when it is already showing.
    void flash.offsetWidth;
    flash.classList.add('is-visible');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashTimer = 0;
      flash.classList.remove('is-visible');
    }, flashMs);
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

  // Tags enrich the caption but never gate playback: the file name paints
  // first, and a late answer for a track that is no longer on screen is dropped.
  let tagToken = 0;
  async function showTags(track) {
    const token = ++tagToken;
    const nameEl = document.getElementById('audio-name');
    const tagsEl = document.getElementById('audio-tags');
    const coverEl = document.getElementById('audio-cover');
    if (!track || !window.electronAPI?.getAudioTags) return;
    let tags;
    try {
      tags = await window.electronAPI.getAudioTags(track.file.path);
    } catch (_) {
      return;
    }
    // The user may have moved on while the tags were being read.
    if (token !== tagToken || image !== track || !tags || !tags.ok) return;
    // Cover art is independent of the text tags: a track with a picture but no
    // title still gets its art, and a track with neither keeps the plain caption.
    if (coverEl) {
      if (tags.cover) {
        coverEl.src = tags.cover;
        coverEl.hidden = false;
      } else {
        coverEl.removeAttribute('src');
        coverEl.hidden = true;
      }
    }
    if (!tags.title && !tags.artist && !tags.album) return;
    nameEl.textContent = tags.title || track.file.name;
    // Artist and album are shown next to the format, never as a hidden tooltip:
    // the same line every track already has, so nothing new has to be learned.
    const detail = [tags.artist, tags.album].filter(Boolean).join(' · ');
    if (tagsEl) {
      tagsEl.textContent = detail;
      tagsEl.hidden = !detail;
    }
  }

  function attach(next) {
    stopFrames(); level = 0; elapsed = 0; energy = 0; bass = 0; highs = 0;
    waveGain = 1; spin = 0; flow = 0; envelopeClock = 0;
    clearTimeout(flashTimer); flashTimer = 0; flash?.classList.remove('is-visible');
    bands.fill(0); peaks.fill(0); waveform?.fill(128);
    slices.fill(0); slicePeaks.fill(0);
    image = next && window.CVFormats.isAudio(next) ? next : null;
    stage.hidden = !image;
    document.getElementById('audio-visualizer-row').hidden = !image;
    const tagsEl = document.getElementById('audio-tags');
    const coverEl = document.getElementById('audio-cover');
    if (image) {
      const nameEl = document.getElementById('audio-name');
      nameEl.textContent = image.file.name;
      if (tagsEl) { tagsEl.textContent = ''; tagsEl.hidden = true; }
      // Reset the art with the rest of the caption so a previous track's cover
      // never flashes over the new one while its tags load.
      if (coverEl) { coverEl.removeAttribute('src'); coverEl.hidden = true; }
      document.getElementById('audio-format').textContent = image.file.name.split('.').pop().toUpperCase();
      // Deliberately not awaited: tags arrive after playback is already live.
      void showTags(image);
    } else {
      tagToken++;
      if (tagsEl) { tagsEl.textContent = ''; tagsEl.hidden = true; }
      if (coverEl) { coverEl.removeAttribute('src'); coverEl.hidden = true; }
    }
    wire(); resize(); refresh();
  }

  async function updateMode() {
    wire();
    try { if (media && !media.paused) await prepare(); }
    catch (error) { console.error('Audio visualization failed:', error); }
    resize(); refresh();
  }
  // Every style the picker can reach, in menu order. 'off' stays last so the
  // cycle can step through the visual styles and land on it predictably.
  const order = ['spectrum', 'waveform', 'envelope', 'radial', 'particles', 'aurora',
    'tunnel', 'terrain', 'helix', 'grid', 'prism', 'off'];

  // Single entry point for arrows and keyboard: they all drive the real select,
  // so the value, the styled label, persistence and the change handler stay in
  // one path instead of three that could drift apart.
  function cycle(step) {
    if (!image) return;
    const index = order.indexOf(mode);
    const from = index < 0 ? 0 : index;
    const next = order[(from + step + order.length) % order.length];
    if (next === mode) return;
    select.value = next;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    // Name the style that was just selected, so stepping is self-evident.
    flashName(next);
  }

  // Arrows flanking the styled picker, so one click steps a style instead of
  // opening the list. Built here because the select is moved into its shell.
  function buildPicker() {
    const shell = select.closest('.cfg-select-shell');
    const row = document.getElementById('audio-visualizer-row');
    if (!shell || !row) return;
    const arrow = (direction, key) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `visualizer-arrow visualizer-arrow-${direction < 0 ? 'prev' : 'next'}`;
      button.dataset.i18nAria = key;
      button.setAttribute('aria-label', text(key));
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'
        + (direction < 0 ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6') + '"/></svg>';
      button.addEventListener('click', () => cycle(direction));
      return button;
    };
    const wrap = document.createElement('div');
    wrap.className = 'visualizer-picker';
    shell.before(wrap);
    const prev = arrow(-1, 'audio_visual_prev');
    const next = arrow(1, 'audio_visual_next');
    wrap.append(prev, shell, next);
    for (const button of [prev, next]) {
      button.addEventListener('pointerenter', () => {
        prev.classList.remove('is-hovered');
        next.classList.remove('is-hovered');
        button.classList.add('is-hovered');
      });
      button.addEventListener('pointerleave', () => button.classList.remove('is-hovered'));
    }
    const styledTrigger = shell.querySelector('.cfg-select-trigger');
    if (styledTrigger) {
      const syncOpenState = () => wrap.classList.toggle('select-open', styledTrigger.getAttribute('aria-expanded') === 'true');
      new MutationObserver(syncOpenState).observe(styledTrigger, { attributes: true, attributeFilter: ['aria-expanded'] });
    }
    // The arrows are the discoverable route; the shortcut is the fast one, so
    // both arrows advertise it rather than leaving it buried in a menu.
    if (typeof window.setCyberTooltip === 'function') {
      const hint = text('audio_visualizer_hint');
      for (const button of [prev, next]) {
        window.setCyberTooltip(button, hint);
        button.dataset.tooltipKbd = 'V';
        button.classList.add('tooltip-bottom');
        if (button === next) button.classList.add('tooltip-align-right');
      }
    }
  }

  function initialize(element) {
    media = element; select.value = mode;
    select.addEventListener('change', () => {
      mode = styles.has(select.value) ? select.value : 'off';
      try { localStorage.setItem('cv_audio_visualizer', mode); } catch (_) { /* optional */ }
      void updateMode();
    });
    buildPicker();
    ['playing', 'pause', 'ended', 'emptied'].forEach(event => media.addEventListener(event, refresh));
    document.addEventListener('visibilitychange', () => { resize(); refresh(); });
    reducedMotion.addEventListener('change', () => { void updateMode(); });
    new ResizeObserver(resize).observe(stage);
    new MutationObserver(resize).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] });
  }
  return { initialize, attach, prepare, refresh, localize, cycle };
})();
