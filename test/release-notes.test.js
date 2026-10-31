'use strict';

const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const releaseNotes = require('../js/release-notes');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');

// Body shaped like the rendered .github/release-template.md for a release
const TEMPLATE_BODY = [
  '<p align="center">',
  '  <img src="https://raw.githubusercontent.com/CyberGems/CyberViewer/main/assets/icon.png" width="120" alt="CyberViewer">',
  '</p>',
  '',
  '## 🖼️ CyberViewer v1.19.0: Release Notes',
  '',
  '### 🚀 What\'s new in this release',
  '',
  '<!-- changelog-summary:start -->',
  'Video playback arrives with local files plus isolated YouTube videos.',
  '<!-- changelog-summary:end -->',
  '',
  '---',
  '',
  '### ✨ Key Features & Highlights',
  '',
  '- 🎬 **Integrated video playback**:',
  '  - Play local videos in lightweight media tabs alongside images.',
  '  - Refined playback controls and immersive fullscreen.',
  '',
  '- ▶️ **Isolated YouTube playback**:',
  '  - Open YouTube videos or full playlists in a dedicated, isolated viewer.',
  '',
  '<details>',
  '<summary><b>🌐 Ver notas de la versión en Español</b></summary>',
  '',
  '### 🚀 Novedades de esta versión',
  '',
  '- **Reproducción de video integrada**: reproduce videos locales en pestañas de medios.',
  '- **YouTube aislado**: abre videos o listas completas de YouTube en un visor dedicado.',
  '',
  '</details>',
  '',
  '---',
  '',
  '### 📦 Downloads & Packages',
  '',
  '> ⬇️ **Direct download:** click a file name to download it now.',
  '',
  '| File | Description | Platform |',
  '| :--- | :--- | :--- |',
  '| **[`CyberViewer-Setup-1.19.0.exe`](https://github.com/CyberGems/CyberViewer/releases/download/v1.19.0/CyberViewer-Setup-1.19.0.exe)** | 🚀 **Recommended Installer** | Windows 10 / 11 (x64) |',
  '',
  '### VirusTotal and SHA256',
  '',
  '**Installer**: [View VirusTotal report](https://www.virustotal.com/gui/file/ABC)',
  '',
  '```text',
  'ABC',
  '```',
  '',
  '*Crafted with precision by [CyberGems](https://cybergems.org)*'
].join('\n');

// Shape of the flattened stripHtml() output the main process used to broadcast
const FLATTENED_BODY = [
  '### 🚀 What\'s new in this release',
  '',
  'Video playback arrives with local files plus isolated YouTube videos.',
  '',
  '### ✨ Key Features & Highlights',
  '',
  '- 🎬 Integrated video playback:',
  '- Play local videos in lightweight media tabs alongside images.',
  '',
  '🌐 Ver notas de la versión en Español',
  '### 🚀 Novedades de esta versión',
  '',
  '- Reproducción de video integrada: reproduce videos locales en pestañas de medios.',
  '',
  '### 📦 Downloads & Packages',
  '',
  'Direct download: click a file name to download it now.',
  '',
  'CyberViewer-Setup-1.19.0.exe',
  'Recommended Installer',
  '',
  '### VirusTotal and SHA256',
  '',
  '38b0e468c189409e6ecb996565afc34f2329325f038bf1220b61a5a21878a3d8'
].join('\n');

