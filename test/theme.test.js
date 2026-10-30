'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const bootJs = fs.readFileSync(path.join(root, 'js', 'theme-boot.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const backup = fs.readFileSync(path.join(root, 'lib', 'settings-backup.js'), 'utf8');
const i18n = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));

const THEME_KEYS = [
  'cfg_theme_section',
  'cfg_theme_cyberviewer_name',
  'cfg_theme_cyberviewer_desc',
  'cfg_theme_gray_name',
  'cfg_theme_gray_desc',
  'cfg_theme_light_name',
  'cfg_theme_light_desc'
];

describe('Appearance themes', () => {
  it('defines a theme block for gray and light', () => {
    assert.match(css, /html\[data-theme='gray'\]\s*\{/);
    assert.match(css, /html\[data-theme='light'\]\s*\{/);
  });

  it('declares the full token layer in the default :root', () => {
    for (const token of [
      '--cyber-tint-rgb', '--cyber-scrim-rgb', '--cyber-shell-rgb', '--cyber-modal-rgb',
      '--cyber-accent-ink', '--cyber-accent2-ink', '--cyber-star-ink', '--cyber-danger-ink',
      '--cyber-text-on-panel', '--cyber-on-accent', '--cyber-ring', '--cyber-knob',
      '--cyber-color-scheme'
    ]) {
      assert.match(css, new RegExp(token.replace(/-/g, '\\-') + '\\s*:'), `missing ${token}`);
    }
  });

  it('neutralises the accent family in the gray theme', () => {
    const gray = css.match(/html\[data-theme='gray'\]\s*\{([\s\S]*?)\n\}/);
    assert.ok(gray, 'gray block not found');
    const body = gray[1];
    // Every accent-family token resolves to equal RGB channels (pure gray).
    for (const rgb of ['--cyber-accent-rgb', '--cyber-accent2-rgb', '--cyber-accent3-rgb',
      '--cyber-star-rgb', '--cyber-ok-rgb', '--cyber-danger-rgb']) {
      const m = body.match(new RegExp(rgb.replace(/-/g, '\\-') + ':\\s*(\\d+),\\s*(\\d+),\\s*(\\d+);'));
      assert.ok(m, `${rgb} not defined in gray theme`);
      assert.equal(m[1], m[2]);
      assert.equal(m[2], m[3]);
    }
  });

  it('keeps the accent family chromatic in the light theme', () => {
    const light = css.match(/html\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/);
    assert.ok(light, 'light block not found');
    const m = light[1].match(/--cyber-accent2-rgb:\s*(\d+),\s*(\d+),\s*(\d+);/);
    assert.ok(m, 'light accent2 not defined');
    assert.notEqual(m[1], m[3], 'light accent2 should stay coloured');
  });

  it('drives native controls and surfaces from the theme in the light theme', () => {
    const light = css.match(/html\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/);
    assert.match(light[1], /--cyber-color-scheme:\s*light;/);
    // Tint flips to a dark lift so the white-alpha overlays read on a light surface.
    assert.match(light[1], /--cyber-tint-rgb:\s*0,\s*0,\s*0;/);
  });

  it('defaults the appearance theme to CyberViewer in renderer and main', () => {
    assert.match(appJs, /appearanceTheme:\s*'cyberviewer'/);
    assert.match(mainJs, /appearanceTheme:\s*'cyberviewer'/);
    assert.match(appJs, /function applyAppearanceTheme\(/);
    assert.match(appJs, /CV_THEMES = \['cyberviewer', 'gray', 'light'\]/);
  });

  it('applies the saved theme before first paint', () => {
    assert.match(html, /<script src="js\/theme-boot\.js"><\/script>/);
    // The bootstrap must run before the stylesheets so the first frame is correct.
    assert.ok(html.indexOf('js/theme-boot.js') < html.indexOf('css/app.css'));
    assert.match(bootJs, /data-theme/);
    assert.match(bootJs, /localStorage/);
  });

  it('passes the theme to the renderer and matches the frame colour', () => {
    assert.match(mainJs, /theme:\s*themeName/);
    assert.match(mainJs, /accent:\s*\(settings\.app/);
    assert.match(mainJs, /frameColor/);
  });

  it('exposes the theme picker in the Appearance tab', () => {
    assert.match(html, /id="cfg-theme-group"/);
    assert.match(html, /data-theme-opt="cyberviewer"/);
    assert.match(html, /data-theme-opt="gray"/);
    assert.match(html, /data-theme-opt="light"/);
    assert.match(html, /id="cfg-accent-row"/);
  });

  it('persists the theme through settings backup', () => {
    assert.match(backup, /APPEARANCE_THEMES = new Set\(\['cyberviewer', 'gray', 'light'\]\)/);
    assert.match(backup, /out\.appearanceTheme = src\.appearanceTheme/);
  });

  it('ships the theme strings in both languages', () => {
    for (const lang of ['en', 'es']) {
      for (const key of THEME_KEYS) {
        assert.ok(i18n[lang] && i18n[lang][key], `missing ${lang}.${key}`);
      }
    }
  });
});
