'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { TabModel, MAX_TABS, cleanView } = require('../js/tab-model');

const image = filePath => ({ file: { name: filePath.split(/[\\/]/).pop(), path: filePath } });

describe('image tab model', () => {
  it('deduplicates Windows paths while keeping independent documents and views', () => {
    const model = new TabModel();
    const first = model.open(image('C:\\Photos\\one.png'));
    first.view.zoom = 2;
    first.view.panX = 42;
    const second = model.open(image('D:/Photos/two.png'));
    assert.notEqual(first.id, second.id);
    assert.equal(second.view.zoom, 1);
    assert.equal(model.open(image('c:/photos/ONE.png')), first);
    assert.equal(model.tabs.length, 2);
    assert.equal(model.active.view.panX, 42);
  });
  it('closes adjacent tabs, reopens in order, and never duplicates a reopened path', () => {
    const model = new TabModel();
    const first = model.open(image('C:/one.png'));
    const middle = model.open(image('C:/two.png'));
    const last = model.open(image('C:/three.png'));
    model.activate(middle.id);
    model.close(middle.id);
    assert.equal(model.active, last);
    assert.equal(model.reopen(), middle);
    model.close(middle.id);
    const replacement = model.open(image('C:/two.png'));
    assert.equal(model.reopen(), replacement);
    assert.equal(model.tabs.length, 3);
    model.close(first.id);
    assert.equal(model.active, replacement);
  });
  it('moves tabs without changing their identity, active state, or pending rotation', () => {
    const model = new TabModel();
    const first = model.open(image('C:/one.png'));
    const second = model.open(image('C:/two.png'));
    second.view.currentRotation = 90;
    second.view.hasChanges = true;
    assert.equal(model.move(second.id, first.id), true);
    assert.deepEqual(model.tabs.map(tab => tab.id), [second.id, first.id]);
    assert.equal(model.active, second);
    assert.equal(second.view.currentRotation, 90);
    assert.equal(model.move(second.id, 'unknown'), false);
    assert.equal(model.move(second.id, null), true);
    assert.equal(model.tabs[1], second);
  });
  it('keeps hundreds of inactive tabs as metadata and limits closed history', () => {
    const model = new TabModel();
    for (let i = 0; i < 1000; i++) model.open(image('C:/images/' + i + '.png'), { activate: false });
    assert.equal(model.tabs.length, 1000);
    assert.equal(model.activeId, null);
    for (const tab of [...model.tabs]) model.close(tab.id);
    assert.equal(model.activeId, null);
    assert.equal(model.closed.length, 20);
  });
  it('reports the tab limit without dropping existing tabs or history', () => {
    const model = new TabModel();
    for (let i = 0; i < MAX_TABS; i++) model.open(image('C:/' + i + '.png'));
    assert.throws(() => model.open(image('C:/extra.png')), /TAB_LIMIT/);
    assert.equal(model.tabs.length, MAX_TABS);
    assert.equal(model.open(image('C:/1.png')).image.file.path, 'C:/1.png');
  });
  it('serializes file and clipboard tabs, retaining viewport and rotation recipes', () => {
    const model = new TabModel();
    const first = model.open(image('C:/one.png'));
    first.view = { viewMode: 'custom', selectedViewMode: 'fit', zoom: 2.5, panX: 31, panY: -20,
      currentRotation: 450, hasChanges: true };
    const pasted = model.open({ file: { name: 'Clipboard.png', path: null }, draftId: 'draft.png' });
    const result = model.snapshot();
    assert.equal(result.activeId, pasted.id);
    assert.equal(result.tabs[0].view.currentRotation, 90);
    assert.equal(result.tabs[0].view.panY, -20);
    assert.equal(result.tabs[1].draftId, 'draft.png');
    assert.ok(!('image' in result.tabs[0]));
  });
  it('sanitizes untrusted view values', () => {
    const result = cleanView({ zoom: Infinity, panX: NaN, panY: -Infinity, currentRotation: 91,
      hasChanges: true, viewMode: 'execute', selectedViewMode: 'invalid' });
    assert.equal(result.zoom, 1);
    assert.equal(result.currentRotation, 0);
    assert.equal(result.hasChanges, false);
    assert.equal(result.viewMode, 'fit');
  });
});
