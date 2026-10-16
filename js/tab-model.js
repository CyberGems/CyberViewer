(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CVTabs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_TABS = 2000;
  function pathKey(value) {
    return typeof value === 'string' ? value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() : '';
  }
  function defaultView() {
    return { viewMode: 'fit', selectedViewMode: 'fit', zoom: 1, panX: 0, panY: 0,
      currentRotation: 0, visualRotation: 0, hasChanges: false, videoTime: 0 };
  }
  function cleanView(value = {}) {
    const result = defaultView();
    for (const key of ['viewMode', 'selectedViewMode']) {
      if (['fit', 'original', 'custom'].includes(value[key])) result[key] = value[key];
    }
    for (const key of ['zoom', 'panX', 'panY']) {
      if (Number.isFinite(value[key])) result[key] = key === 'zoom'
        ? Math.min(20, Math.max(0.05, value[key])) : Math.min(1e7, Math.max(-1e7, value[key]));
    }
    if (Number.isFinite(value.currentRotation) && value.currentRotation % 90 === 0) {
      result.currentRotation = ((value.currentRotation % 360) + 360) % 360;
    }
    result.visualRotation = result.currentRotation;
    result.hasChanges = result.currentRotation !== 0;
    if (Number.isFinite(value.videoTime)) result.videoTime = Math.max(0, Math.min(1e9, value.videoTime));
    return result;
  }
  class TabModel {
    constructor() {
      this.tabs = [];
      this.activeId = null;
      this.closed = [];
      this.nextId = 1;
    }
    get active() { return this.tabs.find(tab => tab.id === this.activeId) || null; }
    findPath(filePath) {
      const key = pathKey(filePath);
      return key ? this.tabs.find(tab => pathKey(tab.image.file.path) === key) : null;
    }
    open(image, { activate = true, view, source = 'folder' } = {}) {
      let tab = this.findPath(image.file.path);
      if (!tab) {
        if (this.tabs.length >= MAX_TABS) throw new Error('TAB_LIMIT');
        tab = { id: `tab-${this.nextId++}`, image, view: cleanView(view), source,
          hiddenPaths: [], scrollTop: 0 };
        this.tabs.push(tab);
      }
      if (activate) this.activeId = tab.id;
      return tab;
    }
    activate(id) {
      if (!this.tabs.some(tab => tab.id === id)) return false;
      this.activeId = id;
      return true;
    }
    close(id, { remember = true } = {}) {
      const index = this.tabs.findIndex(tab => tab.id === id);
      if (index < 0) return null;
      const [tab] = this.tabs.splice(index, 1);
      if (remember) {
        this.closed.push(tab);
        if (this.closed.length > 20) this.closed.shift();
      }
      if (this.activeId === id) this.activeId = this.tabs[Math.min(index, this.tabs.length - 1)]?.id || null;
      return tab;
    }
    reopen() {
      const tab = this.closed.pop();
      if (!tab) return null;
      const existing = this.findPath(tab.image.file.path);
      if (existing) { this.activeId = existing.id; return existing; }
      if (this.tabs.length >= MAX_TABS) { this.closed.push(tab); throw new Error('TAB_LIMIT'); }
      this.tabs.push(tab);
      this.activeId = tab.id;
      return tab;
    }
    move(id, beforeId) {
      if (id === beforeId) return false;
      const index = this.tabs.findIndex(tab => tab.id === id);
      if (index < 0 || (beforeId && !this.tabs.some(tab => tab.id === beforeId))) return false;
      const [tab] = this.tabs.splice(index, 1);
      const target = beforeId ? this.tabs.findIndex(item => item.id === beforeId) : this.tabs.length;
      this.tabs.splice(target, 0, tab);
      return true;
    }
    snapshot() {
      return { version: 1, activeId: this.activeId, tabs: this.tabs.map(tab => ({
        id: tab.id, path: tab.image.file.path || null, draftId: tab.image.draftId || null,
        name: tab.image.file.name, view: cleanView(tab.view), source: tab.source,
        hiddenPaths: tab.hiddenPaths, scrollTop: tab.scrollTop
      })) };
    }
  }
  return { TabModel, MAX_TABS, pathKey, defaultView, cleanView };
});
