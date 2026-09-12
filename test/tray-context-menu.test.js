const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

describe('tray context menu', () => {
  it('keeps About inside Help without a duplicate root action', () => {
    const start = mainJs.indexOf('function buildTrayContextMenuTemplate()');
    const end = mainJs.indexOf('function rebuildTrayContextMenu()', start);
    assert.ok(start >= 0 && end > start, 'tray context menu builder should be present');
    const template = mainJs.slice(start, end);

    assert.match(template, /label: help\.aboutLabel/);
    assert.doesNotMatch(template, /label: t\.tray_about \|\| t\.about/);
  });
});
