const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const visualizer = fs.readFileSync(path.join(root, 'js', 'audio-visualizer.js'), 'utf8');

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
