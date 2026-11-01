'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('CyberViewer.html');
const appJs = read('js/app.js');
const videoPlayer = read('js/video-player.js');
const videoCss = read('css/video.css');

describe('video fit-to-window button', () => {
  it('adds the video-fit button with the former fullscreen glyph, before fullscreen', () => {
    const fitIndex = html.indexOf('id="video-fit"');
    const fsIndex = html.indexOf('id="video-fullscreen"');
    assert.ok(fitIndex !== -1 && fsIndex !== -1 && fitIndex < fsIndex);
    assert.match(html, /<button type="button" id="video-fit" disabled aria-keyshortcuts="F">\s*<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"\/><\/svg>/);
  });

  it('uses the image viewer fullscreen glyph on the video fullscreen button', () => {
    const hudGlyph = html.match(/id="btn-fs-hud"[\s\S]*?d="([^"]+)"/)[1];
    const videoGlyph = html.match(/id="video-fullscreen"[\s\S]*?d="([^"]+)"/)[1];
    assert.equal(videoGlyph, hudGlyph);
  });

  it('drops the expand/collapse state swap entirely', () => {
    assert.doesNotMatch(html, /video-icon-expand|video-icon-collapse/);
    assert.doesNotMatch(videoCss, /video-icon-expand|video-icon-collapse/);
  });

  it('switches between dimmed and plain without an accent highlight', () => {
    assert.match(appJs, /const zoomed = window\.CVVideo\.active\(\) && !window\.CVFormats\.isAudio\(state\.images\[state\.current\]\) && !window\.CVYouTube\.active\(\) && !state\.isGhost && state\.viewMode !== 'fit';/);
    assert.match(appJs, /videoFit\.disabled = !zoomed;/);
    assert.doesNotMatch(appJs, /videoFit\.classList\.toggle\('active'/);
    assert.match(videoCss, /#video-fit:disabled, #video-fit:disabled:hover \{ background: transparent; \}/);
    assert.match(videoCss, /#video-fit:disabled svg \{ opacity: \.38; \}/);
    assert.doesNotMatch(videoCss, /#video-fit\.active/);
  });

  it('accents the fullscreen button while native fullscreen is active', () => {
    assert.match(videoCss, /body\.video-active\.ghost-mode #video-fullscreen,\s*body\.video-active\.ghost-mode #video-fullscreen:hover \{ background: rgba\(var\(--cyber-accent-rgb\), 0\.12\); color: var\(--cyber-accent-ink\); \}/);
  });

  it('reuses the image viewer fit pipeline and localized labels', () => {
    assert.match(videoPlayer, /\$\('video-fit'\)\.addEventListener\('click', \(\) => \{\s*if \(window\.CVYouTube\.active\(\)\) return;\s*const fit = \$\('btn-fit-hud'\);/);
    assert.match(videoPlayer, /\$\('video-fit'\)\.setAttribute\('aria-label', text\('menu_fit'\)\);/);
    assert.match(videoPlayer, /setCyberTooltip\(\$\('video-fit'\), text\('fit_title'\)\);/);
  });
});
