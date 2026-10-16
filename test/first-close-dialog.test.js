'use strict';

const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
const backupLib = fs.readFileSync(path.join(root, 'lib', 'settings-backup.js'), 'utf8');
const ui = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));

describe('first-close dialog (minimize to tray vs quit)', () => {
  it('renders the CyberNotes-style dialog with two options and a remember checkbox', () => {
    assert.match(html, /id="modal-first-close"[^>]*aria-labelledby="first-close-title"/);
    assert.match(html, /id="btn-first-close-tray"[\s\S]*?data-i18n="first_close_tray"[\s\S]*?data-i18n="first_close_tray_sub"[\s\S]*?<span class="btn-key-hint" aria-hidden="true"><svg class="btn-enter-icon"/);
    assert.match(html, /id="btn-first-close-quit"[^>]*>[\s\S]*?data-i18n="first_close_quit"[\s\S]*?data-i18n="first_close_quit_sub"[\s\S]*?data-i18n="first_close_key_space"/);
    assert.match(html, /class="first-close-option is-danger" id="btn-first-close-quit"/);
    assert.match(html, /<input type="checkbox" id="cfg-first-close-remember">/);
    assert.match(html, /data-i18n="first_close_remember">Recordar mi elección</);
    // lucide Download (tray) and Power (quit) icons, same as CyberNotes
    assert.match(html, /id="btn-first-close-tray"[\s\S]*?<path d="M12 15V3"\/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"\/><path d="m7 10 5 5 5-5"\/>/);
    assert.match(html, /id="btn-first-close-quit"[\s\S]*?<path d="M12 2v10"\/><path d="M18\.4 6\.6a9 9 0 1 1-12\.77\.04"\/>/);
    // Header close button dismisses via the shared data-close-modal mechanism
    assert.match(html, /id="modal-first-close"[\s\S]*?data-close-modal="modal-first-close"/);
  });

  it('asks on the first close and remembers the choice afterwards (main.js)', () => {
    // The close event asks only before a choice exists and only for resident
    // instances (ephemeral file-arg windows keep closing directly).
    assert.match(mainJs, /if \(!isEphemeral && !s\.closeChoiceMade && !s\.closeToTray\) \{/);
    assert.match(mainJs, /event\.preventDefault\(\);[\s\S]*?win\.focus\(\);[\s\S]*?webContents\.send\('confirm-first-close'\)/);
    // Known choice: tray hides, otherwise the window closes (persistWindowState)
    assert.match(mainJs, /if \(!isEphemeral && s\.closeToTray\) \{\s*event\.preventDefault\(\);\s*hideToTray\(\);/);

    // The tray icon is resident: created at startup for non-ephemeral instances
    // regardless of closeToTray, and never destroyed by a settings save
    assert.match(mainJs, /function shouldShowTrayIcon\(\) \{\s*return !\(allowMultipleInstances && instanceHasInitialFile\);/);
    assert.match(mainJs, /if \(shouldShowTrayIcon\(\)\) createTray\(\);/);
    assert.doesNotMatch(mainJs, /tray\.destroy\(\)/);

    // first-close-choice persists the remembered choice and acts immediately
    assert.match(mainJs, /if \(remember\) \{[\s\S]*?closeChoiceMade: true,[\s\S]*?closeToTray: action === 'tray'/);
    assert.match(mainJs, /if \(action === 'tray'\) \{[\s\S]*?if \(!tray\) createTray\(\);[\s\S]*?hideToTray\(\);/);
    assert.match(mainJs, /isQuitting = true;\s*app\.quit\(\);/);
  });

  it('exposes the bridge in preload.js', () => {
    assert.match(preload, /onConfirmFirstClose: \(cb\) => ipcRenderer\.on\('confirm-first-close', \(\) => cb\(\)\)/);
    assert.match(preload, /respondFirstClose: \(action, remember\) => ipcRenderer\.invoke\('first-close-choice', action, !!remember\)/);
  });

  it('wires the dialog in app.js: options, IPC, keys, Esc, overlay click', () => {
    // Renderer listens for the main-process question and opens the dialog
    assert.match(appJs, /onConfirmFirstClose\(\(\) => \{[\s\S]*?openModal\('modal-first-close'\);/);
    // Both options call respondFirstClose with the remember flag
    assert.match(appJs, /function chooseFirstClose\(action\) \{[\s\S]*?respondFirstClose\(action, remember\)/);
    assert.match(appJs, /\$\('btn-first-close-tray'\)[\s\S]*?addEventListener\('click', \(\) => chooseFirstClose\('tray'\)\)/);
    assert.match(appJs, /\$\('btn-first-close-quit'\)[\s\S]*?addEventListener\('click', \(\) => chooseFirstClose\('quit'\)\)/);
    // Keyboard map: Enter → tray, Space → quit (CyberNotes)
    assert.match(appJs, /if \(\$\('modal-first-close'\)\.classList\.contains\('active'\)\) \{[\s\S]*?if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); chooseFirstClose\('tray'\); return; \}[\s\S]*?if \(e\.key === ' ' \|\| e\.code === 'Space'\) \{ e\.preventDefault\(\); chooseFirstClose\('quit'\); return; \}/);
    // Esc dismisses and clicking the backdrop dismisses
    assert.match(appJs, /closeModal\('modal-tray-pin'\);\s*closeModal\('modal-first-close'\);/);
    assert.match(appJs, /'modal-tray-pin', 'modal-first-close'\]\.forEach\(id => \{/);
    // Settings defaults carry the new flag
    assert.match(appJs, /closeToTray: false,\s*\n\s*closeChoiceMade: false,/);
  });

  it('styles the option cards and remember checkbox', () => {
    assert.match(css, /\.first-close-option \{[\s\S]*?border: 1px solid var\(--cyber-border\);[\s\S]*?cursor: pointer;[\s\S]*?\}/);
    assert.match(css, /\.first-close-option:hover \{[\s\S]*?border-color: var\(--cyber-accent\);/);
    assert.match(css, /\.first-close-option\.is-danger \.first-close-option-icon \{[\s\S]*?color: var\(--cyber-accent2\);/);
    assert.match(css, /\.first-close-remember input:checked \+ \.first-close-checkmark \{[\s\S]*?background: var\(--cyber-accent\);/);
  });

  it('localizes every key in English and Spanish, clarifying the faster image opening', () => {
    const keys = [
      'first_close_title', 'first_close_question', 'first_close_tray', 'first_close_tray_sub',
      'first_close_quit', 'first_close_quit_sub', 'first_close_remember',
      'first_close_key_space'
    ];
    for (const lang of ['en', 'es']) {
      for (const key of keys) {
        assert.equal(typeof ui[lang][key], 'string', `${lang}.${key} missing`);
        assert.ok(ui[lang][key].trim().length > 0, `${lang}.${key} empty`);
      }
    }
    // The tray option must communicate that keeping the app resident makes
    // opening images faster (both languages)
    assert.match(ui.en.first_close_tray_sub, /open faster/i);
    assert.match(ui.es.first_close_tray_sub, /más rápido/i);
  });

  it('includes closeChoiceMade in settings backups', () => {
    assert.match(backupLib, /'closeChoiceMade',/);
  });
});

describe('modal hotkey badges audit', () => {
  it('badges every hotkey action in every modal with a consistent chip', () => {
    // [button id, expected badge] — Enter badges are chips wrapping the arrow SVG
    const enterChip = '<span class="btn-key-hint" aria-hidden="true"><svg class="btn-enter-icon"';
    const escChip = '<span class="btn-key-hint">Esc</span>';
    const expectations = [
      // [regex locating the button tag, expected badge snippet inside it]
      [/id="btn-confirm-ok"/, enterChip],
      [/id="btn-confirm-cancel"/, escChip],
      [/id="btn-tray-pin-dismiss"/, escChip],
      [/id="btn-tray-pin-settings"/, enterChip],
      [/id="btn-first-close-tray"/, enterChip],
      [/id="btn-first-close-quit"/, '<span class="btn-key-hint" data-i18n="first_close_key_space">'],
      [/id="btn-print-now"/, enterChip],
      [/class="top-btn btn-cancel[^"]*" data-close-modal="modal-print-export"/, escChip],
      [/id="props-close-btn"/, enterChip],
      [/id="btn-confirm-resize"/, enterChip],
      [/class="top-btn btn-cancel[^"]*" data-close-modal="modal-resize"/, escChip],
      [/id="btn-confirm-adjust"/, enterChip],
      [/class="top-btn btn-cancel[^"]*" data-close-modal="modal-adjust"/, escChip],
      [/class="config-nav-close"/, '<span class="btn-key-hint" aria-hidden="true"><svg class="btn-enter-icon config-close-enter"'],
      [/id="btn-crop-confirm"/, enterChip],
      [/id="btn-crop-cancel"/, escChip]
    ];
    for (const [btnRe, badge] of expectations) {
      const m = html.match(new RegExp('<button[^>]*' + btnRe.source + '[^>]*>[\\s\\S]*?</button>'));
      assert.ok(m, `button matching ${btnRe.source} not found`);
      assert.ok(m[0].includes(badge), `button ${btnRe.source} should carry badge: ${badge}`);
    }
  });

  it('leaves no bare Enter icon outside a chip', () => {
    // Every btn-enter-icon SVG must sit inside a .btn-key-hint chip
    const svgs = html.match(/<svg class="btn-enter-icon/g) || [];
    const chips = html.match(/<span class="btn-key-hint"[^>]*><svg class="btn-enter-icon/g) || [];
    assert.equal(svgs.length, chips.length, 'every Enter SVG must be chip-wrapped');
    assert.ok(svgs.length >= 8, 'audit covers all modals with Enter actions');
  });

  it('uses one enlarged badge style for all hints', () => {
    assert.match(css, /\.btn-key-hint \{[\s\S]*?font-size: 11px;[\s\S]*?min-width: 20px;[\s\S]*?padding: 2px 6px;[\s\S]*?border-radius: 4px;[\s\S]*?\}/);
    assert.match(css, /\.btn-enter-icon \{[\s\S]*?width: 13px;[\s\S]*?height: 13px;/);
    // No per-dialog opacity overrides remain
    assert.doesNotMatch(css, /\.first-close-key-hint/);
  });
});
