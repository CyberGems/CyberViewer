'use strict';

const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  TRAY_HELP_URLS,
  shouldShowTrayPinReminder,
  taskbarSettingsUri,
  taskbarSettingsLaunch
} = require('../lib/tray-help');

const root = path.join(__dirname, '..');
const trayMenuJs = fs.readFileSync(path.join(root, 'js', 'tray-menu.js'), 'utf8');

describe('tray Help view', () => {
  it('lists pin, docs, faq, changelog, website, donate, about and updates in the help view', () => {
    const helpStart = trayMenuJs.indexOf('function renderHelpView()');
    const suiteStart = trayMenuJs.indexOf('function renderSuiteView()');
    assert.ok(helpStart >= 0 && suiteStart > helpStart, 'help view should be present');
    const helpView = trayMenuJs.slice(helpStart, suiteStart);
    assert.match(helpView, /action: 'help-pin'/);
    assert.match(helpView, /action: 'help-docs'/);
    assert.match(helpView, /action: 'help-faq'/);
    assert.match(helpView, /action: 'help-changelog'/);
    assert.match(helpView, /action: 'help-website'/);
    assert.match(helpView, /action: 'help-donate'/);
    assert.match(helpView, /action: 'about-modal'/);
    assert.match(helpView, /action: 'check-updates'/);
  });

  it('carries the help labels in English and Spanish', () => {
    assert.match(trayMenuJs, /pin: 'Pin icon to taskbar\.\.\.'/);
    assert.match(trayMenuJs, /pin: 'Anclar icono en la barra de tareas\.\.\.'/);
    assert.match(trayMenuJs, /docs: 'Documentation \(Wiki\)'/);
    assert.match(trayMenuJs, /docs: 'Documentación \(Wiki\)'/);
    assert.match(trayMenuJs, /faq: 'Frequently Asked Questions'/);
    assert.match(trayMenuJs, /faq: 'Preguntas frecuentes \(FAQ\)'/);
    assert.match(trayMenuJs, /about: 'About CyberViewer\.\.\.'/);
    assert.match(trayMenuJs, /about: 'Acerca de CyberViewer\.\.\.'/);
    assert.match(trayMenuJs, /updates: 'Check for updates\.\.\.'/);
    assert.match(trayMenuJs, /updates: 'Buscar actualizaciones\.\.\.'/);
  });

  it('exposes only the intended external destinations', () => {
    assert.equal(TRAY_HELP_URLS.docs, 'https://github.com/CyberGems/CyberViewer/wiki');
    assert.equal(TRAY_HELP_URLS.faq, 'https://github.com/CyberGems/CyberViewer/wiki/FAQ');
    assert.equal(TRAY_HELP_URLS.changelog, 'https://github.com/CyberGems/CyberViewer/releases');
    assert.equal(TRAY_HELP_URLS.website, 'https://cybergems.org');
    assert.equal(TRAY_HELP_URLS.donate, 'https://github.com/CyberGems/CyberViewer#%EF%B8%8F-donate');
  });
});

describe('tray visibility reminder', () => {
  it('shows only on a false-to-true transition when not dismissed', () => {
    assert.equal(shouldShowTrayPinReminder(false, true, false), true);
    assert.equal(shouldShowTrayPinReminder(true, true, false), false);
    assert.equal(shouldShowTrayPinReminder(false, false, false), false);
    assert.equal(shouldShowTrayPinReminder(false, true, true), false);
  });

  it('uses the safe Windows Settings fallback URI', () => {
    assert.equal(taskbarSettingsUri(), 'ms-settings:taskbar');
    assert.deepEqual(taskbarSettingsLaunch('win32', false), {
      method: 'uri',
      uri: 'ms-settings:taskbar'
    });
    assert.deepEqual(taskbarSettingsLaunch('win32', true), {
      method: 'native',
      uri: 'ms-settings:taskbar'
    });
  });
});
