'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('CyberViewer.html');
const workspace = read('js/workspace.js');
const appJs = read('js/app.js');
const tabsCss = read('css/tabs.css');

describe('tab bar ui', () => {
  it('wires the plus button to the real file dialog and the empty strip to dblclick and context menu', () => {
    // The old wiring clicked a non-existent #btn-open node, so the button did nothing.
    assert.doesNotMatch(workspace, /\$\('btn-open'\)\.click\(\)/);
    assert.match(workspace, /image-tabs-open'\)\.addEventListener\('click', \(\) => window\.openImageDialog && window\.openImageDialog\(\)\)/);
    assert.match(workspace, /tabBar\.addEventListener\('dblclick', \(event\) => \{\s*if \(\(event\.target === tabBar \|\| event\.target === tabList\)/);
    assert.match(workspace, /tabBar\.addEventListener\('contextmenu', \(event\) => \{\s*if \(event\.target === tabBar \|\| event\.target === tabList\) showCustomContextMenu\(event, 'tab-bar', \{\}\)/);
  });

  it('builds a tab-bar menu with reopen and close all', () => {
    assert.match(workspace, /function barMenu\(\) \{/);
    assert.match(workspace, /barMenu, clearPreloads/);
    assert.match(appJs, /if \(type === 'tab-bar'\) return window\.CVWorkspace\.barMenu\(\);/);
    assert.match(workspace, /\{ label: text\('tabs_reopen'\), shortcut: 'Ctrl\+Shift\+T', icon: 'restore', enabled: model\.closed\.length > 0, action: reopen \}/);
  });

  it('shows edge navigation only while the strip overflows', () => {
    assert.match(html, /id="image-tabs-scroll-left"/);
    assert.match(html, /id="image-tabs-scroll-right"/);
    assert.match(workspace, /function syncTabOverflow\(\) \{/);
    assert.match(workspace, /const overflowing = list\.scrollWidth > list\.clientWidth \+ 1;/);
    assert.match(workspace, /tabList\.addEventListener\('scroll', syncTabOverflow, \{ passive: true \}\)/);
    assert.match(tabsCss, /\.tab-bar-nav-btn\[hidden\] \{ display: none; \}/);
  });

  it('gives the switcher a header with count and a close-all footer', () => {
    assert.match(html, /id="tab-switcher-close-all"/);
    assert.match(html, /id="tab-switcher-count"/);
    assert.match(workspace, /\$\('tab-switcher-count'\)\.textContent = model\.tabs\.length;/);
    assert.match(workspace, /\$\('tab-switcher-close-all'\)\.disabled = !model\.tabs\.length;/);
    assert.match(workspace, /\$\('tab-switcher-close-all'\)\.addEventListener\('click', \(\) => \{\s*\$\('tab-switcher'\)\.hidden = true;\s*closeTabs\(model\.tabs\.map\(tab => tab\.id\)\);/);
    assert.match(tabsCss, /\.tab-switcher-head \{/);
    assert.match(tabsCss, /\.tab-switcher-close-all \{/);
  });

  it('styles the plus button as a square bordered action like the suite', () => {
    assert.match(tabsCss, /\.tab-bar-button\s*\{[^}]*width: 28px;[^}]*height: 28px;/);
    assert.match(html, /id="image-tabs-open"[\s\S]*?<path d="M12 5v14"\/><path d="M5 12h14"\/>/);
  });
});
