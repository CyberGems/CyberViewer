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
  it('deforms a spectral wireframe with live frequency and peak data', () => {
    const tunnel = visualizer.match(/function tunnel\(w, h, unit\) \{[\s\S]*?\n  \}/)[0];
    for (const source of ['bands', 'peaks', 'bass', 'energy', 'highs', 'flow', 'spin']) {
      assert.ok(tunnel.includes(source), `Tunnel should react to ${source}`);
    }
    assert.match(tunnel, /tunnelOrder\.sort/);
    assert.match(tunnel, /tunnelSegments/);
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
