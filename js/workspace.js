/* global state, I18N, $, mainImg, isElectron, mediaUrl, loadFiles,
   closeImage, clearViewer, mergeNeighbors, folderScanCache,
   folderDirFromPath, buildSidebar, showToast, showCyberConfirm,
   stopSlideshow, getOriginalZoom, viewerFitSize, updateSaveButton,
   updateHUDStates, syncFavoritesToggleButtonState,
   showCustomContextMenu, syncCurrentIndex, setCyberTooltip, ttBind */
'use strict';

// Tabs retain document metadata and compressed clipboard blobs, never a hidden
// full-resolution <img>, canvas, renderer process, or complete folder per tab.
window.CVWorkspace = (() => {
  const { TabModel, pathKey, defaultView } = window.CVTabs;
  const model = new TabModel();
  const ownedImages = new Set();
  let pendingView = null;
  let busy = false;
  let suspended = false;
  let ready = false;
  let sessionTimer = null;
  let sessionQueue = Promise.resolve();
  let lastSession = '';
  let saveErrorShown = false;
  let restoreEnabled = false;
  let allowUnload = false;
  let dragId = null;
  let deferredActivation = null;
  let pendingSuspend = false;
  let dialogDepth = 0;

  const text = key => (I18N[state.settings.app.language || 'en'] || I18N.en)[key];
  const edited = tab => tab.view.hasChanges || !tab.image.file.path;
  const retained = image => model.tabs.some(tab => tab.image === image) || model.closed.some(tab => tab.image === image);
  function release(image) {
    if (retained(image)) return;
    if (image.url?.startsWith('blob:')) URL.revokeObjectURL(image.url);
    ownedImages.delete(image);
  }
  function prune() { for (const image of ownedImages) release(image); }
  function clearPreloads() {
    for (const image of state.preloadCache.values()) {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute('src');
    }
    state.preloadCache.clear();
  }
  function capture() {
    const tab = model.active;
    if (!tab || state.images[state.current] !== tab.image || suspended || pendingView?.tab === tab) return;
    for (const key of Object.keys(defaultView())) tab.view[key] = state[key];
    tab.source = window.CVYouTubeSource.isYouTube(tab.image) ? 'youtube' : state.showingFavs ? 'favorites' : 'folder';
    tab.hiddenPaths = state.images.filter(image => image.hidden && image.file.path).map(image => image.file.path);
    tab.scrollTop = $('sidebar-scroll')?.scrollTop || 0;
  }
  function isEditing() {
    return busy || dialogDepth > 0 || state.isCropping || !!document.querySelector('.modal-overlay.active');
  }
  function canSwitch() {
    if (!isEditing()) return true;
    showToast(text('tabs_finish_edit'), 'info');
    return false;
  }
  function imageForFile(file) {
    const existing = model.findPath(file.path);
    if (existing) return existing.image;
    const image = { file, url: null, thumbUrl: null, w: 0, h: 0, loaded: false, size: file.size || 0, fromClipboard: !file.path };
    ownedImages.add(image);
    return image;
  }
  async function scan(tab, seq) {
    const filePath = tab.image.file.path;
    if (!isElectron || !filePath || window.CVYouTubeSource.isYouTube(filePath)) return;
    const dir = pathKey(folderDirFromPath(filePath));
    const cached = folderScanCache.get(dir);
    if (cached?.files && Date.now() - cached.scannedAt < 2000) {
      if (seq === state.openSeq && model.active === tab) { mergeNeighbors(cached.files, filePath, seq); restoreSidebar(tab); }
      return;
    }
    try {
      const neighbors = await window.electronAPI.scanFolder(filePath);
      if (seq !== state.openSeq || model.active !== tab) return;
      mergeNeighbors(neighbors, filePath, seq);
      const entry = folderScanCache.get(dir);
      if (entry) { entry.files = neighbors; entry.scannedAt = Date.now(); }
      restoreSidebar(tab);
    } catch (error) { console.error('Unable to scan tab folder:', error); }
  }
  function restoreSidebar(tab) {
    const hidden = new Set(tab.hiddenPaths.map(pathKey));
    state.images.forEach(image => { image.hidden = hidden.has(pathKey(image.file.path)) && image !== tab.image; });
    buildSidebar();
    if ($('sidebar-scroll')) $('sidebar-scroll').scrollTop = tab.scrollTop;
  }
  async function activate(id, { force = false, source } = {}) {
    const tab = model.tabs.find(item => item.id === id);
    if (!tab || (!force && model.active === tab && !suspended)) return !!tab;
    if (!force && !canSwitch()) return false;
    capture();
    if (model.active) { delete model.active.image.staticUrl; model.active.image.loaded = false; }
    clearViewer();
    model.activate(id);
    if (source) tab.source = source;
    suspended = false;
    tab.image.loaded = false; // Dimensions alone do not imply decoded pixels remain resident.
    pendingView = { tab, view: { ...tab.view } };
    const seq = state.openSeq;
    render();
    if (isElectron && tab.image.file.path && !window.CVYouTubeSource.isYouTube(tab.image)) {
      try {
        const result = await window.electronAPI.registerPaths([tab.image.file.path]);
        if (seq !== state.openSeq || model.active !== tab) return false;
        tab.image.unavailable = !result?.registered?.length;
      } catch (_) { tab.image.unavailable = true; }
    }
    if (seq !== state.openSeq || model.active !== tab) return false;
    loadFiles([tab.image.file], 0, true);
    if (tab.source === 'favorites') {
      const paths = state.settings.app.favorites || [];
      state.showingFavs = true;
      state.images = paths.map(filePath => pathKey(filePath) === pathKey(tab.image.file.path) ? tab.image :
        imageForFile({ path: filePath, name: filePath.split(/[\\/]/).pop(), size: 0 }));
      if (!state.images.includes(tab.image)) state.images.unshift(tab.image);
      syncCurrentIndex(state.images.indexOf(tab.image));
      syncFavoritesToggleButtonState();
      restoreSidebar(tab);
      if (isElectron && paths.length) {
        // A restored favorites list can span several directories. Register its
        // paths after starting the active image, then retry any early thumbs.
        window.electronAPI.registerPaths(paths).then(result => {
          if (seq !== state.openSeq || model.active !== tab) return;
          const registered = new Set((result.registered || []).map(pathKey));
          state.images.forEach(image => { if (registered.has(pathKey(image.file.path))) image.thumbFailed = false; });
          buildSidebar();
        }).catch(error => console.error('Unable to register favorite paths:', error));
      }
    } else {
      state.showingFavs = false;
      syncFavoritesToggleButtonState();
      void scan(tab, seq);
    }
    render();
    changed();
    return true;
  }
  async function openFiles(files, initialIdx = 0, options = {}) {
    const accepted = Array.from(files).filter(window.CVFormats.isSupportedFile);
    if (!accepted.length) return false;
    capture();
    let target;
    try {
      for (let index = 0; index < accepted.length; index++) {
        const file = accepted[index];
        const tab = model.open(imageForFile(file), { activate: false, source: options.source, view: options.view });
        if (index === initialIdx) target = tab;
      }
    } catch (error) {
      showToast(text('tabs_limit'), 'warning');
      console.error('Unable to open tabs:', error);
    }
    target ||= model.tabs[model.tabs.length - 1];
    if (target && ((busy && options.afterEdit) || dialogDepth > 0)) deferredActivation = target.id;
    if (target && options.activate !== false && !isEditing()) await activate(target.id, { force: true, source: options.source });
    else { render(); changed(); }
    prune();
    return !!target;
  }
  async function openPath(filePath, options = {}) {
    if (!filePath) return false;
    return openFiles([{ name: filePath.split(/[\\/]/).pop(), path: filePath, size: 0, type: '' }], 0, options);
  }
  async function openYouTube(value) {
    const source = window.CVYouTubeSource.parse(value);
    if (!source || !canSwitch()) return false;
    const existing = model.findPath(source.url);
    if (existing) {
      if (source.startSeconds || source.index) {
        const view = { videoTime: source.startSeconds, youtubeIndex: source.index, youtubeVideoId: source.videoId || '' };
        Object.assign(existing.view, view);
        if (model.active === existing) Object.assign(state, view);
      }
      return activate(existing.id, { force: true });
    }
    const file = { name: 'YouTube · ' + (source.videoId || source.playlistId), path: source.url, size: 0, youtube: source };
    const result = await openFiles([file], 0, { source: 'youtube', view: { videoTime: source.startSeconds, youtubeIndex: source.index, youtubeVideoId: source.videoId || '' } });
    return result;
  }
  // Folder browsing replaces only a clean tab. A pending edit/paste stays open;
  // a target already in the workspace is focused instead of duplicated.
  function beforeShow(image) {
    const tab = model.active;
    if (tab?.image === image) return true;
    if (busy) return false;
    if (tab && state.images[state.current] === tab.image) capture();
    const existing = model.findPath(image.file.path);
    if (existing && existing !== tab) { void activate(existing.id); return false; }
    if (!tab || edited(tab)) {
      void openFiles([image.file], 0, { source: state.showingFavs ? 'favorites' : 'folder' });
      return false;
    }
    const previous = tab.image;
    tab.image = image;
    ownedImages.add(image);
    tab.view = defaultView();
    tab.source = state.showingFavs ? 'favorites' : 'folder';
    release(previous);
    pendingView = null;
    render();
    changed();
    return true;
  }
  function viewFor(image) { return pendingView?.tab.image === image ? pendingView.view : null; }
  function restoreView(w, h) {
    if (!pendingView || model.active !== pendingView.tab) return false;
    Object.assign(state, pendingView.view);
    if (state.viewMode === 'fit' && w && h) {
      const { vw, vh } = viewerFitSize();
      state.zoom = Math.min(vw / w, vh / h);
    } else if (state.viewMode === 'original') state.zoom = getOriginalZoom();
    mainImg.style.transform = `rotate(${state.visualRotation}deg)`;
    pendingView = null;
    updateSaveButton();
    updateHUDStates();
    return true;
  }
  function confirmDiscard(tabs, callback) {
    capture();
    const pending = tabs.filter(edited);
    if (!pending.length) { callback(); return; }
    showCyberConfirm({ title: text('tabs_unsaved_title'), message: text('tabs_unsaved_message'),
      detail: pending.map(tab => tab.image.file.name).join('\n'), danger: false, onConfirm: callback });
  }
  function closeTabs(ids, { discard = false, remember = true } = {}) {
    if (!canSwitch()) return;
    const tabs = model.tabs.filter(tab => ids.includes(tab.id));
    const finish = () => {
      const previous = model.activeId;
      capture();
      for (const tab of tabs) {
        // Discard is explicit. Reopening must not resurrect a discarded edit.
        tab.view.currentRotation = 0; tab.view.visualRotation = 0; tab.view.hasChanges = false;
        model.close(tab.id, { remember });
      }
      if (previous !== model.activeId) {
        if (model.activeId) void activate(model.activeId, { force: true });
        else { clearViewer(); render(); changed(); }
      } else { render(); changed(); }
      prune();
    };
    if (discard) finish(); else confirmDiscard(tabs, finish);
  }
  function reopen() {
    if (!canSwitch()) return;
    capture();
    try {
      const tab = model.reopen();
      if (tab) void activate(tab.id, { force: true });
    } catch (_) { showToast(text('tabs_limit'), 'warning'); }
  }
  function cycle(offset) {
    if (!model.tabs.length) return;
    const index = model.tabs.findIndex(tab => tab.id === model.activeId);
    void activate(model.tabs[(index + offset + model.tabs.length) % model.tabs.length].id);
  }
  function contextMenu(id) {
    const index = model.tabs.findIndex(tab => tab.id === id);
    return [
      { label: text('tabs_close'), shortcut: 'Ctrl+W', icon: 'x', action: () => closeTabs([id]) },
      { label: text('tabs_close_others'), icon: 'x', enabled: model.tabs.length > 1,
        action: () => closeTabs(model.tabs.filter(tab => tab.id !== id).map(tab => tab.id)) },
      { label: text('tabs_close_right'), icon: 'x', enabled: index < model.tabs.length - 1,
        action: () => closeTabs(model.tabs.slice(index + 1).map(tab => tab.id)) },
      { label: text('tabs_close_all'), icon: 'x', action: () => closeTabs(model.tabs.map(tab => tab.id)) },
      { type: 'separator' },
      { label: text('tabs_reopen'), shortcut: 'Ctrl+Shift+T', icon: 'restore', enabled: model.closed.length > 0, action: reopen }
    ];
  }
  // Menu for right-clicks on the tab bar's empty strip (CyberFeeds pattern).
  function barMenu() {
    return [
      { label: text('menu_open'), shortcut: 'Ctrl+O', icon: 'image', action: () => window.openImageDialog && window.openImageDialog() },
      { label: text('menu_open_folder'), shortcut: 'Ctrl+Shift+F', icon: 'folder', action: () => window.openFolderDialog && window.openFolderDialog() },
      { type: 'separator' },
      { label: text('tabs_reopen'), shortcut: 'Ctrl+Shift+T', icon: 'restore', enabled: model.closed.length > 0, action: reopen },
      { label: text('tabs_close_all'), icon: 'x', enabled: model.tabs.length > 0, action: () => closeTabs(model.tabs.map(tab => tab.id)) }
    ];
  }
  // Show the edge navigation buttons only when the strip actually overflows,
  // and only on the side that still has hidden tabs.
  function syncTabOverflow() {
    const left = $('image-tabs-scroll-left');
    const right = $('image-tabs-scroll-right');
    const list = $('image-tab-list');
    if (!left || !right || !list) return;
    const overflowing = list.scrollWidth > list.clientWidth + 1;
    left.hidden = !overflowing || list.scrollLeft <= 1;
    right.hidden = !overflowing || list.scrollLeft >= list.scrollWidth - list.clientWidth - 1;
  }
  function render() {
    const bar = $('image-tabs');
    const list = $('image-tab-list');
    if (!bar || !list) return;
    bar.hidden = !model.tabs.length;
    document.body.classList.toggle('has-image-tabs', !!model.tabs.length);
    bar.setAttribute('aria-label', text('tabs_label'));
    const nodes = new Map([...list.children].map(node => [node.dataset.tabId, node]));
    let position = 0;
    for (const tab of model.tabs) {
      let shell = nodes.get(tab.id);
      if (!shell) {
        shell = document.createElement('div');
        shell.className = 'image-tab-shell';
        shell.setAttribute('role', 'presentation');
        shell.dataset.tabId = tab.id;
        shell.draggable = true;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'image-tab'; button.setAttribute('role', 'tab');
        button.id = tab.id; button.setAttribute('aria-controls', 'viewer-wrap');
        const dot = document.createElement('span'); dot.className = 'image-tab-dirty'; dot.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span'); label.className = 'image-tab-name';
        button.append(dot, label);
        button.addEventListener('focus', () => prepareTooltip(button));
        ttBind(button);
        button.addEventListener('click', () => void activate(tab.id));
        const close = document.createElement('button');
        close.type = 'button'; close.className = 'image-tab-close'; close.textContent = '×';
        close.addEventListener('click', () => closeTabs([tab.id]));
        shell.append(button, close);
        shell.addEventListener('auxclick', event => { if (event.button === 1) { event.preventDefault(); closeTabs([tab.id]); } });
        shell.addEventListener('contextmenu', event => showCustomContextMenu(event, 'tab', { id: tab.id }));
        shell.addEventListener('dragstart', event => {
          dragId = tab.id;
          event.dataTransfer.setData('application/x-cyberviewer-tab', tab.id);
          event.dataTransfer.effectAllowed = 'move';
        });
        shell.addEventListener('dragover', event => { if (dragId) { event.preventDefault(); shell.classList.add('tab-drop-target'); } });
        shell.addEventListener('dragleave', () => shell.classList.remove('tab-drop-target'));
        shell.addEventListener('drop', event => {
          if (!dragId) return;
          event.preventDefault(); event.stopPropagation();
          model.move(dragId, tab.id); dragId = null; render(); changed();
        });
        shell.addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.tab-drop-target').forEach(node => node.classList.remove('tab-drop-target')); });
      }
      nodes.delete(tab.id);
      const active = tab.id === model.activeId;
      shell.classList.toggle('active', active);
      shell.classList.toggle('dirty', edited(tab));
      const button = shell.querySelector('.image-tab');
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      const name = tab.image.file.name;
      button.setAttribute('aria-label', name + (edited(tab) ? ` (${text('tabs_unsaved')})` : ''));
      button.querySelector('.image-tab-name').textContent = name;
      shell.querySelector('.image-tab-close').setAttribute('aria-label', text('tabs_close_named').replace('{name}', name));
      shell.querySelector('.image-tab-close').tabIndex = active ? 0 : -1;
      if (list.children[position] !== shell) list.insertBefore(shell, list.children[position] || null);
      position++;
    }
    nodes.forEach(node => node.remove());
    const active = list.querySelector('.image-tab-shell.active');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('image-tabs-list-btn').setAttribute('aria-label', text('tabs_list').replace('{count}', model.tabs.length));
    $('image-tabs-count').textContent = model.tabs.length;
    $('image-tabs-open').setAttribute('aria-label', text('menu_open'));
    list.setAttribute('aria-label', text('tabs_label'));
    $('viewer-wrap').setAttribute('role', 'tabpanel');
    if (model.activeId) $('viewer-wrap').setAttribute('aria-labelledby', model.activeId);
    else $('viewer-wrap').removeAttribute('aria-labelledby');
    if (!$('tab-switcher').hidden) renderSwitcher();
    syncTabOverflow();
  }
  function prepareTooltip(button) {
    const label = button.querySelector('.image-tab-name');
    const tab = model.tabs.find(item => item.id === button.id);
    if (tab && label.scrollWidth > label.clientWidth) {
      setCyberTooltip(button, tab.image.file.path || tab.image.file.name);
    } else { button.classList.remove('cyber-tooltip'); delete button.dataset.tooltip; }
  }
  function renderSwitcher() {
    const query = $('tab-search').value.toLowerCase();
    $('tab-search').placeholder = text('tabs_search');
    $('tab-search').setAttribute('aria-label', text('tabs_search'));
    $('tab-switcher-count').textContent = model.tabs.length;
    $('tab-switcher-close-all').disabled = !model.tabs.length;
    const list = $('tab-switcher-list');
    list.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const tab of model.tabs) {
      if (!(tab.image.file.name + ' ' + (tab.image.file.path || '')).toLowerCase().includes(query)) continue;
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'tab-switcher-item';
      row.classList.toggle('active', tab.id === model.activeId);
      const name = document.createElement('span'); name.textContent = tab.image.file.name;
      const filePath = document.createElement('small'); filePath.textContent = tab.image.file.path || text('tabs_clipboard');
      row.append(name, filePath);
      row.addEventListener('click', () => { $('tab-switcher').hidden = true; void activate(tab.id); });
      fragment.append(row);
    }
    if (!fragment.childNodes.length) {
      const empty = document.createElement('p'); empty.className = 'tab-switcher-empty'; empty.textContent = text('tabs_search_empty'); fragment.append(empty);
    }
    list.append(fragment);
  }
  async function ensureDraft(tab) {
    const image = tab.image;
    if (image.file.path || image.draftId) return;
    if (!image.draftPromise) {
      image.draftPromise = (async () => {
        const url = image.url || URL.createObjectURL(image.file);
        let blob;
        try { blob = await (await fetch(url)).blob(); }
        finally { if (url !== image.url) URL.revokeObjectURL(url); }
        if (blob.type !== 'image/png') {
          const source = new Image();
          const temporary = URL.createObjectURL(blob);
          try {
            source.src = temporary; await source.decode();
            const canvas = document.createElement('canvas'); canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
            canvas.getContext('2d').drawImage(source, 0, 0);
            blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
          } finally { source.removeAttribute('src'); URL.revokeObjectURL(temporary); }
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const result = await window.electronAPI.saveSessionDraft(btoa(binary));
        if (!result.ok) throw new Error(result.error || 'DRAFT_SAVE_FAILED');
        image.draftId = result.id;
      })().finally(() => { delete image.draftPromise; });
    }
    await image.draftPromise;
  }
  function changed() {
    if (!ready || !isElectron || !state.settings.app.restoreSession) return;
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => void flush(), 400);
  }
  function flush() {
    clearTimeout(sessionTimer);
    sessionQueue = sessionQueue.catch(() => false).then(async () => {
      if (!ready || !isElectron || !state.settings.app.restoreSession) return true;
      capture();
      for (const tab of [...model.tabs]) await ensureDraft(tab);
      capture();
      const snapshot = model.snapshot();
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastSession) return true;
      const result = await window.electronAPI.saveSession(snapshot);
      if (!result.ok) throw new Error(result.error || 'SESSION_SAVE_FAILED');
      lastSession = serialized; saveErrorShown = false;
      return true;
    }).catch(error => {
      console.error('Unable to save workspace:', error);
      if (!saveErrorShown) showToast(text('tabs_session_save_error'), 'error', 5000);
      saveErrorShown = true;
      return false;
    });
    return sessionQueue;
  }
  function settingsChanged() {
    if (!ready || !isElectron) return;
    const enabled = state.settings.app.restoreSession === true;
    if (enabled === restoreEnabled) return;
    restoreEnabled = enabled;
    lastSession = '';
    if (enabled) changed();
    else {
      clearTimeout(sessionTimer);
      sessionQueue = sessionQueue.then(async () => {
        // Restored clipboard images may be served directly from a draft file.
        // Keep their bytes in memory before removing session-owned files.
        for (const tab of [...model.tabs, ...model.closed]) {
          const image = tab.image;
          if (!image.file.path && image.draftId && image.url && !image.url.startsWith('blob:')) {
            image.url = URL.createObjectURL(await (await fetch(image.url)).blob());
            image.thumbUrl = image.url;
          }
          delete image.draftId;
        }
        const result = await window.electronAPI.clearSession();
        if (!result.ok) throw new Error(result.error);
      }).catch(error => { console.error('Unable to clear saved session:', error); showToast(text('tabs_session_save_error'), 'error'); });
    }
  }
  async function restore() {
    restoreEnabled = state.settings.app.restoreSession === true;
    if (isElectron && restoreEnabled) {
      try {
        const result = await window.electronAPI.loadSession();
        if (!result.ok) showToast(text('tabs_session_load_error'), 'warning', 5000);
        if (result.recovered) showToast(text('tabs_session_recovered'), 'warning', 5000);
        for (const item of result.session.tabs) {
          const image = { file: { name: item.name || item.path?.split(/[\\/]/).pop() || text('tabs_clipboard'), path: item.path, size: 0 },
            draftId: item.draftId, url: item.draftPath ? mediaUrl(item.draftPath) : null,
            fromClipboard: !item.path, missingDraft: !item.path && !item.draftPath, loaded: false, w: 0, h: 0, size: 0 };
          ownedImages.add(image);
          const tab = model.open(image, { activate: false, view: item.view, source: item.source });
          tab.id = item.id; tab.hiddenPaths = item.hiddenPaths; tab.scrollTop = item.scrollTop;
        }
        model.nextId = Math.max(0, ...model.tabs.map(tab => Number(tab.id.slice(4)))) + 1;
        const target = model.tabs.find(tab => tab.id === result.session.activeId) || model.tabs[0];
        if (target) await activate(target.id, { force: true });
      } catch (error) { console.error('Unable to restore workspace:', error); showToast(text('tabs_session_load_error'), 'warning', 5000); }
    }
    ready = true;
    render();
    if (isElectron) window.electronAPI.workspaceReady();
  }
  async function edit(callback) {
    if (busy) return;
    busy = true;
    document.body.classList.add('workspace-busy');
    try {
      await callback();
      // Save handlers reload the shared image. Keep navigation locked until that
      // load has finished, including handlers that await path registration.
      if (mainImg.getAttribute('src') && !mainImg.complete) {
        try { await mainImg.decode(); } catch (_) { /* the normal image error UI remains responsible */ }
      }
      capture(); render(); changed();
    } finally {
      busy = false; document.body.classList.remove('workspace-busy');
      if (deferredActivation && !dialogDepth) {
        const id = deferredActivation; deferredActivation = null;
        await activate(id, { force: true });
      }
      if (pendingSuspend) suspend();
    }
  }
  async function dialog(callback) {
    dialogDepth++;
    try { return await callback(); }
    finally {
      dialogDepth--;
      if (!dialogDepth && !busy && deferredActivation) {
        const id = deferredActivation; deferredActivation = null;
        await activate(id, { force: true });
      }
      if (pendingSuspend) suspend();
    }
  }
  function suspend() {
    if (busy || state.isCropping || isEditing()) { pendingSuspend = true; return; }
    pendingSuspend = false;
    capture();
    window.CVYouTube.unload();
    window.CVVideo.unload();
    stopSlideshow({ silent: true });
    state.openSeq++; state.scanInProgress = false;
    clearPreloads();
    if (state.resolveMainImage) state.resolveMainImage();
    mainImg.onload = null; mainImg.onerror = null; mainImg.removeAttribute('src');
    $('sidebar-inner').replaceChildren();
    for (const tab of model.tabs) { delete tab.image.staticUrl; tab.image.loaded = false; }
    suspended = true;
    void flush();
  }
  function resume() { pendingSuspend = false; if (suspended && model.activeId) void activate(model.activeId, { force: true }); }
  function imageBound(image) {
    const tab = model.tabs.find(item => item.image === image);
    if (!tab) return;
    const duplicate = model.findPath(image.file.path);
    if (duplicate && duplicate !== tab) model.close(duplicate.id, { remember: false });
    folderScanCache.delete(pathKey(folderDirFromPath(image.file.path)));
    if (model.active === tab) buildSidebar();
    render(); changed();
  }
  async function relocate(id, filePath) {
    if (!canSwitch()) return;
    const tab = model.tabs.find(item => item.id === id);
    if (!tab) return;
    const result = await window.electronAPI.registerPaths([filePath]);
    if (!result.registered?.length || !model.tabs.includes(tab)) return;
    const existing = model.findPath(result.registered[0]);
    if (existing && existing !== tab) { await activate(existing.id); return; }
    tab.image.file = { name: result.registered[0].split(/[\\/]/).pop(), path: result.registered[0], size: 0 };
    tab.image.url = null; tab.image.unavailable = false; tab.image.missingDraft = false;
    delete tab.image.draftId;
    await activate(id, { force: true });
  }
  function fileDeleted(image) {
    capture();
    const key = pathKey(image.file.path);
    const neighbors = state.images.filter(item => item !== image && (!key || pathKey(item.file.path) !== key));
    const previous = model.activeId;
    for (const tab of [...model.tabs]) {
      if (tab.image === image || (key && pathKey(tab.image.file.path) === key)) model.close(tab.id, { remember: false });
    }
    model.closed = model.closed.filter(tab => tab.image !== image && (!key || pathKey(tab.image.file.path) !== key));
    if (key) folderScanCache.delete(pathKey(folderDirFromPath(image.file.path)));
    if (previous !== model.activeId) {
      if (!model.activeId && neighbors.length) model.open(neighbors[0]);
      if (model.activeId) void activate(model.activeId, { force: true });
      else { clearViewer(); render(); changed(); }
    } else {
      state.images = neighbors;
      syncCurrentIndex(state.images.indexOf(model.active?.image));
      buildSidebar(); changed();
    }
    prune();
  }
  function initialize() {
    const list = $('image-tab-list');
    list.addEventListener('wheel', event => {
      if (!event.ctrlKey && list.scrollWidth > list.clientWidth) { event.preventDefault(); list.scrollLeft += event.deltaY || event.deltaX; }
    }, { passive: false });
    list.addEventListener('pointerover', event => {
      const name = event.target.closest('.image-tab-name');
      if (!name) return;
      prepareTooltip(name.closest('.image-tab'));
    });
    list.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Delete'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (event.key === 'Delete') closeImage();
        else if (event.key === 'Home' || event.key === 'End') void activate(model.tabs[event.key === 'Home' ? 0 : model.tabs.length - 1].id);
        else cycle(event.key === 'ArrowLeft' ? -1 : 1);
        $(model.activeId)?.focus();
      }
    });
    $('image-tabs-list-btn').addEventListener('click', () => {
      const switcher = $('tab-switcher'); switcher.hidden = !switcher.hidden;
      if (!switcher.hidden) { $('tab-search').value = ''; renderSwitcher(); $('tab-search').focus(); }
    });
    $('image-tabs-open').addEventListener('click', () => window.openImageDialog && window.openImageDialog());
    $('tab-switcher-close-all').addEventListener('click', () => {
      $('tab-switcher').hidden = true;
      closeTabs(model.tabs.map(tab => tab.id));
    });
    const tabBar = $('image-tabs');
    const tabList = $('image-tab-list');
    // Double-click on the empty strip opens the file dialog, like a browser.
    tabBar.addEventListener('dblclick', (event) => {
      if ((event.target === tabBar || event.target === tabList) && window.openImageDialog) window.openImageDialog();
    });
    // Context menu for the empty strip (tab shells bind their own).
    tabBar.addEventListener('contextmenu', (event) => {
      if (event.target === tabBar || event.target === tabList) showCustomContextMenu(event, 'tab-bar', {});
    });
    $('image-tabs-scroll-left').addEventListener('click', () => tabList.scrollBy({ left: -tabList.clientWidth * 0.75, behavior: 'smooth' }));
    $('image-tabs-scroll-right').addEventListener('click', () => tabList.scrollBy({ left: tabList.clientWidth * 0.75, behavior: 'smooth' }));
    tabList.addEventListener('scroll', syncTabOverflow, { passive: true });
    window.addEventListener('resize', syncTabOverflow);
    $('btn-relocate-tab').addEventListener('click', async () => {
      const id = model.activeId;
      const result = await window.electronAPI.openFile();
      const filePath = Array.isArray(result) ? result[0] : result;
      if (filePath) await relocate(id, filePath);
    });
    $('tab-search').addEventListener('input', renderSwitcher);
    $('tab-search').addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); $('tab-switcher-list').querySelector('button')?.focus(); }
    });
    $('tab-switcher-list').addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const items = [...$('tab-switcher-list').querySelectorAll('button')];
        const index = items.indexOf(document.activeElement);
        items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
      }
    });
    document.addEventListener('pointerdown', event => { if (!event.target.closest('#tab-switcher, #image-tabs-list-btn')) $('tab-switcher').hidden = true; });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('tab-switcher').hidden) {
        event.preventDefault(); event.stopImmediatePropagation(); $('tab-switcher').hidden = true; $('image-tabs-list-btn').focus();
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key === 'Tab' || event.key.toLowerCase() === 'w' || (event.shiftKey && event.key.toLowerCase() === 't')) {
        if (event.target.closest('input, textarea, [contenteditable="true"]') && event.key !== 'Tab') return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === 'Tab') cycle(event.shiftKey ? -1 : 1);
        else if (event.key.toLowerCase() === 'w') closeImage();
        else reopen();
      }
    }, true);
    document.addEventListener('click', event => {
      if (busy && event.target.closest('#kbd-hint, #sidebar, #main-menu, .modal-overlay')) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
    window.addEventListener('pointerup', changed);
    window.addEventListener('wheel', changed, { passive: true });
    window.addEventListener('keyup', changed);
    window.addEventListener('beforeunload', event => {
      capture();
      if (allowUnload || !isElectron) return;
      event.returnValue = false;
      // Overlays that hold in-progress image work must not be dismissed by a
      // quit; chrome-only ones (config, properties, reminders) hold nothing,
      // so they are closed here instead of stalling the quit chain and
      // pulling the hidden window back on screen.
      if (busy || dialogDepth > 0 || state.isCropping ||
        document.querySelector('#modal-adjust.active, #modal-resize.active, #modal-print-export.active, #modal-youtube.active')) {
        showToast(text('tabs_finish_edit'), 'warning');
        return;
      }
      document.querySelectorAll('.modal-overlay.active').forEach(overlay => overlay.classList.remove('active'));
      const finish = async () => {
        if (state.settings.app.restoreSession && !(await flush())) return;
        allowUnload = true;
        window.electronAPI.finishWorkspaceClose();
      };
      confirmDiscard(model.tabs, () => void finish());
    });
    if (isElectron) window.electronAPI.onSuspendWorkspace(suspend);
    render();
  }
  return { model, get busy() { return busy; }, get ready() { return ready; }, capture, render,
    activate, openPath, openFiles, openYouTube, beforeShow, viewFor, restoreView, closeTabs, reopen,
    contextMenu, barMenu, clearPreloads, release, changed, flush, settingsChanged, restore, edit, dialog,
    suspend, resume, imageBound, relocate, fileDeleted, initialize, isEditing };
})();
