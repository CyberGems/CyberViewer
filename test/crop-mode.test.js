const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const workspace = fs.readFileSync(path.join(root, 'js', 'workspace.js'), 'utf8');
const youtubePlayer = fs.readFileSync(path.join(root, 'js', 'youtube-player.js'), 'utf8');

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
    // Crop is uncommitted, viewer-local state: switches and external opens
    // cancel it silently. busy (save/reload), confirm dialogs and modals
    // still require an explicit finish or cancel.
    const canSwitch = workspace.match(/function canSwitch\(\) \{[\s\S]*?\n  \}/);
    assert.ok(canSwitch, 'canSwitch should exist');
    assert.match(canSwitch[0], /if \(state\.isCropping && !busy && dialogDepth === 0 && !document\.querySelector\('\.modal-overlay\.active'\)\) \{\s*\n\s*exitCropMode\(\);\s*\n\s*return true;/);
    assert.match(canSwitch[0], /showToast\(text\('tabs_finish_edit'\), 'info'\)/);
    assert.match(workspace, /isEditing, canSwitch \}/, 'canSwitch should be exported for the YouTube dialog');
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
});
