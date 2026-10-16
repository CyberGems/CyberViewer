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
    console.log('PASS restored video tab and playback position, paused');
  } else {
    const file = path.join(dataDir,'clip #ñ %.mp4');
    await open(path.basename(file)); await loaded();
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
    await evaluate('rotate(90); discardPendingChanges();');
    assert.equal(await evaluate('return state.hasChanges;'),false);
    console.log('PASS image editing restored and inactive video decoder released');

    await open('unsupported-audio.mp4'); await loaded();
    await evaluate('window.CVVideo.element.muted=true; await window.CVVideo.toggle();');
    await waitFor(() => evaluate("return !$('video-audio-note').hidden;"), 'unsupported audio notice');
    await open('damaged.mp4');
    await waitFor(() => evaluate('return document.body.classList.contains("image-error") && !state.transitioning;'), 'incompatible video banner');
    assert.ok(await evaluate("return $('error-banner-sub').textContent.includes('códec');"));
    await evaluate("state.settings.app.language='en'; updateLanguage('en'); setImageError(state.images[state.current]);");
    assert.ok(await evaluate("return $('error-banner-sub').textContent.includes('codec');"));
    console.log('PASS unsupported audio warning and bilingual invalid-video message');

    await open(path.basename(file)); await loaded();
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
