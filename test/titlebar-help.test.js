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
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');

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

  it('keeps the active filename in the window title bar and reserves its banner for fullscreen', () => {
    assert.match(html, /id="titlebar-filename"[^>]*data-i18n-aria="titlebar_filename_aria"/);
    assert.doesNotMatch(html, /id="top-hints"/);
    assert.match(css, /body:not\(\.ghost-mode\) #viewer-filename\s*\{\s*display:\s*none !important;/);
    assert.match(css, /body\.ghost-mode \.titlebar-filename\s*\{\s*display:\s*none;/);
    assert.match(html, /id="titlebar-filename"[^>]*data-empty="true"[^>]*>[\s\S]*class="titlebar-filename-base"[\s\S]*class="titlebar-filename-extension"/);
    assert.match(css, /\.titlebar-filename-base\s*\{[\s\S]*?text-overflow:\s*ellipsis;/);
    assert.match(css, /\.titlebar-filename-extension\s*\{[\s\S]*?flex:\s*0 0 auto;/);
    assert.match(css, /\.titlebar-filename-extension\s*\{[\s\S]*?color:\s*color-mix\([\s\S]*?opacity:\s*0\.78;/);
    assert.match(appJs, /function syncFilenameDisplays\(image = state\.images\[state\.current\]\)/);
    assert.match(appJs, /splitFilenameExtension\(name\)/);
    assert.match(appJs, /showPropertiesPanel\(image\.file\.path\)/);
    for (const lang of ['en', 'es']) {
      for (const key of ['titlebar_filename_aria', 'titlebar_filename_hint']) {
        assert.equal(typeof ui[lang][key], 'string');
        assert.ok(ui[lang][key].trim().length > 0);
      }
    }
  });

  it('uses distinct fullscreen and slideshow icon silhouettes', () => {
    const fs = html.match(/id="btn-fs-hud"[\s\S]*?<\/button>/);
    const slideshow = html.match(/id="btn-slideshow"[\s\S]*?<\/button>/);
    assert.ok(fs && slideshow, 'fullscreen and slideshow buttons should be present');
    assert.match(fs[0], /data-i18n-aria="fs_title"[\s\S]*?M9 4H4v5M4 4l5 5M15 4h5v5M20 4l-5 5M4 15v5h5M4 20l5-5M15 20h5v-5M20 20l-5-5/);
    assert.match(slideshow[0], /data-i18n-aria="ss_title"[\s\S]*?<path d="M6 8H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1"\/>[\s\S]*?<rect x="6" y="5" width="15" height="15" rx="2"\/>[\s\S]*?M12 10v5l4-2\.5-4-2\.5z/);
    assert.match(appJs, /menu_slideshow: 'presentation'/);
    assert.match(appJs, /'presentation': '<rect x="6" y="5"/);
    assert.match(appJs, /'fullscreen': '<path d="M9 4H4v5M4 4l5 5/);
  });

  it('provides the shortcut guide from a compact title-bar button', () => {
    assert.match(html, /id="btn-shortcuts"[^>]*aria-controls="shortcuts-popover"/);
    assert.match(html, /id="shortcuts-popover"[^>]*role="dialog"/);
    assert.match(appJs, /function setShortcutsPopoverOpen\(open\)/);
    assert.match(appJs, /if \(closeShortcutsPopover\(\)\)/);
    for (const lang of ['en', 'es']) {
      assert.equal(typeof ui[lang].shortcuts_title, 'string');
      assert.ok(ui[lang].shortcuts_title.trim().length > 0);
    }
  });

  it('suppresses shortcuts button tooltip when open and provides an expanded 2-column shortcuts cheat sheet', () => {
    // Tooltip suppression when open (titlebar tooltip card guard, CyberNotes style)
    assert.match(appJs, /function ttSuppressedWhileOpen\(el\)[\s\S]*?btn-shortcuts[\s\S]*?shortcuts-popover/);
    assert.match(appJs, /function ttShow\(el\)\s*\{\s*if \(ttSuppressedWhileOpen\(el\)\) return;/);
    assert.match(appJs, /button\.classList\.toggle\('open',\s*next\);[\s\S]*?if \(next\) button\.blur\(\);/);

    // 2-column grid structure in HTML & CSS
    assert.match(html, /class="shortcuts-grid"[\s\S]*?class="shortcuts-col"[\s\S]*?data-i18n="shortcuts_sec_view"[\s\S]*?data-i18n="shortcuts_sec_edit"/);
    assert.match(css, /\.shortcuts-grid\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*1fr 1fr;/);
    assert.match(css, /\.shortcuts-popover\s*\{[\s\S]*?width:\s*min\(390px,\s*calc\(100vw - 24px\)\);/);

    // Key combinations present
    const expectedKeys = [
      '<kbd>F</kbd>', '<kbd>1</kbd>', '<kbd>S</kbd>', '<kbd>Ctrl</kbd><kbd>O</kbd>',
      '<kbd>Ctrl</kbd><kbd>D</kbd>', '<kbd>Q</kbd><kbd>E</kbd>', '<kbd>H</kbd>',
      '<kbd>C</kbd>', '<kbd>R</kbd>', '<kbd>J</kbd>', '<kbd>Ctrl</kbd><kbd>C</kbd>',
      '<kbd>Ctrl</kbd><kbd>V</kbd>', '<kbd>Del</kbd>', '<kbd>Esc</kbd>'
    ];
    for (const key of expectedKeys) {
      assert.ok(html.includes(key), `shortcuts popover should contain ${key}`);
    }

    // Bilingual localization for all added keys
    const i18nKeys = [
      'shortcuts_sec_view', 'shortcuts_sec_edit', 'shortcuts_1_1', 'shortcuts_slideshow',
      'shortcuts_rotate', 'shortcuts_flip', 'shortcuts_adjust', 'shortcuts_copy',
      'shortcuts_paste', 'shortcuts_favorite', 'shortcuts_delete', 'shortcuts_close',
      'shortcuts_props', 'shortcuts_about', 'shortcuts_help', 'shortcuts_config',
      'shortcuts_menu', 'shortcuts_min', 'shortcuts_max', 'shortcuts_close_window',
      'titlebar_about'
    ];
    for (const lang of ['en', 'es']) {
      for (const key of i18nKeys) {
        assert.equal(typeof ui[lang][key], 'string', `${lang}.${key} should be defined`);
        assert.ok(ui[lang][key].trim().length > 0);
      }
    }
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

  it('unifies right-side titlebar controls and refines separator line thickness', () => {
    assert.match(html, /id="btn-shortcuts"[^>]*>[\s\S]*?<svg class="win-ico"/);
    assert.match(html, /id="win-min"[^>]*>[\s\S]*?<svg class="win-ico"/);
    assert.match(html, /id="win-max"[^>]*>[\s\S]*?<svg class="win-ico"/);
    assert.match(html, /id="win-close"[^>]*>[\s\S]*?<svg class="win-ico"/);
    assert.match(css, /\.win-ico\s*\{\s*width:\s*15px;\s*height:\s*15px;/);
    assert.match(css, /\.menu-ico\s*\{\s*width:\s*15px;\s*height:\s*15px;/);
    assert.match(css, /\.titlebar-config-glyph\s*\{[\s\S]*?width:\s*15px;\s*height:\s*15px;/);

    // The titlebar separator is a crisp 1px hairline: solid accent, no edge
    // fade and no glow, so it reads as a fine line on every theme.
    assert.match(css, /#topbar::after\s*\{[^}]*background:\s*rgba\(var\(--cyber-accent-rgb\),\s*0\.45\);[^}]*\}/);
    assert.doesNotMatch(css, /#topbar::after\s*\{[^}]*box-shadow:/);
    assert.match(css, /body:not\(\.window-maximized\)::after\s*\{[\s\S]*?box-shadow:\s*0 -1px 2px rgba\(var\(--cyber-accent-rgb\),\s*0\.15\);/);
  });

  it('separates the app controls from the window controls with an elegant fading divider', () => {
    // The divider sits between the app/action buttons and the window controls
    assert.match(html, /class="win-sep" aria-hidden="true"><\/div>\s*<button class="win-btn" id="win-min"/);
    assert.match(css, /\.win-sep\s*\{[^}]*width:\s*1px;[^}]*height:\s*20px;[^}]*linear-gradient\(to bottom,\s*transparent,\s*rgba\(var\(--cyber-accent-rgb\),\s*0\.26\)\s*50%,\s*transparent\);[^}]*\}/);
  });

  it('clears the stuck hover highlight on the minimize button after window restore', () => {
    // main process notifies the renderer on restore (minimize → taskbar) and
    // show (minimize → tray), the two paths that leave :hover stuck
    assert.match(mainJs, /win\.on\('restore', \(\) => \{[\s\S]*?webContents\.send\('window-restore'\)/);
    assert.match(mainJs, /win\.on\('show', \(\) => \{[\s\S]*?webContents\.send\('window-restore'\)/);
    // preload bridge
    assert.match(preload, /onWindowRestore:\s*\(cb\)\s*=>\s*ipcRenderer\.on\('window-restore',\s*\(\)\s*=>\s*cb\(\)\)/);
    // renderer toggles a one-frame pointer-events reset to force a re-hit-test
    assert.match(appJs, /onWindowRestore\(\(\) => \{[\s\S]*?classList\.add\('hover-reset'\);[\s\S]*?requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => \{[\s\S]*?classList\.remove\('hover-reset'\);/);
    assert.match(css, /body\.hover-reset,\s*body\.hover-reset \*\s*\{\s*pointer-events:\s*none !important;\s*\}/);
  });

  it('mirrors the CyberNotes title bar: hotkeys on every control with tooltip badges', () => {
    // Hotkey wiring in the global keydown handler
    assert.match(appJs, /case 'm': e\.preventDefault\(\); \$\('btn-menu'\)\.click\(\); return;/);
    assert.match(appJs, /if \(updateBtn && updateBtn\.style\.display !== 'none'\) updateBtn\.click\(\);/);
    assert.match(appJs, /case 'n': e\.preventDefault\(\); if \(isElectron\) window\.electronAPI\.minimize\(\); return;/);
    assert.match(appJs, /case 'x': e\.preventDefault\(\); if \(isElectron\) window\.electronAPI\.maximize\(\); return;/);
    assert.match(appJs, /if \(e\.key === 'F4'\) \{ e\.preventDefault\(\); if \(isElectron\) window\.electronAPI\.close\(\); return; \}/);
    assert.match(appJs, /if \(e\.key === 'F1'\) \{ e\.preventDefault\(\); \$\('btn-about'\)\.click\(\); return; \}/);
    assert.match(appJs, /if \(e\.key === '\?'\) \{ e\.preventDefault\(\); setShortcutsPopoverOpen\(\$\('shortcuts-popover'\)\.hidden\); return; \}/);

    // Every titlebar control carries a hotkey badge for its tooltip card
    const badges = [
      ['logo-trigger', 'F1'], ['titlebar-filename', 'Ctrl+I'], ['titlebar-update-btn', 'Alt+U'],
      ['btn-shortcuts', '?'], ['btn-config', 'Ctrl+,'], ['btn-menu', 'Alt+M'],
      ['btn-about', 'F1'], ['win-min', 'Alt+N'], ['win-max', 'Alt+X'], ['win-close', 'Alt+F4']
    ];
    for (const [id, kbd] of badges) {
      const escaped = kbd.replace(/[+,?]/g, m => '\\' + m);
      assert.match(html, new RegExp(`id="${id}"[^>]*data-tooltip-kbd="${escaped}"`), `${id} should badge ${kbd}`);
    }

    // Tooltip card renders the badge as a <kbd> chip (CyberNotes naming)
    assert.match(appJs, /ttKbdEl = document\.createElement\('kbd'\);/);
    assert.match(appJs, /ttKbdEl\.className = 'tooltip-shortcut-key';/);
    assert.match(css, /#titlebar-tooltip \.tooltip-shortcut-key\s*\{[\s\S]*?font-size:\s*9px;/);
    assert.match(css, /#titlebar-tooltip\.is-visible\s*\{[\s\S]*?opacity:\s*1;/);
  });

  it('swaps the burger for a lucide More (...) icon like CyberNotes', () => {
    const menu = html.match(/id="btn-menu"[\s\S]*?<\/button>/);
    assert.ok(menu, 'menu button markup should be present');
    // lucide MoreHorizontal: three horizontal dots
    assert.match(menu[0], /<svg class="menu-ico"[^>]*><circle cx="5" cy="12" r="1"\/><circle cx="12" cy="12" r="1"\/><circle cx="19" cy="12" r="1"\/><\/svg>/);
    assert.doesNotMatch(menu[0], /M4 7h16/);
    assert.match(html, /id="btn-menu"[^>]*data-i18n-tt="menu"[^>]*data-tooltip-kbd="Alt\+M"/);
  });

  it('provides CyberPaste-style square titlebar update button and removes obsolete burger badge', () => {
    // Titlebar markup placement: icon-only square button preceding the shortcuts button
    const updateBtnIdx = html.indexOf('id="titlebar-update-btn"');
    const shortcutsIdx = html.indexOf('id="btn-shortcuts"');
    assert.ok(updateBtnIdx > 0, 'titlebar-update-btn must be present in CyberViewer.html');
    assert.ok(shortcutsIdx > updateBtnIdx, 'titlebar-update-btn must precede shortcuts button');
    const updateBtn = html.match(/id="titlebar-update-btn"[\s\S]*?<\/button>/);
    assert.ok(updateBtn, 'titlebar-update-btn markup should be present');
    assert.match(updateBtn[0], /<svg viewBox="0 0 24 24"[\s\S]*?<line x1="12" y1="5" x2="12" y2="19"[\s\S]*?<polyline points="19 12 12 19 5 12"/);
    assert.doesNotMatch(updateBtn[0], /titlebar-update-label|titlebar-update-icon/);

    // CSS CyberPaste square button: h-8 w-8 rounded-lg, cyan primary border and background
    assert.match(css, /\.titlebar-update-btn\s*\{[\s\S]*?height:\s*32px;[\s\S]*?width:\s*32px;[\s\S]*?border-radius:\s*8px;/);
    // Outline-free button: tinted background only, no border on any state
    assert.match(css, /\.titlebar-update-btn\s*\{[^}]*background:\s*rgba\(var\(--cyber-accent-rgb\),\s*0\.1\);/);
    assert.doesNotMatch(css, /\.titlebar-update-btn\s*\{[^}]*border:/);
    assert.match(css, /\.titlebar-update-btn:hover,\s*\.titlebar-update-btn:focus-visible\s*\{[^}]*background:\s*rgba\(var\(--cyber-accent-rgb\),\s*0\.25\);/);
    assert.match(css, /\.titlebar-update-btn:active\s*\{[\s\S]*?transform:\s*scale\(0\.95\);/);
    // Soft, relaxed motion-safe pulse (3.5s ease-in-out), no badges, no per-state recolor
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.titlebar-update-btn\s*\{[^}]*?animation:\s*titlebar-update-pulse 3\.5s ease-in-out infinite;/);
    assert.match(css, /@keyframes titlebar-update-pulse\s*\{\s*0%,\s*100%\s*\{\s*opacity:\s*1;\s*\}\s*50%\s*\{\s*opacity:\s*0\.5;\s*\}\s*\}/);
    assert.doesNotMatch(css, /\.titlebar-update-btn\.ready\s*\{/);
    assert.doesNotMatch(css, /\.titlebar-update-label-wrap\s*\{/);
    assert.doesNotMatch(css, /\.update-menu-badge\s*\{/);

    // Icon-only button: the standalone label key is gone from both locales
    assert.equal(ui.en.titlebar_update_btn, undefined);
    assert.equal(ui.es.titlebar_update_btn, undefined);

    // JS updater controller: permanently hidden while auto-check updates is disabled
    assert.match(appJs, /function syncTitleBarUpdateButton\(\)/);
    assert.match(appJs, /const autoCheckOff = state\.settings\.app\.checkUpdatesOnStartup === false;/);
    assert.match(appJs, /const pending = !!\(s && \(s\.state === 'available' \|\| s\.state === 'downloaded'\)\) && !autoCheckOff;/);
    assert.match(appJs, /updateBtn\.style\.display\s*=\s*pending \? 'inline-flex' : 'none';/);
    assert.doesNotMatch(appJs, /updateBtn\.classList\.toggle\('ready'/);
    assert.match(appJs, /titlebarUpdateBtn\.addEventListener\('click',\s*\(e\)\s*=>\s*\{[\s\S]*?openAbout\(\);/);
  });

  it('orders About modal update controls: banner, actions, progress, cards, status, notes', () => {
    const bannerIdx = appJs.indexOf('id="about-update-banner"');
    const detailsIdx = appJs.indexOf('id="about-update-details"');
    const progressIdx = appJs.indexOf('id="about-update-progress"');
    const actionsIdx = appJs.indexOf('class="about-update-actions"');
    const statusIdx = appJs.indexOf('id="about-update-status"');
    const notesIdx = appJs.indexOf('id="about-release-notes"');
    const releaseBtnIdx = appJs.indexOf('id="about-btn-release"');

    assert.ok(bannerIdx > 0, 'about-update-banner must be present');
    assert.ok(actionsIdx > bannerIdx, 'action buttons must follow the banner');
    assert.ok(progressIdx > actionsIdx, 'progress must follow action buttons');
    assert.ok(detailsIdx > progressIdx, 'version cards must follow progress');
    assert.ok(statusIdx > detailsIdx, 'status text must follow version cards');
    assert.ok(notesIdx > statusIdx, 'release notes must be below the status text');
    assert.ok(releaseBtnIdx > notesIdx, 'view release page button must follow notes');
    // Maintenance box is a flex column with gap; children carry no outer margins
    assert.match(css, /\.about-release-notes\s*\{[\s\S]*?margin-top:\s*0;[\s\S]*?margin-bottom:\s*0;/);
  });
});
