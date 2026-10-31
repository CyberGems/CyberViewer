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
    assert.match(player, /void toggle\(\);\s*videoClickToggledUntil = Date\.now\(\) \+ 700;/);
    assert.match(player, /function handleVideoDblClick\(\) \{\s*if \(Date\.now\(\) < videoClickToggledUntil\) \{/);
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
    assert.match(player, /element\.addEventListener\('play', \(\) => \{\s*if \(flashSuppressed\) \{ flashSuppressed = false; return; \}\s*if \(Date\.now\(\) - loadedAt > 400\) flashOverlay\(FLASH_PLAY\);\s*\}\)/);
    assert.match(player, /element\.addEventListener\('pause', \(\) => \{\s*if \(flashSuppressed\) \{ flashSuppressed = false; return; \}\s*flashOverlay\(FLASH_PAUSE\);\s*\}\)/);
  });
});
