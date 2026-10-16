'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SessionStore, sanitizeSession } = require('../lib/session-store');

const snapshot = filePath => ({ version: 1, activeId: 'tab-1', tabs: [
  { id: 'tab-1', path: filePath, name: 'one.png', view: { currentRotation: 90, zoom: 2, panX: 25 } }
] });
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberviewer-session-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('cyberviewer-session-test-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { dir, store: new SessionStore(dir) };
}
describe('workspace session persistence', () => {
  it('round-trips tabs without requiring inactive files to exist', t => {
    const { store } = fixture(t);
    store.write(snapshot('Z:/offline/one.png'));
    const result = store.read();
    assert.equal(result.ok, true);
    assert.equal(result.session.tabs[0].path, 'Z:/offline/one.png');
    assert.equal(result.session.tabs[0].view.currentRotation, 90);
    assert.equal(result.session.tabs[0].view.panX, 25);
  });
  it('recovers the previous valid snapshot when the latest file is corrupt', t => {
    const { store } = fixture(t);
    store.write(snapshot('C:/first.png'));
    store.write(snapshot('C:/second.png'));
    fs.writeFileSync(store.file, '{broken');
    const result = store.read();
    assert.equal(result.ok, true);
    assert.equal(result.recovered, true);
    assert.equal(result.session.tabs[0].path, 'C:/first.png');
    store.write(snapshot('C:/third.png'));
    fs.writeFileSync(store.file, '{broken again');
    assert.equal(store.read().session.tabs[0].path, 'C:/first.png');
  });
  it('rejects invalid writes without replacing the current session', t => {
    const { store } = fixture(t);
    store.write(snapshot('C:/valid.png'));
    assert.throws(() => store.write({ version: 2, tabs: [] }), /INVALID_SESSION/);
    assert.equal(store.read().session.tabs[0].path, 'C:/valid.png');
    assert.throws(() => store.write(snapshot('../relative.png')), /INVALID_SESSION_TAB/);
    assert.equal(store.read().ok, true);
  });
  it('reports failed recovery without pretending there was an empty session', t => {
    const { store } = fixture(t);
    fs.writeFileSync(store.file, '{}');
    assert.equal(store.read().ok, false);
    assert.equal(store.read().session.tabs.length, 0);
  });
  it('rejects duplicate identities and paths and resolves a missing active ID', () => {
    const input = snapshot('C:/one.png');
    input.tabs.push({ ...input.tabs[0], id: 'tab-2', path: 'c:\\ONE.png' });
    assert.throws(() => sanitizeSession(input), /DUPLICATE_SESSION_PATH/);
    input.tabs[1].path = 'C:/two.png'; input.tabs[1].id = 'tab-1';
    assert.throws(() => sanitizeSession(input), /DUPLICATE_SESSION_ID/);
    input.tabs.pop(); input.activeId = 'tab-999';
    assert.equal(sanitizeSession(input).activeId, 'tab-1');
  });
  it('stores clipboard bytes using opaque IDs and prevents path traversal', t => {
    const { store } = fixture(t);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
    const id = store.saveDraft(png.toString('base64'));
    assert.deepEqual(fs.readFileSync(store.draftPath(id)), png);
    assert.equal(store.draftPath('../settings.json'), null);
    assert.equal(store.draftPath('not-an-id.png'), null);
    assert.throws(() => store.saveDraft(Buffer.from('not a PNG').toString('base64')), /INVALID_DRAFT/);
    store.write({ version: 1, activeId: 'tab-1', tabs: [{ id: 'tab-1', draftId: id, name: 'Clipboard.png' }] });
    assert.equal(store.read().session.tabs[0].draftId, id);
  });
  it('clears only session-owned files when the option is disabled', t => {
    const { dir, store } = fixture(t);
    store.write(snapshot('C:/one.png'));
    store.write(snapshot('C:/two.png'));
    fs.writeFileSync(path.join(dir, 'settings.json'), 'keep settings');
    fs.mkdirSync(store.draftDir, { recursive: true });
    fs.writeFileSync(path.join(store.draftDir, 'unrelated.txt'), 'keep unrelated');
    store.clear();
    assert.equal(fs.existsSync(store.file), false);
    assert.equal(fs.existsSync(store.file + '.bak'), false);
    assert.equal(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'), 'keep settings');
    assert.equal(fs.readFileSync(path.join(store.draftDir, 'unrelated.txt'), 'utf8'), 'keep unrelated');
  });
});
