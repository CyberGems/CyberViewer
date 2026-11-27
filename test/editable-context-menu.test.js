'use strict';

const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = read('js/app.js');
const preload = read('preload.js');
const main = read('main.js');
const i18n = JSON.parse(read('i18n/ui.json'));
const bundled = read('i18n/ui.js');

describe('editable text context menu', () => {
  it('routes text fields and contenteditable regions through the shared styled menu', () => {
    assert.match(app, /const EDITABLE_INPUT_TYPES = new Set\(\[/);
    assert.match(app, /target\.closest\('textarea, \[contenteditable\]:not\(\[contenteditable="false"\]\)'\)/);
    assert.match(app, /void showEditableContextMenu\(e, editable\)/);
    assert.match(app, /showCustomContextMenu\(event, 'editable'/);
    assert.match(app, /buildEditableMenuTemplate\(data\.field, data\.clipboardText\)/);
    assert.doesNotMatch(preload, /window\.addEventListener\('contextmenu'/);
  });

  it('offers all editing commands with availability checks and field-bound actions', () => {
    for (const command of ['undo', 'redo', 'cut', 'copy', 'paste', 'select_all', 'delete']) {
      assert.ok(app.includes(`item('edit_${command}'`), `Missing ${command}`);
    }
    assert.match(app, /document\.queryCommandEnabled\(command\)/);
    assert.match(app, /document\.execCommand\('delete'\)/);
    assert.match(app, /selection\.range\.deleteContents\(\)/);
    assert.match(app, /canModify && clipboardText\.length > 0/);
    assert.match(app, /restoreEditableSelection\(field, selection\)/);
    assert.match(app, /btn\.disabled = true/);
    assert.match(app, /btn\.setAttribute\('aria-disabled', 'true'\)/);
  });

  it('reads clipboard text through Electron and localizes every command', () => {
    assert.match(preload, /readClipboardText: \(\) => ipcRenderer\.invoke\('clipboard:read-text'\)/);
    assert.match(main, /ipcMain\.handle\('clipboard:read-text'/);
    const keys = ['edit_undo', 'edit_redo', 'edit_cut', 'edit_copy', 'edit_paste', 'edit_select_all', 'edit_delete'];
    for (const key of keys) {
      assert.ok(i18n.en[key], `English missing ${key}`);
      assert.ok(i18n.es[key], `Spanish missing ${key}`);
      assert.ok(bundled.includes(`"${key}":`), `Bundle missing ${key}`);
    }
  });
});
