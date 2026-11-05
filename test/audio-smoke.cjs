'use strict';

// Real decoding and canvas rendering in an isolated profile. No FFmpeg install.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const formatSamples = ['tone.flac', 'tone.ogg', 'tone.oga', 'voice.ogg', 'voice.opus', 'tone.aac', 'tone.m4a'];
const sampleName = name => 'Format #ñ % ' + name;
if (!process.versions.electron) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberviewer-audio-test-'));
  for (const name of formatSamples) fs.copyFileSync(path.join(__dirname, 'fixtures', 'audio', name), path.join(dataDir, sampleName(name)));
  const env = { ...process.env, CV_AUDIO_TEST_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const phase of ['initial', 'restore']) {
    const result = require('node:child_process').spawnSync(require('electron'), [__filename], {
      env: { ...env, CV_AUDIO_TEST_PHASE: phase }, windowsHide: true, encoding: 'utf8', timeout: 60000
    });
    console.log(result.stdout || '');
    if (result.stderr) console.error(result.stderr);
    if (result.error || result.status !== 0) {
      console.error(result.error || `Audio smoke exited ${result.status}`);
      console.error('Isolated test data: ' + dataDir); process.exit(1);
    }
  }
  console.log('Audio test data and screenshots: ' + dataDir); process.exit(0);
}

