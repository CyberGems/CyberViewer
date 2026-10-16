(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CVYouTubeSource = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,128}$/;
  function seconds(value) {
    if (!value) return 0;
    if (/^\d+(?:\.\d+)?$/.test(value)) return Math.min(1e9, Number(value));
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
    return match ? Math.min(1e9, Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)) : 0;
  }
  function parse(value) {
    if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\\]/.test(value.trim())) return null;
    let url;
    try { url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : 'https://' + value.trim()); } catch (_) { return null; }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(host)) return null;
    let videoId = null;
    if (host.endsWith('youtu.be')) videoId = url.pathname.split('/')[1];
    else if (url.pathname === '/watch') videoId = url.searchParams.get('v');
    else videoId = /^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] || null;
    if (videoId && !VIDEO_ID.test(videoId)) return null;
    const playlistId = url.searchParams.get('list');
    if (playlistId && !PLAYLIST_ID.test(playlistId)) return null;
    if (!videoId && !(playlistId && ['/playlist', '/embed/videoseries', '/embed', '/embed/'].includes(url.pathname))) return null;
    const index = Math.min(100000, Math.max(0, Number.parseInt(url.searchParams.get('index'), 10) - 1 || 0));
    const startSeconds = seconds(url.searchParams.get('t') || url.searchParams.get('start') || url.hash.match(/^#t=(.+)$/)?.[1]);
    const canonical = new URL(videoId ? 'https://www.youtube.com/watch' : 'https://www.youtube.com/playlist');
    if (videoId) canonical.searchParams.set('v', videoId);
    if (playlistId) canonical.searchParams.set('list', playlistId);
    return { url: canonical.href, videoId, playlistId, index, startSeconds };
  }
  function from(value) {
    const file = value?.file || value;
    return parse(typeof file === 'string' ? file : file?.path);
  }
  return { parse, from, isYouTube: value => !!from(value), VIDEO_ID, PLAYLIST_ID };
});
