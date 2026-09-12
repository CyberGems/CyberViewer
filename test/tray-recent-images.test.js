const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const appCss = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const menuI18n = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'menu.json'), 'utf8'));
const uiI18n = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));
const { BOOLEAN_KEYS } = require(path.join(root, 'lib', 'settings-backup.js'));

describe('tray and interface recent images (10 items)', () => {
  it('increases recent file limits to 10 in app.js', () => {
    assert.match(appJs, /const RECENT_MAX = 10;/);
    assert.match(appJs, /const RECENT_CTX_MAX = 10;/);
  });

  it('includes trayRecentImages in settings-backup BOOLEAN_KEYS', () => {
    assert.ok(BOOLEAN_KEYS.includes('trayRecentImages'));
  });

  it('defaults trayRecentImages to true in main.js and app.js', () => {
    assert.match(mainJs, /trayRecentImages:\s*true/);
    assert.match(appJs, /trayRecentImages:\s*true/);
  });

  it('contains tray recent images toggle switch and clear button in settings HTML', () => {
    assert.ok(html.includes('id="cfg-tray-recent-images"'));
    assert.ok(html.includes('id="cfg-clear-recent-images"'));
    assert.match(html, /data-i18n="tray_recent_images"/);
    assert.match(html, /data-i18n="tray_clear_recent_btn"/);
  });

  it('contains bilingual translations for tray recents and clear buttons in menu and ui i18n', () => {
    // menu.json
    assert.ok(menuI18n.en.tray_recent_images);
    assert.ok(menuI18n.es.tray_recent_images);
    assert.ok(menuI18n.en.tray_clear_recent);
    assert.ok(menuI18n.es.tray_clear_recent);
    assert.ok(menuI18n.en.tray_no_recent);
    assert.ok(menuI18n.es.tray_no_recent);

    // ui.json
    assert.ok(uiI18n.en.tray_recent_images);
    assert.ok(uiI18n.es.tray_recent_images);
    assert.ok(uiI18n.en.tray_recent_images_desc);
    assert.ok(uiI18n.es.tray_recent_images_desc);
    assert.ok(uiI18n.en.tray_clear_recent_btn);
    assert.ok(uiI18n.es.tray_clear_recent_btn);
  });

  it('wires clear button and recent-files-cleared IPC in app.js', () => {
    assert.match(appJs, /clearRecentImagesBtn\.addEventListener\('click'/);
    assert.match(appJs, /window\.electronAPI\.onRecentFilesCleared/);
  });

  it('builds tray recent submenu with up to 10 items, separator, and clear action in main.js', () => {
    const start = mainJs.indexOf('function buildTrayContextMenuTemplate()');
    const end = mainJs.indexOf('function rebuildTrayContextMenu()', start);
    assert.ok(start >= 0 && end > start);
    const code = mainJs.slice(start, end);

    assert.match(code, /slice\(0,\s*10\)/);
    assert.match(code, /t\.tray_recent_images/);
    assert.match(code, /t\.tray_clear_recent/);
    assert.match(code, /pendingTrayAction\s*=\s*'clear-recent'/);
    assert.match(code, /trayRecentImages\s*!==\s*false/);
  });

  it('constrains context menu panel and header subtitle to prevent oversized menus', () => {
    assert.match(appCss, /\.context-menu-panel\s*\{[\s\S]*?max-width:\s*320px;/);
    assert.match(appCss, /\.menu-header-sub\s*\{[\s\S]*?max-width:\s*170px;/);
    assert.match(appCss, /\.menu-header-sub-base\s*\{[\s\S]*?text-overflow:\s*ellipsis;/);
  });
});
