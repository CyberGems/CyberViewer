const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const workspace = fs.readFileSync(path.join(root, 'js', 'workspace.js'), 'utf8');

describe('native window title', () => {
  it('uses the app name followed by the active file and an unsaved marker', () => {
    const sync = workspace.match(/function syncTitle\(\) \{[\s\S]*?\n  \}/);
    assert.ok(sync, 'syncTitle should exist in the workspace module');
    assert.match(sync[0], /const tab = model\.active;/);
    assert.match(sync[0], /const name = tab\?\.image\?\.file\?\.name \|\| '';/);
    assert.match(sync[0], /const title = name \? `CyberViewer · \$\{name\}\$\{edited\(tab\) \? '\*' : ''\}` : 'CyberViewer';/);
    assert.match(sync[0], /if \(document\.title !== title\) document\.title = title;/);
  });

  it('keeps the native title in sync on tab changes and on edits', () => {
    const render = workspace.match(/function render\(\) \{[\s\S]*?if \(!bar \|\| !list\) return;/);
    assert.ok(render, 'render should exist');
    assert.match(render[0], /syncTitle\(\);/);
    const changed = workspace.match(/function changed\(\) \{[\s\S]*?\n  \}/);
    assert.ok(changed, 'changed should exist');
    assert.match(changed[0], /^\s*syncTitle\(\);/m);
  });

  it('exposes syncTitle for the renderer display helper', () => {
    assert.match(workspace, /dialog, syncTitle,/);
  });
});
