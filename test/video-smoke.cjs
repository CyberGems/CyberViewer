'use strict';
// Always run with an isolated profile through scripts/test-video.cjs.
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const dataDir = process.env.CV_VIDEO_TEST_DIR;
if (!dataDir || !path.basename(dataDir).startsWith('cyberviewer-video-test-')) throw new Error('Isolated test directory required');
const phase = process.env.CV_VIDEO_TEST_PHASE;
app.setPath('userData', dataDir);
app.setName('CyberViewer Video Test');
process.argv.push('--startup');
if (phase === 'initial') {
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ app: {
    language: 'es', restoreSession: true, closeChoiceMade: true, closeToTray: false,
    checkUpdatesOnStartup: false, toggleHotkey: 'disabled', contextMenuEnabled: false,
    autoBackup: { enabled: false }
  }, window: { width: 1100, height: 800, maximized: false } }));
}
require('../main');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(callback, description, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await callback()) return; await delay(50); }
  throw new Error('Timed out: ' + description);
}
app.whenReady().then(async () => {
  let win;
  await waitFor(() => (win = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('CyberViewer.html'))), 'main window');
  const errors = [];
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  const evaluate = body => win.webContents.executeJavaScript('(async()=>{' + body + '})()');
  const open = async name => { await evaluate('await openImagePath(' + JSON.stringify(path.join(dataDir,name)) + ');'); };
  const loaded = () => waitFor(() => evaluate('return window.CVWorkspace.ready && !state.transitioning && window.CVVideo.element.readyState >= 2 && window.CVVideo.element.videoWidth === 320;'), 'video ready');
  await waitFor(() => evaluate('return window.CVWorkspace?.ready;'), 'workspace ready');
  if (phase === 'restore') {
    await loaded();
    const restored = await evaluate('return {time:window.CVVideo.element.currentTime, paused:window.CVVideo.element.paused, view:window.CVWorkspace.model.active.view, source:window.CVVideo.element.src};');
    assert.ok(Math.abs(restored.time - 6) < .3, JSON.stringify(restored));
    assert.equal(await evaluate('return window.CVVideo.element.paused;'), true);
    assert.equal(await evaluate("return getComputedStyle($('kbd-hint')).display === 'none' && getComputedStyle($('statusbar')).display === 'none' && $('canvas-layer').clientHeight === $('viewer-wrap').clientHeight;"), true, 'Video fills the viewer without the image toolbar or footer');
    console.log('PASS restored video tab and playback position, paused');
  } else {
    const file = path.join(dataDir,'clip #ñ %.mp4');
    await evaluate('window.CVVideo.element.muted=true;');
    await open(path.basename(file)); await loaded();
    await waitFor(() => evaluate('return !window.CVVideo.element.paused && window.CVVideo.element.currentTime > .2;'), 'autoplay is enabled by default');
    assert.equal(await evaluate("return state.settings.app.videoAutoplay && $('video-autoplay').getAttribute('aria-checked') === 'true';"), true);
    await evaluate("window.CVVideo.element.pause(); $('video-more').click();");
    assert.equal(await evaluate("return getComputedStyle($('video-more'),'::after').display === 'none' && getComputedStyle($('video-more'),'::before').display === 'none';"), true, 'More tooltip is suppressed while its menu is open');
    assert.equal(await evaluate("const m=getComputedStyle($('video-menu')), c=getComputedStyle($('main-menu')); return m.backdropFilter === c.backdropFilter && m.backgroundImage === c.backgroundImage;"), true, 'Playback menu shares existing glass surfaces');
    await evaluate("$('video-autoplay').click(); window.CVVideo.closeMenu();");
    await waitFor(() => JSON.parse(fs.readFileSync(path.join(dataDir,'settings.json'),'utf8')).app.videoAutoplay === false, 'autoplay preference saved');
    assert.equal(await evaluate('return window.CVVideo.element.paused;'), true);
    await evaluate('window.CVVideo.element.muted = true; await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return window.CVVideo.element.currentTime > .5 && window.CVVideo.element.webkitAudioDecodedByteCount > 0;'), 'video and audio decoded');
    await evaluate('window.CVVideo.element.pause(); window.CVVideo.element.currentTime=6;');
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking;'), 'seek to six seconds');
    assert.ok(await evaluate('return Math.abs(window.CVVideo.element.currentTime - 6) < .1;'));
    const range = await evaluate('const r=await fetch(mediaUrl(' + JSON.stringify(file) + '),{headers:{Range:"bytes=100-199"}}); return {status:r.status,length:(await r.arrayBuffer()).byteLength,range:r.headers.get("content-range")};');
    assert.equal(range.status,206); assert.equal(range.length,100); assert.ok(range.range.startsWith('bytes 100-199/'));
    assert.equal(await evaluate("return $('btn-rot-l').disabled && $('btn-copy').disabled && $('btn-print').disabled;"), true);
    const before = fs.readFileSync(file);
    await evaluate('rotate(90); startCrop(); openResizeModal(); openAdjustModal(); await saveCurrent(); await copyToClipboard();');
    assert.deepEqual(fs.readFileSync(file), before);
    assert.equal(await evaluate('return state.hasChanges || state.isCropping;'), false);
    await evaluate('ensureSidebarOpen();');
    await waitFor(() => evaluate('return state.images.find(im=>im.file.name===' + JSON.stringify(path.basename(file)) + ')?.thumbUrl;'), 'video thumbnail', 25000);
    console.log('PASS playback, audio, seeking, exact byte range, edit guards and thumbnail');

    for (const name of ['compatible.mov','compatible.mkv','compatible.m4v','compatible.webm']) {
      await open(name); await loaded();
      await evaluate('window.CVVideo.element.muted=true; await window.CVVideo.toggle();');
      await waitFor(() => evaluate('return window.CVVideo.element.currentTime > .2;'), name + ' playback');
      const thumbnail = await evaluate('return await window.electronAPI.getThumbnail(' + JSON.stringify(path.join(dataDir,name)) + ',{priority:true});');
      assert.ok(thumbnail, name + ' thumbnail exists');
      const bitmap = nativeImage.createFromPath(require('../lib/paths').cleanFsPath(thumbnail)).toBitmap();
      assert.ok(bitmap.some((value,index) => index % 4 !== 3 && value > 32), name + ' thumbnail contains a decoded frame');
    }
    await open(path.basename(file)); await loaded();
    assert.ok(await evaluate('return Math.abs(window.CVVideo.element.currentTime-6)<.3;'));
    assert.equal(await evaluate("return $('video-audio-note').hidden;"),true, 'A paused restored video must not be reported as lacking playable audio');
    console.log('PASS MOV, MKV, M4V, WebM and playback position across tabs');
    await evaluate("$('video-loop').click();");
    assert.equal(await evaluate('return window.CVVideo.element.loop;'),true);
    await evaluate("$('video-loop').click(); $('video-volume').value='0.35'; $('video-volume').dispatchEvent(new Event('input'));");
    assert.equal(await evaluate('return window.CVVideo.element.volume;'),.35);
    await evaluate("$('video-mute').click();");
    assert.equal(await evaluate('return window.CVVideo.element.muted;'),true);
    await evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));");
    await waitFor(() => evaluate('return !window.CVVideo.element.paused;'), 'Space plays video');
    await evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));");
    assert.equal(await evaluate('return window.CVVideo.element.paused;'),true);
    await evaluate("window.CVVideo.element.currentTime=2;");
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking;'), 'keyboard seek setup');
    await evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));");
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking;'), 'ArrowRight seeks video');
    assert.ok(await evaluate('return Math.abs(window.CVVideo.element.currentTime-7)<.3;'));
    console.log('PASS playback keyboard, five-second seek, volume, mute and loop controls');

    // Exercise the actual native fullscreen transition, not only a CSS class.
    await evaluate("state.settings.app.hudAutoHideDelay=350; $('video-fullscreen').click();");
    await waitFor(() => win.isFullScreen(), 'native fullscreen enabled');
    await waitFor(() => evaluate("return state.isGhost && $('viewer-wrap').clientHeight === innerHeight;"), 'fullscreen viewport');
    assert.equal(await evaluate("return getComputedStyle($('main-video')).objectFit === 'contain' && getComputedStyle($('canvas-layer')).transform === 'none' && $('main-video').getBoundingClientRect().width === innerWidth && getComputedStyle($('image-tabs')).display === 'none' && getComputedStyle($('topbar')).display === 'none';"), true, 'Native fullscreen fits the complete frame without app chrome');
    await evaluate('window.CVVideo.element.loop=true; await window.CVVideo.toggle(); window.CVVideo.reveal();');
    const center = await evaluate('return {x:Math.floor(innerWidth/2),y:Math.floor(innerHeight/2)};');
    win.webContents.sendInputEvent({type:'mouseMove', ...center});
    await waitFor(() => evaluate("return document.body.classList.contains('video-idle') && getComputedStyle($('video-controls')).opacity === '0' && getComputedStyle($('ghost-close')).opacity === '0';"), 'fullscreen controls idle and fade completed');
    assert.equal(await evaluate("return getComputedStyle($('video-controls')).opacity === '0' && $('video-controls').inert && getComputedStyle($('ghost-close')).opacity === '0' && getComputedStyle($('viewer-wrap')).cursor === 'none';"), true, 'Idle fullscreen contains only the video');
    fs.writeFileSync(path.join(dataDir,'video-fullscreen-clean.png'), (await win.webContents.capturePage()).toPNG());
    win.webContents.sendInputEvent({type:'mouseMove',x:center.x+5,y:center.y+5});
    await waitFor(() => evaluate("return !document.body.classList.contains('video-idle');"), 'pointer reveals controls');
    await evaluate("$('video-more').click();");
    await delay(500);
    assert.equal(await evaluate("return !document.body.classList.contains('video-idle') && !$('video-menu').hidden;"), true, 'Open menus keep controls available');
    fs.writeFileSync(path.join(dataDir,'video-playback-menu.png'), (await win.webContents.capturePage()).toPNG());
    await evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));");
    assert.equal(win.isFullScreen(), true, 'First Escape closes the playback menu');
    assert.equal(await evaluate("return $('video-menu').hidden;"), true);
    await waitFor(() => evaluate("return document.body.classList.contains('video-idle');"), 'controls hide again');
    await evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'m',bubbles:true}));");
    assert.equal(await evaluate("return document.body.classList.contains('video-idle');"), false, 'Keyboard reveals controls');
    await evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true})); $('video-play').focus();");
    await delay(500);
    assert.equal(await evaluate("return !document.body.classList.contains('video-idle') && document.activeElement === $('video-play');"), true, 'Keyboard focus keeps playback controls available');
    await evaluate("$('video-seek').dispatchEvent(new Event('pointerdown',{bubbles:true}));");
    await delay(500);
    assert.equal(await evaluate("return document.body.classList.contains('video-idle');"), false, 'Seeking gestures keep playback controls available');
    await evaluate("window.dispatchEvent(new Event('pointerup')); $('video-play').blur();");
    await evaluate('window.CVVideo.element.pause(); window.CVVideo.element.loop=false;');
    await delay(500);
    assert.equal(await evaluate("return document.body.classList.contains('video-idle');"), false, 'Paused controls remain available');
    fs.writeFileSync(path.join(dataDir,'video-fullscreen-controls.png'), (await win.webContents.capturePage()).toPNG());
    await evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));");
    await waitFor(() => !win.isFullScreen(), 'Escape leaves native fullscreen');
    await waitFor(() => evaluate("return !state.isGhost && getComputedStyle($('topbar')).opacity === '1';"), 'normal window restored');
    await evaluate('state.settings.app.hudAutoHideDelay=2000;');
    console.log('PASS native fullscreen, complete frame, controls/cursor idle hide, pointer/keyboard reveal, menus and Escape');
    await open('long.mp4'); await loaded();
    assert.ok(await evaluate('return window.CVVideo.element.duration>=599;'));
    await evaluate('window.CVVideo.element.currentTime=590;');
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking && Math.abs(window.CVVideo.element.currentTime-590)<.3;'), 'seek near end of ten-minute video');
    await evaluate('window.CVVideo.element.muted=true; await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return window.CVVideo.element.currentTime>590.2;'), 'play from late range');
    await open('1080p.mp4');
    await waitFor(() => evaluate('return !state.transitioning && window.CVVideo.element.videoWidth===1920 && window.CVVideo.element.readyState>=2;'), '1080p decoded');
    await evaluate('window.CVVideo.element.muted=true; await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return window.CVVideo.element.currentTime>.2;'), '1080p playback');
    console.log('PASS ten-minute video with late seek and 1080p playback');
    const png = nativeImage.createFromBitmap(Buffer.alloc(80*60*4,255),{width:80,height:60}).toPNG();
    fs.writeFileSync(path.join(dataDir,'still.png'),png);
    await open('still.png');
    await waitFor(() => evaluate('return mainImg.complete && mainImg.naturalWidth === 80 && !state.transitioning;'), 'image after video');
    assert.equal(await evaluate('return window.CVVideo.element.hasAttribute("src");'), false);
    assert.equal(await evaluate("return $('btn-rot-l').disabled;"), false);
    assert.equal(await evaluate("return getComputedStyle($('kbd-hint')).display !== 'none' && !document.body.classList.contains('video-idle') && !$('ghost-close').inert;"), true, 'Image chrome and fullscreen exit are restored after video');
    await evaluate('rotate(90); discardPendingChanges();');
    assert.equal(await evaluate('return state.hasChanges;'),false);
    console.log('PASS image editing restored and inactive video decoder released');

    for (const name of ['silent.mp4', 'unsupported-audio.mp4']) {
      await open(name); await loaded();
      assert.equal(await evaluate("return !$('video-volume').disabled && !$('video-mute').disabled;"), true, 'A new source is checked independently');
      await evaluate('window.CVVideo.element.muted=true; await window.CVVideo.toggle();');
      await waitFor(() => evaluate("return window.CVVideo.element.currentTime > .8 && $('video-volume').disabled && $('video-mute').disabled;"), name + ' disables unavailable audio controls');
      await evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'m',bubbles:true}));");
      assert.equal(await evaluate('return window.CVVideo.element.muted;'), true, 'Mute hotkey respects unavailable audio');
      assert.equal(await evaluate("return $('video-audio-note').hidden && $('video-menu').hidden;"), true, 'Silent or unsupported audio never raises an automatic notice');
      await evaluate("window.CVVideo.element.pause(); $('video-more').click(); $('video-audio-info').click();");
      fs.writeFileSync(path.join(dataDir,name + '-controls.png'), (await win.webContents.capturePage()).toPNG());
      assert.equal(await evaluate("return !$('video-audio-note').hidden && $('video-audio-note').textContent.includes('puede ser silencioso');"), true, 'Audio information appears only when requested');
      await evaluate("state.settings.app.language='en'; updateLanguage('en');");
      assert.ok(await evaluate("return $('video-audio-note').textContent.includes('may be silent');"));
      await evaluate("state.settings.app.language='es'; updateLanguage('es'); window.CVVideo.closeMenu();");
    }
    await open('delayed-audio.mp4'); await loaded();
    await evaluate('window.CVVideo.element.muted=true; await window.CVVideo.toggle();');
    await waitFor(() => evaluate("return window.CVVideo.element.currentTime>3.5 && window.CVVideo.element.webkitAudioDecodedByteCount>0 && !$('video-volume').disabled && !$('video-mute').disabled;"), 'audio controls recover when a delayed track becomes decodable');
    console.log('PASS unavailable audio controls, mute guard and delayed-audio recovery');
    await open('damaged.mp4');
    await waitFor(() => evaluate('return document.body.classList.contains("image-error") && !state.transitioning;'), 'incompatible video banner');
    assert.ok(await evaluate("return $('error-banner-sub').textContent.includes('códec');"));
    await evaluate("state.settings.app.language='en'; updateLanguage('en'); setImageError(state.images[state.current]);");
    assert.ok(await evaluate("return $('error-banner-sub').textContent.includes('codec');"));
    console.log('PASS quiet silent/unsupported audio, requested bilingual audio information and invalid-video message');

    for (const name of ['unindexed.mkv', ...(fs.existsSync(path.join(dataDir,'regression-sample.mkv')) ? ['regression-sample.mkv'] : [])]) {
      await open(name);
      await waitFor(() => evaluate('return !state.transitioning && window.CVVideo.element.videoWidth > 0 && window.CVVideo.element.readyState >= 2 && !window.CVVideo.element.error;'), name + ' first frame');
      await evaluate('window.CVVideo.element.muted=true; await window.CVVideo.toggle();');
      await waitFor(() => evaluate('return window.CVVideo.element.currentTime > .3 && !window.CVVideo.element.error;'), name + ' playback');
      await evaluate('window.CVVideo.element.pause(); window.CVVideo.element.currentTime=window.CVVideo.element.duration*.7;');
      await waitFor(() => evaluate('const v=window.CVVideo.element;return !v.seeking && Math.abs(v.currentTime-v.duration*.7)<.3 && !v.error;'), name + ' late seek');
      const sampleTime = await evaluate('return window.CVVideo.element.currentTime;');
      await open('autoplay.mp4'); await loaded();
      await open(name);
      await waitFor(() => evaluate('return !state.transitioning && window.CVVideo.element.readyState>=2 && !window.CVVideo.element.seeking && !window.CVVideo.element.error;'), name + ' restored tab');
      assert.ok(Math.abs(await evaluate('return window.CVVideo.element.currentTime;')-sampleTime)<.3, name + ' restored playback position');
      const thumbnail = await evaluate('return await window.electronAPI.getThumbnail(' + JSON.stringify(path.join(dataDir,name)) + ',{priority:true});');
      assert.ok(thumbnail, name + ' thumbnail after preload fix');
    }
    console.log('PASS unindexed MKV and optional real MKV: first frame, playback, seeking, tab restoration and thumbnail');

    await evaluate("$('video-autoplay').click();");
    await waitFor(() => JSON.parse(fs.readFileSync(path.join(dataDir,'settings.json'),'utf8')).app.videoAutoplay === true, 'autoplay enabled preference saved');
    await open('autoplay.mp4'); await loaded();
    await waitFor(() => evaluate('return !window.CVVideo.element.paused && window.CVVideo.element.currentTime > .2;'), 'autoplay starts a newly loaded video');
    await evaluate("$('video-autoplay').click();");
    assert.equal(await evaluate('return window.CVVideo.element.paused;'), false, 'Changing autoplay does not interrupt current playback');
    await waitFor(() => JSON.parse(fs.readFileSync(path.join(dataDir,'settings.json'),'utf8')).app.videoAutoplay === false, 'manual playback preference saved');
    await open(path.basename(file)); await loaded();
    assert.equal(await evaluate('return window.CVVideo.element.paused;'), true, 'Disabled autoplay applies to the next loaded video');
    console.log('PASS default autoplay, persisted on/off switch and manual playback after changing preference');
    await evaluate("window.CVVideo.element.currentTime=6;");
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking;'), 'reset position after keyboard test');
    await evaluate("state.settings.app.language='es'; updateLanguage('es'); window.CVVideo.element.currentTime=6;");
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking;'), 'final seek');
    await evaluate('window.CVWorkspace.capture(); await window.CVWorkspace.flush();');
    await delay(150);
    fs.writeFileSync(path.join(dataDir,'video-player.png'), (await win.webContents.capturePage()).toPNG());
    await evaluate("state.settings.app.language='en'; updateLanguage('en');");
    assert.equal(await evaluate("return $('video-play-label').textContent;"),'Play');
    fs.writeFileSync(path.join(dataDir,'video-player-en.png'), (await win.webContents.capturePage()).toPNG());
    await evaluate("state.settings.app.language='es'; updateLanguage('es');");
    const snapshot=JSON.parse(fs.readFileSync(path.join(dataDir,'session.json'),'utf8'));
    assert.ok(Math.abs(snapshot.tabs.find(tab=>tab.path===file).view.videoTime-6)<.3);
    await evaluate('window.CVWorkspace.suspend();');
    assert.equal(await evaluate('return window.CVVideo.element.hasAttribute("src");'),false);
    await evaluate('await window.CVWorkspace.flush();');
    const suspendedSession=JSON.parse(fs.readFileSync(path.join(dataDir,'session.json'),'utf8'));
    assert.ok(Math.abs(suspendedSession.tabs.find(tab=>tab.path===file).view.videoTime-6)<.3, 'Suspending preserves the captured position');
    console.log('PASS saved session position and decoder release on suspend');
  }
  // Decoder errors for the deliberately damaged fixture are expected.
  const unexpected=errors.filter(message=>!/(DEMUXER|FFmpegDemuxer|ERR_REQUEST_RANGE_NOT_SATISFIABLE)/i.test(message));
  assert.deepEqual(unexpected,[]);
  app.exit(0);
}).catch(error=>{console.error(error);app.exit(1)});
setTimeout(()=>{console.error('Video smoke timeout');app.exit(2)},80000);
