'use strict';

const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');

describe('tray reminder presentation', () => {
  it('keeps the no-repeat choice exclusive to automatic reminders', () => {
    assert.match(appJs, /function openTrayPinReminder\(\{ automatic = false \} = \{\}\)/);
    assert.match(appJs, /checkboxRow\.hidden = !automatic/);
    assert.match(appJs, /if \(isAutomaticTrayPinReminder\(\) && checkbox && checkbox\.checked\) rememberTrayPinReminder\(\);/);
    assert.match(appJs, /openTrayPinReminder\(\{ automatic: true \}\)/);
    assert.match(html, /id="tray-pin-check-row" data-tray-auto-only/);
  });

  it('schedules the first automatic reminder when the app starts with tray enabled', () => {
    assert.match(appJs, /function scheduleInitialTrayPinReminder\(\)/);
    assert.match(appJs, /if \(!isCloseToTrayEnabled\(\) \|\| isTrayPinReminderDismissed\(\)\) return;/);
    assert.match(appJs, /applySettings\(\);\s*scheduleInitialTrayPinReminder\(\);/);
    assert.match(appJs, /else maybeShowPendingTrayPinReminder\(\);/);
  });
});

describe('title bar and welcome banner visuals', () => {
  it('keeps the branding icon colored and adds a subtle hover glow', () => {
    assert.match(css, /\.logo-img\s*\{[\s\S]*?filter: none;/);
    assert.match(css, /\.logo:hover \.logo-img,[\s\S]*?filter: drop-shadow\(0 0 5px/);
  });

  it('uses the requested gear glyph and removes duplicate welcome branding', () => {
    assert.match(html, /class="titlebar-config-glyph"[^>]*>\&\#9881;/);
    assert.doesNotMatch(html, /drop-brand/);
  });

  it('colors the Help donation icon with the danger accent', () => {
    assert.match(css, /\.menu-item\[data-action="help-donate"\] > \.menu-ico\s*\{[\s\S]*?color: var\(--cyber-accent2\)/);
  });
});
