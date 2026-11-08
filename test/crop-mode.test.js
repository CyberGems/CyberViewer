const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

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
