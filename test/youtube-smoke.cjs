'use strict';
// Live integration test: requires internet and public, embeddable YouTube items.
const { app, BrowserWindow, webContents, nativeImage, session } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const dir = process.env.CV_YOUTUBE_TEST_DIR, phase = process.env.CV_YOUTUBE_TEST_PHASE;
if (!dir || !path.basename(dir).startsWith('cyberviewer-youtube-test-')) throw new Error('Isolated profile required');
app.setPath('userData', dir); app.setName('CyberViewer YouTube Test'); process.argv.push('--startup');
if (phase === 'initial') fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ app: {
  language: 'es', videoAutoplay: false, restoreSession: true, closeChoiceMade: true, closeToTray: false,
  checkUpdatesOnStartup: false, toggleHotkey: 'disabled', contextMenuEnabled: false, autoBackup: { enabled: false }
}, window: { width: 1100, height: 800, maximized: false } }));
require('../main');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let diagnostics = async () => ({});
async function waitFor(callback, description, timeout = 35000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await callback()) return; await delay(100); }
  throw new Error('Timed out: ' + description);
}
app.whenReady().then(async () => {
  let win;
  await waitFor(() => (win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('CyberViewer.html'))), 'main window');
  const evaluate = body => win.webContents.executeJavaScript('(async()=>{' + body + '})()');
  const child = () => webContents.getAllWebContents().find(w => w.getURL().endsWith('/assets/youtube-player.html'));
  const info = () => evaluate('return window.CVYouTube.info;');
  diagnostics = async () => {
    if (child()) fs.writeFileSync(path.join(dir,'failure-player.png'),(await child().capturePage()).toPNG());
    if (child()) for (const f of child().mainFrame.frames) console.error('Player frame:', f.url, await f.executeJavaScript("[...document.querySelectorAll('button')].map(el=>({label:el.getAttribute('aria-label'),class:el.className})).slice(-40)"));
    return evaluate("return {info:window.CVYouTube.info,status:$('youtube-status').textContent,hidden:document.hidden,modals:[...document.querySelectorAll('.modal-overlay.active')].map(el=>el.id)};");
  };
  const loaded = () => waitFor(async () => (await info())?.videoId, 'YouTube video ready');
  await waitFor(() => evaluate('return window.CVWorkspace?.ready;'), 'workspace ready');
  if (phase === 'restore') {
    await loaded();
    await waitFor(async () => Math.abs((await info()).time - 12) < 1, 'restored YouTube playback time');
    assert.equal((await info()).videoId, 'M7lc1UVf-VE');
    assert.equal((await info()).state, 5);
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 2);
    console.log('PASS restart restores YouTube tabs and playback position with autoplay off');
  } else {
    await evaluate("window.CVYouTube.openDialog(); $('youtube-url').value='https://evil.test/watch?v=M7lc1UVf-VE'; $('youtube-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));");
    assert.equal(await evaluate("return !$('youtube-url-error').hidden && window.CVWorkspace.model.tabs.length===0;"), true);
    await evaluate("$('youtube-url').value='https://youtu.be/M7lc1UVf-VE?t=12'; $('youtube-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));");
    await loaded();
    await waitFor(async () => Math.abs((await info()).time - 12) < 1, 'start time from URL');
    assert.equal(await child().executeJavaScript('typeof window.electronAPI'), 'undefined');
    assert.equal(child().getLastWebPreferences().sandbox, true);
    assert.equal(child().getLastWebPreferences().nodeIntegration, false);
    assert.equal(await evaluate("return $('btn-rot-l').disabled && $('btn-copy').disabled;"), true);
    await evaluate("window.CVYouTube.command('mute');");
    await waitFor(async () => (await info())?.muted, 'mute acknowledged by YouTube');
    await evaluate("window.CVYouTube.command('toggle');");
    await waitFor(async () => (await info())?.state === 1 || await evaluate("return $('youtube-status').textContent.includes('Pulsa');"), 'play or documented autoplay block');
    if ((await info()).state !== 1) {
      win.show(); win.focus(); child().focus();
      await waitFor(() => win.isFocused(), 'focused player window');
      // Exercise YouTube's own Play button with a trusted user gesture. Native
      // screen coordinates vary with the desktop's per-monitor DPI scaling.
      const frame = child().mainFrame.frames.find(f => f.url.startsWith('https://www.youtube-nocookie.com/'));
      assert.ok(frame, 'Official player iframe exists');
      const play = '.ytp-large-play-button, .ytp-play-button, .ytmCuedOverlayPlayButton';
      await waitFor(() => frame.executeJavaScript('!!document.querySelector(' + JSON.stringify(play) + ')'), 'official Play button ready');
      await frame.executeJavaScript('document.querySelector(' + JSON.stringify(play) + ').click()', true);
    }
    await waitFor(async () => { const value = await info(); return [1, 3].includes(value.state) && value.time > 12.5; }, 'actual YouTube playback', 45000);
    const playingFrame = child().mainFrame.frames.find(f => f.url.startsWith('https://www.youtube-nocookie.com/'));
    assert.equal(await playingFrame.executeJavaScript("(()=>{const video=document.querySelector('video');return !!video && !video.paused && video.getVideoPlaybackQuality().totalVideoFrames>0})()"), true, 'YouTube actually decodes video frames');
    await evaluate("window.CVYouTube.command('pause');");
    await waitFor(async () => (await info()).state === 2, 'YouTube pause');
    console.log('PASS valid/invalid link dialog, URL timestamp, isolated permissions, decoded playback and pause');
    fs.writeFileSync(path.join(dir, 'youtube-player.png'), (await child().capturePage()).toPNG());
    await evaluate("$('youtube-fullscreen').click();");
    await waitFor(() => win.isFullScreen(), 'native fullscreen');
    await waitFor(() => evaluate("return state.isGhost && getComputedStyle($('youtube-footer')).display==='none';"), 'fullscreen without CyberViewer overlays');
    assert.equal(await evaluate("return getComputedStyle($('ghost-close')).display==='none';"), true);
    child().sendInputEvent({ type: 'keyDown', keyCode: 'ESC' });
    child().sendInputEvent({ type: 'keyUp', keyCode: 'ESC' });
    await waitFor(() => !win.isFullScreen(), 'Escape from focused YouTube player');
    const officialFrame = child().mainFrame.frames.find(f => f.url.startsWith('https://www.youtube-nocookie.com/'));
    await officialFrame.executeJavaScript("document.querySelector('.ytmA11yStylesHiddenButton')?.click()", true);
    const fullscreen = '.ytp-fullscreen-button, button[aria-label*="pantalla completa" i], button[aria-label*="full screen" i]';
    await waitFor(() => officialFrame.executeJavaScript('!!document.querySelector(' + JSON.stringify(fullscreen) + ')'), 'official fullscreen button ready');
    await officialFrame.executeJavaScript('document.querySelector(' + JSON.stringify(fullscreen) + ').click()', true);
    await waitFor(() => win.isFullScreen(), 'official YouTube fullscreen control');
    child().sendInputEvent({ type: 'keyDown', keyCode: 'ESC' });
    child().sendInputEvent({ type: 'keyUp', keyCode: 'ESC' });
    await waitFor(() => !win.isFullScreen(), 'Escape from official YouTube fullscreen');
    await waitFor(() => child().executeJavaScript('!document.fullscreenElement'), 'official player leaves HTML fullscreen');
    await evaluate("window.CVYouTube.openDialog();");
    await delay(200);
    const view = win.contentView.children.find(v => v.webContents === child());
    assert.equal(view.getVisible(), false, 'Native view must not cover dialogs');
    await evaluate("closeModal('modal-youtube');");
    await waitFor(() => view.getVisible(), 'view after dialog closes');
    const firstId = await evaluate('return window.CVWorkspace.model.activeId;');
    await evaluate('return await window.CVWorkspace.openYouTube(' + JSON.stringify(process.env.CV_YOUTUBE_PLAYLIST || 'https://www.youtube.com/playlist?list=UU_x5XG1OV2P6uZZ5FSM9Ttw') + ');');
    await waitFor(async () => (await info())?.count > 1, 'complete playlist loaded');
    await evaluate("window.CVYouTube.command('mute'); window.CVYouTube.command('next');");
    await waitFor(async () => (await info())?.index === 1 && (await info())?.state === 1, 'next playlist video');
    const second = (await info()).videoId;
    await evaluate("window.CVYouTube.command('pause');");
    await waitFor(async () => (await info()).state === 2, 'playlist paused');
    const listId = await evaluate('return window.CVWorkspace.model.activeId;');
    await evaluate('await window.CVWorkspace.activate(' + JSON.stringify(firstId) + ');'); await loaded();
    await evaluate('await window.CVWorkspace.activate(' + JSON.stringify(listId) + ');');
    await waitFor(async () => (await info())?.videoId === second && (await info())?.index === 1, 'playlist selection across tab switches');
    assert.equal(webContents.getAllWebContents().filter(w => w.getURL().endsWith('/assets/youtube-player.html')).length, 1, 'Only one YouTube renderer stays active');
    console.log('PASS native fullscreen/Escape, modal layering, full playlist, next video, retained playlist position and decoder release');
    fs.writeFileSync(path.join(dir, 'youtube-playlist.png'), (await child().capturePage()).toPNG());
    const png = nativeImage.createFromBitmap(Buffer.alloc(80*60*4,255),{width:80,height:60}).toPNG();
    const image = path.join(dir,'still.png'); fs.writeFileSync(image,png);
    await evaluate('await openImagePath(' + JSON.stringify(image) + ');');
    await waitFor(() => !child(), 'YouTube renderer closes on local image');
    assert.equal(await evaluate("return !$('btn-rot-l').disabled && !window.CVYouTube.active();"), true);
    await evaluate('window.CVWorkspace.closeTabs([window.CVWorkspace.model.activeId],{discard:true,remember:false});');
    await evaluate('await window.CVWorkspace.activate(' + JSON.stringify(firstId) + ');'); await loaded();
    await evaluate('await window.CVWorkspace.openYouTube("https://youtu.be/M7lc1UVf-VE?t=12");');
    await loaded(); await waitFor(async () => Math.abs((await info()).time - 12) < 1, 'final saved YouTube time');
    await evaluate('window.CVWorkspace.capture(); await window.CVWorkspace.flush(); window.CVWorkspace.suspend(); await window.CVWorkspace.flush();');
    await waitFor(() => !child(), 'suspend releases YouTube renderer');
    console.log('PASS local image tools recover, session saves, tray suspension destroys the online player');
    // Real network failure must stay actionable without touching the normal session.
    await session.fromPartition('youtube-player').clearCache();
    const onlineSession = session.fromPartition('youtube-player');
    onlineSession.webRequest.onBeforeRequest({ urls: ['https://*/*'] }, (_details, callback) => callback({ cancel: true }));
    await evaluate('window.CVWorkspace.resume();');
    await waitFor(() => evaluate("return !$('youtube-retry').hidden && $('youtube-status').textContent.includes('YouTube');"), 'offline error with retry', 40000);
    onlineSession.webRequest.onBeforeRequest(null);
    await evaluate("$('youtube-retry').click();");
    await loaded();
    await waitFor(async () => (await info())?.state === 5, 'retry reconnects to YouTube');
    console.log('PASS network loading failure, actionable error and successful retry');
  }
  app.exit(0);
}).catch(async error => { console.error(error); try { console.error('Diagnostics:', await diagnostics()); } catch (_) { /* Keep the original failure. */ } app.exit(1); });
setTimeout(() => { console.error('YouTube smoke timeout'); app.exit(2); }, 170000);
