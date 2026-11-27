const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const visualizer = fs.readFileSync(path.join(root, 'js', 'audio-visualizer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const bundledI18n = fs.readFileSync(path.join(root, 'i18n', 'ui.js'), 'utf8');
const i18n = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));

describe('audio visualizer resume guard', () => {
  it('never wires the audio graph before a user gesture exists', () => {
    // Autoplay policy starts a fresh AudioContext suspended without a
    // gesture, and awaiting resume() then hangs forever — a session restore
    // auto-resuming playback would never call element.play(). The graph must
    // wait for sticky activation, and play natively until then.
    assert.match(visualizer, /if \(!navigator\.userActivation\?\.hasBeenActive\) return;/);
    assert.match(visualizer, /if \(context\.state === 'suspended'\) await context\.resume\(\)\.catch\(\(\) => \{\}\);/);
    // Creation must be gated, but the resume check stays reachable when the
    // visualizer is off and the context is already routing element audio.
    const prepare = visualizer.match(/async function prepare\(\) \{[\s\S]*?\n  \}/)[0];
    const gateIndex = prepare.indexOf('userActivation');
    const resumeIndex = prepare.indexOf("context.state === 'suspended'");
    assert.ok(gateIndex >= 0 && resumeIndex > gateIndex, 'resume check should follow the creation gate');
    assert.ok(!/if \(!enabled\(\)\) return;/.test(prepare.split('if (!context) {')[0]), 'enabled() must not skip the resume check');
  });
});

