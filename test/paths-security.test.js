'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  createPathAllowlist,
  isExistingImageFile,
  isImagePath,
  cleanFsPath
} = require('../lib/paths');

describe('isExistingImageFile', () => {
  it('accepts real image files only', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-img-'));
    const img = path.join(tmp, 'ok.png');
    const txt = path.join(tmp, 'nope.txt');
    fs.writeFileSync(img, 'x');
    fs.writeFileSync(txt, 'y');

    assert.equal(isExistingImageFile(img), true);
    assert.equal(isExistingImageFile(txt), false);
    assert.equal(isExistingImageFile(tmp), false);
    assert.equal(isExistingImageFile(path.join(tmp, 'missing.jpg')), false);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe('allowImageFile', () => {
  it('registers parent only for image files', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-allow2-'));
    const img = path.join(tmp, 'pic.webp');
    const secret = path.join(tmp, 'secret.txt');
    fs.writeFileSync(img, 'x');
    fs.writeFileSync(secret, 'secret');

    const allow = createPathAllowlist([]);
    assert.equal(allow.allowImageFile(secret), null);
    assert.equal(allow.isAllowed(secret), false);

    const registered = allow.allowImageFile(img);
    assert.ok(registered);
    assert.equal(allow.isAllowed(img), true);
    // sibling non-image under same dir becomes readable via allowlist root —
    // that's intentional (folder scan). Arbitrary other dirs stay blocked.
    assert.equal(allow.isAllowed(path.join(os.tmpdir(), 'other-cv-root', 'x.png')), false);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('rejects non-existent paths', () => {
    const allow = createPathAllowlist([]);
    assert.equal(allow.allowImageFile('C:\\definitely\\missing\\file.jpg'), null);
  });
});

describe('cleanFsPath hardening', () => {
  it('throws on non-string', () => {
    assert.throws(() => cleanFsPath(null), TypeError);
    assert.throws(() => cleanFsPath(42), TypeError);
  });

  it('isImagePath rejects text', () => {
    assert.equal(isImagePath('readme.md'), false);
    assert.equal(isImagePath('x.JPEG'), true);
  });
});
