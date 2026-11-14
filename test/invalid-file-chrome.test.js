const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const appCss = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
const youtubeCss = fs.readFileSync(path.join(root, 'css', 'youtube.css'), 'utf8');
const videoCss = fs.readFileSync(path.join(root, 'css', 'video.css'), 'utf8');
const audioCss = fs.readFileSync(path.join(root, 'css', 'audio.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const youtubePlayer = fs.readFileSync(path.join(root, 'js', 'youtube-player.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const ui = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));
const mediaTypes = fs.readFileSync(path.join(root, 'js', 'media-types.js'), 'utf8');
const trayCss = fs.readFileSync(path.join(root, 'css', 'tray-menu.css'), 'utf8');
const workspace = fs.readFileSync(path.join(root, 'js', 'workspace.js'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const preloadJs = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');

// Collapse whitespace so the assertions match regardless of the source
// formatting (selector list wrapping, indentation, trailing spaces).
const flat = (text) => text.replace(/\s+/g, ' ');

describe('invalid-file view chrome', () => {
  it('hides the action bar and statusbar while the error banner is up', () => {
    const css = flat(appCss);
    assert.match(css, /body\.image-error:not\(\.ghost-mode\) #kbd-hint, body\.image-error:not\(\.ghost-mode\) #statusbar,[^}]*display: none !important;/);
    // Fullscreen (ghost) keeps the docked statusbar hidden and also clears the
    // floating action bar.
    assert.match(css, /body\.image-error\.ghost-mode #kbd-hint/);
  });

  it('frees the dock height and the statusbar strip so the banner centers', () => {
    const css = flat(appCss);
    assert.match(css, /body\.image-error:not\(\.ghost-mode\):not\(\.empty-state\)[^{]*\{[^}]*--dock-h: 0px;/);
    assert.match(css, /body\.image-error\.statusbar-visible:not\(\.ghost-mode\):not\(\.empty-state\) #viewer-wrap[^{]*\{[^}]*margin-bottom: 0 !important;/);
    assert.match(css, /body\.image-error #toolbar-handle[^{]*\{[^}]*display: none !important;/);
  });

  it('hides the sidebar and its toggle', () => {
    const css = flat(appCss);
    assert.match(css, /body\.image-error #sidebar, body\.image-error #sidebar-edge-rail[^{]*\{[^}]*display: none !important;/);
    // The toggle is hidden outright (not just dimmed): it would reopen a panel
    // that cannot list anything, and it reads as stray chrome over the banner.
    assert.match(css, /body\.image-error #sidebar-handle \{ display: none !important; \}/);
  });

  it('guards the sidebar toggle click so the menu programmatic click is inert', () => {
    const handler = appJs.match(/sidebarHandleEl\.addEventListener\('click', \(e\) => \{[\s\S]*?\n  \}\);/);
    assert.ok(handler, 'sidebar handle click handler should stay on sidebarHandleEl');
    assert.match(handler[0], /if \(document\.body\.classList\.contains\('image-error'\)\) return;/);
  });

  it('keeps the sidebar and toolbar menu items inert while the banner is up', () => {
    const sb = appJs.match(/const sb = panel\.querySelector\('\[data-action="sidebar"\]'\);[\s\S]*?\n    \}/);
    assert.ok(sb, 'sidebar menu item sync should exist');
    assert.match(sb[0], /sb\.classList\.toggle\('disabled', err\);/);
    const tb = appJs.match(/const tb = panel\.querySelector\('\[data-action="toolbar"\]'\);[\s\S]*?\n    \}/);
    assert.ok(tb, 'toolbar menu item sync should exist');
    assert.match(tb[0], /tb\.classList\.toggle\('disabled', err\);/);
  });

  it('drops the grab cursor and the pan/zoom/fullscreen gestures', () => {
    const css = flat(appCss);
    // No frame to pan: the grab cursor only confuses.
    assert.match(css, /body\.image-error #viewer-wrap \{ cursor: default; \}/);
    // The prev/next arrows would float over the banner.
    assert.match(css, /body\.image-error #nav-container \{ display: none !important; \}/);
    // The canvas gestures become no-ops while the banner owns the screen.
    const guard = /if \(document\.body\.classList\.contains\('image-error'\)\) return;/;
    const wheel = appJs.match(/viewerWrap\.addEventListener\('wheel',[\s\S]*?\}, \{ passive: false \}\);/);
    assert.match(wheel[0], guard);
    const down = appJs.match(/viewerWrap\.addEventListener\('mousedown',[\s\S]*?\n\}\);/);
    assert.match(down[0], guard);
    const dbl = appJs.match(/viewerWrap\.addEventListener\('dblclick',[\s\S]*?\n\}\);/);
    assert.match(dbl[0], guard);
  });

  it('keeps the rosa palette on the frame and corners, neutral on logo and title', () => {
    const css = flat(appCss);
    assert.match(css, /\.err-frame \{ border-color: rgba\(var\(--cyber-accent2-rgb\), 0\.5\); \}/);
    assert.match(css, /\.err-corner \{ border-color: var\(--cyber-accent2\) !important; \}/);
    // Logo and title follow the app accent, not the error pink.
    assert.match(css, /\.err-logo \{ color: rgba\(var\(--cyber-accent-rgb\), 0\.72\);/);
    assert.match(css, /\.err-title \{ color: var\(--cyber-text\); \}/);
  });

  it('lists the locate button before the open button (more intuitive order)', () => {
    const relocate = html.indexOf('id="btn-relocate-tab"');
    const open = html.indexOf('id="btn-error-open"');
    assert.ok(relocate > -1 && open > -1, 'both error buttons should exist');
    assert.ok(relocate < open, 'Localizar should come before Abrir otra imagen');
  });
});

describe('media error chrome in fullscreen', () => {
  it('hides the video controls (and the heading inside them) on a video error', () => {
    const css = flat(videoCss);
    // #video-heading, #video-fit and #video-fullscreen live inside
    // #video-controls, so hiding the container clears the whole overlay.
    assert.match(css, /body\.image-error #video-controls \{ display: none; \}/);
  });

  it('hides the audio stage on an audio error', () => {
    const css = flat(audioCss);
    assert.match(css, /body\.audio-active\.image-error #audio-stage \{ display: none; \}/);
  });
});

describe('YouTube inline error chrome', () => {
  it('hides the action bar and statusbar while the embed shows its error', () => {
    const css = flat(youtubeCss);
    assert.match(css, /body\.youtube-error #kbd-hint, body\.youtube-error #statusbar \{ display: none !important; \}/);
  });

  it('toggles the youtube-error class with the embed error and clears it on unload', () => {
    assert.match(youtubePlayer, /document\.body\.classList\.toggle\('youtube-error', !!error\);/);
    assert.match(youtubePlayer, /document\.body\.classList\.remove\('youtube-error'\);/);
  });
});

describe('welcome screen', () => {
  it('hides the sidebar toggle, which has nothing to list yet', () => {
    assert.match(flat(appCss), /body\.empty-state #sidebar-handle \{ display: none !important; \}/);
  });

  it('offers a YouTube link entry point wired to the dialog', () => {
    assert.match(html, /id="btn-drop-youtube"[^>]*>\s*<span class="drop-btn-label" data-i18n="drop_youtube"/);
    assert.match(appJs, /const btnDropYoutube = \$\('btn-drop-youtube'\);/);
    assert.match(appJs, /window\.CVYouTube\.openDialog\(\)/);
  });

  it('labels Paste as images-only, in both languages', () => {
    assert.match(html, /id="btn-drop-paste"[^>]*>\s*<span class="drop-btn-label" data-i18n="drop_paste">Pegar imagen<\/span>/);
    for (const lang of ['en', 'es']) {
      assert.match(ui[lang].drop_paste, /image|imagen/i);
      assert.ok(typeof ui[lang].drop_youtube === 'string' && ui[lang].drop_youtube.length > 0);
    }
  });

  it('uses one hint mechanism for all three welcome buttons', () => {
    for (const key of ['drop_btn', 'drop_paste', 'drop_youtube', 'drop_paste_youtube']) {
      // Labels carry no embedded shortcut; hints are separate keys.
      assert.doesNotMatch(ui.en[key], /Ctrl\+/);
      assert.doesNotMatch(ui.es[key], /Ctrl\+/);
    }
    for (const lang of ['en', 'es']) {
      for (const key of ['drop_open_hint', 'drop_paste_hint', 'drop_youtube_hint']) {
        assert.match(ui[lang][key], /^Ctrl\+[OLV]$/, `${lang}.${key}`);
      }
    }
    assert.match(appJs, /label\.textContent = t\[key\] \|\| \(ytUrl \? 'Paste YouTube link' : 'Paste image'\);/);
  });

  it('stacks the primary button above the secondary pair, with a hotkey hint', () => {
    // Short label + hint, since the formats are now shown on the icon flyout.
    assert.match(html, /id="btn-drop-open"[^>]*><span class="drop-btn-label" data-i18n="drop_btn">Abrir<\/span><span class="drop-btn-hint" data-i18n="drop_open_hint">Ctrl\+O<\/span>/);
    assert.match(html, /class="drop-actions-secondary"[\s\S]*?id="btn-drop-paste"[\s\S]*?id="btn-drop-youtube"/);
    assert.match(flat(appCss), /#drop-zone \.drop-actions \{ display: flex; flex-direction: column;/);
    for (const lang of ['en', 'es']) {
      assert.ok(['Open', 'Abrir'].includes(ui[lang].drop_btn), `drop_btn should be short (${lang})`);
      assert.equal(ui[lang].drop_open_hint, 'Ctrl+O');
    }
  });
});

describe('welcome formats flyout', () => {
  it('moves the format list off the banner text', () => {
    for (const lang of ['en', 'es']) {
      // No format enumeration and no repeated "arrastra"/"drag and drop".
      assert.doesNotMatch(ui[lang].drop_sub, /JPG|MP4|MP3|\bWebP\b/);
      assert.doesNotMatch(ui[lang].drop_sub, /arrastra|drag and drop|suelta/i);
    }
  });

  it('sources the format labels from one place, shared with About', () => {
    assert.match(mediaTypes, /const IMAGE_FORMAT_LABELS = \[/);
    assert.match(mediaTypes, /const VIDEO_FORMAT_LABELS = \[/);
    assert.match(mediaTypes, /const AUDIO_FORMAT_LABELS = /);
    assert.match(mediaTypes, /IMAGE_FORMAT_LABELS, VIDEO_FORMAT_LABELS, AUDIO_FORMAT_LABELS/);
    assert.match(appJs, /const ABOUT_IMAGE_FORMATS = window\.CVFormats\.IMAGE_FORMAT_LABELS;/);
    assert.match(appJs, /const ABOUT_VIDEO_FORMATS = window\.CVFormats\.VIDEO_FORMAT_LABELS;/);
  });

  it('anchors the flyout to the drop tile and reveals it on hover/focus', () => {
    assert.match(html, /class="drop-tile-wrap"[\s\S]*?id="btn-drop-icon"[\s\S]*?id="drop-formats"[\s\S]*?id="drop-formats-rows"/);
    assert.match(appJs, /tile\.addEventListener\('mouseenter', show\);/);
    assert.match(appJs, /tile\.addEventListener\('mouseleave', hide\);/);
    assert.match(appJs, /tile\.addEventListener\('focus', show\);/);
    // Suppressed while files are dragged over the tile.
    assert.match(appJs, /classList\.contains\('drag-over'\)/);
    assert.match(flat(appCss), /\.drop-formats\[hidden\] \{ display: none !important; \}/);
  });
});

describe('audio error cursor', () => {
  it('drops the grab cursor in audio mode', () => {
    // Audio has no frame to pan; its error banner is covered by the shared
    // body.image-error cursor rule.
    assert.match(flat(audioCss), /body\.audio-active #viewer-wrap \{ cursor: default; \}/);
    assert.match(flat(appCss), /body\.image-error #viewer-wrap \{ cursor: default; \}/);
  });
});

describe('welcome paste affordance', () => {
  it('adds breathing room between the primary and secondary rows', () => {
    assert.match(flat(appCss), /#drop-zone \.drop-actions \{ display: flex; flex-direction: column; align-items: center; gap: 16px;/);
  });

  it('probes the clipboard from the Electron layer without reading image bytes', () => {
    assert.match(mainJs, /ipcMain\.handle\('clipboard:probe'/);
    assert.match(preloadJs, /probeClipboard: \(\) => ipcRenderer\.invoke\('clipboard:probe'\)/);
    // Electron 45 removed readImage/availableFormats in favour of the async
    // web-style API, so the probe must feature-detect and fall back to has().
    assert.match(mainJs, /if \(typeof clipboard\.readImage === 'function'\)/);
    assert.match(mainJs, /for \(const format of \['image\/png', 'image\/jpeg'\]\)/);
    assert.match(mainJs, /await clipboard\.has\(format\)/);
    assert.match(mainJs, /await clipboard\.readText\(\)/);
  });

  it('reads clipboard images through the async item API on Electron 45', () => {
    assert.match(mainJs, /ipcMain\.handle\('clipboard:read-image', async \(\)/);
    assert.match(mainJs, /it\.types\.some\(\(t\) => t\.startsWith\('image\/'\)\)/);
    assert.match(mainJs, /await item\.getType\(type\)/);
    assert.match(mainJs, /Buffer\.from\(await blob\.arrayBuffer\(\)\)/);
  });

  it('relabels Paste to a YouTube URL when the clipboard holds a link', () => {
    assert.match(appJs, /async function syncPasteAffordance\(\)/);
    assert.match(appJs, /state\.clipboardYouTube = ytUrl;/);
    assert.match(appJs, /drop_paste_youtube/);
    assert.match(appJs, /window\.CVYouTube\.openUrl\(state\.clipboardYouTube\)/);
    assert.match(youtubePlayer, /async function openUrl\(value\)/);
    assert.match(youtubePlayer, /openDialog, openUrl, initialize/);
    // Ctrl+V falls back to a YouTube link when there is no image.
    assert.match(appJs, /async function pasteYouTubeFromClipboard\(\)/);
    assert.match(appJs, /if \(await pasteYouTubeFromClipboard\(\)\) return;/);
  });

  it('localizes the YouTube paste labels and toast', () => {
    for (const lang of ['en', 'es']) {
      assert.match(ui[lang].drop_paste_youtube, /YouTube/);
      assert.ok(typeof ui[lang].toast_youtube_pasted === 'string' && ui[lang].toast_youtube_pasted.length > 0);
    }
    // Both entry points say "Enlace"/"link", never "URL".
    assert.match(ui.es.drop_paste_youtube, /^Pegar enlace de YouTube/);
    assert.match(ui.es.drop_youtube, /^Enlace de YouTube/);
    assert.doesNotMatch(ui.es.drop_paste_youtube, /URL/);
    assert.doesNotMatch(ui.es.drop_youtube, /URL/);
  });

  it('hides the dedicated YouTube button while Paste is in link mode', () => {
    assert.match(appJs, /const ytBtn = \$\('btn-drop-youtube'\);/);
    assert.match(appJs, /ytBtn\.hidden = !!ytUrl;/);
  });

  it('tailors the close warning to the real cause, without phantom rotations', () => {
    // The old catch-all string claimed pending rotations for a plain pasted image.
    assert.equal(ui.en.tabs_unsaved_message, undefined);
    assert.equal(ui.es.tabs_unsaved_message, undefined);
    for (const lang of ['en', 'es']) {
      for (const key of ['tabs_unsaved_rot_one', 'tabs_unsaved_rot_many', 'tabs_unsaved_file_one',
        'tabs_unsaved_file_many', 'tabs_unsaved_rot_file_one', 'tabs_unsaved_rot_file_many',
        'tabs_unsaved_close_question']) {
        assert.ok(typeof ui[lang][key] === 'string' && ui[lang][key].length > 0, `${lang}.${key}`);
      }
      // The plain unsaved case must not mention rotations.
      assert.doesNotMatch(ui[lang].tabs_unsaved_file_one, /rotac|rotation/i);
      assert.doesNotMatch(ui[lang].tabs_unsaved_file_many, /rotac|rotation/i);
    }
    assert.match(workspace, /function tabsUnsavedMessage\(pending\)/);
    assert.match(workspace, /pending\.some\(tab => tab\.view\.hasChanges\)/);
    assert.match(workspace, /pending\.some\(tab => !tab\.image\.file\.path\)/);
    assert.doesNotMatch(workspace, /tabs_unsaved_message/);
  });
});

describe('helper text legibility and clipboard copy', () => {
  it('bumps helper, description and detail text by a point', () => {
    const css = flat(appCss);
    const ycss = flat(youtubeCss);
    assert.match(css, /\.confirm-detail \{ font-size: 13px;/);
    assert.match(css, /\.drop-sub \{ font-size: 13px;/);
    assert.match(css, /#drop-zone \.drop-sub \{ color: var\(--cyber-muted\); font-size: 13px;/);
    assert.match(css, /\.config-desc \{ font-size: 13px;/);
    assert.match(css, /\.modal-subtitle \{ color: var\(--cyber-muted\); font-size: 12px;/);
    assert.match(css, /\.first-close-option-sub \{ font-size: 13px;/);
    assert.match(css, /\.props-path-val \{ text-align: left !important; color: var\(--cyber-accent-ink\) !important; font-size: 12px;/);
    assert.match(css, /\.menu-header-sub \{ font-size: 12px;/);
    assert.match(css, /#modal-config \.config-tab-intro-desc \{ margin-top: 3px; color: var\(--cyber-muted\); font-size: 12px;/);
    assert.match(css, /\.about-formats-label \{ font-size: 11px;/);
    assert.match(css, /\.about-formats-tech \{ display: block; font-size: 11px;/);
    assert.match(ycss, /\.youtube-dialog p \{ margin: 0; color: var\(--cyber-muted\); font-size: 13px; line-height: 1\.5; \}/);
    assert.match(ycss, /#youtube-status \{ color: var\(--cyber-muted\); font-size: 12px; line-height: 1\.35; \}/);
  });

  it('copies images to the clipboard through the Electron 45 item API', () => {
    assert.match(mainJs, /async function writeClipboardImage\(buffer\)/);
    assert.match(mainJs, /new ClipboardItem\(\{ 'image\/png': blob \}\)/);
    assert.match(mainJs, /writeClipboardImage\(data\)\.catch\(\(\) => \{\}\)/);
    // writeImage may only remain inside the feature-detected legacy branch.
    const calls = (mainJs.match(/clipboard\.writeImage\(img\);/g) || []).length;
    assert.equal(calls, 1, 'writeImage only inside the feature-detected helper');
  });
});

describe('dialog keyboard ownership and unified view HUD', () => {
  it('swallows content hotkeys while a dialog is open', () => {
    // Paste with no image fired its banner behind modals; the guard sits
    // before the content hotkey switch so nothing acts (or toasts) there.
    assert.match(appJs, /if \(document\.body\.classList\.contains\('modal-open'\)\) return;/);
    const guardIdx = appJs.indexOf("if (document.body.classList.contains('modal-open')) return;");
    const pasteIdx = appJs.indexOf("case 'v': e.preventDefault(); pasteFromClipboard(); break;");
    assert.ok(guardIdx > -1 && pasteIdx > -1 && guardIdx < pasteIdx, 'guard must precede the paste hotkey');
  });

  it('hides the sidebar toggle for pasted-image tabs', () => {
    assert.match(flat(appCss), /body\.current-unsaved #sidebar-handle \{ display: none !important; \}/);
    assert.match(appJs, /document\.body\.classList\.toggle\('current-unsaved', !!\(cur && !cur\.file\.path\)\);/);
  });

  it('unifies zoom and mode feedback into one view HUD', () => {
    assert.equal((html.match(/id="zoom-hud"/g) || []).length, 0, 'zoom-hud removed');
    assert.equal((flat(appCss).match(/#zoom-hud/g) || []).length, 0, 'zoom-hud CSS removed');
    assert.match(html, /id="mode-hud"/);
    assert.match(flat(appCss), /#mode-hud\.hud-hidden-fade \{ opacity: 0 !important; \}/);
    assert.doesNotMatch(flat(appCss), /body\.ghost-mode #mode-hud \{ display: none; \}/);
    assert.match(appJs, /const zoomHud = \$\('mode-hud'\);/);
    assert.match(appJs, /\{ el: \$\('mode-hud'\), hideClass: 'hud-hidden-fade', ghostOnly: true \}/);
  });
});

describe('modal flag ownership and save feedback', () => {
  it('watches every modal overlay so no open/close path can skip the flag', () => {
    assert.match(appJs, /const modalFlagObserver = new MutationObserver\(refreshModalOpenFlag\);/);
    assert.match(appJs, /function watchModalFlag\(el\)/);
    assert.match(appJs, /document\.querySelectorAll\('\.modal-overlay, #about-overlay'\)\.forEach\(watchModalFlag\);/);
    // Overlays built later (e.g. #about-overlay) get watched on insertion.
    assert.match(appJs, /new MutationObserver\(\(mutations\) => \{/);
    assert.match(appJs, /refreshModalOpenFlag\(\);/);
  });

  it('reports save success through the view HUD', () => {
    assert.match(appJs, /showModeHud\(lang === 'es' \? 'COPIA GUARDADA' : 'COPY SAVED'\);/);
    assert.match(appJs, /showModeHud\(lang === 'es' \? 'IMAGEN GUARDADA' : 'IMAGE SAVED'\);/);
    // Progress and errors stay as toasts.
    assert.match(appJs, /'GUARDANDO COPIA\.\.\.' : 'SAVING COPY\.\.\.', 'info'/);
    assert.match(appJs, /showToast\(result\.error \|\| 'ERROR', 'error'\);/);
  });

  it('lets the mode HUD manage its own visibility', () => {
    assert.match(flat(appCss), /#mode-hud\.hud-hidden-fade \{ opacity: 0 !important; \}/);
    assert.match(appJs, /if \(item\.el\.id === 'mode-hud'\) \{\s*return;/);
  });
});

describe('slideshow yields to dialogs and tray text legibility', () => {
  it('pauses a running slideshow while a dialog is open and resumes it after', () => {
    assert.match(appJs, /if \(anyOpen && !wasOpen\) pauseSlideshowForModal\(\);/);
    assert.match(appJs, /else if \(!anyOpen && wasOpen\) resumeSlideshowForModal\(\);/);
    assert.match(appJs, /function pauseSlideshowForModal\(\) \{\s*if \(state\.slideshowActive && state\.slideshowPlaying && !slideshowPausedByModal\) \{\s*pauseSlideshow\(\);/);
    assert.match(appJs, /function resumeSlideshowForModal\(\) \{\s*if \(!slideshowPausedByModal\) return;/);
    // A manual pause stays put: the dialog only reverts its own pause.
    assert.match(appJs, /slideshowPausedByModal = true;/);
    assert.match(appJs, /slideshowPausedByModal = false;/);
  });

  it('lifts the dim tray texts (version and empty state)', () => {
    assert.match(trayCss, /\.head-ver \{\s*font-size: 11px;\s*font-weight: 500;\s*color: var\(--text-muted\);/);
    assert.match(trayCss, /\.item-empty-label \{\s*font-style: italic;\s*color: var\(--text-muted\);/);
    assert.match(trayCss, /\.item-desc \{\s*font-size: 11px;\s*color: var\(--text-muted\);/);
  });
});
