'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MIN_W, MIN_H, clampWindowBounds, nextBoundsAttempt, boundsMatch } = require('../lib/window-bounds');

function fakeDisplay(id, x, y, width, height, scaleFactor = 1) {
  return {
    id,
    scaleFactor,
    bounds: { x, y, width, height },
    workArea: { x, y, width, height }
  };
}

describe('clampWindowBounds', () => {
  const primary = fakeDisplay(1, 0, 0, 1920, 1080, 1.5);
  const secondary = fakeDisplay(2, 1920, 0, 1920, 1080, 1.25);
  const displays = [primary, secondary];

  it('centers default size on primary when no bounds', () => {
    const r = clampWindowBounds(null, { displays, primary });
    assert.ok(r.width <= primary.workArea.width);
    assert.ok(r.height <= primary.workArea.height);
    assert.ok(r.x >= primary.workArea.x);
    assert.ok(r.y >= primary.workArea.y);
  });

  it('resets DPI-inflated sizes that exceed workArea', () => {
    const r = clampWindowBounds(
      { x: -200, y: 0, width: 4000, height: 2500 },
      { displays, primary }
    );
    assert.ok(r.width <= primary.workArea.width);
    assert.ok(r.height <= primary.workArea.height);
    assert.ok(r.width >= MIN_W);
    assert.ok(r.height >= MIN_H);
  });

  it('enforces the chrome-safe minimum width', () => {
    const r = clampWindowBounds(
      { x: 100, y: 100, width: 640, height: 400 },
      { displays, primary }
    );
    assert.equal(r.width, MIN_W);
    assert.equal(r.height, MIN_H);
  });

  it('keeps a valid restored window on the same display', () => {
    const r = clampWindowBounds(
      { x: 200, y: 100, width: 1100, height: 700 },
      { displays, primary }
    );
    assert.equal(r.width, 1100);
    assert.equal(r.height, 700);
    assert.equal(r.x, 200);
    assert.equal(r.y, 100);
  });

  it('centers a normal restored window on the selected display when requested', () => {
    const r = clampWindowBounds(
      { x: 2680, y: 100, width: 1100, height: 700, displayId: 2 },
      { displays, primary, preferredDisplayId: 'auto', center: true }
    );
    assert.equal(r.displayId, 2);
    assert.equal(r.x, 2330);
    assert.equal(r.y, 190);
  });

  it('honors preferredDisplayId', () => {
    const r = clampWindowBounds(
      { x: 100, y: 100, width: 1000, height: 700 },
      { displays, primary, preferredDisplayId: 2 }
    );
    assert.equal(r.displayId, 2);
    assert.ok(r.x >= secondary.workArea.x);
  });

  it('restores last displayId when preferred is auto', () => {
    const r = clampWindowBounds(
      { x: 100, y: 100, width: 1000, height: 700, displayId: 2 },
      { displays, primary, preferredDisplayId: 'auto' }
    );
    assert.equal(r.displayId, 2);
    assert.ok(r.x >= secondary.workArea.x);
  });

  it('preferredDisplayId wins over saved displayId', () => {
    const r = clampWindowBounds(
      { x: 2100, y: 100, width: 1000, height: 700, displayId: 2 },
      { displays, primary, preferredDisplayId: 1 }
    );
    assert.equal(r.displayId, 1);
    assert.ok(r.x < secondary.workArea.x);
  });
});

describe('nextBoundsAttempt', () => {
  // Real measurement from a 150% display: asking for 1153x612 at 125% and
  // landing on a 150% monitor returns 1384x735 (the 1.5/1.25 ratio).
  const tvArea = { x: -1208, y: 144, width: 1208, height: 720 };
  const want = { x: -1180, y: 198, width: 1153, height: 612 };
  const inflated = { x: -1180, y: 198, width: 1384, height: 735 };

  it('re-requests the same target after a DPI-inflated placement', () => {
    const next = nextBoundsAttempt(want, inflated, tvArea);
    assert.deepEqual(next, want);
  });

  it('converges once the window is on the target display', () => {
    // Real behaviour: the first placement across a DPI boundary is inflated,
    // every placement after that is exact.
    let got = inflated;
    let request = want;
    for (let i = 0; i < 3 && !boundsMatch(want, got); i++) {
      request = nextBoundsAttempt(want, got, tvArea);
      got = { ...request };
    }
    assert.ok(boundsMatch(want, got));
    assert.equal(got.width, want.width);
    assert.equal(got.height, want.height);
  });

  it('keeps the corrected window inside the work area', () => {
    const next = nextBoundsAttempt(want, inflated, tvArea);
    assert.ok(next.x >= tvArea.x);
    assert.ok(next.y >= tvArea.y);
    assert.ok(next.x + next.width <= tvArea.x + tvArea.width);
    assert.ok(next.y + next.height <= tvArea.y + tvArea.height);
  });

  it('clamps an oversized target into the work area', () => {
    const huge = { x: -5000, y: -5000, width: 9000, height: 9000 };
    const next = nextBoundsAttempt(huge, huge, tvArea);
    assert.equal(next.width, tvArea.width);
    assert.equal(next.height, tvArea.height);
    assert.equal(next.x, tvArea.x);
    assert.equal(next.y, tvArea.y);
  });

  it('never returns a negative or zero size', () => {
    const tiny = { x: 0, y: 0, width: 900, height: 400 };
    const next = nextBoundsAttempt(tiny, { x: 0, y: 0, width: 5000, height: 5000 }, tvArea);
    assert.ok(next.width >= 1);
    assert.ok(next.height >= 1);
  });
});

describe('boundsMatch', () => {
  it('accepts a one-pixel rounding difference', () => {
    const a = { x: 10, y: 20, width: 1153, height: 612 };
    const b = { x: 10, y: 20, width: 1154, height: 612 };
    assert.equal(boundsMatch(a, b), true);
  });

  it('rejects a real mismatch', () => {
    const a = { x: 10, y: 20, width: 1153, height: 612 };
    const b = { x: 10, y: 20, width: 1384, height: 735 };
    assert.equal(boundsMatch(a, b), false);
  });
});
