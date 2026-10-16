const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

/** Extract a top-level function body by name (up to the next `function `). */
function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found`);
  const end = src.indexOf('\nfunction ', start + 1);
  return end === -1 ? src.slice(start) : src.slice(start, end);
}

describe('sidebar startup preference (manual vs external open)', () => {
  it('setSidebarOpen only persists when persist is not disabled', () => {
    const code = extractFunction(appJs, 'setSidebarOpen');
    assert.match(code, /function setSidebarOpen\(open, opts = \{\}\)/);
    assert.match(code, /const persist = opts\.persist !== false;/);
    assert.match(code, /if \(persist && state\.settings && state\.settings\.app\) \{/);
    assert.match(code, /state\.settings\.app\.sidebarOpen = state\.sidebarOpen;/);
  });

  it('ensureSidebarOpen expands without persisting the startup preference', () => {
    const code = extractFunction(appJs, 'ensureSidebarOpen');
    assert.match(code, /setSidebarOpen\(true, \{ persist: false \}\)/);
  });

  it('the user handle toggle keeps persisting the preference', () => {
    const handleStart = appJs.indexOf("sidebarHandleEl.addEventListener('click'");
    assert.ok(handleStart >= 0);
    const code = appJs.slice(handleStart, appJs.indexOf('});', handleStart) + 3);
    assert.match(code, /setSidebarOpen\(!state\.sidebarOpen\)/);
  });

  it('favorites view expands the sidebar without going through the handle click', () => {
    const favStart = appJs.indexOf("case 'favorites-view':");
    assert.ok(favStart >= 0);
    const code = appJs.slice(favStart, appJs.indexOf('break;', favStart));
    assert.match(code, /ensureSidebarOpen\(\)/);
    assert.doesNotMatch(code, /sidebar-handle'\)\.click\(\)/);
  });

  it('external open (onOpenFile) never forces the sidebar open', () => {
    const onOpenFile = appJs.indexOf('window.electronAPI.onOpenFile(');
    assert.ok(onOpenFile >= 0);
    const code = appJs.slice(onOpenFile, appJs.indexOf('});', onOpenFile) + 3);
    assert.match(code, /if \(paths\.length\) await window\.CVWorkspace\.openFiles\(/);
    assert.doesNotMatch(code, /openSidebar/);
  });

  it('openImagePath only opens the sidebar when explicitly asked', () => {
    const code = extractFunction(appJs, 'openImagePath');
    assert.match(code, /if \(opts\.openSidebar\) ensureSidebarOpen\(\);/);
  });

  it('main.js forces the sidebar closed only for launches without a file argument', () => {
    const start = mainJs.indexOf("ipcMain.handle('get-settings'");
    assert.ok(start >= 0);
    const end = mainJs.indexOf("ipcMain.handle('get-version'", start);
    assert.ok(end > start);
    const code = mainJs.slice(start, end);
    // The only sidebarOpen assignment must sit inside the no-file-argument branch,
    // so external launches (double-click from a file manager) keep the persisted value.
    const assignments = code.match(/settings\.app\.sidebarOpen/g) || [];
    assert.equal(assignments.length, 1);
    assert.match(code, /\/\/ Manual launch[\s\S]*?if \(!instanceHasInitialFile && settings\.app\)/);
    assert.match(code, /settings\.app\.sidebarOpen = false;\s*\n\s*\}\s*\n\s*return settings;/);
  });

  it('applySettings applies the sidebar state from settings at startup', () => {
    const code = extractFunction(appJs, 'applySettings');
    assert.match(code, /state\.sidebarOpen = !!s\.sidebarOpen;/);
    assert.match(code, /sidebar\.style\.display = state\.sidebarOpen \? '' : 'none';/);
  });
});
