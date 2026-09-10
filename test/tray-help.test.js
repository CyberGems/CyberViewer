'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  TRAY_HELP_URLS,
  buildTrayHelpModel,
  shouldShowTrayPinReminder,
  taskbarSettingsUri,
  taskbarSettingsLaunch
} = require('../lib/tray-help');
const menuI18n = require('../i18n/menu.json');

describe('tray Help menu', () => {
  it('builds the complete English action model', () => {
    const help = buildTrayHelpModel(menuI18n.en);
    assert.equal(help.label, 'Help');
    assert.equal(help.pinLabel, 'Keep visible in system tray');
    assert.equal(help.aboutLabel, 'About...');
    assert.deepEqual(help.actions, [
      'help-pin', 'help-docs', 'help-faq', 'help-changelog',
      'help-website', 'help-donate', 'help-about', 'help-check-updates'
    ]);
  });

  it('keeps all Help labels translated in Spanish', () => {
    const help = buildTrayHelpModel(menuI18n.es);
    assert.equal(help.label, 'Ayuda');
    assert.equal(help.backLabel, 'Volver');
    assert.equal(help.pinLabel, 'Mantener visible en la bandeja del sistema');
    assert.equal(help.faqLabel, 'Preguntas frecuentes');
    assert.equal(help.updatesLabel, 'Buscar actualizaciones');
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
