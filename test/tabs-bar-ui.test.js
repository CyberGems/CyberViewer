'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('CyberViewer.html');
const workspace = read('js/workspace.js');
const appJs = read('js/app.js');
const tabsCss = read('css/tabs.css');
const ui = JSON.parse(read('i18n/ui.json'));

describe('tab bar ui', () => {
  it('offers localized media icons for image, video, audio and YouTube tabs', () => {
    for (const lang of ['en', 'es']) {
      assert.ok(ui[lang].tabs_media_icons);
      assert.ok(ui[lang].tabs_media_icons_desc);
    }
    assert.match(html, /id="cfg-tab-media-icons"/);
    assert.match(workspace, /CVYouTubeSource\.isYouTube\(tab\.image\)/);
    assert.match(workspace, /CVFormats\.isAudio\(tab\.image\)/);
    assert.match(workspace, /CVFormats\.isVideo\(tab\.image\)/);
    assert.match(workspace, /mediaIcon\.hidden = state\.settings\.app\.showTabMediaIcons === false/);
    assert.match(tabsCss, /\.image-tab-media-icon\[hidden\] \{ display: none; \}/);
    assert.match(workspace, /title\.append\(icon, name\)/);
    assert.match(workspace, /icon\.append\(iconSvg\(mediaTypeForTab\(tab\)\)\)/);
    assert.match(tabsCss, /\.tab-switcher-item-icon\[hidden\] \{ display: none; \}/);
  });
  it('omits tooltips that only restate visible modal actions', () => {
    for (const id of ['props-close-btn', 'preset-pct25', 'preset-pct50', 'preset-pct200']) {
      const tag = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0];
      assert.ok(tag, id);
      assert.doesNotMatch(tag, /data-i18n-title=|data-tooltip=|title=/, id);
    }
    for (const modal of ['modal-resize', 'modal-adjust']) {
      const tag = html.match(new RegExp(`<button[^>]*class="top-btn btn-cancel modal-cancel-btn"[^>]*data-close-modal="${modal}"[^>]*>`))?.[0];
      assert.ok(tag, modal);
      assert.doesNotMatch(tag, /data-i18n-title=|data-tooltip=|title=/, modal);
    }
  });
  it('localizes the viewer drop choice and tab insertion cue in both languages', () => {
    for (const lang of ['en', 'es']) {
      for (const key of ['drop_center_action', 'drop_center_action_desc', 'drop_center_new_tab', 'drop_center_replace']) {
        assert.ok(ui[lang][key], `${lang}.${key}`);
      }
    }
    assert.match(html, /id="cfg-drop-center-action"/);
    assert.match(html, /id="tab-file-drop-marker"/);
    assert.match(html, /id="drag-overlay-label"/);
  });
  it('wires the plus button to the real file dialog and the empty strip to dblclick and context menu', () => {
    // The old wiring clicked a non-existent #btn-open node, so the button did nothing.
    assert.doesNotMatch(workspace, /\$\('btn-open'\)\.click\(\)/);
    assert.match(workspace, /image-tabs-open'\)\.addEventListener\('click', \(\) => window\.openImageDialog && window\.openImageDialog\(\)\)/);
    assert.match(workspace, /tabBar\.addEventListener\('dblclick', \(event\) => \{\s*if \(\(event\.target === tabBar \|\| event\.target === tabList\)/);
    assert.match(workspace, /tabBar\.addEventListener\('contextmenu', \(event\) => \{\s*if \(event\.target === tabBar \|\| event\.target === tabList\) showCustomContextMenu\(event, 'tab-bar', \{\}\)/);
  });

  it('builds a tab-bar menu with reopen and close all', () => {
    assert.match(workspace, /function barMenu\(\) \{/);
    assert.match(workspace, /barMenu, clearPreloads/);
    assert.match(appJs, /if \(type === 'tab-bar'\) return window\.CVWorkspace\.barMenu\(\);/);
    assert.match(workspace, /\{ label: text\('tabs_reopen'\), shortcut: 'Ctrl\+Shift\+T', icon: 'restore', enabled: model\.closed\.length > 0, action: reopen \}/);
  });

  it('shows edge navigation only while the strip overflows', () => {
    assert.match(html, /id="image-tabs-scroll-left"/);
    assert.match(html, /id="image-tabs-scroll-right"/);
    assert.match(workspace, /function syncTabOverflow\(\) \{/);
    assert.match(workspace, /const overflowing = list\.scrollWidth > list\.clientWidth \+ 1;/);
    assert.match(workspace, /tabList\.addEventListener\('scroll', syncTabOverflow, \{ passive: true \}\)/);
    assert.match(tabsCss, /\.tab-bar-nav-btn\[hidden\] \{ display: none; \}/);
  });

  it('gives the switcher a header with count and a close-all footer', () => {
    for (const lang of ['en', 'es']) {
      for (const key of ['tabs_close_all_confirm', 'tabs_close_all_confirm_one', 'tabs_close_all_confirm_action']) {
        assert.ok(ui[lang][key], `${lang}.${key}`);
      }
    }
    assert.match(html, /id="tab-switcher-close-all"/);
    assert.match(html, /id="tab-switcher-close-confirm"/);
    assert.match(html, /id="tab-switcher-close-cancel"/);
    assert.match(html, /id="tab-switcher-close-confirm-btn"/);
    assert.match(html, /id="tab-switcher-count"/);
    assert.match(workspace, /\$\('tab-switcher-count'\)\.textContent = model\.tabs\.length;/);
    assert.match(workspace, /\$\('tab-switcher-close-all'\)\.disabled = !model\.tabs\.length;/);
    assert.match(workspace, /\$\('tab-switcher-close-all'\)\.addEventListener\('click', \(\) => \{\s*setCloseAllConfirmation\(true, true\);/);
    assert.match(workspace, /\$\('tab-switcher-close-confirm-btn'\)\.addEventListener\('click', \(\) => \{[\s\S]*?closeTabs\(model\.tabs\.map\(tab => tab\.id\)\);/);
    assert.match(tabsCss, /\.tab-switcher-head \{/);
    assert.match(tabsCss, /\.tab-switcher-close-all \{/);
    assert.match(tabsCss, /#tab-switcher-list::-webkit-scrollbar \{ width: 6px; \}/);
    assert.match(tabsCss, /#tab-switcher-list::-webkit-scrollbar-button \{ display: none; \}/);
  });

  it('localizes the modal helper lines in both languages', () => {
    for (const lang of ['en', 'es']) {
      for (const key of ['config_intro', 'props_intro', 'resize_intro', 'adjust_intro', 'print_export_intro']) {
        assert.ok(ui[lang][key], `${lang}.${key}`);
        assert.match(html, new RegExp(`data-i18n="${key}"`));
      }
    }
  });

  it('styles the plus button as a square bordered action like the suite', () => {
    assert.match(tabsCss, /\.tab-bar-button\s*\{[^}]*width: 28px;[^}]*height: 28px;/);
    assert.match(html, /id="image-tabs-open"[\s\S]*?<path d="M12 5v14"\/><path d="M5 12h14"\/>/);
  });

  it('drags tabs with a pointer ghost clamped to the strip instead of native DnD', () => {
    // Native drag and drop let the OS ghost wander across the whole interface.
    assert.doesNotMatch(workspace, /shell\.draggable = true/);
    assert.doesNotMatch(workspace, /cyberviewer-tab/);
    assert.match(workspace, /const TAB_DRAG_THRESHOLD = 6;/);
    assert.match(workspace, /function bindTabDrag\(\) \{/);
    assert.match(workspace, /bindTabDrag\(\);/);
    assert.match(workspace, /model\.moveTo\(drag\.id, drag\.originIndex\);/);
    assert.match(tabsCss, /\.image-tab-ghost \{/);
    assert.match(tabsCss, /body\.tab-drag-active \{ user-select: none; \}/);
  });
});
