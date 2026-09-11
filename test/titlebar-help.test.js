'use strict';

const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
const ui = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));

function mainMenuMarkup() {
  const start = html.indexOf('<div id="main-menu"');
  const end = html.indexOf('<button class="win-btn', start);
  assert.ok(start >= 0 && end > start, 'main menu markup should be present');
  return html.slice(start, end);
}

function helpMarkup() {
  const menu = mainMenuMarkup();
  const start = menu.indexOf('data-i18n="menu_help"');
  const end = menu.indexOf('data-action="quit"', start);
  assert.ok(start >= 0 && end > start, 'Help flyout markup should be present');
  return menu.slice(start, end);
}

describe('title bar Help menu', () => {
  it('keeps the Help labels translated in English and Spanish', () => {
    const keys = [
      'menu_help_pin', 'menu_help_docs', 'menu_help_faq',
      'menu_help_changelog', 'menu_help_website', 'menu_help_donate'
    ];
    for (const lang of ['en', 'es']) {
      for (const key of keys) {
        assert.equal(typeof ui[lang][key], 'string');
        assert.ok(ui[lang][key].trim().length > 0);
      }
    }
  });

  it('uses the requested Help order and hides the tray action when not applicable', () => {
    const help = helpMarkup();
    const actions = [
      'show-tray-pin-reminder', 'help-docs', 'help-faq', 'help-changelog',
      'help-website', 'help-donate', 'about', 'check-updates'
    ];
    let previous = -1;
    for (const action of actions) {
      const position = help.indexOf(`data-action="${action}"`);
      assert.ok(position > previous, `${action} should follow the previous Help action`);
      previous = position;
    }
    assert.match(help, /data-action="show-tray-pin-reminder"[^>]*data-tray-only/);
    assert.match(help, /class="menu-divider" data-tray-only/);
  });

  it('keeps Configuration as a dedicated accessible title-bar control', () => {
    const menu = mainMenuMarkup();
    assert.doesNotMatch(menu, /data-action="preferences"/);
    const config = html.indexOf('id="btn-config"');
    const burger = html.indexOf('<div class="menu-wrap">');
    assert.ok(config >= 0 && config < burger, 'Configuration should be beside the burger');
    assert.match(html, /id="btn-config"[^>]*data-i18n-aria="config"/);
    assert.match(html, /id="btn-menu"[^>]*aria-haspopup="true"[^>]*aria-expanded="false"/);
  });

  it('uses CyberViewer destinations and the existing external-link bridge', () => {
    const urls = [
      'https://github.com/CyberGems/CyberViewer/wiki',
      'https://github.com/CyberGems/CyberViewer/wiki/FAQ',
      'https://github.com/CyberGems/CyberViewer/releases',
      'https://cybergems.org',
      'https://github.com/CyberGems/CyberViewer#%EF%B8%8F-donate'
    ];
    for (const url of urls) assert.ok(appJs.includes(url), `missing URL: ${url}`);
    assert.match(appJs, /window\.electronAPI\.openExternal\(url\)/);
  });

  it('uses localized glass for menus without affecting the viewer surface', () => {
    assert.match(css, /\.menu-panel,\s*\.menu-sub\s*\{[\s\S]*?background:\s*[\s\S]*?border-color:[\s\S]*?box-shadow:/);
    assert.match(css, /\.menu-panel,[\s\S]*?\.menu-sub[\s\S]*?-webkit-backdrop-filter:\s*blur\(26px\) saturate\(145%\);[\s\S]*?backdrop-filter:\s*blur\(26px\) saturate\(145%\);/);
    assert.match(css, /@supports\s+not\s+\(\(backdrop-filter:\s*blur\(1px\)\)\s+or\s+\(-webkit-backdrop-filter:\s*blur\(1px\)\)\)/);
  });

  it('portals the burger menu out of the composited titlebar for reliable blur', () => {
    assert.match(appJs, /document\.body\.appendChild\(panel\);/);
    assert.match(appJs, /panel\.classList\.add\('main-menu-portal'\);/);
    assert.match(appJs, /!panel\.contains\(e\.target\)\s*&&\s*!btn\.contains\(e\.target\)/);
    assert.match(css, /\.menu-panel\.main-menu-portal\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?right:\s*auto;/);
  });
});
