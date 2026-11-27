'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'audio-engine.js'), 'utf8');

function harness() {
  class Param {
    constructor(value) { this.value = value; this.targets = []; }
    setTargetAtTime(value, time, constant) { this.value = value; this.targets.push({ value, time, constant }); }
  }
  class Node {
    constructor() { this.connections = []; }
    connect(node) { this.connections.push(node); }
    disconnect() { this.connections = []; }
  }
  class Gain extends Node { constructor() { super(); this.gain = new Param(1); } }
  class Filter extends Node {
    constructor() { super(); this.gain = new Param(0); this.frequency = new Param(0); this.Q = new Param(0); }
  }
  class Compressor extends Node {
    constructor() {
      super(); this.threshold = new Param(0); this.knee = new Param(0); this.ratio = new Param(1);
      this.attack = new Param(0); this.release = new Param(0);
    }
  }
  class Analyser extends Node { constructor() { super(); this.frequencyBinCount = 512; this.fftSize = 1024; } }
  class MediaSource extends Node {}
  const contexts = [];
  class AudioContext {
    constructor() {
      this.state = 'suspended'; this.currentTime = 0; this.destination = {};
      this.sources = []; this.gains = []; this.filters = []; this.compressors = []; this.analysers = [];
      contexts.push(this);
    }
    createMediaElementSource() { const node = new MediaSource(); this.sources.push(node); return node; }
    createGain() { const node = new Gain(); this.gains.push(node); return node; }
    createBiquadFilter() { const node = new Filter(); this.filters.push(node); return node; }
    createDynamicsCompressor() { const node = new Compressor(); this.compressors.push(node); return node; }
    createAnalyser() { const node = new Analyser(); this.analysers.push(node); return node; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
  }
  const sandbox = {
    console, AudioContext,
    navigator: { userActivation: { hasBeenActive: false } },
    document: {
      getElementById: () => ({}),
      addEventListener: () => {}
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return { engine: sandbox.CVAudioEngine, contexts, navigator: sandbox.navigator };
}

describe('audio equalizer engine', () => {
  it('normalizes persisted values and returns detached snapshots', () => {
    const { engine } = harness();
    assert.deepEqual(Array.from(engine.defaults().gains), Array(10).fill(0));
    const loaded = engine.load({ enabled: true, preset: 'bass_boost', preamp: 40, gains: [7, '5', -20] });
    assert.equal(loaded.enabled, true);
    assert.equal(loaded.preamp, 12);
    assert.deepEqual(Array.from(loaded.gains), [7, 5, -12, 0, 0, 0, 0, 0, 0, 0]);
    loaded.gains[0] = -12;
    assert.equal(engine.snapshot().gains[0], 7);
    assert.equal(engine.load({ preset: 'invalid' }).preset, 'flat');
  });

  it('waits for activation, then builds one ordered graph and resumes it', async () => {
    const { engine, contexts, navigator } = harness();
    engine.load({ enabled: true, preset: 'bass_boost' });
    assert.equal(await engine.prepare(), false);
    assert.equal(contexts.length, 0);
    navigator.userActivation.hasBeenActive = true;
    assert.equal(await engine.prepare(), true);
    assert.equal(await engine.prepare(), true);
    assert.equal(contexts.length, 1);
    const context = contexts[0];
    const [media] = context.sources;
    const [preamp] = context.gains;
    const [limiter] = context.compressors;
    const [analyser] = context.analysers;
    assert.equal(media.connections[0], preamp);
    assert.equal(preamp.connections[0], context.filters[0]);
    context.filters.forEach((filter, index) => {
      if (index < context.filters.length - 1) assert.equal(filter.connections[0], context.filters[index + 1]);
    });
    assert.equal(context.filters[9].connections[0], limiter);
    assert.equal(limiter.connections[0], analyser);
    assert.equal(analyser.connections[0], context.destination);
    assert.equal(engine.getAnalyser(), analyser);
    engine.suspend();
    assert.equal(context.state, 'suspended');
    assert.equal(await engine.prepare(), true);
  });

  it('applies presets and neutralizes every DSP stage without reconnecting', async () => {
    const { engine, contexts, navigator } = harness();
    navigator.userActivation.hasBeenActive = true;
    engine.load({ enabled: true });
    engine.applyPreset('bass_boost');
    await engine.prepare();
    const context = contexts[0];
    const connectionCounts = [context.sources[0], ...context.gains, ...context.filters,
      ...context.compressors, context.analysers[0]].map(node => node.connections.length);
    let state = engine.inspect();
    assert.ok(Math.abs(state.preamp - 10 ** (-2 / 20)) < .000001);
    assert.equal(state.bands.length, 10);
    assert.equal(state.bands[0].type, 'lowshelf');
    assert.equal(state.bands[9].type, 'highshelf');
    assert.equal(state.bands[5].type, 'peaking');
    assert.equal(state.bands[0].frequency, 62);
    assert.equal(state.bands[9].frequency, 13000);
    assert.equal(state.bands[0].gain, 7);
    assert.equal(state.limiter.threshold, -1.5);
    assert.equal(state.limiter.ratio, 20);
    engine.setEnabled(false);
    state = engine.inspect();
    assert.equal(state.preamp, 1);
    assert.ok(state.bands.every(band => band.gain === 0));
    assert.equal(state.limiter.threshold, 0);
    assert.equal(state.limiter.knee, 0);
    assert.equal(state.limiter.ratio, 1);
    assert.deepEqual([context.sources[0], ...context.gains, ...context.filters,
      ...context.compressors, context.analysers[0]].map(node => node.connections.length), connectionCounts);
    engine.setEnabled(true);
    assert.equal(engine.inspect().bands[0].gain, 7);
    engine.setBand(0, 3);
    engine.setPreamp(-4);
    assert.equal(engine.snapshot().preset, 'custom');
    engine.reset();
    const resetState = engine.snapshot();
    assert.deepEqual({ ...resetState, gains: Array.from(resetState.gains) },
      { enabled: true, preset: 'flat', preamp: 0, gains: Array(10).fill(0) });
  });
});
