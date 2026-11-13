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
    assert.match(html, /id="btn-drop-youtube"[^>]*data-i18n="drop_youtube"/);
    assert.match(appJs, /const btnDropYoutube = \$\('btn-drop-youtube'\);/);
    assert.match(appJs, /window\.CVYouTube\.openDialog\(\)/);
  });

  it('labels Paste as images-only, in both languages', () => {
    assert.match(html, /id="btn-drop-paste"[^>]*>Pegar imagen · Ctrl\+V</);
    for (const lang of ['en', 'es']) {
      assert.match(ui[lang].drop_paste, /image|imagen/i);
      assert.ok(typeof ui[lang].drop_youtube === 'string' && ui[lang].drop_youtube.length > 0);
    }
  });

  it('stacks the primary button above the secondary pair, with a hotkey hint', () => {
    // Short label + hint, since the formats are now shown on the icon flyout.
    assert.match(html, /id="btn-drop-open"[^>]*><span data-i18n="drop_btn">Abrir<\/span><span class="drop-btn-hint" data-i18n="drop_open_hint">Ctrl\+O<\/span>/);
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
