'use strict';

const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('CyberViewer.html');
const ui = read('js/audio-equalizer.js');
const styles = read('css/video.css');
const player = read('js/video-player.js');
const app = read('js/app.js');
const i18n = JSON.parse(read('i18n/ui.json'));
const bundled = read('i18n/ui.js');

describe('audio equalizer interface', () => {
  it('loads the shared engine and equalizer before the visualizer', () => {
    assert.ok(html.indexOf('js/audio-engine.js') < html.indexOf('js/audio-equalizer.js'));
    assert.ok(html.indexOf('js/audio-equalizer.js') < html.indexOf('js/audio-visualizer.js'));
    assert.match(html, /id="audio-equalizer-toggle"[^>]*aria-controls="audio-equalizer-panel"/);
    assert.match(html, /id="audio-equalizer-panel"[^>]*role="dialog"/);
    assert.match(ui, /window\.CVAudioEngine\.bands\.forEach/);
    assert.match(ui, /input\.min = '-12'; input\.max = '12'; input\.step = '1'/);
  });

  it('ships every equalizer string in English, Spanish and the bundle', () => {
    const keys = [
      'audio_equalizer', 'audio_equalizer_hint', 'audio_equalizer_on', 'audio_equalizer_off',
      'audio_equalizer_preset', 'audio_equalizer_custom', 'audio_equalizer_flat',
      'audio_equalizer_bass_boost', 'audio_equalizer_vocal', 'audio_equalizer_electronic',
      'audio_equalizer_acoustic', 'audio_equalizer_night', 'audio_equalizer_preamp',
      'audio_equalizer_reset', 'audio_equalizer_close', 'audio_equalizer_band', 'audio_equalizer_scope'
    ];
    for (const key of keys) {
      assert.ok(i18n.en[key], `English missing ${key}`);
      assert.ok(i18n.es[key], `Spanish missing ${key}`);
      assert.ok(bundled.includes(`"${key}":`), `Bundle missing ${key}`);
    }
  });

  it('uses theme tokens and keeps the panel clear of transport auto-hide', () => {
    for (const token of ['--cyber-menu-text', '--cyber-muted', '--cyber-accent-ink', '--cyber-accent-rgb', '--cyber-panel']) {
      assert.ok(styles.includes(token), `Missing theme token ${token}`);
    }
    assert.match(styles, /#audio-equalizer-panel:not\(\[hidden\]\)/);
    assert.match(styles, /html\[data-theme='light'\] #audio-equalizer-power/);
    assert.match(styles, /#audio-equalizer-toggle:disabled:hover \{ background: transparent; color: inherit; \}/);
    assert.match(styles, /\.video-sound\.audio-unavailable #video-mute svg \{ opacity: \.38; \}/);
    assert.match(app, /'video-next', 'audio-equalizer-toggle'/);
    assert.match(player, /window\.CVAudioEqualizer\.isOpen\(\)/);
    assert.match(player, /#audio-equalizer-toggle, #audio-equalizer-panel/);
    assert.match(player, /window\.CVAudioEqualizer\.setOpen\(false\)/);
  });

  it('persists defaults, live changes and factory resets through app settings', () => {
    assert.equal((app.match(/audioEqualizer: window\.CVAudioEngine\.defaults\(\)/g) || []).length, 2);
    assert.match(app, /window\.CVAudioEqualizer\.initialize\(\)/);
    assert.match(app, /window\.CVAudioEqualizer\.localize\(\)/);
    assert.match(app, /window\.CVAudioEqualizer\.applySettings\(s\.audioEqualizer\)/);
    assert.match(ui, /state\.settings\.app\.audioEqualizer = window\.CVAudioEngine\.snapshot\(\)/);
    assert.match(ui, /window\.electronAPI\?\.saveSettings\(state\.settings\.app\)/);
  });
});
