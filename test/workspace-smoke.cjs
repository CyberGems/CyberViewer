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
    await waitFor(() => evaluate('return state.images.length === 3;'), 'folder scan');
    await evaluate("$('btn-next').click();");
    await loaded();
    assert.equal(await evaluate('return window.CVWorkspace.model.activeId;'), 'tab-1',
      'folder navigation must keep the current tab even when the target is already open');
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs[1].image.file.name;'), 'two.png');
    assert.equal(await evaluate("return document.querySelectorAll('.image-tab-shell.duplicate').length;"), 2);
    assert.equal(await evaluate("return $('tab-1').getAttribute('aria-label').includes('También abierto en otra pestaña');"), true);
    assert.equal(await evaluate("state.settings.app.language='en'; updateLanguage('en'); const translated=$('tab-1').getAttribute('aria-label').includes('Also open in another tab'); state.settings.app.language='es'; updateLanguage('es'); return translated;"), true);
    assert.equal(await evaluate("return $('nav-container').classList.contains('nav-useless');"), false);
    assert.equal(await evaluate("return getComputedStyle(document.querySelector('.image-tab-shell.duplicate .image-tab-duplicate')).display;"), 'flex');
    fs.writeFileSync(path.join(dataDir, 'duplicate-tabs.png'), (await win.webContents.capturePage()).toPNG());
    assert.equal(await evaluate(`const workspace=window.CVWorkspace, active=workspace.model.active;
      const reference=workspace.model.tabs.find(tab=>tab!==active &&
        window.CVTabs.pathKey(tab.image.file.path)===window.CVTabs.pathKey(active.image.file.path));
      reference.view.hasChanges=true;
      const result=await saveWorkspaceImage({filePath:active.image.file.path,buffer:''});
      reference.view.hasChanges=false;
      return result.success===false;`), true, 'saving must respect pending edits in another tab for the same file');
    await evaluate('window.CVWorkspace.imageBound(window.CVWorkspace.model.active.image);');
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 3,
      'binding a saved file must preserve other tabs showing that file');
    await evaluate("$('btn-prev').click();");
    await loaded();
    assert.equal(await evaluate("return document.querySelectorAll('.image-tab-shell.duplicate').length;"), 0);
    const smallPath = path.join(dataDir, 'capture-270x130.png');
    const largePath = path.join(dataDir, 'capture-2000x1200.png');
    for (const [file, width, height] of [[smallPath, 270, 130], [largePath, 2000, 1200]]) {
      fs.writeFileSync(file, nativeImage.createFromBitmap(Buffer.alloc(width * height * 4, 255), { width, height }).toPNG());
      await evaluate('await window.CVWorkspace.openFiles([{ path: ' + JSON.stringify(file) + ', name: ' + JSON.stringify(path.basename(file)) + ', size: 0 }]);');
      await loaded();
      const view = await evaluate(`return { mode: state.viewMode, zoom: state.zoom, original: getOriginalZoom(),
        bounds: mainImg.getBoundingClientRect().toJSON(), viewport: viewerFitSize(), dpr: window.devicePixelRatio };`);
      if (width === 270) {
        assert.equal(view.mode, 'original', 'small capture opens at 1:1');
        assert.ok(Math.abs(view.zoom - view.original) < 1e-6);
        assert.ok(Math.abs(view.bounds.width * view.dpr - width) < 2, 'capture pixels map to screen pixels');
        await evaluate("$('btn-fit-hud').click();");
        assert.equal(await evaluate('return state.viewMode === "fit" && state.zoom > getOriginalZoom();'), true,
          'explicit Fit may enlarge a small capture');
      } else {
        assert.equal(view.mode, 'fit', 'large capture opens fitted');
        assert.ok(view.zoom < view.original);
        assert.ok(view.bounds.width <= view.viewport.vw + 1 && view.bounds.height <= view.viewport.vh + 1);
      }
      await evaluate('window.CVWorkspace.closeTabs([window.CVWorkspace.model.activeId]);');
      await loaded();
      assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 3);
    }
    await evaluate("await window.CVWorkspace.activate('tab-1');"); await loaded();
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
    const footerTips = () => evaluate("return ['footer-size', 'footer-weight', 'footer-zoom'].map(id => {" +
      "const el = $(id); return { text: el.dataset.tooltip, whiteSpace: getComputedStyle(el, '::after').whiteSpace }; });");
    const spanishTips = await footerTips();
    assert.deepEqual(spanishTips.map(tip => tip.text), [
      'Dimensiones en píxeles ⋅ Clic para Propiedades',
      'Tamaño en disco ⋅ Clic para Propiedades',
      'Nivel de escala ⋅ 100% = 1:1'
    ]);
    assert.ok(spanishTips.every(tip => tip.whiteSpace === 'nowrap'));
    assert.equal(await evaluate("return $('img-dims').textContent;"), '120 × 80');
    const spanish = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dataDir, 'tabs-es.png'), spanish.toPNG());
    await evaluate("state.settings.app.language = 'en'; updateLanguage('en');");
    await evaluate('await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));');
    const englishTips = await footerTips();
    assert.deepEqual(englishTips.map(tip => tip.text), [
      'Dimensions in pixels ⋅ Click for Properties',
      'Size on disk ⋅ Click for Properties',
      'Scale level ⋅ 100% = 1:1'
    ]);
    assert.ok(englishTips.every(tip => tip.whiteSpace === 'nowrap'));
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
  } else if (phase === 'overflow') {
    await loaded();
    if (!win.isVisible()) win.show();
    await waitFor(() => win.isVisible(), 'overflow window visible');
    await evaluate('await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));');
    const position = await evaluate(`const list = $('image-tab-list');
      const active = list.querySelector('.image-tab-shell.active');
      const viewport = list.getBoundingClientRect();
      const tab = active.getBoundingClientRect();
      return { count: window.CVWorkspace.model.tabs.length, activeId: window.CVWorkspace.model.activeId,
        scrollLeft: list.scrollLeft, viewport: viewport.toJSON(), tab: tab.toJSON() };`);
    assert.equal(position.count, 40);
    assert.equal(position.activeId, 'tab-40');
    assert.equal(await evaluate(`const tabs=window.CVWorkspace.model.tabs;
      return tabs[0].image.file.path===tabs[38].image.file.path && tabs[0].image!==tabs[38].image &&
        document.querySelectorAll('.image-tab-shell.duplicate').length===2 &&
        $('tab-39').getAttribute('aria-label').includes(I18N[state.settings.app.language].tabs_also_open);`), true,
    'session restore retains independent tabs for the same local file');
    assert.ok(position.tab.left >= position.viewport.left - 1 && position.tab.right <= position.viewport.right + 1,
      'restored active tab should be visible in the tab strip: ' + JSON.stringify(position));
    const afterResize = await evaluate(`const list = $('image-tab-list');
      list.scrollLeft = 0;
      window.dispatchEvent(new Event('resize'));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const viewport = list.getBoundingClientRect();
      const tab = list.querySelector('.image-tab-shell.active').getBoundingClientRect();
      return { scrollLeft: list.scrollLeft, viewport: viewport.toJSON(), tab: tab.toJSON() };`);
    assert.ok(afterResize.tab.left >= afterResize.viewport.left - 1 && afterResize.tab.right <= afterResize.viewport.right + 1,
      'active tab should be visible after the strip is laid out again: ' + JSON.stringify(afterResize));
    console.log('PASS overflow: active tab remains visible after restoring 40 tabs and resizing');

    await waitFor(() => evaluate("return $('titlebar-filename').textContent === 'overflow-40.png';"),
      'title bar reflects the restored active file');
    const titleRegion = await evaluate("const el = $('titlebar-filename'); return {" +
      "tag: el.tagName, region: getComputedStyle(el).getPropertyValue('-webkit-app-region')," +
      "name: el.textContent, tooltip: el.dataset.tooltip, cursor: getComputedStyle(el).cursor };");
    assert.equal(titleRegion.tag, 'DIV');
    assert.equal(titleRegion.region, 'drag');
    assert.equal(titleRegion.name, 'overflow-40.png');
    assert.equal(titleRegion.tooltip, undefined, 'full title should not have a redundant tooltip');
    assert.equal(titleRegion.cursor, 'default');
    const clippedTitle = await evaluate(`const el = $('titlebar-filename');
      el.style.maxWidth = '60px';
      const base = el.querySelector('.titlebar-filename-base');
      return { clipped: base.scrollWidth > base.clientWidth + 1,
        title: el.getBoundingClientRect().toJSON() };`);
    assert.equal(clippedTitle.clipped, true);
    await waitFor(() => evaluate("return $('titlebar-filename').dataset.tooltip === 'overflow-40.png';"),
      'clipped filename tooltip appears after layout');
    const pointer = await evaluate('return window.electronAPI.getPointerInWindow();');
    assert.ok(Number.isFinite(pointer.x) && Number.isFinite(pointer.y),
      'native cursor coordinates should be available independently of title hover events');
    await evaluate(`if (restorePointerPending && restorePointerAnchor) {
      updateRestorePointerGuard({ screenX: restorePointerAnchor.screenX + 3, screenY: restorePointerAnchor.screenY });
    }`);
    assert.equal(await evaluate('return !!titlebarTooltipPoll;'), true);
    await evaluate('clearInterval(titlebarTooltipPoll); titlebarTooltipPoll = null;');
    const inside = { x: clippedTitle.title.x + clippedTitle.title.width / 2,
      y: clippedTitle.title.y + clippedTitle.title.height / 2, focused: true };
    await evaluate('updateTitlebarTooltipFromPointer(' + JSON.stringify(inside) + ');');
    await delay(300);
    await evaluate('updateTitlebarTooltipFromPointer(' + JSON.stringify(inside) + ');');
    const shown = await evaluate(`return { text: $('titlebar-tooltip')?.querySelector('.tt-label')?.textContent,
      visible: !$('titlebar-tooltip')?.hidden, anchor: ttAnchor?.id };`);
    assert.deepEqual(shown, { text: 'overflow-40.png', visible: true, anchor: 'titlebar-filename' });
    await waitFor(() => evaluate("return $('titlebar-tooltip').classList.contains('is-visible') && getComputedStyle($('titlebar-tooltip')).opacity === '1';"),
      'full filename card is painted');
    fs.writeFileSync(path.join(dataDir, 'title-tooltip.png'), (await win.webContents.capturePage()).toPNG());
    await evaluate('updateTitlebarTooltipFromPointer({ x: -1, y: -1, focused: true });');
    assert.equal(await evaluate("return $('titlebar-tooltip').hidden;"), true);
    await evaluate(`$('titlebar-filename').style.maxWidth = '';`);
    await waitFor(() => evaluate("return $('titlebar-filename').dataset.tooltip === undefined;"),
      'tooltip disappears when filename fits again');
    await evaluate("$('footer-size').click();");
    await waitFor(() => evaluate("return $('modal-properties').classList.contains('active');"),
      'footer still opens Properties');
    assert.equal(await evaluate("const button = $('props-close-btn'); return !button.hasAttribute('data-tooltip') && !button.hasAttribute('title');"), true,
      'Properties Close has no redundant tooltip');
    await evaluate("closeModal('modal-properties');");
    console.log('PASS title bar: document title uses the native drag region; Properties remain accessible from the footer');

    const mediaProperties = await evaluate(`const previousImages = state.images;
      const previousCurrent = state.current;
      const previousCurrentIdx = state.currentIdx;
      const samples = [
        { path: 'C:/test/sample.png', name: 'sample.png', kind: 'image' },
        { path: 'C:/test/sample.mp4', name: 'sample.mp4', kind: 'video' },
        { path: 'C:/test/sample.mp3', name: 'sample.mp3', kind: 'audio' },
        { path: 'https://www.youtube.com/watch?v=abcdefghijk&list=UU_x5XG1OV2P6uZZ5FSM9Ttw', name: 'Playlist video', kind: 'youtube' }
      ];
      const results = [];
      try {
        for (const sample of samples) {
          state.images = [{ file: { path: sample.path, name: sample.name }, w: 120, h: 80 }];
          state.current = 0;
          state.currentIdx = 0;
          syncEmptyState();
          $('titlebar-properties-btn').click();
          results.push({ kind: sample.kind,
            buttonVisible: !$('titlebar-properties-btn').hidden,
            modalOpen: $('modal-properties').classList.contains('active'),
            name: $('props-name').textContent,
            path: $('props-path').textContent,
            source: $('modal-properties').dataset.source,
            fileSizeHidden: $('props-size').closest('.props-row').hidden,
            nativeHidden: $('props-native-btn').hidden,
            youtubePreviewVisible: !$('props-youtube-preview').hidden });
          if (sample.kind !== 'youtube') closeModal('modal-properties');
        }
      } finally {
        state.images = previousImages;
        state.current = previousCurrent;
        state.currentIdx = previousCurrentIdx;
        syncEmptyState();
      }
      return results;`);
    assert.equal(mediaProperties.every(item => item.buttonVisible && item.modalOpen && item.name), true,
      'the title bar opens Properties for every media type');
    assert.equal(mediaProperties.slice(0, 3).every(item => item.source === 'file' && !item.fileSizeHidden && !item.nativeHidden && !item.youtubePreviewVisible), true,
      'local media retain file properties and native actions');
    assert.deepEqual(mediaProperties[3], {
      kind: 'youtube', buttonVisible: true, modalOpen: true, name: 'Playlist video',
      path: 'https://www.youtube.com/playlist?list=UU_x5XG1OV2P6uZZ5FSM9Ttw',
      source: 'youtube', fileSizeHidden: true, nativeHidden: true, youtubePreviewVisible: true
    }, 'YouTube Properties show the playlist link and hide file-only actions');
    await delay(350);
    fs.writeFileSync(path.join(dataDir, 'youtube-properties.png'), (await win.webContents.capturePage()).toPNG());
    await evaluate("closeModal('modal-properties');");
    console.log('PASS title bar Properties: image, video, audio and YouTube use relevant details');

    assert.equal(await evaluate("return state.settings.app.centerDropAction;"), 'new-tab');
    const centerLabel = await evaluate(`const rect = $('viewer-wrap').getBoundingClientRect();
      updateFileDropZone(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return $('drag-overlay-label').textContent;`);
    assert.equal(centerLabel, 'Open in new tabs');
    assert.equal(await evaluate("return getComputedStyle($('drag-overlay')).display;"), 'block');
    await evaluate('await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));');
    fs.writeFileSync(path.join(dataDir, 'viewer-file-drop.png'), (await win.webContents.capturePage()).toPNG());
    await evaluate('clearFileDropZone();');
    const centerFile = path.join(dataDir, 'center-drop.png');
    const stripFile = path.join(dataDir, 'strip-drop.png');
    const replacementFile = path.join(dataDir, 'replacement-drop.png');
    for (const file of [centerFile, stripFile, replacementFile]) fs.copyFileSync(path.join(dataDir, 'one.png'), file);
    await evaluate("const input = document.createElement('input'); input.type = 'file'; input.id = 'test-file-drop'; document.body.append(input);");
    win.webContents.debugger.attach('1.3');
    const { root } = await win.webContents.debugger.sendCommand('DOM.getDocument');
    const { nodeId } = await win.webContents.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: '#test-file-drop' });
    const nativeDrop = async (file, zone) => {
      await win.webContents.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files: [file] });
      await evaluate(`const transfer = new DataTransfer(); transfer.items.add($('test-file-drop').files[0]);
        const target = $('${zone}'); const rect = target.getBoundingClientRect();
        const x = '${zone}' === 'image-tabs' ? $('image-tab-list').children[2].getBoundingClientRect().left + 2 : rect.left + rect.width / 2;
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer,
          clientX: x, clientY: rect.top + rect.height / 2 }));`);
    };
    await nativeDrop(centerFile, 'viewer-wrap');
    await waitFor(() => evaluate('return window.CVWorkspace.model.active?.image.file.name === "center-drop.png";'), 'center drop active');
    await loaded();
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 41);
    assert.equal(await evaluate('return window.CVWorkspace.model.active.image.file.name;'), 'center-drop.png');
    await evaluate('await window.CVWorkspace.dropFiles([{ path: ' + JSON.stringify(centerFile) + ', name: "center-drop.png", size: 0 }], { insertAt: 1 });');
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 41);
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs[1].image.file.name;'), 'center-drop.png');
    const stripZone = await evaluate(`const bar = $('image-tabs').getBoundingClientRect();
      const shell = $('image-tab-list').children[2].getBoundingClientRect();
      const index = tabFileDropIndex(shell.left + 2);
      updateFileDropZone(shell.left + 2, bar.top + bar.height / 2);
      const marker = getComputedStyle($('tab-file-drop-marker')).display;
      return { index, marker };`);
    assert.deepEqual(stripZone, { index: 2, marker: 'block' });
    fs.writeFileSync(path.join(dataDir, 'tab-file-drop.png'), (await win.webContents.capturePage()).toPNG());
    await evaluate('clearFileDropZone();');
    await nativeDrop(stripFile, 'image-tabs');
    await waitFor(() => evaluate('return window.CVWorkspace.model.active?.image.file.name === "strip-drop.png";'), 'strip drop active');
    await loaded();
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs[2].image.file.name;'), 'strip-drop.png');
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 42);
    win.webContents.debugger.detach();
    await evaluate('state.settings.app.centerDropAction = "replace"; dropOnViewer([{ path: ' + JSON.stringify(replacementFile) + ', name: "replacement-drop.png", size: 0 }]);');
    await waitFor(() => evaluate('return window.CVWorkspace.model.active?.image.file.name === "replacement-drop.png";'), 'replacement drop active');
    await loaded();
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 42);
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs[2].image.file.name;'), 'replacement-drop.png');
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.some(tab => tab.image.file.name === "strip-drop.png");'), false);
    const replaceLabel = await evaluate(`const rect = $('viewer-wrap').getBoundingClientRect();
      updateFileDropZone(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const label = $('drag-overlay-label').textContent; clearFileDropZone(); return label;`);
    assert.equal(replaceLabel, 'Replace the current tab');
    const guardedFile = path.join(dataDir, 'guarded-drop.png');
    fs.copyFileSync(path.join(dataDir, 'one.png'), guardedFile);
    await evaluate('state.hasChanges = true; dropOnViewer([{ path: ' + JSON.stringify(guardedFile) + ', name: "guarded-drop.png", size: 0 }]);');
    assert.equal(await evaluate("return $('modal-cyber-confirm').classList.contains('active');"), true,
      'replacing an unsaved tab should require confirmation');
    await evaluate("$('btn-confirm-cancel').click(); state.hasChanges = false; window.CVWorkspace.model.active.view.hasChanges = false;");
    assert.equal(await evaluate('return window.CVWorkspace.model.active.image.file.name;'), 'replacement-drop.png');
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 42);
    await evaluate("openConfig(); $('cfg-drop-center-action').value = 'new-tab'; $('cfg-drop-center-action').dispatchEvent(new Event('change', { bubbles: true }));");
    await waitFor(() => evaluate("return state.settings.app.centerDropAction === 'new-tab';"), 'drop preference saved in UI');
    await waitFor(() => JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).app.centerDropAction === 'new-tab',
      'drop preference persisted to settings');
    fs.writeFileSync(path.join(dataDir, 'drop-setting.png'), (await win.webContents.capturePage()).toPNG());
    await evaluate("closeModal('modal-config');");
    console.log('PASS file drops: viewer preference, tab-strip insertion and replacement preserve tab order');
    win.webContents.send('window-restore');
    await waitFor(() => evaluate('return restorePointerPending && !!restorePointerAnchor;'), 'restore pointer guard armed');
    await evaluate(`clearInterval(restorePointerPoll);
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      ttShow($('win-min'));`);
    await delay(550);
    assert.equal(await evaluate(`return restorePointerPending && document.body.classList.contains('restore-pointer-pending') &&
      document.body.classList.contains('suppress-tooltips') && !document.querySelector('#titlebar-tooltip:not([hidden])');`), true,
    'synthetic pointer events and elapsed time do not expose the minimize tooltip');
    await evaluate('updateRestorePointerGuard({ screenX: restorePointerAnchor.screenX + 3, screenY: restorePointerAnchor.screenY });');
    assert.equal(await evaluate("return !restorePointerPending && !document.body.classList.contains('restore-pointer-pending');"), true,
      'physical pointer movement releases restore guard');
    console.log('PASS restore keeps minimize hover and tooltip hidden until physical pointer movement');
    const tabMediaIcons = await evaluate(`const model = window.CVWorkspace.model;
      const samples = [
        { path: 'C:/test/sample.png', name: 'sample.png', kind: 'image' },
        { path: 'C:/test/sample.mp4', name: 'sample.mp4', kind: 'video' },
        { path: 'C:/test/sample.mp3', name: 'sample.mp3', kind: 'audio' },
        { path: 'https://www.youtube.com/playlist?list=UU_x5XG1OV2P6uZZ5FSM9Ttw', name: 'YouTube playlist', kind: 'youtube' }
      ];
      const ids = samples.map(sample => model.open({ file: sample }, { activate: false }).id);
      window.CVWorkspace.render();
      const icons = ids.map((id, index) => {
        const icon = document.getElementById(id).querySelector('.image-tab-media-icon');
        return { kind: icon.dataset.mediaType, visible: !icon.hidden, svg: !!icon.querySelector('svg'), expected: samples[index].kind };
      });
      $('tab-switcher').hidden = true;
      $('image-tabs-list-btn').click();
      const pickerIcons = [...$('tab-switcher-list').querySelectorAll('.tab-switcher-item')].slice(-ids.length)
        .map((row, index) => ({ icon: !!row.querySelector('.tab-switcher-item-icon svg'),
          title: row.querySelector('.tab-switcher-item-name')?.textContent, expected: samples[index].name }));
      $('tab-switcher').hidden = true;
      ids.forEach(id => model.close(id, { remember: false }));
      window.CVWorkspace.render();
      return { icons, pickerIcons };`);
    assert.equal(tabMediaIcons.icons.every(icon => icon.kind === icon.expected && icon.visible && icon.svg), true,
      'all four tab media types have visible icons by default');
    assert.equal(tabMediaIcons.pickerIcons.every(row => row.icon && row.title === row.expected), true,
      'tab picker shows the same four icons beside their titles');
    await evaluate("openConfig(); $('cfg-tab-media-icons').click();");
    await waitFor(() => evaluate("return state.settings.app.showTabMediaIcons === false && [...document.querySelectorAll('.image-tab-media-icon')].every(icon => icon.hidden);"),
      'media icons hidden on existing tabs');
    await waitFor(() => JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).app.showTabMediaIcons === false,
      'media icon preference saved');
    assert.equal(await evaluate(`$('tab-switcher').hidden = true; $('image-tabs-list-btn').click();
      const hidden = [...$('tab-switcher-list').querySelectorAll('.tab-switcher-item-icon')].every(icon => icon.hidden);
      $('tab-switcher').hidden = true; return hidden;`), true,
    'tab picker respects the visibility setting');
    await evaluate("$('cfg-tab-media-icons').click(); closeModal('modal-config');");
    await waitFor(() => evaluate("return state.settings.app.showTabMediaIcons === true && [...document.querySelectorAll('.image-tab-media-icon')].every(icon => !icon.hidden);"),
      'media icons restored on existing tabs');
    console.log('PASS image, video, audio and YouTube tab icons and saved visibility preference');
    const headingState = await evaluate(`return {
      titles: [...document.querySelectorAll('.modal-overlay .modal-title')].map(el => getComputedStyle(el).textTransform),
      helpers: ['modal-config', 'modal-print-export', 'modal-properties', 'modal-resize', 'modal-adjust']
        .map(id => $(id).querySelector('.modal-subtitle')?.textContent),
      section: getComputedStyle($('modal-properties').querySelector('.props-section-label')).textTransform
    };`);
    assert.equal(headingState.titles.every(value => value === 'none'), true, 'modal titles use natural case');
    assert.equal(headingState.helpers.every(Boolean), true, 'tool modals include a short helper line');
    assert.equal(headingState.section, 'none', 'modal section titles use natural case');
    await evaluate("openConfig();");
    const originalWindowSize = win.getSize();
    win.setSize(1180, 700);
    const configHeaderGeometry = await evaluate(`return ['general', 'appearance', 'interface', 'slideshow', 'system', 'backup']
      .map(id => { setActiveConfigTab(id);
        const header = $('modal-config').querySelector('.modal-header').getBoundingClientRect();
        const body = $('modal-config').querySelector('.config-modal-body').getBoundingClientRect();
        return { id, headerHeight: header.height, bodyTop: body.top };
      });`);
    assert.equal(configHeaderGeometry.every(item =>
      Math.abs(item.headerHeight - configHeaderGeometry[0].headerHeight) < 1 &&
      Math.abs(item.bodyTop - configHeaderGeometry[0].bodyTop) < 1), true,
    `settings header should stay fixed across sections: ${JSON.stringify(configHeaderGeometry)}`);
    win.setSize(...originalWindowSize);
    const configTabGeometry = await evaluate(`return ['general', 'appearance', 'interface', 'slideshow', 'system', 'backup']
      .map(id => { setActiveConfigTab(id);
        const content = $('modal-config').querySelector('.config-content');
        const panel = $('config-tab-' + id).getBoundingClientRect();
        return { id, contentWidth: content.clientWidth, panelLeft: panel.left, panelWidth: panel.width };
      });`);
    const firstConfigTab = configTabGeometry[0];
    assert.equal(configTabGeometry.every(item => item.contentWidth === firstConfigTab.contentWidth &&
      Math.abs(item.panelLeft - firstConfigTab.panelLeft) < 1 &&
      Math.abs(item.panelWidth - firstConfigTab.panelWidth) < 1), true,
    `settings panels should not jump when their scrollbar appears: ${JSON.stringify(configTabGeometry)}`);
    await evaluate("setActiveConfigTab('general');");
    assert.equal(await evaluate(`return $('config-tab-general').querySelector('.config-row select')?.id;`),
      'cfg-lang', 'language selector is first in General');
    await evaluate("document.querySelector('#cfg-drop-center-action + .cfg-select-trigger').click();");
    assert.equal(await evaluate(`return document.querySelectorAll('#cfg-select-listbox [role="option"]').length;`),
      2, 'settings dropdown uses the themed option list');
    await new Promise(resolve => setTimeout(resolve, 80));
    fs.writeFileSync(path.join(dataDir, 'config-select-open.png'), (await win.webContents.capturePage()).toPNG());
    await evaluate(`document.querySelectorAll('#cfg-select-listbox [role="option"]')[1].click();`);
    await waitFor(() => evaluate("return $('cfg-drop-center-action').value === 'replace';"), 'custom dropdown updates the original select');
    await evaluate(`const trigger = document.querySelector('#cfg-drop-center-action + .cfg-select-trigger');
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));`);
    await waitFor(() => evaluate("return $('cfg-drop-center-action').value === 'new-tab';"), 'settings dropdown keyboard selection');
    await evaluate("document.querySelector('#cfg-lang + .cfg-select-trigger').click();");
    assert.equal(await evaluate("return document.querySelectorAll('#cfg-select-listbox [role=option]').length;"),
      2, 'language dropdown opens with two options');
    await evaluate("document.querySelectorAll('#cfg-select-listbox [role=option]')[1].click();");
    await waitFor(() => evaluate("return document.documentElement.lang === 'es';"), 'custom language dropdown switches to Spanish');
    await evaluate("document.querySelector('#cfg-lang + .cfg-select-trigger').click();");
    assert.equal(await evaluate("return document.querySelectorAll('#cfg-select-listbox [role=option]').length;"),
      2, 'language dropdown reopens after applying Spanish');
    await evaluate("document.querySelectorAll('#cfg-select-listbox [role=option]')[0].click();");
    await waitFor(() => evaluate("return document.documentElement.lang === 'en';"), 'custom language dropdown switches back to English');
    await evaluate("document.querySelector('#cfg-lang + .cfg-select-trigger').click();");
    assert.equal(await evaluate("return !!document.querySelector('#cfg-select-listbox');"), true,
      'language dropdown opens before Escape');
    await evaluate(`document.querySelector('#cfg-lang + .cfg-select-trigger')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));`);
    const escapeState = await evaluate(`return {
      menuClosed: !document.querySelector('#cfg-select-listbox'),
      modalOpen: $('modal-config').classList.contains('active'),
      focused: document.activeElement.className,
      expanded: document.querySelector('#cfg-lang + .cfg-select-trigger').getAttribute('aria-expanded')
    };`);
    assert.equal(escapeState.menuClosed && escapeState.modalOpen &&
      escapeState.focused.includes('cfg-select-trigger') && escapeState.expanded === 'false',
    true, `Escape closes the dropdown and restores focus: ${JSON.stringify(escapeState)}`);
    await new Promise(resolve => setTimeout(resolve, 220));
    fs.writeFileSync(path.join(dataDir, 'config-heading.png'), (await win.webContents.capturePage()).toPNG());
    await evaluate("closeModal('modal-config');");
    const closeAllCount = await evaluate('return window.CVWorkspace.model.tabs.length;');
    await evaluate("$('tab-switcher').hidden = true; $('image-tabs-list-btn').click(); $('tab-switcher-close-all').click();");
    fs.writeFileSync(path.join(dataDir, 'tab-close-confirm.png'), (await win.webContents.capturePage()).toPNG());
    assert.equal(await evaluate(`return !$('tab-switcher-close-confirm').hidden && $('tab-switcher-close-all').hidden &&
      $('tab-switcher-close-confirm-text').textContent.includes(String(window.CVWorkspace.model.tabs.length));`), true,
    'close-all opens an inline confirmation with the current tab count');
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), closeAllCount,
      'first click leaves all tabs open');
    await evaluate("$('tab-switcher-close-cancel').click();");
    assert.equal(await evaluate("return $('tab-switcher-close-confirm').hidden && !$('tab-switcher-close-all').hidden;"), true,
      'Cancel restores the close-all action');
    await evaluate("$('tab-switcher-close-all').click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));");
    assert.equal(await evaluate("return $('tab-switcher-close-confirm').hidden && !$('tab-switcher').hidden;"), true,
      'Escape dismisses only the inline confirmation');
    await evaluate("$('tab-switcher-close-all').click(); $('tab-switcher-close-confirm-btn').click();");
    await waitFor(() => evaluate("return window.CVWorkspace.model.tabs.length === 0 || $('modal-cyber-confirm').classList.contains('active');"),
      'close-all runs after inline confirmation');
    if (await evaluate("return $('modal-cyber-confirm').classList.contains('active');")) await evaluate("$('btn-confirm-ok').click();");
    await waitFor(() => evaluate('return window.CVWorkspace.model.tabs.length === 0;'), 'all tabs closed');
    console.log('PASS modal headings, stable settings layout, themed selectors, and inline close-all confirmation');
  }
  app.exit(0);
}).catch(error => { console.error(error.stack || error); app.exit(1); });