describe('Prism audio visualization', () => {
  it('replaces Fireworks in the picker and both languages', () => {
    assert.match(html, /<option value="prism" data-i18n="audio_prism">Prisma<\/option>/);
    assert.doesNotMatch(html, /audio_flares|value="flares"/);
    assert.equal(i18n.en.audio_prism, 'Prism');
    assert.equal(i18n.es.audio_prism, 'Prisma');
    assert.match(bundledI18n, /"audio_prism":"Prism"/);
    assert.doesNotMatch(bundledI18n, /"audio_flares"/);
  });

  it('registers Prism for selection, cycling and saved-preference migration', () => {
    const styles = visualizer.match(/const styles = new Set\(\[([\s\S]*?)\]\)/)[1];
    const order = visualizer.match(/const order = \[([\s\S]*?)\];/)[1];
    assert.match(styles, /'prism'/);
    assert.match(order, /'prism'/);
    assert.doesNotMatch(styles, /'flares'/);
    assert.doesNotMatch(order, /'flares'/);
    assert.match(visualizer, /if \(saved === 'flares'\) \{\s*mode = 'prism';\s*localStorage\.setItem\('cv_audio_visualizer', mode\);/);
    assert.match(visualizer, /else if \(mode === 'prism'\) prism\(w, h, unit\);/);
    assert.doesNotMatch(visualizer, /function flares|mode === 'flares'/);
  });

  it('derives the beam and spectrum fan from live audio data', () => {
    const prism = visualizer.match(/function prism\(w, h, unit\) \{[\s\S]*?\n  \}/)[0];
    for (const source of ['waveform', 'waveGain', 'bands', 'bass', 'energy', 'highs']) {
      assert.ok(prism.includes(source), `Prism should react to ${source}`);
    }
    assert.match(visualizer, /mode === 'envelope' \|\| mode === 'prism'/);
  });
});

describe('Tunnel audio visualization', () => {
  it('deforms a smoothly tracked spectral wireframe with live frequency data', () => {
    const tunnel = visualizer.match(/function tunnel\(w, h, unit\) \{[\s\S]*?\n  \}/)[0];
    for (const source of ['tunnelBands', 'tunnelPeaks', 'tunnelBass', 'tunnelEnergy', 'tunnelHighs', 'tunnelTravel', 'tunnelSpin']) {
      assert.ok(tunnel.includes(source), `Tunnel should react to ${source}`);
    }
    assert.match(visualizer, /tunnelBands\[i\] \+= \(bands\[i\] - tunnelBands\[i\]\) \* tunnelSmooth/);
    assert.match(visualizer, /delta \/ \.22/);
    assert.match(visualizer, /tunnelBass \+= \(bass - tunnelBass\) \* \(1 - Math\.exp\(-delta \/ \.28\)\)/);
    assert.match(visualizer, /tunnelPeaks\[i\] = Math\.max\(tunnelBands\[i\], tunnelPeaks\[i\] - delta \* \.24\)/);
    assert.match(visualizer, /tunnelTravel \+= delta \* level \* \(\.035 \+ tunnelBass \* \.085 \+ tunnelEnergy \* \.018\);/);
    assert.match(visualizer, /tunnelSpin \+= delta \* level \* \(\.028 \+ tunnelEnergy \* \.06 \+ tunnelHighs \* \.018\);/);
    assert.match(tunnel, /tunnelOrder\.sort/);
    assert.match(tunnel, /quadraticCurveTo/);
    assert.match(tunnel, /nextBand/);
    assert.doesNotMatch(tunnel, /\bflow\b|\bspin\b/);
  });
});

describe('Oscilloscope audio visualization', () => {
  it('filters waveform windows and gain before drawing the ribbon', () => {
    const sample = visualizer.match(/function sample\(delta\) \{[\s\S]*?\n  \}/)[0];
    const ribbon = visualizer.match(/function ribbon\(w, h, unit\) \{[\s\S]*?\n  \}/)[0];
    assert.match(sample, /if \(mode === 'waveform'\)/);
    assert.match(sample, /scopeGain \+= \(targetGain - scopeGain\)/);
    assert.match(sample, /const sampleWindow = waveform\.length \/ wavePoints\.length/);
    assert.match(sample, /Math\.tanh\(/);
    assert.match(sample, /Math\.abs\(target\) > Math\.abs\(wavePoints\[i\]\) \? \.085 : \.22/);
    assert.match(sample, /\) \* edge;/);
    assert.doesNotMatch(sample, /edge \* level/);
    assert.match(ribbon, /wavePoints\[i\] \* level/);
    assert.doesNotMatch(ribbon, /wavePoints\[i\]\s*=|waveform|waveGain/);
  });
});

describe('caption-safe visualization layout', () => {
  it('measures the space above the track caption', () => {
    assert.match(visualizer, /visualTop = h \* \.075/);
    assert.match(visualizer, /captionRect\.top - rect\.top/);
    assert.match(visualizer, /new ResizeObserver\(resize\)\.observe\(caption\)/);
  });

  it('expands Spectrum, Matrix and Terrain through that space', () => {
    const spectrum = visualizer.match(/function spectrum\(w, h, unit\) \{[\s\S]*?\n  \}/)[0];
    const grid = visualizer.match(/function ledGrid\(w, h, unit\) \{[\s\S]*?\n  \}/)[0];
    const terrain = visualizer.match(/function terrain\(w, h, unit\) \{[\s\S]*?\n  \}/)[0];
    assert.match(spectrum, /baseline = visualBottom - h \* \.025/);
    assert.match(spectrum, /maxBar = baseline - visualTop/);
    assert.match(grid, /bottom = visualBottom - h \* \.02/);
    assert.match(grid, /available = bottom - visualTop/);
    assert.match(grid, /Math\.round\(\(available \+ gap\) \/ \(cell \+ gap\)\)/);
    assert.match(grid, /lit = Math\.pow\(value, \.6\) \* rows/);
    assert.match(terrain, /floor = visualBottom - h \* \.008/);
    assert.match(terrain, /area = visualBottom - visualTop/);
  });
});

describe('visualization picker and dropdown navigation', () => {
  it('isolates arrow tooltips and aligns the right one inside the edge', () => {
    assert.match(visualizer, /visualizer-arrow-\$\{direction < 0 \? 'prev' : 'next'\}/);
    assert.match(visualizer, /if \(button === next\) button\.classList\.add\('tooltip-align-right'\)/);
    const styles = fs.readFileSync(path.join(root, 'css', 'audio.css'), 'utf8');
    assert.match(styles, /visualizer-arrow\.is-hovered::after/);
    assert.match(styles, /visualizer-picker\.select-open \.visualizer-arrow::after/);
    assert.match(visualizer, /button\.classList\.add\('is-hovered'\)/);
    assert.match(visualizer, /MutationObserver\(syncOpenState\)/);
  });

  it('adds localized scroll chevrons and keyboard paging to overflowing selects', () => {
    const selects = fs.readFileSync(path.join(root, 'js', 'config-selects.js'), 'utf8');
    assert.match(selects, /className = 'cfg-select-options'/);
    assert.match(selects, /cfg_select_scroll_up/);
    assert.match(selects, /cfg_select_scroll_down/);
    assert.match(selects, /viewport\.scrollBy/);
    assert.match(selects, /event\.key === 'PageDown' \|\| event\.key === 'PageUp'/);
    assert.equal(i18n.en.cfg_select_scroll_up, 'Scroll up');
    assert.equal(i18n.es.cfg_select_scroll_up, 'Desplazar arriba');
    assert.equal(i18n.en.cfg_select_scroll_down, 'Scroll down');
    assert.equal(i18n.es.cfg_select_scroll_down, 'Desplazar abajo');
  });
});
