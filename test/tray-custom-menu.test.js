const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const trayMenuJs = fs.readFileSync(path.join(root, 'js', 'tray-menu.js'), 'utf8');
const trayPreloadJs = fs.readFileSync(path.join(root, 'tray-preload.js'), 'utf8');
const trayMenuHtml = fs.readFileSync(path.join(root, 'tray-menu.html'), 'utf8');
const trayMenuCss = fs.readFileSync(path.join(root, 'css', 'tray-menu.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const uiI18n = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));
const suite = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'suite', 'suite.json'), 'utf8'));

describe('suite-standard tray popup wiring', () => {
  it('keeps the full suite channel contract in the preload bridge', () => {
    for (const channel of [
      'tray-menu-state', 'tray-menu-show', 'tray-menu-reset', 'tray-menu-action',
      'tray-menu-ready', 'tray-menu-hide', 'tray-menu-request-state'
    ]) {
      assert.ok(trayPreloadJs.includes(`'${channel}'`), `missing channel ${channel}`);
    }
    for (const method of ['onState', 'onShow', 'onReset', 'action', 'ready', 'hide', 'requestState']) {
      assert.ok(trayPreloadJs.includes(`${method}:`), `missing bridge method ${method}`);
    }
  });

  it('renders all four views with drill-down navigation', () => {
    for (const view of ['main', 'recents', 'help', 'suite']) {
      assert.match(trayMenuJs, new RegExp(`currentView === '${view}'`));
    }
    assert.match(trayMenuJs, /localAction: 'recents'/);
    assert.match(trayMenuJs, /localAction: 'help'/);
    assert.match(trayMenuJs, /localAction: 'suite'/);
    assert.match(trayMenuJs, /function resetToMain\(\)/);
  });

  it('dispatches every popup action in main.js', () => {
    for (const action of [
      'quit', 'show', 'hide', 'open-file', 'settings', 'about-modal', 'check-updates',
      'help-pin', 'help-docs', 'help-faq', 'help-changelog', 'help-website', 'help-donate',
      'suite-app', 'suite-view-all', 'suite-home', 'open-recent', 'clear-recent'
    ]) {
      assert.match(mainJs, new RegExp(`action === '${action}'`), `missing action ${action}`);
    }
  });

  it('loads the popup window frameless, transparent, and prewarmed from createTray', () => {
    assert.match(mainJs, /function ensureTrayMenuWin\(\)/);
    assert.match(mainJs, /loadFile\(path\.join\(__dirname, 'tray-menu\.html'\)\)/);
    assert.match(mainJs, /preload: path\.join\(__dirname, 'tray-preload\.js'\)/);
    const createTrayStart = mainJs.indexOf('function createTray()');
    const hotkeyStart = mainJs.indexOf('Global toggle hotkey', createTrayStart);
    assert.ok(createTrayStart >= 0 && hotkeyStart > createTrayStart);
    const createTray = mainJs.slice(createTrayStart, hotkeyStart);
    assert.match(createTray, /ensureTrayMenuWin\(\)/);
    assert.match(createTray, /showCustomTrayMenu\(bounds\)/);
  });

  it('serves recent image thumbnails through the cvlocal protocol', () => {
    assert.match(trayMenuHtml, /img-src[^"]*cvlocal:/);
    assert.match(mainJs, /toMediaUrl\(filePath\)/);
  });

  it('ships the complete suite data with icons for every app', () => {
    assert.equal(suite.count, 10);
    assert.equal(Array.isArray(suite.apps) && suite.apps.length, 10);
    for (const app of suite.apps) {
      assert.ok(app.slug && app.site, `app ${app.slug} missing site`);
      assert.ok(
        fs.existsSync(path.join(root, 'assets', 'suite', `${app.slug}.png`)),
        `missing icon for ${app.slug}`
      );
    }
  });

  it('excludes CyberViewer itself from the suite view items', () => {
    assert.match(trayMenuJs, /slug !== 'cyberviewer'/);
  });

  it('formats the tooltip as brand plus toggle shortcut', () => {
    assert.match(mainJs, /function formatTrayTooltip\(/);
    assert.match(mainJs, /CyberViewer · \$\{clean\}/);
  });

  it('gates suite suggestions behind showSuiteRecommendations in tray and About', () => {
    assert.match(mainJs, /showSuiteRecommendations: s\.showSuiteRecommendations !== false/);
    assert.match(trayMenuJs, /showSuiteRecommendations !== false/);
    assert.match(appJs, /showSuiteRecommendations !== false/);
    assert.ok(html.includes('id="cfg-suite-recs"'));
    assert.match(html, /data-i18n="suite_recommendations"/);
    assert.ok(uiI18n.en.suite_recommendations);
    assert.ok(uiI18n.es.suite_recommendations);
    assert.ok(uiI18n.en.suite_recommendations_desc);
    assert.ok(uiI18n.es.suite_recommendations_desc);
  });

  it('renders app-style tooltip bubbles instead of native titles', () => {
    assert.doesNotMatch(trayMenuJs, /btn\.title =/);
    assert.match(trayMenuJs, /dataset\.tooltip = def\.title/);
    assert.match(trayMenuJs, /headEl\.dataset\.tooltip = t\('about'\)/);
    assert.match(trayMenuCss, /\[data-tooltip\]::after/);
    assert.match(trayMenuCss, /\.head\[data-tooltip\]::after/);
  });

  it('backs recent thumbnails with a checkerboard plate and border', () => {
    assert.match(trayMenuCss, /\.item-img\s*\{[\s\S]*?background-image: conic-gradient/);
    assert.match(trayMenuCss, /\.item-img\s*\{[\s\S]*?background-clip: padding-box/);
    assert.match(trayMenuCss, /\.item-img\s*\{[\s\S]*?border: 1px solid/);
  });

  it('does not count the tray popup as an app window on window-all-closed', () => {
    const start = mainJs.indexOf("app.on('window-all-closed'");
    assert.ok(start >= 0);
    const handler = mainJs.slice(start, mainJs.indexOf('});', start));
    assert.match(handler, /w !== trayMenuWin/);
  });
});
