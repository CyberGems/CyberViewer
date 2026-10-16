'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MAX_TABS, cleanView, pathKey } = require('../js/tab-model');

const MAX_SESSION_BYTES = 8 * 1024 * 1024;
const MAX_DRAFT_BYTES = 64 * 1024 * 1024;
const DRAFT_ID = /^[a-f0-9-]{36}\.png$/;
const isAbsolute = value => typeof value === 'string' && value.length <= 4096 &&
  !value.includes('\0') && (path.win32.isAbsolute(value) || path.posix.isAbsolute(value));

function sanitizeSession(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.tabs) || input.tabs.length > MAX_TABS) {
    throw new Error('INVALID_SESSION');
  }
  const paths = new Set();
  const ids = new Set();
  const tabs = input.tabs.map((item, index) => {
    if (!item || (!isAbsolute(item.path) && !DRAFT_ID.test(item.draftId || ''))) throw new Error('INVALID_SESSION_TAB');
    const id = typeof item.id === 'string' && /^tab-\d+$/.test(item.id) ? item.id : `tab-${index + 1}`;
    if (ids.has(id)) throw new Error('DUPLICATE_SESSION_ID');
    ids.add(id);
    const key = isAbsolute(item.path) ? pathKey(item.path) : `draft:${item.draftId}`;
    if (paths.has(key)) throw new Error('DUPLICATE_SESSION_PATH');
    paths.add(key);
    return { id, path: isAbsolute(item.path) ? item.path : null,
      draftId: !isAbsolute(item.path) ? item.draftId : null,
      name: typeof item.name === 'string' ? item.name.slice(0, 512) : '',
      view: cleanView(item.view || {}), source: item.source === 'favorites' ? 'favorites' : 'folder',
      hiddenPaths: Array.isArray(item.hiddenPaths) ? item.hiddenPaths.filter(isAbsolute).slice(0, 5000) : [],
      scrollTop: Number.isFinite(item.scrollTop) ? Math.max(0, item.scrollTop) : 0 };
  });
  return { version: 1, activeId: tabs.some(tab => tab.id === input.activeId) ? input.activeId : tabs[0]?.id || null, tabs };
}

class SessionStore {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'session.json');
    this.draftDir = path.join(dataDir, 'session-images');
  }
  read() {
    let failed = false;
    for (const file of [this.file, this.file + '.bak']) {
      if (!fs.existsSync(file)) continue;
      try {
        if (fs.statSync(file).size > MAX_SESSION_BYTES) throw new Error('SESSION_TOO_LARGE');
        return { ok: true, session: sanitizeSession(JSON.parse(fs.readFileSync(file, 'utf8'))), recovered: failed };
      } catch (_) { failed = true; }
    }
    return { ok: !failed, session: { version: 1, activeId: null, tabs: [] }, recovered: false };
  }
  write(input) {
    const session = sanitizeSession(input);
    const text = JSON.stringify(session);
    if (Buffer.byteLength(text) > MAX_SESSION_BYTES) throw new Error('SESSION_TOO_LARGE');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    // Preserve the last valid snapshot. A damaged file must never replace it.
    if (fs.existsSync(this.file)) {
      let valid = false;
      try {
        if (fs.statSync(this.file).size <= MAX_SESSION_BYTES) {
          sanitizeSession(JSON.parse(fs.readFileSync(this.file, 'utf8')));
          valid = true;
        }
      } catch (_) { /* retain the previous valid backup */ }
      if (valid) fs.copyFileSync(this.file, this.file + '.bak');
    }
    const temporary = this.file + '.tmp';
    const fd = fs.openSync(temporary, 'w');
    try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, this.file);
    return session;
  }
  saveDraft(base64) {
    if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_DRAFT_BYTES * 4 / 3) + 4) throw new Error('INVALID_DRAFT');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_DRAFT_BYTES || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new Error('INVALID_DRAFT');
    }
    fs.mkdirSync(this.draftDir, { recursive: true });
    const id = crypto.randomUUID() + '.png';
    fs.writeFileSync(path.join(this.draftDir, id), buffer, { flag: 'wx' });
    return id;
  }
  draftPath(id) {
    if (!DRAFT_ID.test(id || '')) return null;
    const file = path.join(this.draftDir, id);
    try { return fs.statSync(file).isFile() ? file : null; } catch (_) { return null; }
  }
  clear() {
    // Only remove files owned by the session feature, never other app data.
    for (const suffix of ['', '.bak', '.tmp']) {
      fs.rmSync(this.file + suffix, { force: true });
    }
    if (fs.existsSync(this.draftDir)) {
      for (const name of fs.readdirSync(this.draftDir)) {
        if (DRAFT_ID.test(name)) fs.rmSync(path.join(this.draftDir, name), { force: true });
      }
    }
  }
}

module.exports = { SessionStore, sanitizeSession, MAX_SESSION_BYTES, MAX_DRAFT_BYTES };
