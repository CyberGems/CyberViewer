'use strict';

const MIN_W = 800;
const MIN_H = 500;

/**
 * Clamp/restore window bounds into a display workArea.
 * Mitigates Electron+Windows mixed-DPI bugs where saved sizes grow across launches.
 *
 * @param {object|null} bounds - { x, y, width, height }
 * @param {object} opts
 * @param {Array} opts.displays - from screen.getAllDisplays()
 * @param {object} opts.primary - primary display
 * @param {string|number} [opts.preferredDisplayId]
 */
function clampWindowBounds(bounds, opts) {
  const displays = opts.displays || [];
  const primary = opts.primary || displays[0];
  if (!primary) {
    return { x: 0, y: 0, width: 1280, height: 800 };
  }

  let display = primary;
  const preferredId = opts.preferredDisplayId;
  if (preferredId && preferredId !== 'auto') {
    display = displays.find((d) => d.id.toString() === preferredId.toString()) || primary;
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

  if (onPreferred || !fullyInside || !Number.isFinite(x) || !Number.isFinite(y)) {
    x = Math.round(area.x + (area.width - w) / 2);
    y = Math.round(area.y + (area.height - h) / 2);
  }

  x = Math.min(Math.max(x, area.x), area.x + Math.max(0, area.width - w));
  y = Math.min(Math.max(y, area.y), area.y + Math.max(0, area.height - h));

  return { x, y, width: w, height: h, displayId: display.id };
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
  displayNearestPoint
};
