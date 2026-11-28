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
  const maxCustomPresets = 50;
  const customPresetId = /^custom_[a-z0-9_-]{1,64}$/;
  let settings = defaults();
  let context = null, source = null, preamp = null, limiter = null, analyser = null;
  let filters = [];
  let shutdownPromise = null;

  function defaults() {
    return { enabled: false, preset: 'flat', preamp: 0, gains: Array(bands.length).fill(0), customPresets: [] };
  }

  function clampGain(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(-12, Math.min(12, Math.round(number))) : 0;
  }

  function normalizePresetName(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 48) : '';
  }

  function normalizeCustomPresets(value) {
    if (!Array.isArray(value)) return [];
    const ids = new Set();
    const names = new Set();
    const out = [];
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      if (typeof item.id !== 'string' || !customPresetId.test(item.id) || ids.has(item.id)) continue;
      const name = normalizePresetName(item.name);
      const nameKey = name.toLocaleLowerCase();
      if (!name || names.has(nameKey)) continue;
      ids.add(item.id);
      names.add(nameKey);
      out.push({
        id: item.id,
        name,
        preamp: clampGain(item.preamp),
        gains: bands.map((_, index) => clampGain(Array.isArray(item.gains) ? item.gains[index] : 0))
      });
      if (out.length >= maxCustomPresets) break;
    }
    return out;
  }

  function normalize(value) {
    const input = value && typeof value === 'object' ? value : {};
    const customPresets = normalizeCustomPresets(input.customPresets);
    const selected = customPresets.find(item => item.id === input.preset);
    return {
      enabled: input.enabled === true,
      preset: typeof input.preset === 'string' && presetIds.has(input.preset) ? input.preset
        : selected ? selected.id : input.preset === 'custom' ? 'custom' : 'flat',
      preamp: clampGain(input.preamp ?? selected?.preamp),
      gains: bands.map((_, index) => clampGain(Array.isArray(input.gains) ? input.gains[index] : selected?.gains[index])),
      customPresets
    };
  }

  function snapshot() {
    return {
      ...settings,
      gains: [...settings.gains],
      customPresets: settings.customPresets.map(item => ({ ...item, gains: [...item.gains] }))
    };
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
    if (shutdownPromise) return false;
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

  function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      const closing = context;
      context = null; source = null; preamp = null; limiter = null; analyser = null;
      filters = [];
      if (closing) await closing.close().catch(() => {});
    })();
    return shutdownPromise;
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
    const custom = settings.customPresets.find(item => item.id === id);
    const selected = presetIds.has(id) ? presets[id] : custom;
    if (!selected) return snapshot();
    settings = {
      enabled: settings.enabled,
      preset: id,
      preamp: selected.preamp,
      gains: [...selected.gains],
      customPresets: settings.customPresets
    };
    applySettings();
    return snapshot();
  }

  function getCustomPresets() {
    return settings.customPresets.map(item => ({ ...item, gains: [...item.gains] }));
  }

  function nextCustomPresetId() {
    let id;
    do {
      id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    } while (settings.customPresets.some(item => item.id === id));
    return id;
  }

  function saveCustomPreset(name) {
    const normalizedName = normalizePresetName(name);
    const duplicate = settings.customPresets.some(item =>
      item.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase());
    if (!normalizedName || duplicate || settings.customPresets.length >= maxCustomPresets) return null;
    const item = {
      id: nextCustomPresetId(),
      name: normalizedName,
      preamp: settings.preamp,
      gains: [...settings.gains]
    };
    settings.customPresets.push(item);
    settings.preset = item.id;
    return { ...item, gains: [...item.gains] };
  }

  function renameCustomPreset(id, name) {
    const item = settings.customPresets.find(preset => preset.id === id);
    const normalizedName = normalizePresetName(name);
    if (!item || !normalizedName) return null;
    const duplicate = settings.customPresets.some(preset =>
      preset.id !== id && preset.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase());
    if (duplicate) return null;
    item.name = normalizedName;
    return { ...item, gains: [...item.gains] };
  }

  function deleteCustomPreset(id) {
    const index = settings.customPresets.findIndex(item => item.id === id);
    if (index < 0) return false;
    settings.customPresets.splice(index, 1);
    if (settings.preset === id) settings.preset = 'custom';
    return true;
  }

  function reset() {
    const enabled = settings.enabled;
    settings = { ...defaults(), enabled, customPresets: settings.customPresets };
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

  return {
    bands, presets, defaults, normalize, snapshot, prepare, suspend, load,
    setEnabled, setBand, setPreamp, applyPreset, reset,
    getCustomPresets, saveCustomPreset, renameCustomPreset, deleteCustomPreset,
    isEnabled: () => settings.enabled, isReady: () => !!context, getAnalyser: () => analyser, inspect, shutdown
  };
})();
