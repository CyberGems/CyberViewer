'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mediaUrl,
  canvasExport,
  buildCssFilter,
  isIdentityAdjust,
  buildAdjustPreviewFilter,
  formatBytes,
  mimeFromPath,
  formatAspectRatio,
  formatMegapixels,
  formatLikelyHasAlpha,
  sliderToZoom,
  zoomToSlider,
  screenCaptureZoom,
  folderDirFromPath,
  folderNameFromPath,
  splitFilenameExtension
} = require('../js/media-helpers');

describe('mediaUrl', () => {
  it('builds cvlocal query URL from fs path', () => {
    const url = mediaUrl('C:\\Images\\a.png');
    assert.match(url, /^cvlocal:\/\/media\/\?p=/);
    assert.ok(url.includes(encodeURIComponent('C:\\Images\\a.png')) ||
      url.includes(encodeURIComponent('C:/Images/a.png'.replace(/\//g, '\\'))) ||
      url.includes('Images'));
  });

  it('passes through blob and data URLs', () => {
    assert.equal(mediaUrl('blob:http://x/1'), 'blob:http://x/1');
    assert.equal(mediaUrl('data:image/png;base64,xx'), 'data:image/png;base64,xx');
  });

  it('adds cache bust query', () => {
    const url = mediaUrl('C:\\a.jpg', 99);
    assert.match(url, /[?&]t=99/);
  });

  it('returns empty for falsy path', () => {
    assert.equal(mediaUrl(''), '');
    assert.equal(mediaUrl(null), '');
  });
});

describe('canvasExport', () => {
  // Minimal canvas stub for Node
  function fakeCanvas(dataUrl) {
    return {
      toDataURL(mime) {
        if (mime === 'image/jpeg') return 'data:image/jpeg;base64,JPGDATA';
        return dataUrl || 'data:image/png;base64,PNGDATA';
      }
    };
  }

  it('exports jpeg for .jpg paths', () => {
    const r = canvasExport(fakeCanvas(), 'C:\\out\\photo.jpg');
    assert.equal(r.buffer, 'JPGDATA');
    assert.equal(r.filePath, 'C:\\out\\photo.jpg');
  });

  it('exports png and rehomes exotic extensions', () => {
    const r = canvasExport(fakeCanvas(), 'C:\\out\\anim.gif');
    assert.equal(r.buffer, 'PNGDATA');
    assert.equal(r.filePath, 'C:\\out\\anim.png');
  });

  it('keeps .png extension', () => {
    const r = canvasExport(fakeCanvas(), 'C:\\out\\a.png');
    assert.equal(r.filePath, 'C:\\out\\a.png');
  });
});

describe('formatBytes', () => {
  it('formats sizes', () => {
    assert.equal(formatBytes(null), '-');
    assert.equal(formatBytes(500), '500 B');
    assert.equal(formatBytes(2048), '2.0 KB');
    assert.equal(formatBytes(2 * 1024 * 1024), '2.00 MB');
  });
});

describe('image props helpers', () => {
  it('maps extensions to mime types', () => {
    assert.equal(mimeFromPath('a.JPG'), 'image/jpeg');
    assert.equal(mimeFromPath('C:\\\\x\\\\b.png'), 'image/png');
    assert.equal(mimeFromPath('app.ico'), 'image/x-icon');
    assert.equal(mimeFromPath('sample.avif'), 'image/avif');
    assert.equal(mimeFromPath('noext'), '');
  });

  it('formats common aspect ratios', () => {
    assert.equal(formatAspectRatio(1920, 1080), '16:9');
    assert.equal(formatAspectRatio(1080, 1080), '1:1');
    assert.equal(formatAspectRatio(0, 10), '-');
  });

  it('formats megapixels', () => {
    assert.equal(formatMegapixels(1920, 1080), '2.07 MP');
    assert.equal(formatMegapixels(0, 0), '-');
  });

  it('detects likely alpha formats', () => {
    assert.equal(formatLikelyHasAlpha('a.png'), true);
    assert.equal(formatLikelyHasAlpha('app.ico'), true);
    assert.equal(formatLikelyHasAlpha('sample.avif'), true);
    assert.equal(formatLikelyHasAlpha('a.jpg'), false);
  });
});

describe('buildCssFilter / isIdentityAdjust', () => {
  it('maps neutral sliders to factor 1 and toggles off', () => {
    const f = buildCssFilter({
      brightness: 0,
      contrast: 0,
      saturation: 0,
      blur: 0,
      grayscale: false,
      invert: false
    });
    assert.equal(f, 'brightness(1) contrast(1) saturate(1) grayscale(0) invert(0)');
    assert.equal(isIdentityAdjust({}), true);
  });

  it('maps positive and negative slider values', () => {
    const f = buildCssFilter({ brightness: 50, contrast: -25, saturation: 100 });
    assert.match(f, /brightness\(1\.5\)/);
    assert.match(f, /contrast\(0\.75\)/);
    assert.match(f, /saturate\(2\)/);
    assert.equal(isIdentityAdjust({ brightness: 50 }), false);
  });

  it('enables grayscale and invert toggles', () => {
    const f = buildCssFilter({ grayscale: true, invert: true });
    assert.match(f, /grayscale\(1\)/);
    assert.match(f, /invert\(1\)/);
    assert.equal(isIdentityAdjust({ invert: true }), false);
  });

  it('adds blur scaled by blurScale', () => {
    const f = buildCssFilter({ blur: 50 }, { blurScale: 0.5 });
    assert.match(f, /blur\(5px\)/);
    assert.equal(isIdentityAdjust({ blur: 10 }), false);
  });

  it('omits blur when zero', () => {
    const f = buildCssFilter({ blur: 0 });
    assert.ok(!/blur\(/.test(f));
  });

  it('clamps out-of-range slider values', () => {
    const f = buildCssFilter({ brightness: 999, contrast: -999 });
    assert.match(f, /brightness\(2\)/);
    assert.match(f, /contrast\(0\)/);
  });
});

describe('buildAdjustPreviewFilter', () => {
  it('restores the original filter when preview is disabled or comparing', () => {
    const original = 'sepia(0.2)';
    assert.equal(buildAdjustPreviewFilter({
      controls: { brightness: 50 },
      enabled: false,
      originalFilter: original
    }), original);
    assert.equal(buildAdjustPreviewFilter({
      controls: { brightness: 50 },
      enabled: true,
      compareOriginal: true,
      originalFilter: original
    }), original);
  });

  it('uses the original filter for neutral controls and the live filter otherwise', () => {
    const original = 'contrast(0.9)';
    assert.equal(buildAdjustPreviewFilter({
      controls: {},
      enabled: true,
      originalFilter: original
    }), original);
    assert.match(buildAdjustPreviewFilter({
      controls: { brightness: 50 },
      enabled: true,
      originalFilter: original
    }), /brightness\(1\.5\)/);
  });
});

describe('slider zoom mapping', () => {
  it('round-trips roughly mid-scale', () => {
    const z = sliderToZoom(500, 0.05, 20);
    const s = zoomToSlider(z, 0.05, 20);
    assert.ok(Math.abs(s - 500) <= 1);
  });

  it('clamps extremes', () => {
    assert.ok(sliderToZoom(0, 0.05, 20) <= 0.051);
    assert.ok(sliderToZoom(1000, 0.05, 20) >= 19);
  });
});

describe('screen capture zoom', () => {
  it('compensates Windows display scaling', () => {
    assert.equal(screenCaptureZoom(1), 1);
    assert.ok(Math.abs(screenCaptureZoom(1.25) - 0.8) < 1e-12);
    assert.ok(Math.abs(screenCaptureZoom(1.5) - (2 / 3)) < 1e-12);
  });

  it('falls back safely for invalid display scales', () => {
    assert.equal(screenCaptureZoom(0), 1);
    assert.equal(screenCaptureZoom(Number.NaN), 1);
    assert.equal(screenCaptureZoom(null), 1);
  });
});

describe('folder path helpers', () => {
  it('extracts dir and folder name on Windows paths', () => {
    assert.equal(folderDirFromPath('C:\\Photos\\trip\\a.jpg'), 'C:\\Photos\\trip');
    assert.equal(folderNameFromPath('C:\\Photos\\trip'), 'trip');
  });

  it('handles trailing separators and empty', () => {
    assert.equal(folderDirFromPath(''), '');
    assert.equal(folderNameFromPath('C:\\Photos\\trip\\'), 'trip');
  });
});

describe('splitFilenameExtension', () => {
  it('keeps the final extension separate from the truncatable base name', () => {
    assert.deepEqual(splitFilenameExtension('photo.vacations.webp'), {
      base: 'photo.vacations',
      extension: '.webp'
    });
  });

  it('handles names without a usable extension', () => {
    assert.deepEqual(splitFilenameExtension('README'), { base: 'README', extension: '' });
    assert.deepEqual(splitFilenameExtension('.hidden'), { base: '.hidden', extension: '' });
    assert.deepEqual(splitFilenameExtension('photo.'), { base: 'photo.', extension: '' });
  });
});
