'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const appJs = read('js/app.js');
const workspace = read('js/workspace.js');
const html = read('CyberViewer.html');
const appCss = read('css/app.css');

describe('viewer loading state', () => {
  it('clearViewer supports a loading mode that skips the welcome banner', () => {
    assert.match(appJs, /function clearViewer\(opts = \{\}\) \{/);
    assert.match(appJs, /const loading = opts\.loading === true;/);
    assert.match(appJs, /state\.viewerLoading = loading;/);
    assert.match(appJs, /dropZone\.style\.display = loading \? 'none' : 'flex';/);
    assert.match(appJs, /if \(loading\) spinner\.classList\.add\('active'\);/);
  });

  it('tab activation loads straight into the spinner', () => {
    assert.match(workspace, /clearViewer\(\{ loading: true \}\);/);
  });

  it('keeps the viewer chrome while loading and only shows the banner when truly empty', () => {
    assert.match(appJs, /const empty = !hasMedia && !state\.viewerLoading;/);
    assert.match(appJs, /document\.body\.classList\.toggle\('empty-state', empty\);/);
  });

  it('clears the loading flag once the files are loaded', () => {
    assert.match(appJs, /dropZone\.style\.display = 'none';\s*state\.viewerLoading = false;\s*syncEmptyState\(\);/);
  });

  it('renders a bigger two-ring spinner with a fade-in', () => {
    assert.match(html, /<circle class="spinner-track" cx="24" cy="24" r="20"\/>\s*<circle class="spinner-ring" cx="24" cy="24" r="20"\/>/);
    assert.match(appCss, /#spinner \{[^}]*width: 56px;[^}]*\}/s);
    assert.match(appCss, /#spinner\.active \{ opacity: 1; visibility: visible;/);
    assert.match(appCss, /@keyframes spin-arc \{/);
    assert.doesNotMatch(appCss, /spin-draw/);
  });
});
