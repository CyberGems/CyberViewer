(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CVFormats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.ico', '.avif']);
  const VIDEO_EXTS = new Set(['.mp4', '.m4v', '.webm', '.mov', '.mkv']);
  const MEDIA_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS]);
  function extension(value) {
    const file = value?.file || value;
    const name = typeof file === 'string' ? file : file?.path || file?.name || '';
    return /\.[^.\\/]+$/.exec(name)?.[0].toLowerCase() || '';
  }
  const isVideo = value => VIDEO_EXTS.has(extension(value));
  const isSupportedFile = file => MEDIA_EXTS.has(extension(file)) || (!file?.path && file?.type?.startsWith('image/'));
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const rest = String(total % 60).padStart(2, '0');
    return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
  }
  return { IMAGE_EXTS, VIDEO_EXTS, MEDIA_EXTS, isVideo, isSupportedFile, formatTime };
});
