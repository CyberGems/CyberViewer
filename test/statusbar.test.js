const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const ui = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));

describe('status bar scan indicator', () => {
  it('keeps the scan label in the tooltip instead of the visible bar', () => {
    const radar = html.match(/<div class="footer-center cyber-tooltip" id="footer-radar"[\s\S]*?<\/div>/);
    assert.ok(radar, 'scan indicator should be present');
    assert.match(radar[0], /data-i18n-tooltip="radar_tooltip"/);
    assert.doesNotMatch(radar[0], /data-i18n="radar_lbl"|>ESCANEO:<|>SCAN:</);
    assert.match(radar[0], /id="radar-pct"/);
    assert.match(radar[0], /id="radar-count"[^>]*>\[0\/0\]<\/span>/);

    for (const lang of ['en', 'es']) {
      assert.equal(typeof ui[lang].radar_tooltip, 'string');
      assert.ok(ui[lang].radar_tooltip.trim().length > 0);
    }
  });
});
