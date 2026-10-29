'use strict';

// Leaves enough room for the complete titlebar hints and docked action bar,
// including the sidebar width when it is open.
const MIN_W = 960;
const MIN_H = 500;

/**
 * Clamp/restore window bounds into a display workArea.
 * Mitigates Electron+Windows mixed-DPI bugs where saved sizes grow across launches.
 *
 * Display priority:
 * 1) preferredDisplayId (explicit user setting, not "auto")
 * 2) bounds.displayId / opts.savedDisplayId (last closed monitor)
 * 3) display nearest to bounds center
 * 4) primary
 *
 * @param {object|null} bounds - { x, y, width, height, displayId? }
 * @param {object} opts
 * @param {Array} opts.displays - from screen.getAllDisplays()
 * @param {object} opts.primary - primary display
 * @param {string|number} [opts.preferredDisplayId]
 * @param {string|number} [opts.savedDisplayId]
 * @param {boolean} [opts.center] - Center the restored size on the selected display.
 */
function clampWindowBounds(bounds, opts) {
  const displays = opts.displays || [];
  const primary = opts.primary || displays[0];
  if (!primary) {
    return { x: 0, y: 0, width: 1280, height: 800 };
  }

  let display = primary;
  const preferredId = opts.preferredDisplayId;
  const savedId =
    (opts.savedDisplayId != null ? opts.savedDisplayId : null) ??
    (bounds && bounds.displayId != null ? bounds.displayId : null);

  if (preferredId && preferredId !== 'auto') {
    display = displays.find((d) => d.id.toString() === preferredId.toString()) || primary;
  } else if (savedId != null && savedId !== 'auto') {
    display = displays.find((d) => d.id.toString() === savedId.toString()) || primary;
  } else if (bounds && typeof bounds.x === 'number' && typeof bounds.y === 'number') {
    const cx = Math.round(bounds.x + (Number(bounds.width) || 0) / 2);
    const cy = Math.round(bounds.y + (Number(bounds.height) || 0) / 2);
    display = displayNearestPoint(displays, primary, cx, cy);
  }

  const area = display.workArea || display.bounds;
  const maxW = Math.max(MIN_W, area.width);
  const maxH = Math.max(MIN_H, area.height);
  const defaultW = Math.min(1280, Math.max(MIN_W, Math.floor(area.width * 0.85)));
  const defaultH = Math.min(800, Math.max(MIN_H, Math.floor(area.height * 0.85)));

  let w = Number(bounds && bounds.width);
  let h = Number(bounds && bounds.height);
  if (!Number.isFinite(w) || w <= 0) w = defaultW;
  if (!Number.isFinite(h) || h <= 0) h = defaultH;

  // Saved size larger than the target work area ⇒ DPI inflation; reset.
  if (w > area.width || h > area.height) {
    w = defaultW;
    h = defaultH;
  }

  w = Math.min(Math.max(Math.round(w), MIN_W), maxW);
  h = Math.min(Math.max(Math.round(h), MIN_H), maxH);

  let x = bounds && typeof bounds.x === 'number' ? Math.round(bounds.x) : NaN;
  let y = bounds && typeof bounds.y === 'number' ? Math.round(bounds.y) : NaN;

  // If preferred monitor forced, or position missing/off that display, center.
  const onPreferred = preferredId && preferredId !== 'auto';
  const fullyInside =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= area.x - 8 &&
    y >= area.y - 8 &&
    x + w <= area.x + area.width + 8 &&
    y + h <= area.y + area.height + 8;

  if (onPreferred || opts.center === true || !fullyInside || !Number.isFinite(x) || !Number.isFinite(y)) {
    x = Math.round(area.x + (area.width - w) / 2);
    y = Math.round(area.y + (area.height - h) / 2);
  }

  x = Math.min(Math.max(x, area.x), area.x + Math.max(0, area.width - w));
  y = Math.min(Math.max(y, area.y), area.y + Math.max(0, area.height - h));

  return { x, y, width: w, height: h, displayId: display.id };
}

/**
 * Next bounds to request when the window manager returned `got` instead of
 * `want`.
 *
 * Windows inflates a window's size the first time it is placed on a display
 * with a different scale factor than the one it was created on: asking for
 * 1153x612 while the window sits at 125% and landing on a 150% monitor yields
 * 1384x735, the 1.5/1.25 ratio. The inflation is a one-time artifact of
 * crossing the DPI boundary, so the correction is simply to request the same
 * target again once the window is on that display. Scaling the request by the
 * observed ratio instead overshoots and oscillates.
 *
 * The origin is kept as requested and the result stays inside `area` when one
 * is given.
 *
 * @param {{x:number,y:number,width:number,height:number}} want
 * @param {{x:number,y:number,width:number,height:number}} got
 * @param {{x:number,y:number,width:number,height:number}} [area]
 */
function nextBoundsAttempt(want, got, area) {
  let width = Math.max(1, Math.round(Number(want.width)));
  let height = Math.max(1, Math.round(Number(want.height)));
  let x = Math.round(Number(want.x));
  let y = Math.round(Number(want.y));

  if (area) {
    width = Math.min(width, Math.max(1, area.width));
    height = Math.min(height, Math.max(1, area.height));
    x = Math.min(Math.max(x, area.x), area.x + Math.max(0, area.width - width));
    y = Math.min(Math.max(y, area.y), area.y + Math.max(0, area.height - height));
  }

  return { x, y, width, height };
}

/**
 * True when `got` is close enough to `want` to stop correcting. A couple of
 * pixels is normal rounding on scaled displays, and re-requesting it can
 * oscillate forever.
 */
function boundsMatch(want, got, tolerance = 2) {
  if (!want || !got) return false;
  return (
    Math.abs(got.x - want.x) <= tolerance &&
    Math.abs(got.y - want.y) <= tolerance &&
    Math.abs(got.width - want.width) <= tolerance &&
    Math.abs(got.height - want.height) <= tolerance
  );
}

function displayNearestPoint(displays, primary, x, y) {
  let best = primary;
  let bestDist = Infinity;
  for (const d of displays) {
    const b = d.bounds;
    const cx = Math.min(Math.max(x, b.x), b.x + b.width);
    const cy = Math.min(Math.max(y, b.y), b.y + b.height);
    const dist = (x - cx) * (x - cx) + (y - cy) * (y - cy);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

module.exports = {
  MIN_W,
  MIN_H,
  clampWindowBounds,
  displayNearestPoint,
  nextBoundsAttempt,
  boundsMatch
};
