'use strict';
const { WebContentsView, session, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { parse, VIDEO_ID } = require('../js/youtube-source');
const PLAYER_FILE = path.join(__dirname, '..', 'assets', 'youtube-player.html');
const PLAYER_URL = pathToFileURL(PLAYER_FILE).href;
const CLIENT_ID = 'https://com.cybergems.cyberviewer/';

class YouTubePlayer {
  constructor(window) {
    this.window = window; this.view = null; this.id = null;
    this.session = session.fromPartition('youtube-player');
    this.session.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'fullscreen'));
    this.session.webRequest.onBeforeSendHeaders({ urls: ['https://*.youtube.com/*', 'https://*.youtube-nocookie.com/*', 'https://*.googlevideo.com/*'] }, (details, callback) => {
      details.requestHeaders.Referer = CLIENT_ID;
      callback({ requestHeaders: details.requestHeaders });
    });
    this.window.on('closed', () => this.close());
  }
  accepts(event) { return !this.window.isDestroyed() && event.sender === this.window.webContents && event.senderFrame === this.window.webContents.mainFrame; }
  async open(id, value, bounds) {
    const source = parse(value?.url);
    if (!source || !Number.isSafeInteger(id) || id < 1) throw new Error('INVALID_YOUTUBE_SOURCE');
    this.close(); this.id = id;
    const view = this.view = new WebContentsView({ webPreferences: { session: this.session, sandbox: true,
      nodeIntegration: false, contextIsolation: true, webSecurity: true, autoplayPolicy: 'no-user-gesture-required', preload: path.join(__dirname, '..', 'youtube-preload.js') } });
    view.setBackgroundColor('#000000');
    this.window.contentView.addChildView(view);
    this.resize(id, bounds);
    const contents = view.webContents;
    const external = value => {
      try { const url = new URL(value); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) void shell.openExternal(url.href); } catch (_) { /* Invalid player link. */ }
    };
    contents.setWindowOpenHandler(({ url }) => {
      external(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => { event.preventDefault(); external(url); });
    contents.on('will-attach-webview', event => event.preventDefault());
    contents.on('render-process-gone', () => this.send({ error: 'network' }, id));
    contents.on('enter-html-full-screen', () => this.window.webContents.send('fullscreen-changed', true));
    contents.on('leave-html-full-screen', () => this.window.webContents.send('fullscreen-changed', this.window.isFullScreen()));
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const ctrl = input.control || input.meta;
      let action = null;
      if (input.key === 'F11' || (ctrl && input.key.toLowerCase() === 'f')) action = 'fullscreen';
      if (ctrl && input.key.toLowerCase() === 'w') action = 'close-image';
      if (ctrl && input.key.toLowerCase() === 'l') action = 'open-youtube';
      if (ctrl && input.key === 'Tab') action = input.shift ? 'youtube-tab-previous' : 'youtube-tab-next';
      if (input.key === 'Escape' && this.window.isFullScreen()) action = 'fullscreen';
      if (action) { event.preventDefault(); this.window.webContents.send('menu-action', { action }); }
    });
    try {
      await contents.loadFile(PLAYER_FILE);
      if (this.view !== view || contents.isDestroyed()) return false;
      contents.send('youtube:load', { ...source, videoId: VIDEO_ID.test(value.videoId) ? value.videoId : source.videoId,
        index: Math.max(0, Math.min(100000, Number.isSafeInteger(value.index) ? value.index : source.index)),
        startSeconds: Math.max(0, Math.min(1e9, Number.isFinite(value.startSeconds) ? value.startSeconds : source.startSeconds)),
        autoplay: value.autoplay !== false && view.getVisible(), language: value.language === 'es' ? 'es' : 'en' });
      return true;
    } catch (_) { if (this.view === view) this.send({ error: 'network' }, id); return false; }
  }
  resize(id, bounds) {
    if (this.id !== id || !this.view) return;
    const size = this.window.getContentSize();
    const number = value => Number.isFinite(value) ? Math.round(value) : 0;
    const x = Math.max(0, Math.min(size[0], number(bounds?.x)));
    const y = Math.max(0, Math.min(size[1], number(bounds?.y)));
    const width = Math.max(0, Math.min(size[0] - x, number(bounds?.width)));
    const height = Math.max(0, Math.min(size[1] - y, number(bounds?.height)));
    const visible = !!bounds?.visible && width >= 200 && height >= 200;
    this.view.setVisible(visible);
    this.view.setBounds({ x, y, width, height });
    if (!visible) this.command(id, { action: 'pause' });
  }
  command(id, value) {
    if (id !== this.id || !this.view || !['toggle', 'pause', 'seek', 'mute', 'next', 'previous', 'loop'].includes(value?.action)) return;
    this.view.webContents.send('youtube:command', { action: value.action, seconds: Math.max(-3600, Math.min(3600, Number(value.seconds) || 0)), enabled: value.enabled === true });
  }
  report(event, value) {
    if (!this.view || event.sender !== this.view.webContents || event.senderFrame !== this.view.webContents.mainFrame || event.senderFrame.url !== PLAYER_URL) return;
    const state = { ready: value?.ready === true, blocked: value?.blocked === true, muted: value?.muted === true,
      error: [2, 5, 100, 101, 150, 153, 'network', 'playback'].includes(value?.error) ? value.error : null,
      videoId: VIDEO_ID.test(value?.videoId) ? value.videoId : '',
      title: typeof value?.title === 'string' ? value.title.slice(0, 512) : '',
      time: Number.isFinite(value?.time) ? Math.max(0, Math.min(1e9, value.time)) : 0,
      duration: Number.isFinite(value?.duration) ? Math.max(0, Math.min(1e9, value.duration)) : 0,
      state: [-1, 0, 1, 2, 3, 5].includes(value?.state) ? value.state : -1,
      index: Number.isSafeInteger(value?.index) ? Math.max(0, Math.min(100000, value.index)) : 0,
      count: Number.isSafeInteger(value?.count) ? Math.max(0, Math.min(100000, value.count)) : 0 };
    this.send(state);
  }
  send(value, id = this.id) { if (!this.window.isDestroyed()) this.window.webContents.send('youtube:state', { ...value, id }); }
  close(id = this.id) {
    if (id !== this.id || !this.view) return;
    const view = this.view; this.view = null; this.id = null;
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
}
module.exports = { YouTubePlayer };
