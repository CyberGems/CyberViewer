'use strict';

/**
 * Pure media/path helpers shared by the renderer and unit tests.
 * UMD: browser → window.CVMedia; Node → module.exports
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CVMedia = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /**
   * Build a cvlocal:// URL that keeps Windows paths intact (query param, not path host).
   * @param {string} fsPath
   * @param {string|number|boolean|null} [bust]
   */
  function mediaUrl(fsPath, bust) {
    if (!fsPath) return '';
    const s = String(fsPath);
    if (s.startsWith('blob:') || s.startsWith('data:')) return s;
    if (s.startsWith('cvlocal:')) {
      try {
        const u = new URL(s.replace(/^cvlocal:/i, 'http:'));
        const p = u.searchParams.get('p');
        if (p) {
          let url = 'cvlocal://media/?p=' + encodeURIComponent(p);
          if (bust != null && bust !== false) url += '&t=' + encodeURIComponent(String(bust));
          return url;
        }
      } catch (_) { /* fall through */ }
    }
    let url = 'cvlocal://media/?p=' + encodeURIComponent(s);
    if (bust != null && bust !== false) url += '&t=' + encodeURIComponent(String(bust));
    return url;
  }

  /**
   * Build a CSS Canvas filter string from basic adjust controls.
   * Tone sliders use -100..100 with 0 as neutral (maps to factor 1.0).
   * Blur uses 0..100 → 0..20px at the current canvas resolution.
   * @param {{ brightness?: number, contrast?: number, saturation?: number, blur?: number, grayscale?: boolean, invert?: boolean }} opts
   * @param {{ blurScale?: number }} [renderOpts] optional multiplier for blur px (e.g. preview scale)
   * @returns {string}
   */
  function buildCssFilter(opts, renderOpts) {
    const o = opts || {};
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
    const toFactor = (n) => 1 + clamp(n, -100, 100) / 100;
    const blurScale = renderOpts && renderOpts.blurScale != null ? Number(renderOpts.blurScale) : 1;
    const safeScale = Number.isFinite(blurScale) && blurScale > 0 ? blurScale : 1;
    // Scale blur with canvas size so a downscaled preview matches full-res strength
    const blurPx = (clamp(o.blur, 0, 100) / 100) * 20 * safeScale;
    const parts = [
      'brightness(' + toFactor(o.brightness) + ')',
      'contrast(' + toFactor(o.contrast) + ')',
      'saturate(' + toFactor(o.saturation) + ')',
      'grayscale(' + (o.grayscale ? 1 : 0) + ')',
      'invert(' + (o.invert ? 1 : 0) + ')'
    ];
    if (blurPx > 0.01) {
      parts.push('blur(' + (Math.round(blurPx * 100) / 100) + 'px)');
    }
    return parts.join(' ');
  }

  /**
   * True when adjust controls are all at neutral defaults.
   * @param {{ brightness?: number, contrast?: number, saturation?: number, blur?: number, grayscale?: boolean, invert?: boolean }} opts
   */
  function isIdentityAdjust(opts) {
    const o = opts || {};
    return (
      (Number(o.brightness) || 0) === 0 &&
      (Number(o.contrast) || 0) === 0 &&
      (Number(o.saturation) || 0) === 0 &&
      (Number(o.blur) || 0) === 0 &&
      !o.grayscale &&
      !o.invert
    );
  }

  /**
   * Export a canvas to base64 buffer + path for save-image IPC.
   * Rasterizes exotic containers (gif/webp/bmp/tiff) to PNG.
   * @param {HTMLCanvasElement} canvas
   * @param {string} filePath
   */
  function canvasExport(canvas, filePath) {
    const ext = (String(filePath || '').split('.').pop() || '').toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') {
      return {
        buffer: canvas.toDataURL('image/jpeg', 0.95).split(',')[1],
        filePath: filePath
      };
    }
    let outPath = filePath;
    if (ext !== 'png') {
      outPath = String(filePath).replace(/\.[^.]+$/i, '.png');
    }
    return {
      buffer: canvas.toDataURL('image/png').split(',')[1],
      filePath: outPath
    };
  }

  /**
   * Human-readable byte size for properties / status.
   * @param {number|null|undefined} bytes
   */
  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined) return '-';
    if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    if (bytes > 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }

  /**
   * Slider 0–1000 ↔ zoom factor (log scale).
   */
  function sliderToZoom(val, zoomMin, zoomMax) {
    const t = Math.max(0, Math.min(1000, Number(val) || 0)) / 1000;
    const min = zoomMin != null ? zoomMin : 0.05;
    const max = zoomMax != null ? zoomMax : 20;
    return min * Math.pow(max / min, t);
  }

  function zoomToSlider(zoom, zoomMin, zoomMax) {
    const min = zoomMin != null ? zoomMin : 0.05;
    const max = zoomMax != null ? zoomMax : 20;
    const z = Math.max(min, Math.min(max, Number(zoom) || 1));
    const t = Math.log(z / min) / Math.log(max / min);
    return Math.round(t * 1000);
  }

  /** Parent directory of a file path (Windows / POSIX separators). */
  function folderDirFromPath(filePath) {
    if (!filePath) return '';
    const norm = String(filePath).replace(/[\\/]+$/, '');
    const i = Math.max(norm.lastIndexOf('\\'), norm.lastIndexOf('/'));
    return i >= 0 ? norm.slice(0, i) : '';
  }

  /** Last segment of a directory path. */
  function folderNameFromPath(dirPath) {
    if (!dirPath) return '';
    const norm = String(dirPath).replace(/[\\/]+$/, '');
    const parts = norm.split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  return {
    mediaUrl,
    canvasExport,
    buildCssFilter,
    isIdentityAdjust,
    formatBytes,
    sliderToZoom,
    zoomToSlider,
    folderDirFromPath,
    folderNameFromPath
  };
});
