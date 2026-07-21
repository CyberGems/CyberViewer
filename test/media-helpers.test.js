'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mediaUrl,
  canvasExport,
  formatBytes,
  sliderToZoom,
  zoomToSlider,
  folderDirFromPath,
  folderNameFromPath
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