describe('localized release notes', () => {
  it('shows only the Spanish section to Spanish users', () => {
    const es = releaseNotes.extractLocalizedReleaseNotes(TEMPLATE_BODY, 'es');
    assert.match(es, /Novedades de esta versión/);
    assert.match(es, /Reproducción de video integrada/);
    assert.match(es, /YouTube aislado/);
    assert.doesNotMatch(es, /Key Features/);
    assert.doesNotMatch(es, /Integrated video playback/);
    assert.doesNotMatch(es, /Ver notas de la versión/);
    assert.doesNotMatch(es, /Downloads/);
    assert.doesNotMatch(es, /VirusTotal/);
    assert.doesNotMatch(es, /Crafted with precision/);
    assert.doesNotMatch(es, /CyberViewer v1\.19\.0: Release Notes/);
  });

  it('shows only the English section to English users, without the Spanish block or download junk', () => {
    const en = releaseNotes.extractLocalizedReleaseNotes(TEMPLATE_BODY, 'en');
    assert.match(en, /Key Features & Highlights/);
    assert.match(en, /Integrated video playback/);
    assert.match(en, /Isolated YouTube playback/);
    assert.doesNotMatch(en, /Novedades de esta versión/);
    assert.doesNotMatch(en, /Reproducción de video integrada/);
    assert.doesNotMatch(en, /Ver notas de la versión/);
    assert.doesNotMatch(en, /Downloads/);
    assert.doesNotMatch(en, /VirusTotal/);
    assert.doesNotMatch(en, /Crafted with precision/);
    assert.doesNotMatch(en, /CyberViewer v1\.19\.0: Release Notes/);
  });

  it('prefers explicit lang comment tags when present', () => {
    const body = '### ✨ Features\n\n- Fast\n<!-- lang:es -->### ✨ Novedades\n\n- Rápido<!-- /lang:es -->';
    const es = releaseNotes.extractLocalizedReleaseNotes(body, 'es');
    assert.match(es, /Rápido/);
    assert.doesNotMatch(es, /Fast/);
    const en = releaseNotes.extractLocalizedReleaseNotes(body, 'en');
    assert.match(en, /Fast/);
    assert.doesNotMatch(en, /Rápido/);
  });

  it('recovers the Spanish section from flattened notes without <details> structure', () => {
    const es = releaseNotes.extractLocalizedReleaseNotes(FLATTENED_BODY, 'es');
    assert.match(es, /Novedades de esta versión/);
    assert.match(es, /Reproducción de video integrada/);
    assert.doesNotMatch(es, /Key Features/);
    assert.doesNotMatch(es, /Ver notas de la versión/);
    assert.doesNotMatch(es, /Downloads/);
    assert.doesNotMatch(es, /38b0e468/);
  });

  it('cuts flattened Spanish sections out of non-Spanish notes', () => {
    const en = releaseNotes.extractLocalizedReleaseNotes(FLATTENED_BODY, 'en');
    assert.match(en, /Key Features & Highlights/);
    assert.match(en, /Integrated video playback/);
    assert.doesNotMatch(en, /Novedades/);
    assert.doesNotMatch(en, /Ver notas de la versión/);
    assert.doesNotMatch(en, /Downloads/);
    assert.doesNotMatch(en, /38b0e468/);
  });

  it('normalizes language codes and defaults safely on empty input', () => {
    assert.equal(releaseNotes.normalizeReleaseLang('es-419'), 'es');
    assert.equal(releaseNotes.normalizeReleaseLang('ES'), 'es');
    assert.equal(releaseNotes.normalizeReleaseLang('en-US'), 'en');
    // Empty input falls back to navigator.language (locale-dependent)
    assert.match(releaseNotes.normalizeReleaseLang(''), /^[a-z]{2}$/);
    const body = '### ✨ Features\n\n- Only English here';
    assert.match(releaseNotes.extractLocalizedReleaseNotes(body, 'fr'), /Only English here/);
  });

  it('returns empty output for empty input', () => {
    assert.equal(releaseNotes.extractLocalizedReleaseNotes('', 'es'), '');
    assert.equal(releaseNotes.extractLocalizedReleaseNotes(null, 'es'), '');
  });

  it('is wired into the About dialog with the interface language', () => {
    assert.match(appJs, /window\.CVReleaseNotes\.extractLocalizedReleaseNotes\(rawBody, lang\)/);
    assert.match(appJs, /const lang = \(state\.settings\.app && state\.settings\.app\.language\) \|\| 'en';/);
    // Loaded before app.js in the renderer
    const releaseScriptIdx = html.indexOf('<script src="js/release-notes.js"></script>');
    const appScriptIdx = html.indexOf('<script src="js/app.js"></script>');
    assert.ok(releaseScriptIdx > 0 && releaseScriptIdx < appScriptIdx, 'release-notes.js must load before app.js');
  });
});

describe('changelog peek for the update popup', () => {
  const PEEK_BODY = [
    '### Highlights',
    '- ✨ New transparency background picker',
    '- Faster folder scanning',
    '  - Applies to folders above 500 files',
    '- Fixed a crash on rotation',
    '',
    '### Downloads',
    '- [CyberViewer-Setup.exe](https://example.com) (recommended installer)'
  ].join('\n');

  it('extracts the highlights bullets for English users', () => {
    const items = releaseNotes.parseChangelogPeek(PEEK_BODY, 'en');
    assert.equal(items.length, 4);
    assert.match(items[0].text, /transparency background picker/);
    assert.equal(items[3].text, 'Fixed a crash on rotation');
    assert.equal(items.every((item) => !/installer/i.test(item.text)), true);
  });

  it('flags indented bullets as sub-items', () => {
    const items = releaseNotes.parseChangelogPeek(PEEK_BODY, 'en');
    assert.equal(items[2].isSubItem, true);
    assert.equal(items[2].text, 'Applies to folders above 500 files');
    assert.equal(items[0].isSubItem, false);
  });

  it('serves the Spanish section to Spanish users', () => {
    const body = [
      '### Highlights',
      '- English bullet only',
      '',
      '<details>',
      '<summary>🌐 Ver notas de la versión en Español</summary>',
      '',
      '### Novedades',
      '- Fondo de transparencia automático',
      '- Escaneo más rápido',
      '',
      '</details>'
    ].join('\n');
    const items = releaseNotes.parseChangelogPeek(body, 'es');
    assert.equal(items.length, 2);
    assert.match(items[0].text, /Fondo de transparencia automático/);
    const en = releaseNotes.parseChangelogPeek(body, 'en');
    assert.equal(en.length, 1);
    assert.match(en[0].text, /English bullet only/);
  });

  it('falls back to top-level bullets without a highlights section', () => {
    const body = '- First change\n- Second change\n\n### Downloads\n- Setup (recommended installer)';
    const items = releaseNotes.parseChangelogPeek(body, 'en');
    assert.equal(items.length, 2);
    assert.equal(items[0].text, 'First change');
  });

  it('falls back to descriptive sentences when there are no bullets', () => {
    const body = 'CyberViewer 1.19 brings a redesigned update popup with changelog peek.\n\n### Downloads\n- Setup.exe';
    const items = releaseNotes.parseChangelogPeek(body, 'en');
    assert.equal(items.length, 1);
    assert.match(items[0].text, /redesigned update popup/);
  });

  it('respects the item limit and empty input', () => {
    const body = '### Highlights\n- A\n- B\n- C\n- D\n- E';
    assert.equal(releaseNotes.parseChangelogPeek(body, 'en', 2).length, 2);
    assert.deepEqual(releaseNotes.parseChangelogPeek('', 'en'), []);
  });
});
