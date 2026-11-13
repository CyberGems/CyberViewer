const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const appCss = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
const youtubeCss = fs.readFileSync(path.join(root, 'css', 'youtube.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const youtubePlayer = fs.readFileSync(path.join(root, 'js', 'youtube-player.js'), 'utf8');

// Collapse whitespace so the assertions match regardless of the source
// formatting (selector list wrapping, indentation, trailing spaces).
const flat = (text) => text.replace(/\s+/g, ' ');

describe('invalid-file view chrome', () => {
  it('hides the action bar and statusbar while the error banner is up', () => {
    const css = flat(appCss);
    assert.match(css, /body\.image-error:not\(\.ghost-mode\) #kbd-hint, body\.image-error:not\(\.ghost-mode\) #statusbar,[^}]*display: none !important;/);
    // Fullscreen (ghost) keeps the docked statusbar hidden and also clears the
    // floating action bar.
    assert.match(css, /body\.image-error\.ghost-mode #kbd-hint/);
  });

  it('frees the dock height and the statusbar strip so the banner centers', () => {
    const css = flat(appCss);
    assert.match(css, /body\.image-error:not\(\.ghost-mode\):not\(\.empty-state\)[^{]*\{[^}]*--dock-h: 0px;/);
    assert.match(css, /body\.image-error\.statusbar-visible:not\(\.ghost-mode\):not\(\.empty-state\) #viewer-wrap[^{]*\{[^}]*margin-bottom: 0 !important;/);
    assert.match(css, /body\.image-error #toolbar-handle[^{]*\{[^}]*display: none !important;/);
  });

  it('hides the sidebar and deadens its toggle', () => {
    const css = flat(appCss);
    assert.match(css, /body\.image-error #sidebar, body\.image-error #sidebar-edge-rail[^{]*\{[^}]*display: none !important;/);
    assert.match(css, /body\.image-error #sidebar-handle[^{]*\{[^}]*pointer-events: none;/);
  });

  it('guards the sidebar toggle click so the menu programmatic click is inert', () => {
    const handler = appJs.match(/sidebarHandleEl\.addEventListener\('click', \(e\) => \{[\s\S]*?\n  \}\);/);
    assert.ok(handler, 'sidebar handle click handler should stay on sidebarHandleEl');
    assert.match(handler[0], /if \(document\.body\.classList\.contains\('image-error'\)\) return;/);
  });

  it('keeps the sidebar and toolbar menu items inert while the banner is up', () => {
    const sb = appJs.match(/const sb = panel\.querySelector\('\[data-action="sidebar"\]'\);[\s\S]*?\n    \}/);
    assert.ok(sb, 'sidebar menu item sync should exist');
    assert.match(sb[0], /sb\.classList\.toggle\('disabled', err\);/);
    const tb = appJs.match(/const tb = panel\.querySelector\('\[data-action="toolbar"\]'\);[\s\S]*?\n    \}/);
    assert.ok(tb, 'toolbar menu item sync should exist');
    assert.match(tb[0], /tb\.classList\.toggle\('disabled', err\);/);
  });
});

describe('YouTube inline error chrome', () => {
  it('hides the action bar and statusbar while the embed shows its error', () => {
    const css = flat(youtubeCss);
    assert.match(css, /body\.youtube-error #kbd-hint, body\.youtube-error #statusbar \{ display: none !important; \}/);
  });

  it('toggles the youtube-error class with the embed error and clears it on unload', () => {
    assert.match(youtubePlayer, /document\.body\.classList\.toggle\('youtube-error', !!error\);/);
    assert.match(youtubePlayer, /document\.body\.classList\.remove\('youtube-error'\);/);
  });
});
