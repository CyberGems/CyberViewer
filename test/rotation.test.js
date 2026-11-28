const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const ui = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));

describe('optional rotation autosave', () => {
  it('previews by default and saves automatically only when enabled', () => {
    const rotate = appJs.match(/async function rotate\(deg\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(rotate, 'rotation handler should exist');
    assert.match(rotate, /if \(state\.settings\.app\.autoSaveRotation === true\) await saveCurrent\(\);/);
    assert.match(appJs, /autoSaveRotation: false,/);
    assert.match(appJs, /\$\('cfg-auto-save-rotation'\)\.checked = s\.autoSaveRotation === true;/);
    assert.match(appJs, /autoSaveRotation: !!\(\$\('cfg-auto-save-rotation'\) && \$\('cfg-auto-save-rotation'\)\.checked\),/);
  });

  it('restores pending commit and discard controls', () => {
    assert.match(html, /id="pending-actions"[^>]*hidden/);
    assert.match(html, /id="btn-commit"[^>]*data-i18n-title="save_title"/);
    assert.match(html, /id="btn-discard"[^>]*data-i18n-title="discard_title"/);
    assert.match(appJs, /btnCommit\.addEventListener\('click',[\s\S]*?void saveCurrent\(\);/);
    assert.match(appJs, /btnDiscard\.addEventListener\('click',[\s\S]*?discardPendingChanges\(\);/);
    const pending = appJs.match(/function syncRotationPendingState\(pending\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(pending, 'pending rotation UI sync should exist');
    assert.match(pending, /bar\.hidden = !pending;/);
    assert.match(pending, /bar\.classList\.toggle\('visible', pending\);/);
    assert.match(pending, /btn-commit', 'btn-discard/);
    assert.match(appJs, /const pendingRotation = isRotationPreviewPending\(\);/);
  });

  it('keeps Enter and Escape scoped to an uncommitted preview', () => {
    assert.match(appJs, /if \(isRotationPreviewPending\(\)\) \{\s*\n\s*discardPendingChanges\(\);/);
    const keyboard = appJs.match(/if \(pendingRotation\) \{[\s\S]*?\n  \}/)?.[0];
    assert.ok(keyboard, 'pending rotation keyboard guard should exist');
    assert.match(keyboard, /key === 'enter'[\s\S]*?void saveCurrent\(\);/);
    assert.match(keyboard, /key === 'q' \|\| key === 'e'/);
  });

  it('does not show a success toast after saving a rotation', () => {
    const save = appJs.match(/async function saveCurrent\(\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(save, 'rotation save handler should exist');
    assert.doesNotMatch(save, /toast_changes_saved/);
  });

  it('exposes the setting and pending actions in both languages', () => {
    assert.match(html, /id="cfg-auto-save-rotation"/);
    for (const lang of ['en', 'es']) {
      for (const key of ['cfg_auto_save_rotation', 'cfg_auto_save_rotation_desc', 'rotation_pending_actions', 'save_title', 'discard_title']) {
        assert.ok(typeof ui[lang][key] === 'string' && ui[lang][key].length > 0, `${lang}.${key} should be translated`);
      }
    }
  });
});

describe('rotation export', () => {
  it('renders at natural pixel dimensions and exports lossless PNG', () => {
    const save = appJs.match(/async function saveCurrent\(\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(save, 'rotation save handler should exist');
    assert.match(save, /const iw = mainImg\.naturalWidth;/);
    assert.match(save, /const ih = mainImg\.naturalHeight;/);
    assert.match(save, /canvas\.width = ih;\s*\n\s*canvas\.height = iw;/);
    assert.match(save, /canvas\.toDataURL\('image\/png'\)/);
    assert.match(save, /await mainImg\.decode\(\);/);
    assert.doesNotMatch(save, /drawImage\(mainImg,[^;]*mainImg\.width/);
  });
});
