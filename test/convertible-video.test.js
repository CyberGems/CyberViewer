'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readJson = (file) => JSON.parse(read(file));

const mediaTypes = require('../js/media-types');

describe('convertible legacy video formats', () => {
  it('treats WMV, AVI and FLV as video and marks them convertible', () => {
    for (const ext of ['.wmv', '.avi', '.flv']) {
      assert.ok(mediaTypes.VIDEO_EXTS.has(ext), ext + ' is a video type');
      assert.ok(mediaTypes.CONVERTIBLE_EXTS.has(ext), ext + ' is convertible');
      assert.equal(mediaTypes.isVideo('D:\\clip' + ext), true, ext + ' isVideo');
      assert.equal(mediaTypes.isConvertible('D:\\clip' + ext), true, ext + ' isConvertible');
    }
    assert.equal(mediaTypes.isVideo('D:\\clip.mp4'), true);
    assert.equal(mediaTypes.isConvertible('D:\\clip.mp4'), false, 'mp4 needs no conversion');
    assert.equal(mediaTypes.isConvertible('https://youtube.com/watch?v=x'), false, 'YouTube never converts');
  });

  it('registers the formats in associations, installer and dialog plumbing', () => {
    const pkg = readJson('package.json');
    const videoGroup = pkg.build.win.fileAssociations.find(group => group.name === 'Video');
    for (const ext of ['wmv', 'avi', 'flv']) {
      assert.ok(videoGroup.ext.includes(ext), 'fileAssociations include ' + ext);
    }
    assert.ok(pkg.build.extraResources.some(res => res.from === 'electron/ffmpeg.exe'), 'ffmpeg is bundled');
    assert.equal(pkg.scripts['fetch:ffmpeg'], 'node scripts/fetch-ffmpeg.cjs');

    const nsh = read('build/installer.nsh');
    for (const ext of ['wmv', 'avi', 'flv']) {
      assert.match(nsh, new RegExp(`insertmacro CV_WriteFileAssoc "\\.${ext}"\\s+"CyberViewer\\.video"`));
      assert.match(nsh, new RegExp(`Capabilities\\\\FileAssociations" "\\.${ext}" "CyberViewer\\.video"`));
    }
    const mainJs = read('main.js');
    for (const ext of ['.wmv', '.avi', '.flv']) {
      assert.match(mainJs, new RegExp(`\\{ ext: '${ext}', progid: 'CyberViewer\\.video', group: 'video' \\}`));
    }
    const html = read('CyberViewer.html');
    assert.match(html, /id="file-input" accept="[^"]*\.wmv[^"]*"/);
  });

  it('wires the converter into the main process with cache and lifecycle', () => {
    const mainJs = read('main.js');
    assert.match(mainJs, /const convertedCachePath = path\.join\(app\.getPath\('userData'\), 'converted'\);/);
    assert.match(mainJs, /const mediaConverter = createConverter\(\{ getFfmpegPath, cacheDir: convertedCachePath \}\);/);
    assert.match(mainJs, /pathAllowlist\.allow\(convertedCachePath\);/);
    assert.match(mainJs, /function getFfmpegPath\(\)/);
    assert.match(mainJs, /ipcMain\.handle\('convert-video', async \(event, filePath\) => \{/);
    assert.match(mainJs, /mediaConverter\.dispose\(\);/);
    assert.match(mainJs, /mediaConverter\.prune\(\);/);
    assert.match(mainJs, /mediaConverter\.peekConverted\(abs\)/);
    const pathsLib = read('lib/paths.js');
    assert.match(pathsLib, /CONVERTIBLE_EXTS/);
  });

  it('exposes conversion and progress to the renderer', () => {
    const preload = read('preload.js');
    assert.match(preload, /convertVideo: \(path\) => ipcRenderer\.invoke\('convert-video', path\)/);
    assert.match(preload, /onConvertProgress: \(cb\) => \{/);
    const appJs = read('js/app.js');
    assert.match(appJs, /if \(window\.CVFormats\.isConvertible\(im\) && window\.electronAPI && window\.electronAPI\.convertVideo\) \{/);
    assert.match(appJs, /const result = await window\.electronAPI\.convertVideo\(im\.file\.path\);/);
    assert.match(appJs, /loadUrl = mediaUrl\(result\.path\);/);
    assert.match(appJs, /function showConvertProgress\(percent\)/);
    assert.match(appJs, /function hideConvertProgress\(\)/);
  });

  it('localizes the conversion progress label in both languages', () => {
    const i18n = readJson('i18n/ui.json');
    assert.match(i18n.en.spinner_converting, /Converting video… \{percent\}%/);
    assert.match(i18n.es.spinner_converting, /Convirtiendo video… \{percent\}%/);
    const html = read('CyberViewer.html');
    assert.match(html, /<div id="spinner-label" hidden><\/div>/);
  });

  it('keeps the transcoder out of the repository and pinned in CI', () => {
    const fetcher = read('scripts/fetch-ffmpeg.cjs');
    assert.match(fetcher, /FFMPEG_SHA256 = '[0-9a-f]{64}'/);
    assert.match(fetcher, /gyan\.dev/);
    const workflow = read('.github/workflows/release.yml');
    assert.match(workflow, /Fetch ffmpeg for bundling/);
    assert.match(workflow, /npm run fetch:ffmpeg/);
  });

  it('lib/convert serializes conversions and prunes the cache', () => {
    const convert = read('lib/convert.js');
    assert.match(convert, /function createConverter\(\{ getFfmpegPath, cacheDir \}\)/);
    assert.match(convert, /const inflight = new Map\(\)/);
    assert.match(convert, /async function prune\(/);
    assert.match(convert, /'-movflags', '\+faststart'/);
    assert.match(convert, /parseDurationSeconds/);
  });
});
