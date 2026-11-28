const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');

describe('immediate rotation', () => {
  it('saves each right-angle rotation without a confirmation step', () => {
    const rotate = appJs.match(/async function rotate\(deg\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(rotate, 'rotation handler should exist');
    assert.match(rotate, /await saveCurrent\(\);/);
    assert.doesNotMatch(rotate, /showModal|openModal|confirm\(/);
    assert.doesNotMatch(html, /id="(?:pending-actions|btn-commit|btn-discard)"/);
  });

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
