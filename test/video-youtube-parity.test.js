'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('CyberViewer.html');
const player = read('js/video-player.js');
const appJs = read('js/app.js');
const css = read('css/video.css');

describe('video player youtube parity (phase 1)', () => {
  it('adds prev/next video transport buttons driven by folder siblings', () => {
    assert.match(html, /id="video-prev" hidden/);
    assert.match(html, /id="video-next" hidden/);
    assert.match(player, /function videoSibling\(direction\) \{/);
    assert.match(player, /window\.CVFormats\.isVideo\(candidate\.file\.path\)/);
    assert.match(player, /function syncSiblings\(\) \{/);
    assert.match(player, /prev\.hidden = !videoSibling\(-1\);/);
    assert.match(player, /\$\('video-prev'\)\.addEventListener\('click', \(\) => openSibling\(-1\)\)/);
  });

  it('pauses on video click with double-click discrimination', () => {
    assert.match(player, /\$\('viewer-wrap'\)\.addEventListener\('click', \(event\) => \{\s*if \(!active\(\) \|\| window\.CVYouTube\.active\(\)\) return;/);
    assert.match(player, /if \(videoClickTimer\) return;\s*videoClickTimer = setTimeout\(\(\) => \{\s*videoClickTimer = null;\s*void toggle\(\);\s*\}, 230\);/);
    assert.match(player, /function handleVideoDblClick\(\) \{\s*if \(videoClickTimer\) \{ clearTimeout\(videoClickTimer\); videoClickTimer = null; \}/);
    assert.match(appJs, /if \(window\.CVVideo\.active\(\)\) \{ window\.CVVideo\.handleVideoDblClick\(\); return; \}/);
    assert.match(player, /return \{ element, active, load, unload, toggle, toggleMute, seekBy, sync, syncTools, localize, initialize, imageActions, reveal, closeMenu, handleVideoDblClick, cyclePlaybackRate, setPlaybackRate \};/);
  });

  it('adds a speed panel (0.25-3x) with cycling shortcuts', () => {
    assert.match(html, /id="video-speed-row"/);
    assert.match(html, /id="video-speed-panel" hidden/);
    assert.match(html, /data-rate="3"/);
    assert.match(player, /const SPEEDS = \[0\.25, 0\.5, 0\.75, 1, 1\.25, 1\.5, 1\.75, 2, 3\];/);
    assert.match(player, /function cyclePlaybackRate\(direction\) \{/);
    assert.match(appJs, /key === '>' \|\| key === '<'\) \{ e\.preventDefault\(\); if \(!e\.repeat\) window\.CVVideo\.cyclePlaybackRate\(key === '>' \? 1 : -1\);/);
    assert.match(player, /localStorage\.setItem\('cv_video_rate', String\(rate\)\)/);
  });

  it('shows a seek hover preview with timestamp', () => {
    assert.match(html, /id="video-seek-preview" hidden/);
    assert.match(html, /id="video-preview" muted preload="metadata"/);
    assert.match(player, /video-seek'\)\.addEventListener\('mousemove'/);
    assert.match(player, /previewVideo\.currentTime = Math\.min\(time \+ 0\.05/);
    assert.match(css, /#video-seek-preview \{/);
    assert.match(css, /#video-overlay-flash \{/);
    assert.match(css, /@keyframes video-flash \{/);
  });

  it('flashes youtube-style overlay icons on play and pause', () => {
    assert.match(player, /const FLASH_PLAY = /);
    assert.match(player, /const FLASH_PAUSE = /);
    assert.match(player, /element\.addEventListener\('play', \(\) => \{ if \(Date\.now\(\) - loadedAt > 400\) flashOverlay\(FLASH_PLAY\); \}\)/);
    assert.match(player, /element\.addEventListener\('pause', \(\) => flashOverlay\(FLASH_PAUSE\)\)/);
  });

  it('persists loop, volume and mute across sessions', () => {
    assert.match(player, /function persistVideoPrefs\(\) \{/);
    assert.match(player, /app\.videoLoop = element\.loop;/);
    assert.match(player, /app\.videoMuted = element\.muted;/);
    assert.match(player, /video-loop'\)\.addEventListener\('click', \(\) => \{ element\.loop = !element\.loop; persistVideoPrefs\(\); sync\(\); \}\)/);
    assert.match(player, /element\.volume = Number\(event\.target\.value\); element\.muted = element\.volume === 0;\s*persistVideoPrefs\(\);/);
    assert.match(player, /element\.loop = prefs\.videoLoop === true;/);
    assert.match(player, /element\.muted = prefs\.videoMuted === true;/);
    assert.match(read('main.js'), /data\.app\.videoLoop === undefined/);
    assert.match(read('main.js'), /data\.app\.videoVolume = 1;/);
    assert.match(appJs, /videoLoop: false,\s*videoVolume: 1,\s*videoMuted: false,/);
  });

  it('unifies transport tooltip placement and slims the window diagnostics', () => {
    assert.doesNotMatch(html, /id="video-play" class="tooltip-right"/);
    assert.doesNotMatch(html, /id="video-back" class="tooltip-right"/);
    assert.match(html, /id="video-fullscreen" class="tooltip-align-right"/);
    assert.match(html, /id="video-more" class="tooltip-align-right"/);
    // Prev/next join the outlined stroke family of the play triangle
    assert.doesNotMatch(css, /#video-prev svg, #video-next svg \{ fill: currentColor/);
    // window-persist entries carry only the saved facts, and the log cap is 120
    assert.match(read('main.js'), /diagWindow\('window-persist', \{\s*saved:/);
    assert.doesNotMatch(read('main.js'), /diagWindow\('window-persist', \{\s*live:/);
    assert.match(read('main.js'), /lines\.slice\(-120\)\.join\('\\n'\)/);
  });

  it('keeps every More menu row iconized and the confirm overlay readable on video', () => {
    for (const id of ['video-speed-row', 'video-open', 'video-youtube', 'video-properties', 'video-autoplay', 'video-loop', 'video-audio-info']) {
      const row = html.match(new RegExp(`id="${id}"[\\s\\S]*?</button>`));
      assert.ok(row && row[0].includes('menu-ico'), `${id} must carry a menu icon`);
    }
    assert.match(css, /#video-menu \.menu-ico \{ width: 14px; height: 14px;/);
    // Titlebar filename keeps room for descenders (g, y)
    assert.match(read('css/app.css'), /\.titlebar-filename\s*\{[^}]*font: 600 12px\/1\.3 var\(--font-ui\);/);
    // The confirm overlay keeps the paused frame recognizable in video mode
    assert.match(read('css/app.css'), /body\.video-active #modal-cyber-confirm\s*\{[^}]*backdrop-filter: blur\(3px\);/);
    // The confirm dialog uses the same trash glyph as the context menu
    assert.match(appJs, /const trashGlyph = '<svg viewBox="0 0 24 24" width="22" height="22"[^]*?M14 11v6/);
  });
});