const { app, BrowserWindow, nativeImage } = require('electron');
app.disableHardwareAcceleration();
const dataDir = process.env.CV_AUDIO_TEST_DIR;
if (!dataDir || !path.basename(dataDir).startsWith('cyberviewer-audio-test-')) throw Error('Isolated profile required');
const restoring = process.env.CV_AUDIO_TEST_PHASE === 'restore';
app.setPath('userData', dataDir); app.setName('CyberViewer Audio Test');
process.argv.push('--startup');
if (!restoring) {
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ app: {
    language: 'es', restoreSession: true, closeChoiceMade: true, closeToTray: false,
    checkUpdatesOnStartup: false, toggleHotkey: 'disabled', contextMenuEnabled: false,
    videoAutoplay: false, videoVolume: 0.2, autoBackup: { enabled: false }
  }, window: { width: 1100, height: 800, maximized: false } }));
  const rate = 44100, samples = rate * 12, pcm = Buffer.alloc(44 + samples * 2);
  pcm.write('RIFF'); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(rate, 24); pcm.writeUInt32LE(rate * 2, 28); pcm.writeUInt16LE(2, 32);
  pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / rate, beat = Math.pow((1 + Math.sin(t * Math.PI * 4)) / 2, 5);
    const envelope = 0.55 + 0.35 * Math.sin(t * Math.PI * 2 * .8);
    const signal = Math.sin(t * Math.PI * 110) * .24 * beat
      + Math.sin(t * Math.PI * 440) * .2 * envelope + Math.sin(t * Math.PI * 880) * .15
      + Math.sin(t * Math.PI * 1760) * .07 * (1 - envelope)
      + Math.sin(t * Math.PI * 3520) * .06 * envelope;
    pcm.writeInt16LE(Math.round(signal * 26000), 44 + i * 2);
  }
  fs.writeFileSync(path.join(dataDir, 'Tone #ñ %.wav'), pcm);
  // MPEG-1 Layer III: 128 kb/s, 44.1 kHz stereo, no reservoir or spectral
  // coefficients. These valid silent frames exercise the actual MP3 decoder.
  const mp3Frame = Buffer.alloc(417); mp3Frame.set([0xff, 0xfb, 0x90, 0x00]);
  fs.writeFileSync(path.join(dataDir, 'Silence.mp3'), Buffer.concat(Array(230).fill(mp3Frame)));
  const artwork = fs.readFileSync(path.join(__dirname, '..', 'assets', 'icon.png'));
  const picture = Buffer.concat([Buffer.from([0]), Buffer.from('image/png\0', 'ascii'), Buffer.from([3, 0]), artwork]);
  const pictureFrameHead = Buffer.alloc(10); pictureFrameHead.write('APIC'); pictureFrameHead.writeUInt32BE(picture.length, 4);
  const pictureFrame = Buffer.concat([pictureFrameHead, picture]);
  const tagSize = pictureFrame.length;
  const id3Header = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, (tagSize >> 21) & 0x7f,
    (tagSize >> 14) & 0x7f, (tagSize >> 7) & 0x7f, tagSize & 0x7f]);
  fs.writeFileSync(path.join(dataDir, 'Cover.mp3'), Buffer.concat([id3Header, pictureFrame, ...Array(230).fill(mp3Frame)]));
  fs.writeFileSync(path.join(dataDir, 'Broken.wav'), 'not a wav');
  fs.writeFileSync(path.join(dataDir, 'Picture.png'), nativeImage.createFromBitmap(Buffer.from([50, 100, 170, 255]), { width: 1, height: 1 }).resize({ width: 120, height: 80 }).toPNG());
}
require('../main');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(callback, label) {
  const start = Date.now();
  while (Date.now() - start < 15000) { if (await callback()) return; await delay(50); }
  throw Error('Timed out: ' + label);
}
app.whenReady().then(async () => {
  let win;
  await waitFor(() => (win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('CyberViewer.html'))), 'window');
  const evaluate = body => win.webContents.executeJavaScript('(async()=>{' + body + '})()');
  await waitFor(() => evaluate('return window.CVWorkspace?.ready;'), 'workspace');
  const errors = [];
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  const wav = path.join(dataDir, 'Tone #ñ %.wav');
  const open = name => evaluate('await openImagePath(' + JSON.stringify(path.join(dataDir, name)) + ');');
  const ready = () => waitFor(() => evaluate('return !state.transitioning && window.CVVideo.element.readyState >= 2 && state.images[state.current]?.loaded;'), 'audio loaded');
  async function checkFormat(name, restoringPosition = false) {
    const label = name.split('.').pop().toUpperCase();
    await open(sampleName(name)); await ready();
    const info = await evaluate(`return {audio:document.body.classList.contains('audio-active'), label:$('audio-format').textContent,
      duration:window.CVVideo.element.duration, time:window.CVVideo.element.currentTime, paused:window.CVVideo.element.paused};`);
    assert.equal(info.audio, true, name);
    assert.equal(info.label, label, name);
    assert.ok(info.duration >= 11.5 && info.duration < 13, name + ' has a usable duration: ' + info.duration);
    assert.equal(info.paused, true, name + ' opens paused with autoplay disabled');
    if (restoringPosition) {
      assert.ok(Math.abs(info.time - 4) < .2, name + ' restores four seconds after a real restart: ' + info.time);
      console.log('PASS ' + name + ' position restored after restart');
      return;
    }
    await evaluate(`window.__audioPeak=0; window.CVVideo.setPlaybackRate(1); window.CVVideo.element.loop=false;
      window.CVVideo.element.muted=false; window.CVVideo.element.volume=.1;
      $('audio-visualizer').value='spectrum'; $('audio-visualizer').dispatchEvent(new Event('change')); await window.CVVideo.toggle();`);
    try {
      await waitFor(() => evaluate('return window.CVVideo.element.currentTime>.15 && window.CVVideo.element.webkitAudioDecodedByteCount>0 && window.__audioPeak>0;'), name + ' decodes and feeds the visualizer');
    } catch (error) {
      console.error(name, await evaluate(`const e=window.CVVideo.element;return {time:e.currentTime,paused:e.paused,ended:e.ended,
        error:e.error?.code,ready:e.readyState,decoded:e.webkitAudioDecodedByteCount,peak:window.__audioPeak,context:window.__audioContext?.state};`));
      throw error;
    }
    await evaluate('window.CVVideo.element.pause(); window.CVVideo.element.currentTime=2.5;');
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking;'), name + ' seek');
    assert.ok(await evaluate('return Math.abs(window.CVVideo.element.currentTime-2.5)<.1;'), name + ' exact seek');
    await evaluate('window.CVVideo.seekBy(5);');
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking;'), name + ' forward');
    assert.ok(await evaluate('return Math.abs(window.CVVideo.element.currentTime-7.5)<.1;'), name + ' skips five seconds forward');
    await evaluate('window.CVVideo.seekBy(-5);');
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking;'), name + ' backward');
    assert.ok(await evaluate('return Math.abs(window.CVVideo.element.currentTime-2.5)<.1;'), name + ' skips five seconds backward');
    await evaluate('await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return window.CVVideo.element.currentTime>2.65 && !window.CVVideo.element.paused;'), name + ' resumes after seeking');
    await evaluate('window.CVVideo.element.pause(); window.CVVideo.element.currentTime=4;');
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking;'), name + ' saved position');
    await evaluate('window.CVWorkspace.capture(); await window.CVWorkspace.flush();');
    // Reopen another tab and return, exercising restoration before restarting.
    await open('Tone #ñ %.wav'); await ready();
    await open(sampleName(name)); await ready();
    assert.ok(await evaluate('return Math.abs(window.CVVideo.element.currentTime-4)<.2;'), name + ' restores across tabs');
    console.log('PASS ' + name + ' decoding, visualization, seeking, +/-5s and tab position');
  }
  if (restoring) {
    await ready();
    assert.equal(await evaluate('return state.settings.app.videoAutoplay;'), true, 'The autoplay preference stays enabled');
    assert.equal(await evaluate("return document.body.classList.contains('audio-active') && window.CVVideo.element.paused;"), true);
    assert.ok(await evaluate('return Math.abs(window.CVVideo.element.currentTime - 4) < .2;'));
    assert.equal(await evaluate("return $('audio-visualizer').value;"), 'off');
    for (const name of formatSamples) await checkFormat(name, true);
    console.log('PASS audio session restores position, paused playback and effects preference');
  } else {
    await open('Tone #ñ %.wav'); await ready();
    assert.equal(await evaluate("return document.body.classList.contains('audio-active') && !$('audio-stage').hidden && !$('video-controls').hidden;"), true);
    assert.equal(await evaluate('return window.CVVideo.element.videoWidth;'), 0);
    const thumb = await evaluate('return await window.electronAPI.getThumbnail(' + JSON.stringify(wav) + ');');
    assert.ok(thumb.endsWith('audio-thumbnail.svg'));
    assert.equal(await evaluate('return await window.electronAPI.getThumbnail(' + JSON.stringify(wav) + ', { coverArt: true });'), null,
      'Audio without embedded artwork reports no cover');
    await evaluate('openPropertiesForCurrent();');
    await waitFor(() => evaluate(`const stage=$('props-preview-stage'), image=$('props-preview'), sr=stage.getBoundingClientRect(), ir=image.getBoundingClientRect();
      return $('modal-properties').dataset.previewKind==='audio' && image.complete && image.naturalWidth>0 &&
        image.src.endsWith('/assets/audio-thumbnail.svg') && $('props-readout').hidden && getComputedStyle(stage).backgroundImage==='none' &&
        getComputedStyle(stage).backgroundColor===getComputedStyle(image).backgroundColor && ir.width>=sr.width-4 && ir.height>=sr.height-4;`),
    'audio without cover uses its full-area icon on a solid background');
    await evaluate("closeModal('modal-properties');");
    const range = await evaluate('const r=await fetch(mediaUrl(' + JSON.stringify(wav) + '), {headers:{Range:"bytes=0-43"}});return {status:r.status,mime:r.headers.get("content-type"),size:(await r.arrayBuffer()).byteLength};');
    assert.deepEqual(range, { status: 206, mime: 'audio/wav', size: 44 });
    // Test uses an offscreen/hidden app profile; visibility is controlled here
    // to exercise both scheduler states without showing a window on the desktop.
    await evaluate('window.__audioHidden=false; Object.defineProperty(document,"hidden",{configurable:true,get:()=>window.__audioHidden});');
    await evaluate(`
      const read = AnalyserNode.prototype.getByteFrequencyData;
      const connect = AudioContext.prototype.createMediaElementSource;
      window.__sourceCount=0;
      AudioContext.prototype.createMediaElementSource=function(element){
        window.__audioContext=this; window.__sourceCount++; return connect.call(this,element);
      };
      window.__audioPeak=0; window.__analysisReads=0;
      AnalyserNode.prototype.getByteFrequencyData=function(bytes){
        read.call(this,bytes); window.__analysisReads++; window.__audioPeak=Math.max(...bytes);
      };
      const raf=window.requestAnimationFrame;
      window.__paintTimes=[];
      window.requestAnimationFrame=callback=>raf(now=>{
        const reads=window.__analysisReads, start=performance.now(); callback(now);
        if(window.__analysisReads>reads) window.__paintTimes.push(performance.now()-start);
      });
      const signature=document.createElement('canvas'); signature.width=64; signature.height=36;
      const signatureContext=signature.getContext('2d',{willReadFrequently:true});
      window.__visualSignature=()=>{
        signatureContext.drawImage($('audio-canvas'),0,0,64,36);
        return Array.from(signatureContext.getImageData(0,0,64,36).data);
      };
    `);
    await evaluate('await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return window.CVVideo.element.currentTime > .15 && window.CVVideo.element.webkitAudioDecodedByteCount > 0;'), 'WAV audio decoded');
    const renderStats = {};
    for (const mode of ['spectrum', 'waveform', 'radial', 'particles', 'aurora', 'tunnel', 'terrain', 'helix', 'grid', 'flares']) {
      await evaluate(`$('audio-visualizer').value='${mode}'; $('audio-visualizer').dispatchEvent(new Event('change'));`);
      await evaluate('window.__paintTimes=[];');
      await delay(180);
      const first = await evaluate("return $('audio-canvas').toDataURL();");
      await delay(150);
      const second = await evaluate("return $('audio-canvas').toDataURL();");
      assert.ok(first !== second, mode + ' reacts/animates during actual audio playback');
      fs.writeFileSync(path.join(dataDir, mode + '.png'), (await win.webContents.capturePage()).toPNG());
      assert.equal(await evaluate("return $('audio-canvas').width<=1440 && $('audio-canvas').height<=810;"), true);
      renderStats[mode] = await evaluate('return window.__paintTimes.reduce((a,b)=>a+b,0)/Math.max(1,window.__paintTimes.length);');
    }
    console.log('Mean drawing time (ms, software-rendered test): ' + JSON.stringify(renderStats));
    const counter = await evaluate('return {reads:window.__analysisReads,time:performance.now()};'); await delay(1000);
    const fps = await evaluate(`return (window.__analysisReads-${counter.reads})*1000/(performance.now()-${counter.time});`);
    assert.ok(fps > 10 && fps <= 32, 'Live analysis/drawing remains capped near 30 fps: ' + fps);
    assert.ok(await evaluate('return window.__audioPeak > 20;'), 'Analyser receives real audio, not CORS-muted silence');
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await waitFor(() => evaluate('return matchMedia("(prefers-reduced-motion: reduce)").matches;'), 'reduced motion');
    await delay(100);
    const reduced = await evaluate("return $('audio-canvas').toDataURL();"); await delay(150);
    assert.equal(await evaluate("return $('audio-canvas').toDataURL();"), reduced, 'Reduced motion keeps the visualization static');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    win.webContents.debugger.detach();
    await delay(100);
    // Dialogs must never interrupt playback (openModal used to pause the media).
    await evaluate('$("btn-config").click();');
    assert.equal(await evaluate("return $('modal-config').classList.contains('active');"), true, 'Config dialog opens during playback');
    assert.equal(await evaluate('return !window.CVVideo.element.paused;'), true, 'Playback continues while the config dialog is open');
    await evaluate('window.closeModal("modal-config");');
    assert.equal(await evaluate("return !$('modal-config').classList.contains('active') && !window.CVVideo.element.paused;"), true, 'Playback continues after closing the config dialog');
    // Clicking the stage to dismiss the More menu must not toggle playback.
    const menuCheck = await evaluate(`
      const target = $('canvas-layer');
      $('video-more').click();
      const opened = !$('video-menu').hidden;
      target.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
      target.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      return {opened, menuAfter: !$('video-menu').hidden, paused: window.CVVideo.element.paused};
    `);
    assert.equal(menuCheck.opened, true, 'More menu opens during playback');
    assert.equal(menuCheck.menuAfter, false, 'A stage click closes the More menu');
    assert.equal(menuCheck.paused, false, 'Dismissing the More menu with a stage click keeps playback running');
    // A plain stage click still toggles play/pause.
    await evaluate(`const t=$('canvas-layer'); t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); t.dispatchEvent(new MouseEvent('click',{bubbles:true}));`);
    await waitFor(() => evaluate('return window.CVVideo.element.paused;'), 'plain stage click pauses');
    await evaluate('await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return !window.CVVideo.element.paused;'), 'resume after stage click check');
    const pauseFrames = await evaluate(`
      const before=window.__visualSignature(), e=window.CVVideo.element;
      const paused=new Promise(resolve=>e.addEventListener('pause',resolve,{once:true}));
      e.pause(); await paused; return {before,after:window.__visualSignature(),image:$('audio-canvas').toDataURL(),reads:window.__analysisReads};
    `);
    await delay(120);
    assert.ok(await evaluate(`return $('audio-canvas').toDataURL()!==${JSON.stringify(pauseFrames.image)};`), 'Pause has an animated release');
    await delay(850);
    const stopped = await evaluate("return $('audio-canvas').toDataURL();"); await delay(180);
    assert.equal(await evaluate("return $('audio-canvas').toDataURL();"), stopped, 'Paused canvas is static');
    await evaluate('window.CVAudioVisuals.refresh();');
    assert.equal(await evaluate("return $('audio-canvas').toDataURL();"), stopped, 'Idle repaint leaves no accumulating trails');
    const idleSignature = await evaluate('return window.__visualSignature();');
    const distance = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
    // Native pause delivery may span a render frame. Compare the first step
    // with the whole release, instead of requiring byte-identical frame timing.
    assert.ok(distance(pauseFrames.before, pauseFrames.after) < distance(pauseFrames.before, idleSignature) * .65,
      'Pause starts with a small visual step rather than jumping straight to rest');
    assert.equal(await evaluate('return window.__analysisReads;'), pauseFrames.reads, 'Release reuses frozen samples without extra FFT work');
    // Natural end uses the same short release, then leaves no animation loop.
    await evaluate('window.CVVideo.element.loop=false; window.CVVideo.element.currentTime=window.CVVideo.element.duration-.18;');
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking;'), 'seek close to natural end');
    await evaluate('await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return window.CVVideo.element.ended;'), 'natural end');
    const endStart = await evaluate("return $('audio-canvas').toDataURL();"); await delay(180);
    assert.ok(await evaluate(`return $('audio-canvas').toDataURL()!==${JSON.stringify(endStart)};`), 'End of track settles smoothly');
    await delay(850);
    const ended = await evaluate("return $('audio-canvas').toDataURL();"); await delay(150);
    assert.equal(await evaluate("return $('audio-canvas').toDataURL();"), ended, 'Ended canvas stops drawing');
    await evaluate('await window.CVVideo.toggle();');
    for (let i = 0; i < 3; i++) {
      await evaluate('window.CVVideo.element.pause();'); await delay(40);
      await evaluate('await window.CVVideo.toggle();'); await delay(40);
    }
    assert.equal(await evaluate('return !window.CVVideo.element.paused && window.__audioContext.state==="running";'), true, 'Rapid pause/resume during release preserves playback');
    await evaluate('window.CVVideo.element.pause();'); await delay(850);
    await evaluate('await window.CVVideo.toggle(); window.__audioHidden=true; document.dispatchEvent(new Event("visibilitychange"));');
    const hidden = await evaluate("return $('audio-canvas').toDataURL();"); await delay(150);
    assert.equal(await evaluate("return $('audio-canvas').toDataURL();"), hidden, 'Hidden canvas stops');
    assert.equal(await evaluate('return window.CVVideo.element.paused;'), false, 'Audio continues while effects are hidden');
    await evaluate('window.CVWorkspace.suspend();');
    assert.equal(await evaluate('return !window.CVVideo.element.paused && !!window.CVVideo.element.getAttribute("src");'), true, 'Tray image unloading keeps playing audio');
    await evaluate('window.__audioHidden=false; document.dispatchEvent(new Event("visibilitychange"));');
    await evaluate("$('audio-visualizer').value='off'; $('audio-visualizer').dispatchEvent(new Event('change'));");
    const off = await evaluate("return $('audio-canvas').toDataURL();"); await delay(150);
    assert.equal(await evaluate("return $('audio-canvas').toDataURL();"), off);
    const reads = await evaluate('return window.__analysisReads;'); await delay(100);
    assert.equal(await evaluate('return window.__analysisReads;'), reads, 'Effects off does not analyse frames');
    assert.equal(await evaluate('return window.__audioContext.state;'), 'running', 'Effects off preserves the audio output');
    await evaluate('window.CVVideo.element.pause(); window.CVVideo.element.currentTime=3;');
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking;'), 'seek');
    await evaluate('window.CVVideo.seekBy(1);');
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking;'), 'skip');
    assert.ok(await evaluate('return Math.abs(window.CVVideo.element.currentTime-4)<.1;'));
    await evaluate("$('video-more').click(); $('audio-visualizer').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));");
    assert.ok(await evaluate('return Math.abs(window.CVVideo.element.currentTime-4)<.1;'), 'Visualization selector does not seek playback');
    await evaluate("window.CVVideo.closeMenu(); openPropertiesForCurrent();");
    assert.equal(await evaluate("return $('props-duration').textContent==='0:12' && !$('props-duration-row').hidden && $('props-dims').closest('.props-row').style.display==='none';"), true);
    await evaluate("closeModal('modal-properties');");
    await evaluate("$('video-mute').click(); $('video-loop').click(); window.CVVideo.setPlaybackRate(1.25);");
    assert.equal(await evaluate('return window.CVVideo.element.muted && window.CVVideo.element.loop && window.CVVideo.element.playbackRate===1.25;'), true);
    console.log('PASS PCM WAV, five animated modes, smooth pause/end, 30 fps cap, hide/off and shared controls');
    await open('Silence.mp3'); await ready();
    await evaluate('await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return window.CVVideo.element.currentTime > .15 && window.CVVideo.element.webkitAudioDecodedByteCount > 0;'), 'MP3 decoder');
    await evaluate('window.CVVideo.element.pause();');
    console.log('PASS direct MP3 decoding without conversion');
    await open('Cover.mp3'); await ready();
    await evaluate('openPropertiesForCurrent();');
    await waitFor(() => evaluate(`const stageElement=$('props-preview-stage'); const stage=stageElement.getBoundingClientRect();
      const image=$('props-preview'); const rect=image.getBoundingClientRect();
      return $('modal-properties').classList.contains('active') && image.complete && image.naturalWidth > 0 &&
        !image.src.endsWith('/assets/audio-thumbnail.svg') &&
        $('modal-properties').dataset.previewKind === 'audio' && getComputedStyle(stageElement).backgroundImage === 'none' &&
        getComputedStyle(stageElement).backgroundColor === getComputedStyle(image).backgroundColor &&
        rect.width >= stage.width-4 && rect.height >= stage.height-4;`), 'audio cover fills the solid preview area');
    await delay(350);
    fs.writeFileSync(path.join(dataDir, 'audio-cover-properties.png'), (await win.webContents.capturePage()).toPNG());
    await evaluate("closeModal('modal-properties');");
    console.log('PASS embedded MP3 artwork is extracted and fills the preview without the image checker');
    const videoBytes = await evaluate(`
      const c=document.createElement('canvas'); c.width=1280; c.height=720;
      const draw=c.getContext('2d'), stream=c.captureStream(10), ac=new AudioContext();
      const tone=ac.createOscillator(), output=ac.createMediaStreamDestination();
      tone.connect(output); tone.start(); await ac.resume();
      output.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus'}),chunks=[];
      recorder.ondataavailable=e=>chunks.push(e.data);
      const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
      for(let i=0;i<10;i++){draw.fillStyle=i%2?'#124':'#abd';draw.fillRect(0,0,c.width,c.height);await new Promise(resolve=>setTimeout(resolve,60));}
      recorder.stop();await stopped;tone.stop();stream.getTracks().forEach(track=>track.stop());await ac.close();
      return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
    `);
    fs.writeFileSync(path.join(dataDir, 'Video.webm'), Buffer.from(videoBytes));
    await open('Video.webm'); await ready();
    const videoPath = path.join(dataDir, 'Video.webm');
    assert.ok(await evaluate('return await window.electronAPI.getThumbnail(' + JSON.stringify(videoPath) + ', { priority: true });'),
      'Generated video frame thumbnail exists');
    await evaluate('openPropertiesForCurrent();');
    await waitFor(() => evaluate(`const stageElement=$('props-preview-stage'), stage=stageElement.getBoundingClientRect();
      const image=$('props-preview'), rect=image.getBoundingClientRect();
      return $('modal-properties').classList.contains('active') && $('modal-properties').dataset.previewKind==='video' &&
        image.complete && image.naturalWidth===960 && image.naturalHeight===540 && $('props-video-preview').hidden &&
        getComputedStyle(stageElement).backgroundImage==='none' &&
        getComputedStyle(stageElement).backgroundColor!=='rgba(0, 0, 0, 0)' &&
        rect.width>=stage.width-4 && rect.height>=stage.height-4;`), 'video frame fills the solid preview area');
    await delay(350);
    fs.writeFileSync(path.join(dataDir, 'video-cover-properties.png'), (await win.webContents.capturePage()).toPNG());
    await evaluate("closeModal('modal-properties');");
    console.log('PASS local video frame fills the preview area without the image checker');
    assert.equal(await evaluate("return !$('audio-stage').hidden || !$('audio-visualizer-row').hidden || document.body.classList.contains('audio-active');"), false);
    await evaluate('await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return window.CVVideo.element.currentTime>.1 && window.CVVideo.element.webkitAudioDecodedByteCount>0;'), 'video with audio after audio playback');
    assert.equal(await evaluate('return window.__audioContext.state;'), 'running');
    await open('Picture.png');
    await waitFor(() => evaluate('return !state.transitioning && mainImg.naturalWidth===120;'), 'image after audio and video');
    assert.equal(await evaluate("return !$('audio-stage').hidden || window.CVVideo.active();"), false);
    await evaluate('openPropertiesForCurrent();');
    assert.equal(await evaluate("return $('modal-properties').dataset.previewKind==='image' && getComputedStyle($('props-preview-stage')).backgroundImage!=='none';"), true,
      'The checker remains available for ordinary image previews');
    await evaluate("closeModal('modal-properties');");
    assert.equal(await evaluate('return window.__sourceCount;'), 1, 'All local media share a single audio graph');
    console.log('PASS audio/video/image switches preserve decoding and release the visualizer');
    for (const name of formatSamples) await checkFormat(name);
    await evaluate("$('audio-visualizer').value='off'; $('audio-visualizer').dispatchEvent(new Event('change'));");
    for (const lang of ['en', 'es']) {
      await evaluate(`state.settings.app.language='${lang}'; updateLanguage('${lang}');`);
      assert.equal(await evaluate("return $('audio-visualizer').getAttribute('aria-label');"), lang === 'es' ? 'Visualización' : 'Visualization');
    }
    await open('Broken.wav');
    await waitFor(() => evaluate('return document.body.classList.contains("image-error");'), 'damaged audio error');
    assert.ok(await evaluate("return $('error-banner-sub').textContent.includes('audio');"));
    await open('Tone #ñ %.wav'); await ready();
    assert.ok(await evaluate('return Math.abs(window.CVVideo.element.currentTime-4)<.2;'));
    await evaluate('window.CVVideo.element.currentTime=4;');
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking;'), 'session seek');
    await evaluate('window.CVWorkspace.capture(); await window.CVWorkspace.flush();');
    await evaluate('state.settings.app.videoAutoplay=true; state.settings.app.keepMediaPausedOnTabReturn=true; await window.electronAPI.saveSettings(state.settings.app);');
    await open('Silence.mp3'); await ready();
    await open('Tone #ñ %.wav'); await ready();
    assert.equal(await evaluate('return window.CVVideo.element.paused;'), true, 'Optional pause is preserved across audio tabs');
    await evaluate('state.settings.app.videoAutoplay=false; await window.electronAPI.saveSettings(state.settings.app); await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return !window.CVVideo.element.paused;'), 'audio plays before leaving tab');
    await open('Silence.mp3'); await ready();
    await open('Tone #ñ %.wav'); await ready();
    await waitFor(() => evaluate('return !window.CVVideo.element.paused;'), 'playing audio resumes on tab return with new-media autoplay off');
    await evaluate('state.settings.app.videoAutoplay=true; await window.electronAPI.saveSettings(state.settings.app);');
    await evaluate('window.CVWorkspace.capture(); await window.CVWorkspace.flush();');
    console.log('PASS bilingual labels, damaged audio error and position across tabs');
    const unexpected = errors.filter(message => !/(DEMUXER|FFmpegDemuxer)/i.test(message));
    assert.deepEqual(unexpected, []);
  }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
setTimeout(() => { console.error('Audio smoke timeout'); app.exit(2); }, 55000);
