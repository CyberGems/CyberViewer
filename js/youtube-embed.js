'use strict';
// Runs only in the isolated player view. All media stays in YouTube's iframe.
(() => {
  let player = null, options = null, timer = null, ready = false, mediaReady = false, selected = false, lastError = null;
  const pending = [];
  let initialSeek = false, initialVideoId = '';
  const report = value => window.youtubeHost.report(value);
  function snapshot() {
    if (!ready || !player) return;
    const video = player.getVideoData();
    report({ ready: mediaReady, error: lastError, muted: player.isMuted(), title: video?.title || '', videoId: video?.video_id || '',
      time: player.getCurrentTime() || 0, duration: player.getDuration() || 0,
      state: player.getPlayerState(), index: player.getPlaylistIndex(), count: player.getPlaylist()?.length || 0 });
  }
  function select() {
    if (selected || !options?.playlistId) return false;
    const ids = player.getPlaylist() || [];
    if (!ids.length) return false;
    selected = true;
    const found = options.videoId ? ids.indexOf(options.videoId) : -1;
    const index = found >= 0 ? found : Math.min(options.index || 0, ids.length - 1);
    initialVideoId = ids[index];
    if (!options.autoplay && index === player.getPlaylistIndex() && !options.startSeconds) return false;
    const list = { list: options.playlistId, listType: 'playlist', index, startSeconds: options.startSeconds || 0 };
    if (options.autoplay) player.loadPlaylist(list); else player.cuePlaylist(list);
    return true;
  }
  function create() {
    if (!options || !window.YT?.Player || player) return;
    const vars = { controls: 1, autoplay: 0, playsinline: 1, rel: 0, hl: options.language, fs: 1 };
    if (['https:', 'http:'].includes(location.protocol)) vars.origin = location.origin;
    player = new window.YT.Player('player', { width: '100%', height: '100%', host: 'https://www.youtube-nocookie.com',
      playerVars: vars, events: {
        onReady: () => {
          ready = true;
          const item = { videoId: options.videoId, startSeconds: options.startSeconds || 0 };
          if (options.playlistId) player.cuePlaylist({ list: options.playlistId, listType: 'playlist', index: options.index || 0 });
          else if (options.autoplay) player.loadVideoById(item); else player.cueVideoById(item);
          clearTimeout(timer); timer = setInterval(() => {
            if (select()) mediaReady = false;
            // Re-cueing an already selected item need not produce a new state
            // event. Poll the actual state too, so restored playlists settle.
            else if ([0, 1, 2, 5].includes(player.getPlayerState()) && player.getVideoData()?.video_id) mediaReady = true;
            snapshot();
            if (mediaReady) for (const command of pending.splice(0)) control(command);
          }, 1000);
          snapshot();
        },
        onStateChange: event => {
          if (select()) { mediaReady = false; return; }
          if ([0, 1, 2, 5].includes(event.data)) mediaReady = true;
          if (event.data === 1) lastError = null;
          if (event.data === 1 && initialSeek) {
            initialSeek = false;
            if (player.getVideoData()?.video_id === initialVideoId && Math.abs(player.getCurrentTime() - options.startSeconds) > 1) player.seekTo(options.startSeconds, true);
          }
          snapshot();
          if (mediaReady) for (const command of pending.splice(0)) control(command);
        },
        onError: event => { lastError = Number(event.data) || 'playback'; report({ error: lastError }); },
        onAutoplayBlocked: () => { mediaReady = true; report({ blocked: true }); snapshot(); }
      } });
  }
  window.onYouTubeIframeAPIReady = create;
  window.youtubeHost.onLoad(value => {
    options = value;
    initialSeek = value.startSeconds > 0;
    initialVideoId = value.videoId || '';
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => report({ error: 'network' });
    document.head.append(script);
    timer = setTimeout(() => report({ error: 'network' }), 25000);
    create();
  });
  function control(command) {
    if (!ready || !player || !mediaReady) { if (pending.length < 10) pending.push(command); return; }
    switch (command.action) {
      case 'toggle': if (player.getPlayerState() === 1) player.pauseVideo(); else player.playVideo(); break;
      case 'pause': player.pauseVideo(); break;
      case 'seek': player.seekTo(Math.max(0, player.getCurrentTime() + command.seconds), true); break;
      case 'mute': if (player.isMuted()) player.unMute(); else player.mute(); break;
      case 'next': player.nextVideo(); break;
      case 'previous': player.previousVideo(); break;
      case 'loop': player.setLoop(!!command.enabled); break;
    }
    snapshot();
  }
  window.youtubeHost.onCommand(control);
  window.addEventListener('offline', () => report({ error: 'network' }));
})();
