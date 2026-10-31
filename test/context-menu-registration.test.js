'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const mainJs = read('main.js');
const appJs = read('js/app.js');

describe('explorer context menu registration', () => {
  it('decorates image and video ProgIDs with the caption and icon', () => {
    assert.match(mainJs, /CONTEXT_MENU_PROGIDS = \[\s*'BMP Image', 'GIF Image', 'JPEG Image', 'PNG Image', 'WebP Image', 'TIFF Image', 'icofile',\s*'Video', 'CyberViewer\.video'/);
    assert.ok(mainJs.includes('const regPath = `HKCU\\\\Software\\\\Classes\\\\${progId}\\\\shell\\\\open`;'));
    assert.match(mainJs, /commands\.push\(\['reg', 'add', regPath, '\/ve', '\/d', assocLabel, '\/f'\]\);/);
    assert.match(mainJs, /commands\.push\(\['reg', 'add', regPath, '\/v', 'Icon', '\/d', exePath, '\/f'\]\);/);
  });

  it('writes the per-extension verb for every supported media type', () => {
    assert.match(mainJs, /const extensions = \[\.\.\.MEDIA_EXTS\];/);
    assert.ok(mainJs.includes('const regPath = `HKCU\\\\Software\\\\Classes\\\\SystemFileAssociations\\\\${ext}\\\\shell\\\\CyberViewer`;'));
  });

  it('removes the custom caption and icon on disable instead of leaving English text', () => {
    assert.match(mainJs, /commands\.push\(\['reg', 'delete', regPath, '\/ve', '\/f'\]\);/);
    assert.match(mainJs, /commands\.push\(\['reg', 'delete', regPath, '\/v', 'Icon', '\/f'\]\);/);
    assert.doesNotMatch(mainJs, /'add', regPath, '\/ve', '\/d', 'Open with CyberViewer'/);
  });

  it('records a registration marker with exe, language and version', () => {
    assert.ok(mainJs.includes("const CONTEXT_MENU_MARKER_KEY = 'HKCU\\\\Software\\\\CyberViewer\\\\ContextMenu';"));
    assert.match(mainJs, /function writeContextMenuMarker\(exePath, lang\)/);
    assert.ok(mainJs.includes("['reg', 'add', CONTEXT_MENU_MARKER_KEY, '/v', 'Exe', '/d', exePath, '/f']"));
    assert.ok(mainJs.includes("['reg', 'add', CONTEXT_MENU_MARKER_KEY, '/v', 'Version', '/d', app.getVersion(), '/f']"));
    assert.match(mainJs, /function deleteContextMenuMarker\(\)/);
  });

  it('re-registers on startup when the marker went stale', () => {
    assert.match(mainJs, /async function ensureContextMenuRegistration\(\)/);
    assert.match(mainJs, /markerExe === exePath && markerLang === lang && markerVersion === app\.getVersion\(\)/);
    assert.match(mainJs, /ensureContextMenuRegistration\(\);/);
  });

  it('re-registers when the language changes while the menu stays enabled', () => {
    assert.match(appJs, /const langChanged = prevContextMenu && contextMenuEnabled && lang !== prevLang;/);
    assert.match(appJs, /prevContextMenu !== contextMenuEnabled \|\| langChanged/);
  });
});
