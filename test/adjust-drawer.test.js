'use strict';

const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const ui = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));

function adjustMarkup() {
  const start = html.indexOf('<div id="modal-adjust"');
  const end = html.indexOf('<!-- CUSTOM CONTEXT MENU -->', start);
  assert.ok(start >= 0 && end > start, 'adjust drawer should be present');
  return html.slice(start, end);
}

describe('Adjust drawer', () => {
  it('uses the main image as the only preview and exposes the live toggle', () => {
    const markup = adjustMarkup();
    assert.match(markup, /class="modal-box adjust-drawer"/);
    assert.match(markup, /id="adj-preview-enabled"[^>]*checked/);
    assert.match(markup, /id="btn-adjust-compare"/);
    assert.doesNotMatch(markup, /adjust-preview-canvas|adj-preview-zoom|btn-adjust-zoom/);
  });

  it('defines a right-side drawer with a fixed action footer', () => {
    assert.match(css, /#modal-adjust\s*\{[\s\S]*?justify-content:\s*flex-end;/);
    assert.match(css, /#modal-adjust \.adjust-drawer\s*\{[\s\S]*?animation:\s*adjust-drawer-in/);
    assert.match(css, /#modal-adjust \.modal-footer\s*\{[\s\S]*?grid-template-rows:\s*auto auto;[\s\S]*?flex-shrink:\s*0;/);
    assert.match(css, /@keyframes adjust-drawer-in/);
  });

  it('keeps the image clear outside the localized glass drawer', () => {
    assert.match(css, /#modal-adjust\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?backdrop-filter:\s*none;/);
    assert.match(css, /#modal-adjust \.adjust-drawer\s*\{[\s\S]*?rgba\(15, 22, 33, 0\.42\)[\s\S]*?backdrop-filter:\s*blur\(20px\) saturate\(150%\);/);
    assert.match(html, /<img src="assets\/icon\.png" class="logo-img"/);
  });

  it('cleans the temporary preview when the modal closes', () => {
    assert.match(appJs, /function restoreAdjustPreview\(\)/);
    assert.match(appJs, /function buildAdjustPreviewFilter|buildAdjustPreviewFilter\(\{/);
    assert.match(appJs, /if \(id === 'modal-adjust' && el\.classList\.contains\('active'\)\)/);
    assert.match(appJs, /restoreAdjustPreview\(\);[\s\S]*?adjustState\.originalFilter = ''/);
  });

  it('has complete preview translations in both supported languages', () => {
    for (const lang of ['en', 'es']) {
      for (const key of [
        'adjust_preview_lbl',
        'adjust_preview_hint',
        'adjust_preview_toggle',
        'adjust_preview_toggle_tooltip'
      ]) {
        assert.equal(typeof ui[lang][key], 'string', `${lang}.${key} should exist`);
        assert.ok(ui[lang][key].trim(), `${lang}.${key} should not be empty`);
      }
    }
  });
});
