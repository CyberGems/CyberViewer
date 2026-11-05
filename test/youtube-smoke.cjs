'use strict';
// Live integration test: requires internet and public, embeddable YouTube items.
const { app, BrowserWindow, webContents, nativeImage, session, Menu } = require('electron');
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
    if (child()) for (const f of child().mainFrame.frames) console.error('Player frame:', f.url, await f.executeJavaScript("({fullscreen:document.fullscreenElement?.tagName,fullscreenId:document.fullscreenElement?.id,buttons:[...document.querySelectorAll('button')].map(el=>({label:el.getAttribute('aria-label'),class:el.className})).slice(-40)})"));
    return evaluate(`const image=$('props-youtube-thumbnail');
      return {info:window.CVYouTube.info,status:$('youtube-status').textContent,hidden:document.hidden,
        modals:[...document.querySelectorAll('.modal-overlay.active')].map(el=>el.id),
        preview:{kind:$('modal-properties').dataset.previewKind,src:image.currentSrc,hidden:image.hidden,
          complete:image.complete,width:image.naturalWidth,height:image.naturalHeight,
          youtubeFallback:$('props-youtube-preview').hidden,videoFallback:$('props-video-preview').hidden}};`);
  };
  const loaded = () => waitFor(async () => (await info())?.videoId, 'YouTube video ready');
  await waitFor(() => evaluate('return window.CVWorkspace?.ready;'), 'workspace ready');
  if (process.env.CV_YOUTUBE_PREVIEW_ONLY === '1') {
    await evaluate(`state.youtubeVideoId='';
      state.images=[{file:{path:'https://www.youtube.com/watch?v=3eyBqyXmI24',name:'YouTube preview sample'},w:16,h:9}];
      state.current=0;state.currentIdx=0;syncEmptyState();await showPropertiesPanel();`);
    await waitFor(() => evaluate(`const modal=$('modal-properties'),image=$('props-youtube-thumbnail');
      return modal.classList.contains('active') && modal.dataset.previewKind==='youtube' && !image.hidden &&
        image.complete && image.naturalWidth>=240 && $('props-youtube-preview').hidden && $('props-video-preview').hidden;`),
    'sample YouTube thumbnail displays without either fallback');
    const samplePreview = await evaluate(`const image=$('props-youtube-thumbnail'),stage=$('props-preview-stage').getBoundingClientRect(),rect=image.getBoundingClientRect();
      return {width:image.naturalWidth,height:image.naturalHeight,src:image.currentSrc,
        backgroundImage:getComputedStyle($('props-preview-stage')).backgroundImage,
        fit:getComputedStyle(image).objectFit,stageWidth:stage.width,stageHeight:stage.height,
        imageWidth:rect.width,imageHeight:rect.height};`);
    assert.equal(samplePreview.backgroundImage, 'none');
    assert.equal(samplePreview.fit, 'contain');
    assert.ok(samplePreview.imageWidth >= samplePreview.stageWidth - 4);
    assert.ok(samplePreview.imageHeight >= samplePreview.stageHeight - 4);
    await evaluate(`return await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve,150))));`);
    fs.writeFileSync(path.join(dir, 'youtube-sample-preview.png'), (await win.webContents.capturePage()).toPNG());
    console.log(`PASS YouTube thumbnail loads and displays (${samplePreview.width}×${samplePreview.height}): ${samplePreview.src}`);
    app.exit(0);
    return;
  }
  if (phase === 'restore') {
    await loaded();
    await waitFor(async () => Math.abs((await info()).time - 12) < 1, 'restored YouTube playback time');
    assert.equal(await evaluate('return state.settings.app.videoAutoplay;'), true, 'The autoplay preference stays enabled');
    assert.equal((await info()).videoId, 'M7lc1UVf-VE');
    assert.equal((await info()).state, 5);
    assert.equal(await evaluate('return window.CVWorkspace.model.tabs.length;'), 2);
    const buildMenu = Menu.buildFromTemplate;
    const nativeMenus = [];
    try {
      Menu.buildFromTemplate = items => {
        nativeMenus.push(items);
        return { popup: ({ callback }) => { if (nativeMenus.length === 2) items[0].click(); callback(); } };
      };
      await evaluate("$('image-tab-list').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));");
      await waitFor(() => nativeMenus.length === 1, 'native tab-strip menu opens');
      await evaluate("$('image-tab-list').querySelector('.image-tab-shell.active').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));");
      await waitFor(() => evaluate('return window.CVWorkspace.model.tabs.length === 1;'), 'native tab menu closes selected tab');
    } finally { Menu.buildFromTemplate = buildMenu; }
    assert.equal(nativeMenus[0][0].label, 'Abrir imágenes, videos o audio');
    assert.equal(nativeMenus[1][0].label, 'Cerrar pestaña');
    for (const menu of nativeMenus) for (const item of menu) {
      if (item.type === 'separator') continue;
      assert.ok(item.icon && !item.icon.isEmpty(), `Native icon for ${item.label}`);
      assert.deepEqual(item.icon.getSize(), { width: 16, height: 16 });
      assert.ok(item.icon.toBitmap().some((byte, index) => index % 4 === 3 && byte > 0),
        `Native icon has visible pixels for ${item.label}`);
    }
    assert.equal(await evaluate("return $('custom-ctx-menu').classList.contains('open');"), false);
    console.log('PASS restart restores YouTube position without playing despite autoplay being enabled');
  } else {
    await evaluate("window.CVYouTube.openDialog(); $('youtube-url').value='https://evil.test/watch?v=M7lc1UVf-VE'; $('youtube-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));");
    assert.equal(await evaluate("return !$('youtube-url-error').hidden && window.CVWorkspace.model.tabs.length===0;"), true);
    await evaluate("$('youtube-url').value='https://youtu.be/M7lc1UVf-VE?t=12'; $('youtube-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));");
    await loaded();
    await evaluate('openPropertiesForCurrent();');
    await waitFor(() => evaluate(`const modal=$('modal-properties'), image=$('props-youtube-thumbnail');
      const stage=$('props-preview-stage').getBoundingClientRect(), rect=image.getBoundingClientRect();
      return modal.classList.contains('active') && modal.dataset.previewKind==='youtube' && !image.hidden &&
        image.complete && image.naturalWidth>=240 && $('props-youtube-preview').hidden &&
        $('props-video-preview').hidden &&
        getComputedStyle($('props-preview-stage')).backgroundImage==='none' &&
        getComputedStyle(image).objectFit==='contain' && rect.width>=stage.width-4 && rect.height>=stage.height-4;`),
    'YouTube thumbnail fills the preview area');
    fs.writeFileSync(path.join(dir, 'youtube-properties-thumbnail.png'), (await win.webContents.capturePage()).toPNG());
    await evaluate("closeModal('modal-properties');");
    await waitFor(() => evaluate("return !$('modal-properties').classList.contains('active');"), 'Properties closes');
    await evaluate('openPropertiesForCurrent();');
    await waitFor(() => evaluate("return !$('props-youtube-thumbnail').hidden && $('props-youtube-thumbnail').naturalWidth>=240;"),
      'cached YouTube thumbnail is shown again');
    await evaluate("closeModal('modal-properties');");
    const playerFrame = () => child()?.mainFrame.frames.find(frame =>
      /^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\//.test(frame.url));
    await waitFor(playerFrame, 'YouTube embed frame');
    const embed = playerFrame();
    await waitFor(() => embed.executeJavaScript('window.__cyberviewerFileDragBridge === true').catch(() => false), 'file drag bridge in embed');
    const forwarded = await embed.executeJavaScript(`(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['test'], 'sample.png', { type: 'image/png' }));
      return !document.body.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    })()`);
    assert.equal(forwarded, true, 'cross-origin embed accepts the OS file drag');
    await waitFor(() => child().executeJavaScript(`[...document.body.children].some(el =>
      el.style.zIndex === '2147483647' && el.style.display === 'block')`), 'file drop shield appears over embed');
    const dropShield = await child().executeJavaScript(`(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['test'], 'sample.png', { type: 'image/png' }));
      const frame = document.querySelector('iframe');
      frame.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      const shield = [...document.body.children].find(el => el.getAttribute('aria-hidden') === 'true' && el.style.zIndex === '2147483647');
      const visible = shield?.style.display === 'block';
      shield.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      return { frame: !!frame, visible, cleared: shield.style.display === 'none' };
    })()`);
    assert.deepEqual(dropShield, { frame: true, visible: true, cleared: true }, 'YouTube view accepts file drags over its iframe');
    await evaluate("Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async url => { window.__copiedYouTubeLink = url; } }); $('youtube-copy').click();");
    await waitFor(() => evaluate("return window.__copiedYouTubeLink === 'https://www.youtube.com/watch?v=M7lc1UVf-VE';"), 'standalone video link copied');
    const titleParts = await evaluate(`const image = state.images[state.current], previous = image.file.name;
      image.file.name = '¡Kimi K3.1 Pro ya está aquí!'; syncFilenameDisplays(image);
      const parts = { base: $('titlebar-filename').querySelector('.titlebar-filename-base').textContent,
        extension: $('titlebar-filename').querySelector('.titlebar-filename-extension').textContent };
      image.file.name = previous; syncFilenameDisplays(image); return parts;`);
    assert.deepEqual(titleParts, { base: '¡Kimi K3.1 Pro ya está aquí!', extension: '' }, 'YouTube title is not parsed as a local filename');
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
    const officialFrame = child().mainFrame.frames.find(f => f.url.startsWith('https://www.youtube-nocookie.com/'));
    await officialFrame.executeJavaScript("document.querySelector('.ytmA11yStylesHiddenButton')?.click()", true);
    const fullscreen = '.ytp-fullscreen-button, button.fullscreen-icon, button[aria-label*="pantalla completa" i], button[aria-label*="full screen" i], button[aria-label*="fullscreen" i]';
    const clickOfficialFullscreen = async () => {
      await waitFor(() => officialFrame.executeJavaScript('!!document.querySelector(' + JSON.stringify(fullscreen) + ')'), 'official fullscreen button ready');
      await officialFrame.executeJavaScript('document.querySelector(' + JSON.stringify(fullscreen) + ').click()', true);
    };
    await evaluate("$('youtube-fullscreen').click();");
    await waitFor(() => win.isFullScreen(), 'native fullscreen');
    await waitFor(() => evaluate("return state.isGhost && getComputedStyle($('youtube-footer')).display==='none';"), 'fullscreen without CyberViewer overlays');
    await waitFor(() => child().mainFrame.frames[0].executeJavaScript('!!document.fullscreenElement'), 'app fullscreen reaches YouTube document');
    assert.equal(await evaluate("return getComputedStyle($('ghost-close')).display==='none';"), true);
    await clickOfficialFullscreen();
    await waitFor(() => !win.isFullScreen(), 'YouTube button exits footer-initiated fullscreen before any native entry');
    await waitFor(() => officialFrame.executeJavaScript('!document.fullscreenElement'), 'YouTube button clears footer fullscreen');
    await evaluate("$('youtube-fullscreen').click();");
    await waitFor(() => officialFrame.executeJavaScript('!!document.fullscreenElement'), 'footer re-enters fullscreen');
    child().sendInputEvent({ type: 'keyDown', keyCode: 'ESC' });
    child().sendInputEvent({ type: 'keyUp', keyCode: 'ESC' });
    await waitFor(() => !win.isFullScreen(), 'Escape from focused YouTube player');
    await waitFor(() => officialFrame.executeJavaScript('!!document.querySelector(' + JSON.stringify(fullscreen) + ')'), 'official fullscreen button ready');
    await officialFrame.executeJavaScript('document.querySelector(' + JSON.stringify(fullscreen) + ').click()', true);
    await waitFor(() => win.isFullScreen(), 'official YouTube fullscreen control');
    await waitFor(() => officialFrame.executeJavaScript('!!document.fullscreenElement'), 'YouTube document owns fullscreen');
    await officialFrame.executeJavaScript('document.querySelector(' + JSON.stringify(fullscreen) + ').click()', true);
    await waitFor(() => !win.isFullScreen(), 'official YouTube button exits fullscreen');
    await waitFor(() => child().executeJavaScript('!document.fullscreenElement'), 'button clears HTML fullscreen');
    const doubleClickPlayer = async () => {
      win.show(); win.focus(); child().focus();
      // Native window notifications precede the DOM fullscreen promise and
      // layout. Let Chromium finish both before issuing another gesture.
      await officialFrame.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      // Dispatch inside the cross-origin frame; parent renderer events cannot
      // bubble into it. Electron supplies the Fullscreen API user activation.
      await officialFrame.executeJavaScript("(()=>{const r=document.querySelector('video').getBoundingClientRect(),x=r.x+r.width*.3,y=r.y+r.height*.45;document.elementFromPoint(x,y).dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,view:window,detail:2,button:0,clientX:x,clientY:y}))})()", true);
    };
    await doubleClickPlayer();
    await waitFor(() => win.isFullScreen(), 'double-click enters YouTube fullscreen');
    await waitFor(() => officialFrame.executeJavaScript('!!document.fullscreenElement'), 'double-click fullscreen transition settled');
    await clickOfficialFullscreen();
    await waitFor(() => !win.isFullScreen(), 'YouTube button exits double-click fullscreen');
    await waitFor(() => officialFrame.executeJavaScript('!document.fullscreenElement'), 'YouTube button clears double-click fullscreen');
    await doubleClickPlayer();
    await waitFor(() => officialFrame.executeJavaScript('!!document.fullscreenElement'), 'double-click re-enters fullscreen after native button exit');
    await doubleClickPlayer();
    await waitFor(() => !win.isFullScreen(), 'double-click exits YouTube fullscreen');
    await waitFor(() => officialFrame.executeJavaScript('!document.fullscreenElement'), 'double-click clears YouTube fullscreen');
    await evaluate("$('youtube-fullscreen').click();");
    await waitFor(() => officialFrame.executeJavaScript('!!document.fullscreenElement'), 'app button enters YouTube fullscreen');
    await doubleClickPlayer();
    await waitFor(() => !win.isFullScreen(), 'double-click exits app-initiated fullscreen');
    await doubleClickPlayer();
    await waitFor(() => win.isFullScreen(), 'double-click re-enters YouTube fullscreen');
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
    const playlistUrl = await evaluate('return window.CVYouTubeSource.copyUrl(state.images[state.current]);');
    await evaluate("window.__copiedYouTubeLink = ''; $('youtube-copy').click();");
    await waitFor(() => evaluate('return window.__copiedYouTubeLink === ' + JSON.stringify(playlistUrl) + ';'), 'playlist link copied from footer');
    assert.equal(await evaluate("return $('youtube-copy').textContent;"), 'Copiar enlace de playlist');
    for (const target of ['youtube-footer', 'statusbar']) {
      assert.equal(await evaluate(`return $('${target}').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 400, clientY: 700 }));`),
        false, `${target} context menu is prevented`);
      assert.equal(await evaluate("return $('custom-ctx-menu').classList.contains('open');"), false,
        `${target} does not show a menu over the native player`);
    }
    await evaluate("delete navigator.clipboard.writeText;");
    await evaluate("window.CVYouTube.command('mute'); window.CVYouTube.command('next');");
    await waitFor(async () => (await info())?.index === 1 && (await info())?.state === 1, 'next playlist video');
    const second = (await info()).videoId;
    const listId = await evaluate('return window.CVWorkspace.model.activeId;');
    await evaluate('state.settings.app.videoAutoplay=false; state.settings.app.keepMediaPausedOnTabReturn=true; await window.electronAPI.saveSettings(state.settings.app);');
    await evaluate('await window.CVWorkspace.activate(' + JSON.stringify(firstId) + ');'); await loaded();
    await evaluate('await window.CVWorkspace.activate(' + JSON.stringify(listId) + ');');
    await waitFor(async () => (await info())?.videoId === second && (await info())?.state === 1,
      'playing playlist resumes on tab return with new-media autoplay off');
    await evaluate('state.settings.app.videoAutoplay=true; await window.electronAPI.saveSettings(state.settings.app);');
    await evaluate("window.CVYouTube.command('pause');");
    await waitFor(async () => (await info()).state === 2, 'playlist paused');
    await evaluate('await window.CVWorkspace.activate(' + JSON.stringify(firstId) + ');'); await loaded();
    await evaluate('await window.CVWorkspace.activate(' + JSON.stringify(listId) + ');');
    await waitFor(async () => (await info())?.videoId === second && (await info())?.index === 1, 'playlist selection across tab switches');
    assert.equal((await info()).state, 5, 'Optional pause is preserved across YouTube tabs');
    await evaluate('state.settings.app.videoAutoplay=false; state.settings.app.keepMediaPausedOnTabReturn=false; await window.electronAPI.saveSettings(state.settings.app);');
    assert.equal(webContents.getAllWebContents().filter(w => w.getURL().endsWith('/assets/youtube-player.html')).length, 1, 'Only one YouTube renderer stays active');
    console.log('PASS fullscreen buttons/double-click/Escape, modal layering, full playlist, next video, retained playlist position and decoder release');
    fs.writeFileSync(path.join(dir, 'youtube-playlist.png'), (await child().capturePage()).toPNG());
    const png = nativeImage.createFromBitmap(Buffer.alloc(80*60*4,255),{width:80,height:60}).toPNG();
    const image = path.join(dir,'still.png'); fs.writeFileSync(image,png);
    await child().executeJavaScript(`const input = document.createElement('input'); input.type = 'file';
      input.id = 'test-file-drop'; document.body.append(input);`);
    child().debugger.attach('1.3');
    try {
      const { root } = await child().debugger.sendCommand('DOM.getDocument');
      const { nodeId } = await child().debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: '#test-file-drop' });
      await child().debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files: [image] });
      const accepted = await child().executeJavaScript(`(() => {
        const transfer = new DataTransfer(); transfer.items.add(document.querySelector('#test-file-drop').files[0]);
        const frame = document.querySelector('iframe');
        frame.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }));
        const shield = [...document.body.children].find(el => el.style.zIndex === '2147483647');
        return !shield.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      })()`);
      assert.equal(accepted, true, 'YouTube drop shield accepts a real local file');
    } finally { if (child()?.debugger.isAttached()) child().debugger.detach(); }
    await waitFor(() => evaluate("return window.CVWorkspace.model.active?.image.file.name === 'still.png';"), 'file dropped over YouTube opens in viewer');
    await waitFor(() => !child(), 'YouTube renderer closes on local image');
    assert.equal(await evaluate("return !$('btn-rot-l').disabled && !window.CVYouTube.active();"), true);
    await evaluate('window.CVWorkspace.closeTabs([window.CVWorkspace.model.activeId],{discard:true,remember:false});');
    await evaluate('await window.CVWorkspace.activate(' + JSON.stringify(firstId) + ');'); await loaded();
    await evaluate('await window.CVWorkspace.openYouTube("https://youtu.be/M7lc1UVf-VE?t=12");');
    await loaded(); await waitFor(async () => Math.abs((await info()).time - 12) < 1, 'final saved YouTube time');
    await evaluate('window.CVWorkspace.capture(); await window.CVWorkspace.flush(); window.CVWorkspace.suspend(); await window.CVWorkspace.flush();');
    await waitFor(() => !child(), 'suspend releases YouTube renderer');
    console.log('PASS file drop over YouTube opens a local image, session saves, tray suspension destroys the online player');
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
    await evaluate('state.settings.app.videoAutoplay=true; await window.electronAPI.saveSettings(state.settings.app); await window.CVWorkspace.flush();');
    console.log('PASS network loading failure, actionable error and successful retry');
  }
  app.exit(0);
}).catch(async error => { console.error(error); try { console.error('Diagnostics:', await diagnostics()); } catch (_) { /* Keep the original failure. */ } app.exit(1); });
setTimeout(() => { console.error('YouTube smoke timeout'); app.exit(2); }, 170000);
