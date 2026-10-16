'use strict';
// Run through scripts/test-workspace.cjs, never against the user's app data.
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const dataDir = process.env.CV_WORKSPACE_TEST_DIR;
if (!dataDir || !path.basename(dataDir).startsWith('cyberviewer-workspace-test-')) throw new Error('Isolated test directory required');
const phase = process.env.CV_WORKSPACE_TEST_PHASE;
app.setPath('userData', dataDir);
app.setName('CyberViewer Workspace Test');
process.argv.push('--startup');
const files = ['one.png', 'two.png', 'three #ñ %.png'].map(name => path.join(dataDir, name));
if (phase === 'initial') {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ app: {
    language: 'es', restoreSession: false, closeChoiceMade: true, closeToTray: false,
    checkUpdatesOnStartup: false, toggleHotkey: 'disabled', sidebarOpen: false, contextMenuEnabled: false,
    autoBackup: { enabled: false }
  }, window: { width: 1100, height: 760, maximized: false } }));
}
require('../main');
if (phase === 'forward') return;

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitFor(callback, description, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await callback();
    if (value) return value;
    await delay(40);
  }
  throw new Error('Timed out: ' + description);
}
app.whenReady().then(async () => {
  const win = await waitFor(() => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('CyberViewer.html')), 'main window');
  const evaluate = body => win.webContents.executeJavaScript('(async () => {' + body + '})()');
  const loaded = () => waitFor(() => evaluate('return window.CVWorkspace?.ready && !window.CVWorkspace.busy && mainImg.complete && mainImg.naturalWidth > 0 && !state.transitioning;'), 'active image decoded').catch(async error => {
    console.error(await evaluate("return { active: window.CVWorkspace.model.activeId, tabs: window.CVWorkspace.model.tabs.length, src: mainImg.src, complete: mainImg.complete, width: mainImg.naturalWidth, transitioning: state.transitioning, editing: window.CVWorkspace.isEditing(), errors: document.body.className };"));
    throw error;
  });
  await waitFor(() => evaluate('return window.CVWorkspace?.ready;'), 'workspace ready');
  if (phase === 'initial') {
    const bitmap = Buffer.alloc(120 * 80 * 4);
    for (let i = 0; i < bitmap.length; i += 4) {
      bitmap[i] = 100; bitmap[i + 1] = Math.floor(i / 4 / 120) * 3; bitmap[i + 2] = (i / 4 % 120) * 2; bitmap[i + 3] = 255;
    }
    const png = nativeImage.createFromBitmap(bitmap, { width: 120, height: 80 }).toPNG();
    for (const file of files) fs.writeFileSync(file, png);
    await evaluate('await window.CVWorkspace.openFiles(' + JSON.stringify(files.map(file => ({ path: file, name: path.basename(file), size: png.length }))) + ');');
    await loaded();
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 3);
    assert.equal(await evaluate('return mainImg.naturalWidth;'), 120);
    await evaluate("state.viewMode = 'custom'; state.zoom = 1.75; state.panX = 31; state.panY = -22; applyTransform(false); rotate(90); await window.CVWorkspace.activate('tab-2');");
    await loaded();
    let result = await evaluate('return { view: window.CVWorkspace.model.tabs[0].view, rotation: state.currentRotation };');
    assert.equal(result.view.zoom, 1.75); assert.equal(result.view.panX, 31); assert.equal(result.view.panY, -22);
    assert.equal(result.view.currentRotation, 90); assert.equal(result.rotation, 0);
    await evaluate("window.CVWorkspace.closeTabs(['tab-2']);");
    await loaded();
    await evaluate('window.CVWorkspace.reopen();');
    await loaded();
    assert.equal(await evaluate('return window.CVWorkspace.model.activeId;'), 'tab-2');
    await evaluate("window.CVWorkspace.model.move('tab-2', 'tab-1'); window.CVWorkspace.render();");
    await evaluate('await openImagePath(' + JSON.stringify(files[0].toUpperCase()) + ');');
    await loaded();
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 3);
    assert.equal(await evaluate('return state.currentRotation;'), 90);
    assert.equal(await evaluate('return state.panX;'), 31);

    // 150 background tabs must not create 150 full-resolution image elements.
    const bulkDir = path.join(dataDir, 'bulk'); fs.mkdirSync(bulkDir);
    const bulk = Array.from({ length: 150 }, (_, index) => ({ path: path.join(bulkDir, index + '.png'), name: index + '.png', size: png.length }));
    for (const file of bulk) fs.writeFileSync(file.path, png);
    await evaluate('await window.CVWorkspace.openFiles(' + JSON.stringify(bulk) + ', 0, { activate: false });');
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 153);
    assert.equal(await evaluate("return document.querySelectorAll('#main-img').length;"), 1);
    await evaluate("$('image-tabs-list-btn').click(); $('tab-search').value = '149.png'; $('tab-search').dispatchEvent(new Event('input'));");
    assert.equal(await evaluate("return $('tab-switcher-list').querySelectorAll('button').length;"), 1);
    await evaluate("$('tab-switcher').hidden = true; window.CVWorkspace.closeTabs(window.CVWorkspace.model.tabs.filter(tab => tab.image.file.path.includes('bulk')).map(tab => tab.id));");
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 3);

    // A queued opening must not retarget a document operation in flight.
    await evaluate('window._editPromise = window.CVWorkspace.edit(() => new Promise(resolve => { window._releaseEdit = resolve; }));');
    await evaluate('await openImagePath(' + JSON.stringify(files[2]) + ', { afterEdit: true });');
    assert.equal(await evaluate('return window.CVWorkspace.model.activeId;'), 'tab-1');
    await evaluate('window._releaseEdit(); await window._editPromise;');
    await loaded();
    assert.equal(await evaluate('return window.CVWorkspace.model.activeId;'), 'tab-3');
    await evaluate("await window.CVWorkspace.activate('tab-2');"); await loaded();
    await evaluate('rotate(90); await saveCurrent();'); await loaded();
    assert.deepEqual(nativeImage.createFromPath(files[1]).getSize(), { width: 80, height: 120 });
    assert.equal(await evaluate("return window.CVWorkspace.model.tabs.find(tab => tab.id === 'tab-1').view.currentRotation;"), 90);

    // File associations always forward to the resident window, even when an
    // obsolete multi-instance preference was saved by an older version.
    const oldSettings = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
    oldSettings.app.allowMultipleInstances = true;
    fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify(oldSettings));
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [__filename, files[2]], {
        env: { ...process.env, CV_WORKSPACE_TEST_PHASE: 'forward' }, windowsHide: true, stdio: 'ignore'
      });
      child.on('error', reject);
      child.on('exit', status => status === 0 ? resolve() : reject(new Error('Forwarding launch failed: ' + status)));
    });
    await waitFor(() => evaluate("return window.CVWorkspace.model.activeId === 'tab-3';"), 'second-instance forwarding');
    await loaded();
    assert.equal(BrowserWindow.getAllWindows().filter(window => window.webContents.getURL().includes('CyberViewer.html')).length, 1);
    await evaluate("await Promise.all(['tab-1', 'tab-2', 'tab-3', 'tab-1', 'tab-2'].map(id => window.CVWorkspace.activate(id)));");
    await loaded();
    assert.equal(await evaluate('return window.CVWorkspace.model.activeId;'), 'tab-2');
    assert.equal(await evaluate('return mainImg.naturalWidth;'), 80);
    await evaluate('rotate(90); rotate(90); rotate(90); rotate(90);');
    assert.equal(await evaluate('return state.hasChanges;'), false);
    await evaluate('window._dialogPromise = window.CVWorkspace.dialog(() => new Promise(resolve => { window._releaseDialog = resolve; }));');
    await evaluate('await openImagePath(' + JSON.stringify(files[2]) + ');');
    assert.equal(await evaluate('return window.CVWorkspace.model.activeId;'), 'tab-2');
    await evaluate('window._releaseDialog(); await window._dialogPromise;');
    await loaded();
    assert.equal(await evaluate('return window.CVWorkspace.model.activeId;'), 'tab-3');
    await evaluate("await window.CVWorkspace.activate('tab-2');"); await loaded();
    const originalBytes = fs.readFileSync(files[0]);
    await evaluate('await saveAsPath(' + JSON.stringify(files[0]) + ');');
    assert.deepEqual(fs.readFileSync(files[0]), originalBytes);
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 3);

    const finishCopy = async expectedSize => {
      await waitFor(() => evaluate('return !window.CVWorkspace.busy && window.CVWorkspace.model.tabs.length === 4;'), 'copy tab');
      await loaded();
      const copy = await evaluate('return window.CVWorkspace.model.active.image.file.path;');
      assert.deepEqual(nativeImage.createFromPath(copy).getSize(), expectedSize);
      await evaluate('closeImage();');
      await evaluate("await window.CVWorkspace.activate('tab-2');"); await loaded();
    };
    await evaluate('await flipImage("h");');
    await finishCopy({ width: 80, height: 120 });
    await evaluate("openResizeModal(); $('resize-width').value = '60'; $('resize-height').value = '40'; $('cfg-resize-copy').checked = true; updateResizeSaveEnabled(state.images[state.current]); $('btn-confirm-resize').click();");
    await finishCopy({ width: 60, height: 40 });
    await evaluate("openAdjustModal(); $('adj-brightness').value = '30'; $('adj-brightness').dispatchEvent(new Event('input')); $('cfg-adjust-copy').checked = true; $('btn-confirm-adjust').click();");
    await finishCopy({ width: 80, height: 120 });
    await evaluate('startCrop();');
    await waitFor(() => evaluate('return state.isCropping && cropState.active && cropState.imgRealRect?.w > 0;'), 'crop geometry');
    await evaluate("cropState.x = cropState.imgRealRect.x; cropState.y = cropState.imgRealRect.y; cropState.w = cropState.imgRealRect.w / 2; cropState.h = cropState.imgRealRect.h / 2; updateCropUI(); $('cfg-crop-copy').checked = true; $('btn-crop-confirm').click();");
    await finishCopy({ width: 40, height: 60 });
    await evaluate("startCrop(); exitCropMode(); await window.CVWorkspace.activate('tab-3');"); await loaded();
    await delay(300);
    assert.equal(await evaluate('return state.isCropping;'), false);

    await evaluate('state.settings.app.favorites = ' + JSON.stringify([files[1], files[2]]) + '; await toggleFavoritesView();');
    await loaded();
    assert.equal(await evaluate('return state.showingFavs;'), true);
    assert.equal(await evaluate('return state.images.length;'), 2);
    await evaluate('await toggleFavoritesView();'); await loaded();
    assert.equal(await evaluate('return state.showingFavs;'), false);

    await evaluate("openConfig(); $('cfg-restore-session').click();");
    await waitFor(() => evaluate('return state.settings.app.restoreSession === true;'), 'session preference autosave');
    await evaluate("closeModal('modal-config');");
    await evaluate("const bytes = Uint8Array.from(atob('" + png.toString('base64') + "'), value => value.charCodeAt(0)); await insertPastedImage(new Blob([bytes], { type: 'image/png' }));");
    await loaded();
    assert.equal(await evaluate('return await window.CVWorkspace.flush();'), true);
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'session.json'), 'utf8'));
    assert.equal(saved.tabs.length, 4);
    assert.ok(saved.tabs.find(tab => !tab.path).draftId);
    assert.equal(saved.tabs.find(tab => tab.id === 'tab-1').view.currentRotation, 90);
    fs.writeFileSync(path.join(dataDir, 'expected-session.json'), JSON.stringify(saved));
    console.log('PASS initial: independent views/edits, 153 tabs/search, close/reopen/reorder, single-instance forwarding, rapid switches, save conflicts, rotation/flip/resize/adjust/crop, favorites, clipboard session');
  } else if (phase === 'restore') {
    await loaded();
    const expected = JSON.parse(fs.readFileSync(path.join(dataDir, 'expected-session.json'), 'utf8'));
    assert.deepEqual(await evaluate('return window.CVWorkspace.model.tabs.map(tab => tab.id);'), expected.tabs.map(tab => tab.id));
    assert.equal(await evaluate('return window.CVWorkspace.model.activeId;'), expected.activeId);
    assert.equal(await evaluate('return window.CVWorkspace.model.active.image.fromClipboard;'), true);
    assert.equal(await evaluate('return mainImg.naturalWidth;'), 120);
    await evaluate("await window.CVWorkspace.activate('tab-1');"); await loaded();
    assert.equal(await evaluate('return state.currentRotation;'), 90);
    assert.equal(await evaluate('return state.zoom;'), 1.75);
    assert.equal(await evaluate('return state.panX;'), 31);
    assert.equal(await evaluate('return state.panY;'), -22);
    await evaluate("await window.CVWorkspace.activate('tab-3');");
    await waitFor(() => evaluate("return document.body.classList.contains('image-error');"), 'missing file error');
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 4);
    assert.equal(await evaluate("return $('btn-relocate-tab').hidden;"), false);
    await evaluate("await window.CVWorkspace.relocate('tab-3', " + JSON.stringify(path.join(dataDir, 'three-moved.png')) + ');'); await loaded();
    assert.equal(await evaluate('return window.CVWorkspace.model.activeId;'), 'tab-3');
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 4);

    // Hiding to tray unloads pixels, preserving all tabs and pending state.
    await evaluate('window.CVWorkspace.suspend();');
    assert.equal(await evaluate("return mainImg.getAttribute('src');"), null);
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 4);
    await evaluate('window.CVWorkspace.resume();'); await loaded();
    await evaluate('await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));');
    const spanish = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dataDir, 'tabs-es.png'), spanish.toPNG());
    await evaluate("state.settings.app.language = 'en'; updateLanguage('en');");
    await evaluate('await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));');
    const english = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dataDir, 'tabs-en.png'), english.toPNG());

    await evaluate("openConfig(); $('cfg-restore-session').click();");
    await waitFor(() => evaluate('return state.settings.app.restoreSession === false;'), 'disable session preference');
    await evaluate("closeModal('modal-config'); await window.CVWorkspace.flush();");
    assert.equal(fs.existsSync(path.join(dataDir, 'session.json')), false);
    await evaluate('await window.CVWorkspace.activate(' + JSON.stringify(expected.activeId) + ');'); await loaded();
    assert.equal(await evaluate('return mainImg.naturalWidth;'), 120);
    await evaluate('closeImage();');
    assert.equal(await evaluate("return $('modal-cyber-confirm').classList.contains('active');"), true);
    await evaluate("$('btn-confirm-cancel').click();");
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 4);
    win.close();
    await waitFor(() => evaluate("return $('modal-cyber-confirm').classList.contains('active');"), 'quit confirmation');
    await evaluate("$('btn-confirm-cancel').click();");
    assert.equal(win.isDestroyed(), false);
    console.log('PASS restore: actual restart, clipboard pixels, pending rotation/viewport, missing-file relocation, tray unloading, EN/ES screenshots, disable without data loss, close/quit cancellation');
  }
  app.exit(0);
}).catch(error => { console.error(error.stack || error); app.exit(1); });
