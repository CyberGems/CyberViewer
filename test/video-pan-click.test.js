'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const player = fs.readFileSync(path.join(__dirname, '..', 'js', 'video-player.js'), 'utf8');

describe('video pan vs play/pause click', () => {
  it('classifies a press as a pan once it moves past the click slop', () => {
    assert.match(player, /\$\('viewer-wrap'\)\.addEventListener\('mousedown', \(event\) => \{\s*pressOrigin = event\.button === 0 \? \{ x: event\.clientX, y: event\.clientY \} : null;\s*pressPanned = false;\s*\}\);/);
    assert.match(player, /if \(Math\.hypot\(event\.clientX - pressOrigin\.x, event\.clientY - pressOrigin\.y\) > CLICK_SLOP_PX\) pressPanned = true;/);
  });

  it('drops the click that ends a pan before the play/pause timer starts', () => {
    const clickHandler = player.indexOf("$('viewer-wrap').addEventListener('click', (event) => {");
    const panGuard = player.indexOf('if (pressPanned) { pressPanned = false; menuDismissClick = false; return; }');
    const pauseTimer = player.indexOf('videoClickTimer = setTimeout(');
    assert.ok(clickHandler !== -1 && panGuard !== -1 && pauseTimer !== -1);
    assert.ok(clickHandler < panGuard && panGuard < pauseTimer, 'the pan guard runs before a pause is scheduled');
  });
});
