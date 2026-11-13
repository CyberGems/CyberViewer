(function (root, factory) {
  'use strict';
  const api = factory(typeof module === 'object' && module.exports ? require('./youtube-source') : root.CVYouTubeSource);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CVFormats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (youtube) {
  'use strict';
  const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.ico', '.avif']);
  const VIDEO_EXTS = new Set(['.mp4', '.m4v', '.webm', '.mov', '.mkv']);
  const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.ogg', '.oga', '.opus', '.aac', '.m4a']);
  const MEDIA_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS, ...AUDIO_EXTS]);
  // Curated display labels (no redundant aliases like JPEG/TIFF) shared by the
  // About panel and the welcome formats flyout, so both list the same set.
  const IMAGE_FORMAT_LABELS = ['JPG', 'PNG', 'GIF', 'WebP', 'BMP', 'ICO', 'AVIF'];
  const VIDEO_FORMAT_LABELS = ['MP4', 'WebM', 'MOV', 'MKV'];
  const AUDIO_FORMAT_LABELS = [...AUDIO_EXTS].map((ext) => ext.slice(1).toUpperCase());
  function extension(value) {
    const file = value?.file || value;
    const name = typeof file === 'string' ? file : file?.path || file?.name || '';
    return /\.[^.\\/]+$/.exec(name)?.[0].toLowerCase() || '';
  }
  const isVideo = value => !!youtube?.isYouTube(value) || VIDEO_EXTS.has(extension(value));
  const isAudio = value => AUDIO_EXTS.has(extension(value));
  const isPlayable = value => isVideo(value) || isAudio(value);
  const isSupportedFile = file => !!youtube?.isYouTube(file) || MEDIA_EXTS.has(extension(file)) || (!file?.path && file?.type?.startsWith('image/'));
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const rest = String(total % 60).padStart(2, '0');
    return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
  }
  return { IMAGE_EXTS, VIDEO_EXTS, AUDIO_EXTS, MEDIA_EXTS, IMAGE_FORMAT_LABELS, VIDEO_FORMAT_LABELS, AUDIO_FORMAT_LABELS, isVideo, isAudio, isPlayable, isSupportedFile, formatTime };
});
