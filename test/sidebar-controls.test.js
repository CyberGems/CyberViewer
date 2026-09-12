const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');

describe('sidebar navigation controls', () => {
  it('keeps center between vertical start and end navigation', () => {
    const folderStart = html.indexOf('<div id="sidebar-folder"');
    const start = html.indexOf('<div id="sidebar-controls">');
    const end = html.indexOf('<!-- Edge rail', start);
    assert.ok(folderStart >= 0 && start > folderStart && end > start, 'sidebar controls should be present');
    const header = html.slice(folderStart, start);
    const controls = html.slice(start, end);
    const ids = [...controls.matchAll(/id="(btn-go-start|btn-center|btn-go-end)"/g)].map(match => match[1]);

    assert.deepEqual(ids, ['btn-go-start', 'btn-center', 'btn-go-end']);
    assert.match(controls, /id="btn-go-start"[\s\S]*?<path d="M5 5h14"\/>[\s\S]*?<path d="M12 19V7"\/>[\s\S]*?<path d="m8 11 4-4 4 4"\/>/);
    assert.match(controls, /id="btn-go-end"[\s\S]*?<path d="M5 19h14"\/>[\s\S]*?<path d="M12 5v12"\/>[\s\S]*?<path d="m8 13 4 4 4-4"\/>/);
    assert.match(header, /class="kbd-btn sidebar-favs-toggle cyber-tooltip tooltip-bottom tooltip-align-right"[^>]*id="btn-toggle-favs"[\s\S]*?data-i18n="show_favorites_lbl"/);
    assert.doesNotMatch(controls, /id="btn-toggle-favs"/);
  });

  it('uses the quieter statusbar button treatment in the sidebar', () => {
    assert.match(css, /#sidebar-controls \.kbd-btn\s*\{[\s\S]*?color:\s*color-mix\([\s\S]*?background:\s*rgba\(8, 10, 14, 0\.42\);[\s\S]*?border:\s*1px solid var\(--cyber-border\);[\s\S]*?border-radius:\s*6px;/);
    assert.match(css, /#sidebar-controls \.kbd-btn:hover:not\(:disabled\):not\(\.is-disabled\)\s*\{[\s\S]*?color:\s*var\(--cyber-accent\);[\s\S]*?transform:\s*translateY\(-1px\);/);
    assert.match(css, /#sidebar-controls #btn-go-start\.cyber-tooltip::after/);
    assert.match(css, /#sidebar-controls #btn-center\.cyber-tooltip::after/);
  });

  it('keeps the center tooltip opaque and inside the available width', () => {
    assert.match(css, /#sidebar-controls \.cyber-tooltip::after\s*\{[\s\S]*?background:\s*rgba\(8, 12, 18, 0\.98\) !important;/);
    assert.match(css, /#sidebar-controls #btn-center\.cyber-tooltip::after\s*\{[\s\S]*?width:\s*min\(220px, calc\(100vw - 24px\)\);[\s\S]*?text-align:\s*left;/);
  });
});
