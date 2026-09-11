'use strict';

const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
const ui = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));

function configMarkup() {
  const start = html.indexOf('<div id="modal-config"');
  const end = html.indexOf('<!-- MODAL: RESIZE -->', start);
  assert.ok(start >= 0 && end > start, 'configuration modal should be present');
  return html.slice(start, end);
}

describe('Backup & Data settings tab', () => {
  it('has complete English and Spanish labels', () => {
    const keys = [
      'settings_nav_backup', 'cfg_backup_tab_title', 'cfg_backup_tab_desc',
      'cfg_backup_section', 'cfg_data_section', 'cfg_data_folder',
      'cfg_data_folder_desc', 'cfg_data_folder_action', 'cfg_cache',
      'cfg_cache_desc', 'cfg_cache_clear', 'cfg_recent_data',
      'cfg_recent_data_desc', 'cfg_recent_data_clear', 'cfg_recovery_section'
    ];
    for (const lang of ['en', 'es']) {
      for (const key of keys) {
        assert.equal(typeof ui[lang][key], 'string', `${lang}.${key} should exist`);
        assert.ok(ui[lang][key].trim().length > 0, `${lang}.${key} should not be empty`);
      }
    }
  });

  it('moves backup and factory recovery controls out of System', () => {
    const config = configMarkup();
    const systemStart = config.indexOf('data-config-panel="system"');
    const backupStart = config.indexOf('data-config-panel="backup"');
    assert.ok(systemStart >= 0 && backupStart > systemStart);
    const system = config.slice(systemStart, backupStart);
    const backup = config.slice(backupStart);

    assert.doesNotMatch(system, /cfg-export-settings|cfg-import-settings|cfg-reset-factory/);
    for (const id of [
      'cfg-export-settings', 'cfg-import-settings', 'cfg-open-data-folder',
      'cfg-clear-thumbnail-cache', 'cfg-clear-recent-history', 'cfg-reset-factory'
    ]) {
      assert.match(backup, new RegExp(`id="${id}"`));
    }
  });

  it('exposes safe data actions through the existing Electron bridge', () => {
    assert.match(preload, /openDataFolder: \(\) => ipcRenderer\.invoke\('open-data-folder'\)/);
    assert.match(preload, /clearThumbnailCache: \(\) => ipcRenderer\.invoke\('clear-thumbnail-cache'\)/);
    assert.match(mainJs, /ipcMain\.handle\('open-data-folder'/);
    assert.match(mainJs, /ipcMain\.handle\('clear-thumbnail-cache'/);
    assert.match(appJs, /function clearRecentHistory\(\)/);
    assert.match(appJs, /function requestClearThumbnailCache\(\)/);
  });
});

describe('Configuration panel presentation', () => {
  it('closes with Enter and exposes About through the compact CyberViewer footer', () => {
    const config = configMarkup();
    assert.match(config, /id="config-brand-about"[^>]*data-i18n-aria="about"/);
    assert.match(config, /id="config-brand-version"/);
    assert.match(css, /#modal-config \.config-brand-footer\s*\{[\s\S]*?border-top:/);
    assert.match(css, /\.config-brand-footer:hover/);
    assert.match(appJs, /e\.key === 'Enter' && \$\('modal-config'\)\.classList\.contains\('active'\)/);
    assert.match(appJs, /closeModal\('modal-config'\);/);
    assert.match(appJs, /configBrandAbout\.addEventListener\('click'[\s\S]*?window\.openAbout/);
  });

  it('opens as a right-side panel with a slide-in animation', () => {
    assert.match(css, /#modal-config\s*\{[\s\S]*?justify-content:\s*flex-end;/);
    assert.match(css, /#modal-config \.config-modal-box\s*\{[\s\S]*?height:\s*100%;/);
    assert.match(css, /animation:\s*config-panel-in/);
    assert.match(css, /@keyframes config-panel-in\s*\{[\s\S]*?translateX\(42px\)/);
  });

  it('keeps inactive navigation neutral and highlights only the active icon', () => {
    assert.match(css, /\.config-nav-btn:not\(\.active\) \.config-nav-icon/);
    assert.match(css, /\.config-nav-btn\.active \.config-nav-icon/);
    assert.match(css, /#modal-config \.config-name\s*\{[\s\S]*?font-size:\s*15px/);
    assert.match(css, /#modal-config \.config-desc\s*\{[\s\S]*?font-size:\s*13px/);
  });

  it('keeps horizontal overflow out of the panel and desktop navigation', () => {
    assert.match(css, /#modal-config\s*\{[\s\S]*?overflow:\s*hidden;/);
    assert.match(css, /#modal-config \.config-nav-items\s*\{[\s\S]*?overflow-x:\s*hidden;/);
    assert.match(css, /#modal-config \.config-content\s*\{[\s\S]*?overflow-x:\s*hidden;/);
    assert.match(css, /#modal-config \.config-info\s*\{[\s\S]*?min-width:\s*0;/);
  });
});
