const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const workspace = fs.readFileSync(path.join(root, 'js', 'workspace.js'), 'utf8');
const youtubePlayer = fs.readFileSync(path.join(root, 'js', 'youtube-player.js'), 'utf8');
const ui = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');

describe('crop mode pointer guard', () => {
  it('ignores viewer double-clicks while the crop selection is active', () => {
    const handler = appJs.match(/viewerWrap\.addEventListener\('dblclick', e => \{[\s\S]*?\n\}\);/);
    assert.ok(handler, 'viewer double-click handler should stay on viewerWrap');
    // The crop guard has to run before the fullscreen, video and zoom branches,
    // otherwise a double-click would act on the image mid-selection.
    assert.match(handler[0], /^viewerWrap\.addEventListener\('dblclick', e => \{[\s\S]{0,400}?if \(state\.isCropping\) return;/);
    assert.match(handler[0], /if \(state\.isCropping\) return;[\s\S]*?toggleFullscreen\(\)/);
  });
});

describe('crop yields to tab switches and external opens', () => {
  it('cancels crop in canSwitch instead of blocking, keeping real-work guards', () => {
    // Uncommitted, viewer-local states (crop plus the adjust/resize editing
    // modals, behind a Config toggle) yield to switches and external opens.
    // busy (save/reload), confirm dialogs and other overlays still require an
    // explicit finish or cancel.
    const canSwitch = workspace.match(/function canSwitch\(\) \{[\s\S]*?\n  \}/);
    assert.ok(canSwitch, 'canSwitch should exist');
    assert.match(canSwitch[0], /const editingModal = document\.querySelector\('#modal-adjust\.active, #modal-resize\.active'\);/);
    assert.match(canSwitch[0], /if \(\(state\.isCropping \|\| editingModal\) && !busy && dialogDepth === 0 &&\s*\n\s*state\.settings\.app\.tabsCancelPendingEdits !== false\) \{/);
    assert.match(canSwitch[0], /const snap = typeof window\.cropSelectionSnapshot === 'function' \? window\.cropSelectionSnapshot\(\) : null;/);
    assert.match(canSwitch[0], /window\.exitCropMode\(\);\s*\n\s*if \(active\) active\.pendingCrop = snap;/);
    assert.match(canSwitch[0], /if \(editingModal\) window\.closeModal\(editingModal\.id\);/);
    assert.match(canSwitch[0], /showToast\(text\('tabs_finish_edit'\), 'info'\)/);
    assert.match(workspace, /isEditing, canSwitch \}/, 'canSwitch should be exported for the YouTube dialog');
  });

  it('exposes the cancel-pending-edits toggle in Config', () => {
    assert.match(html, /id="cfg-tabs-cancel-edits"[^>]*checked/);
    assert.match(appJs, /\$\('cfg-tabs-cancel-edits'\)\.checked = s\.tabsCancelPendingEdits !== false;/);
    assert.match(appJs, /tabsCancelPendingEdits: \$\('cfg-tabs-cancel-edits'\)\.checked,/);
    for (const lang of ['en', 'es']) {
      assert.ok(typeof ui[lang].tabs_cancel_edits === 'string' && ui[lang].tabs_cancel_edits.length > 0);
      assert.ok(typeof ui[lang].tabs_cancel_edits_desc === 'string' && ui[lang].tabs_cancel_edits_desc.length > 0);
    }
  });

  it('lets openFiles activate through canSwitch without losing the defer path', () => {
    // External opens (Explorer, drag & drop, paste) activate immediately when
    // canSwitch allows; busy-afterEdit and dialog opens keep deferring.
    assert.match(workspace, /const deferActivation = target && \(\(busy && options\.afterEdit\) \|\| dialogDepth > 0\);/);
    assert.match(workspace, /if \(deferActivation\) deferredActivation = target\.id;/);
    assert.match(workspace, /if \(target && options\.activate !== false && !deferActivation && canSwitch\(\)\) await activate\(target\.id, \{ force: true, source: options\.source \}\);/);
  });

  it('routes the YouTube dialog through the softening guard', () => {
    assert.match(youtubePlayer, /const reopening = \$\('modal-youtube'\)\.classList\.contains\('active'\);/);
    assert.match(youtubePlayer, /if \(!reopening && !window\.CVWorkspace\.canSwitch\(\)\) return;/);
    assert.doesNotMatch(youtubePlayer, /isEditing\(\) && !\$\('modal-youtube'\)/);
  });

  it('remembers an open crop across tab switches and restores it identically', () => {
    // The selection is captured in image space (0..1) on switch, kept in
    // memory only, and re-entered automatically when the tab displays again:
    // same view, same rotation pending, same rectangle.
    assert.match(appJs, /function cropSelectionSnapshot\(\) \{[\s\S]*?return \{ x: \(cropState\.x - r\.x\) \/ r\.w,[\s\S]*?\};\s*\n\}/);
    assert.match(workspace, /const snap = typeof window\.cropSelectionSnapshot === 'function' \? window\.cropSelectionSnapshot\(\) : null;/);
    assert.match(workspace, /exitCropMode\(\);\s*\n\s*if \(active\) active\.pendingCrop = snap;/);
    // capture() runs after canSwitch() and must not try to snapshot a closed crop.
    assert.doesNotMatch(workspace, /tab\.pendingCrop = typeof window\.cropSelectionSnapshot/);
    assert.match(appJs, /if \(restoredView && target === mainImg\) \{[\s\S]*?restorePendingCrop\(backTab\);/);
    const restore = appJs.match(/function restorePendingCrop\(tab\) \{[\s\S]*?\n\}/)[0];
    // It consumes the snapshot once, keeps the restored view untouched (no
    // discardPendingRotationSilently), calibrates, then remaps proportionally.
    assert.match(restore, /tab\.pendingCrop = null;/);
    assert.match(restore, /calibrateAndShowCrop\(\);/);
    assert.match(restore, /cropState\.x = r\.x \+ snap\.x \* r\.w;/);
    assert.match(restore, /updateCropUI\(\);/);
    assert.doesNotMatch(restore, /discardPendingRotationSilently/);
    // An explicit crop click also brings the remembered selection back.
    assert.match(appJs, /if \(activeTab && activeTab\.pendingCrop\) \{ restorePendingCrop\(activeTab\); return; \}/);
    // Never serialized to session files or restored views.
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'js', 'tab-model.js'), 'utf8'), /pendingCrop/);
  });
});
