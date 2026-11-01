'use strict';

// Real decoding and canvas rendering in an isolated profile. No FFmpeg install.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
if (!process.versions.electron) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberviewer-audio-test-'));
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
    const envelope = 0.55 + 0.35 * Math.sin(i / rate * Math.PI * 2 * 0.8);
    pcm.writeInt16LE(Math.round(Math.sin(i / rate * 440 * Math.PI * 2) * 16000 * envelope), 44 + i * 2);
  }
  fs.writeFileSync(path.join(dataDir, 'Tone #ñ %.wav'), pcm);
  // MPEG-1 Layer III: 128 kb/s, 44.1 kHz stereo, no reservoir or spectral
  // coefficients. These valid silent frames exercise the actual MP3 decoder.
  const mp3Frame = Buffer.alloc(417); mp3Frame.set([0xff, 0xfb, 0x90, 0x00]);
  fs.writeFileSync(path.join(dataDir, 'Silence.mp3'), Buffer.concat(Array(230).fill(mp3Frame)));
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
  if (restoring) {
    await ready();
    assert.equal(await evaluate("return document.body.classList.contains('audio-active') && window.CVVideo.element.paused;"), true);
    assert.ok(await evaluate('return Math.abs(window.CVVideo.element.currentTime - 4) < .2;'));
    assert.equal(await evaluate("return $('audio-visualizer').value;"), 'off');
    console.log('PASS audio session restores position, paused playback and effects preference');
  } else {
    await open('Tone #ñ %.wav'); await ready();
    assert.equal(await evaluate("return document.body.classList.contains('audio-active') && !$('audio-stage').hidden && !$('video-controls').hidden;"), true);
    assert.equal(await evaluate('return window.CVVideo.element.videoWidth;'), 0);
    const thumb = await evaluate('return await window.electronAPI.getThumbnail(' + JSON.stringify(wav) + ');');
    assert.ok(thumb.endsWith('audio-thumbnail.svg'));
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
    `);
    await evaluate('await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return window.CVVideo.element.currentTime > .15 && window.CVVideo.element.webkitAudioDecodedByteCount > 0;'), 'WAV audio decoded');
    for (const mode of ['spectrum', 'waveform', 'radial', 'particles']) {
      await evaluate(`$('audio-visualizer').value='${mode}'; $('audio-visualizer').dispatchEvent(new Event('change'));`);
      await delay(180);
      const first = await evaluate("return $('audio-canvas').toDataURL();");
      await delay(150);
      const second = await evaluate("return $('audio-canvas').toDataURL();");
      assert.ok(first !== second, mode + ' reacts/animates during actual audio playback');
      fs.writeFileSync(path.join(dataDir, mode + '.png'), (await win.webContents.capturePage()).toPNG());
    }
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
    await evaluate('window.CVVideo.element.pause();');
    const stopped = await evaluate("return $('audio-canvas').toDataURL();"); await delay(150);
    assert.equal(await evaluate("return $('audio-canvas').toDataURL();"), stopped, 'Paused canvas is static');
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
    console.log('PASS PCM WAV, byte ranges, thumbnail, four animated modes, pause/hide/off, shared controls');
    await open('Silence.mp3'); await ready();
    await evaluate('await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return window.CVVideo.element.currentTime > .15 && window.CVVideo.element.webkitAudioDecodedByteCount > 0;'), 'MP3 decoder');
    await evaluate('window.CVVideo.element.pause();');
    console.log('PASS direct MP3 decoding without conversion');
    const videoBytes = await evaluate(`
      const c=document.createElement('canvas'); c.width=160; c.height=90;
      const draw=c.getContext('2d'), stream=c.captureStream(10), ac=new AudioContext();
      const tone=ac.createOscillator(), output=ac.createMediaStreamDestination();
      tone.connect(output); tone.start(); await ac.resume();
      output.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus'}),chunks=[];
      recorder.ondataavailable=e=>chunks.push(e.data);
      const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
      for(let i=0;i<10;i++){draw.fillStyle=i%2?'#124':'#abd';draw.fillRect(0,0,160,90);await new Promise(resolve=>setTimeout(resolve,60));}
      recorder.stop();await stopped;tone.stop();stream.getTracks().forEach(track=>track.stop());await ac.close();
      return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
    `);
    fs.writeFileSync(path.join(dataDir, 'Video.webm'), Buffer.from(videoBytes));
    await open('Video.webm'); await ready();
    assert.equal(await evaluate("return !$('audio-stage').hidden || !$('audio-visualizer-row').hidden || document.body.classList.contains('audio-active');"), false);
    await evaluate('await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return window.CVVideo.element.currentTime>.1 && window.CVVideo.element.webkitAudioDecodedByteCount>0;'), 'video with audio after audio playback');
    assert.equal(await evaluate('return window.__audioContext.state;'), 'running');
    await open('Picture.png');
    await waitFor(() => evaluate('return !state.transitioning && mainImg.naturalWidth===120;'), 'image after audio and video');
    assert.equal(await evaluate("return !$('audio-stage').hidden || window.CVVideo.active();"), false);
    assert.equal(await evaluate('return window.__sourceCount;'), 1, 'All local media share a single audio graph');
    console.log('PASS audio/video/image switches preserve decoding and release the visualizer');
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
    console.log('PASS bilingual labels, damaged audio error and position across tabs');
    const unexpected = errors.filter(message => !/(DEMUXER|FFmpegDemuxer)/i.test(message));
    assert.deepEqual(unexpected, []);
  }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
setTimeout(() => { console.error('Audio smoke timeout'); app.exit(2); }, 55000);
