'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  cmToPx,
  cmToIn,
  pageInchesForExport,
  resolveExportOptions,
  bakePrintHtml,
  PRINT_PAGE_INCHES
} = require('../js/media-helpers');

describe('cmToPx', () => {
  it('converts centimeters to px at 96 DPI', () => {
    assert.equal(cmToPx(1), 38);
    assert.equal(cmToPx(2.54), 96);
    assert.equal(cmToPx(0), 0);
    assert.equal(cmToPx(null), 0);
    assert.equal(cmToPx('2'), 76);
    assert.equal(cmToPx(2.5), 94); // 2.5/2.54*96 = 94.48 -> 94
  });
});

describe('cmToIn', () => {
  it('converts centimeters to inches for printToPDF margins', () => {
    assert.equal(cmToIn(1), 0.39);
    assert.equal(cmToIn(2.54), 1);
    assert.equal(cmToIn(0), 0);
    assert.equal(cmToIn(null), 0);
    assert.equal(cmToIn('2'), 0.79);
  });
});

describe('pageInchesForExport', () => {
  it('returns named page sizes (portrait)', () => {
    assert.deepEqual(pageInchesForExport('Letter', 0, 0), { width: 8.5, height: 11 });
    assert.deepEqual(pageInchesForExport('A4', 0, 0), { width: 8.27, height: 11.69 });
    assert.deepEqual(pageInchesForExport('Legal', 0, 0), { width: 8.5, height: 14 });
  });

  it('falls back to Letter for unknown sizes', () => {
    assert.deepEqual(pageInchesForExport('Bogus', 0, 0), { width: 8.5, height: 11 });
  });

  it('sizes Fit page to image inches at 96 DPI', () => {
    const r = pageInchesForExport('Fit', 1920, 1080);
    assert.equal(r.width, 20);
    assert.equal(r.height, 11.3);
  });

  it('clamps Fit page to the minimum surface', () => {
    const r = pageInchesForExport('Fit', 0, 0);
    assert.equal(r.width, 0.5);
    assert.equal(r.height, 0.5);
  });

  it('clamps Fit page to the maximum surface', () => {
    const r = pageInchesForExport('Fit', 100000, 100000);
    assert.equal(r.width, 200);
    assert.equal(r.height, 200);
  });
});

describe('resolveExportOptions', () => {
  it('uses named pageSize and default margins when none given', () => {
    const r = resolveExportOptions({ pageSize: 'A4' }, 2000, 1500);
    assert.equal(r.pageSize, 'A4');
    assert.equal(r.landscape, false);
    assert.deepEqual(r.margins, { marginType: 'default' });
    assert.equal(r.printBackground, true);
  });

  it('applies landscape only for named pages', () => {
    const r = resolveExportOptions({ pageSize: 'A4', orientation: 'Landscape' }, 2000, 1500);
    assert.equal(r.landscape, true);
  });

  it('converts custom cm margins to inches for PDF export', () => {
    const r = resolveExportOptions({
      pageSize: 'Letter',
      marginTop: 1, marginBottom: 1, marginLeft: 1, marginRight: 1
    }, 2000, 1500);
    assert.equal(r.margins.marginType, 'custom');
    assert.equal(r.margins.top, cmToIn(1));
    assert.equal(r.margins.bottom, cmToIn(1));
  });

  it('converts custom cm margins to px for native printing', () => {
    const r = resolveExportOptions({
      pageSize: 'Letter',
      marginTop: 1, marginBottom: 1, marginLeft: 1, marginRight: 1
    }, 2000, 1500, 'print');
    assert.equal(r.margins.marginType, 'custom');
    assert.equal(r.margins.top, cmToPx(1));
    assert.equal(r.margins.bottom, cmToPx(1));
  });

  it('disables margins for Fit page (page == image)', () => {
    const r = resolveExportOptions({ pageSize: 'Fit' }, 1920, 1080);
    assert.deepEqual(r.pageSize, { width: 20, height: 11.3 });
    assert.deepEqual(r.margins, { marginType: 'none' });
    assert.equal(r.landscape, false);
  });

  it('Fit ignores landscape and margins (WYSIWYG)', () => {
    const r = resolveExportOptions({
      pageSize: 'Fit', orientation: 'Landscape',
      marginTop: 1, marginBottom: 1, marginLeft: 1, marginRight: 1
    }, 1920, 1080);
    assert.deepEqual(r.margins, { marginType: 'none' });
    assert.equal(r.landscape, false);
  });

  it('defaults pageSize to Letter', () => {
    const r = resolveExportOptions({}, 2000, 1500);
    assert.equal(r.pageSize, 'Letter');
  });
});

describe('bakePrintHtml', () => {
  it('produces a centered-image HTML doc', () => {
    const html = bakePrintHtml('data:image/png;base64,AAAA', 1920, 1080, 'Photo');
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.indexOf('<title>Photo</title>') >= 0);
    assert.ok(html.indexOf('<img src="data:image/png;base64,AAAA"') >= 0);
    assert.ok(html.indexOf('object-fit:contain') >= 0);
    assert.ok(html.indexOf('justify-content:center') >= 0);
  });

  it('escapes < and > in the title', () => {
    const html = bakePrintHtml('x', 10, 10, 'A<B>C');
    assert.ok(html.indexOf('<title>A&lt;B&gt;C</title>') >= 0);
  });

  it('falls back to a neutral title', () => {
    const html = bakePrintHtml('x', 10, 10, '');
    assert.ok(html.indexOf('<title>CyberViewer</title>') >= 0);
  });
});

describe('PRINT_PAGE_INCHES', () => {
  it('contains the common named surfaces', () => {
    assert.ok(PRINT_PAGE_INCHES.Letter);
    assert.ok(PRINT_PAGE_INCHES.A4);
    assert.ok(PRINT_PAGE_INCHES.Legal);
    assert.ok(PRINT_PAGE_INCHES.A3);
    assert.ok(PRINT_PAGE_INCHES.Letter.width < PRINT_PAGE_INCHES.Letter.height);
  });
});
