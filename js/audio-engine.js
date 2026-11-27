'use strict';

window.CVAudioEngine = (() => {
  const media = document.getElementById('main-video');
  const bands = Object.freeze([62, 115, 250, 450, 630, 1250, 2700, 5300, 7500, 13000]);
  const presets = Object.freeze({
    flat: Object.freeze({ preamp: 0, gains: Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }),
    bass_boost: Object.freeze({ preamp: -2, gains: Object.freeze([7, 6, 4, 2, 0, -1, -1, 0, 1, 2]) }),
    vocal: Object.freeze({ preamp: 0, gains: Object.freeze([-2, -1, 0, 2, 4, 5, 3, 1, 0, -1]) }),
    electronic: Object.freeze({ preamp: -3, gains: Object.freeze([5, 4, 1, 0, -2, -1, 2, 4, 3, 2]) }),
    acoustic: Object.freeze({ preamp: 0, gains: Object.freeze([-1, 0, 2, 3, 2, 1, 2, 1, 2, 1]) }),
    night: Object.freeze({ preamp: -1, gains: Object.freeze([4, 3, 1, 0, -1, -2, -1, 0, 1, 2]) })
  });
  const presetIds = new Set(Object.keys(presets));
  let settings = defaults();
  let context = null, source = null, preamp = null, limiter = null, analyser = null;
  let filters = [];

  function defaults() {
    return { enabled: false, preset: 'flat', preamp: 0, gains: Array(bands.length).fill(0) };
  }

  function clampGain(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(-12, Math.min(12, Math.round(number))) : 0;
  }

  function normalize(value) {
    const input = value && typeof value === 'object' ? value : {};
    return {
      enabled: input.enabled === true,
      preset: typeof input.preset === 'string' && presetIds.has(input.preset) ? input.preset
        : input.preset === 'custom' ? 'custom' : 'flat',
      preamp: clampGain(input.preamp),
      gains: bands.map((_, index) => clampGain(Array.isArray(input.gains) ? input.gains[index] : 0))
    };
  }

  function snapshot() {
    return { ...settings, gains: [...settings.gains] };
  }

  function dbToGain(db) {
    return 10 ** (db / 20);
  }

  function ramp(param, value) {
    if (param) param.setTargetAtTime(value, context.currentTime, .025);
  }

  function applySettings() {
    if (!context) return;
    const active = settings.enabled;
    ramp(preamp.gain, active ? dbToGain(settings.preamp) : 1);
    filters.forEach((filter, index) => ramp(filter.gain, active ? settings.gains[index] : 0));
    ramp(limiter.threshold, active ? -1.5 : 0);
    ramp(limiter.knee, active ? 3 : 0);
    ramp(limiter.ratio, active ? 20 : 1);
  }

  function buildGraph() {
    context = new window.AudioContext({ latencyHint: 'interactive' });
    source = context.createMediaElementSource(media);
    preamp = context.createGain();
    preamp.gain.value = 1;
    filters = bands.map((frequency, index) => {
      const filter = context.createBiquadFilter();
      filter.type = index === 0 ? 'lowshelf' : index === bands.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = index === 0 || index === bands.length - 1 ? .7 : 1;
      filter.gain.value = 0;
      return filter;
    });
    limiter = context.createDynamicsCompressor();
    limiter.threshold.value = 0;
    limiter.knee.value = 0;
    limiter.ratio.value = 1;
    limiter.attack.value = .003;
    limiter.release.value = .18;
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = .65;
    source.connect(preamp);
    let previous = preamp;
    for (const filter of filters) {
      previous.connect(filter);
      previous = filter;
    }
    previous.connect(limiter);
    limiter.connect(analyser);
    analyser.connect(context.destination);
    applySettings();
  }

  async function prepare() {
    if (!context) {
      if (!navigator.userActivation?.hasBeenActive) return false;
      buildGraph();
    }
    if (context.state === 'suspended') await context.resume().catch(() => {});
    return context.state === 'running';
  }

  function suspend() {
    if (context?.state === 'running') void context.suspend().catch(() => {});
  }

  function load(value) {
    settings = normalize(value);
    applySettings();
    return snapshot();
  }

  function setEnabled(enabled) {
    settings.enabled = enabled === true;
    applySettings();
    if (settings.enabled) void prepare();
    return snapshot();
  }

  function setBand(index, gain) {
    if (!Number.isInteger(index) || index < 0 || index >= bands.length) return snapshot();
    settings.gains[index] = clampGain(gain);
    settings.preset = 'custom';
    applySettings();
    return snapshot();
  }

  function setPreamp(gain) {
    settings.preamp = clampGain(gain);
    settings.preset = 'custom';
    applySettings();
    return snapshot();
  }

  function applyPreset(id) {
    if (!presetIds.has(id)) return snapshot();
    const preset = presets[id];
    settings = { enabled: settings.enabled, preset: id, preamp: preset.preamp, gains: [...preset.gains] };
    applySettings();
    return snapshot();
  }

  function reset() {
    const enabled = settings.enabled;
    settings = { ...defaults(), enabled };
    applySettings();
    return snapshot();
  }

  function inspect() {
    return {
      ready: !!context,
      state: context ? context.state : 'closed',
      preamp: preamp ? preamp.gain.value : null,
      bands: filters.map(filter => ({ frequency: filter.frequency.value, gain: filter.gain.value, q: filter.Q.value, type: filter.type })),
      limiter: limiter ? { threshold: limiter.threshold.value, knee: limiter.knee.value, ratio: limiter.ratio.value } : null
    };
  }

  document.addEventListener('pointerdown', () => { if (settings.enabled) void prepare(); }, { capture: true, once: true });
  document.addEventListener('keydown', () => { if (settings.enabled) void prepare(); }, { capture: true, once: true });

  return { bands, presets, defaults, normalize, snapshot, prepare, suspend, load, setEnabled, setBand, setPreamp, applyPreset, reset,
    isEnabled: () => settings.enabled, isReady: () => !!context, getAnalyser: () => analyser, inspect };
})();
