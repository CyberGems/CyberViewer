const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const trayMenuJs = fs.readFileSync(path.join(root, 'js', 'tray-menu.js'), 'utf8');

describe('custom tray menu', () => {
  it('uses the suite-standard popup instead of a native context menu', () => {
    assert.doesNotMatch(mainJs, /setContextMenu/);
    assert.match(mainJs, /CUSTOM TRAY MENU WINDOW \(SUITE STANDARD\)/);
    assert.match(mainJs, /ipcMain\.on\('tray-menu-action'/);
    assert.match(mainJs, /ipcMain\.on\('tray-menu-ready'/);
  });

  it('keeps About inside the help view without a duplicate main-view item', () => {
    const mainStart = trayMenuJs.indexOf('function renderMainView()');
    const helpStart = trayMenuJs.indexOf('function renderHelpView()');
    const suiteStart = trayMenuJs.indexOf('function renderSuiteView()');
    assert.ok(mainStart >= 0 && helpStart > mainStart && suiteStart > helpStart,
      'main and help views should be present');

    const helpView = trayMenuJs.slice(helpStart, suiteStart);
    assert.match(helpView, /action: 'about-modal'/);

    const mainView = trayMenuJs.slice(mainStart, helpStart);
    assert.doesNotMatch(mainView, /action: 'about-modal'/);
  });
});
