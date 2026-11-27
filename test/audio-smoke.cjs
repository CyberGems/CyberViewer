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
  // Each phase decodes seven formats, animates eleven styles and samples the
  // full-track waveform, so a software-rendered machine needs well over a
  // minute. The timeout protects against a hang, not against honest work.
  for (const phase of ['initial', 'restore']) {
    const result = require('node:child_process').spawnSync(require('electron'), [__filename], {
      env: { ...env, CV_AUDIO_TEST_PHASE: phase }, windowsHide: true, encoding: 'utf8', timeout: 180000
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
  // ID3v2.3 text frames: TIT2 (title), TPE1 (artist), TALB (album). Each frame
  // is a 10-byte header, an encoding byte (3 = UTF-8) and the text.
  const textFrame = (id, value) => {
    const body = Buffer.concat([Buffer.from([3]), Buffer.from(value, 'utf8')]);
    const head = Buffer.alloc(10);
    head.write(id, 0, 'ascii');
    head.writeUInt32BE(body.length, 4);
    return Buffer.concat([head, body]);
  };
  const tagBody = Buffer.concat([
    textFrame('TIT2', 'Tagged Track'),
    textFrame('TPE1', 'Tagged Artist'),
    textFrame('TALB', 'Tagged Album')
  ]);
  const tagHeader = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, (tagBody.length >> 21) & 0x7f,
    (tagBody.length >> 14) & 0x7f, (tagBody.length >> 7) & 0x7f, tagBody.length & 0x7f]);
  fs.writeFileSync(path.join(dataDir, 'Tagged.mp3'), Buffer.concat([tagHeader, tagBody, ...Array(230).fill(mp3Frame)]));
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
  // userGesture: the visualizer only wires its AudioContext after real sticky
  // activation, so a script without a gesture would never create the analyser
  // and every animation assertion would fail for the wrong reason.
  const evaluate = body => win.webContents.executeJavaScript('(async()=>{' + body + '})()', true);
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
    const originalId = await evaluate('return window.CVWorkspace.model.activeId;');
    const navDir = path.join(dataDir, 'navigation');
    fs.mkdirSync(navDir);
    const navFiles = ['a.wav', 'b.wav'].map(name => path.join(navDir, name));
    for (const file of navFiles) fs.copyFileSync(wav, file);
    await evaluate('await window.CVWorkspace.openFiles(' + JSON.stringify(navFiles.map(file => ({ path: file, name: path.basename(file), size: 0 }))) + ');');
    await ready();
    await waitFor(() => evaluate('return state.images.length === 2;'), 'audio navigation folder scan');
    const browsingId = await evaluate('return window.CVWorkspace.model.activeId;');
    await evaluate("window.CVVideo.sync(); $('video-next').click();");
    await ready();
    assert.equal(await evaluate('return window.CVWorkspace.model.activeId;'), browsingId,
      'audio navigation keeps the current tab when the target is already open');
    assert.equal(await evaluate("return document.querySelectorAll('.image-tab-shell.duplicate').length;"), 2);
    await evaluate("window.CVVideo.sync(); $('video-prev').click();");
    await ready();
    const tabCount = await evaluate('return window.CVWorkspace.model.tabs.length;');
    await evaluate("state.settings.app.mediaSiblingsNewTab = true; window.CVVideo.sync(); $('video-next').click();");
    await waitFor(() => evaluate(`return window.CVWorkspace.model.tabs.length === ${tabCount + 1};`), 'audio sibling in new tab');
    await ready();
    assert.notEqual(await evaluate('return window.CVWorkspace.model.activeId;'), browsingId);
    assert.equal(await evaluate('return window.CVWorkspace.model.active.image.file.name;'), 'b.wav');
    await evaluate(`state.settings.app.mediaSiblingsNewTab = false; await window.CVWorkspace.activate(${JSON.stringify(originalId)});
      window.CVWorkspace.closeTabs(window.CVWorkspace.model.tabs.filter(tab => tab.image.file.path?.includes('navigation')).map(tab => tab.id));`);
    await ready();
    console.log('PASS local audio siblings stay in the chosen tab or open an explicit duplicate tab');
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
      const readWaveform = AnalyserNode.prototype.getByteTimeDomainData;
      const connect = AudioContext.prototype.createMediaElementSource;
      window.__sourceCount=0;
      AudioContext.prototype.createMediaElementSource=function(element){
        window.__audioContext=this; window.__sourceCount++; return connect.call(this,element);
      };
      window.__audioPeak=0; window.__analysisReads=0;
      AnalyserNode.prototype.getByteFrequencyData=function(bytes){
        if(window.__silenceVisualizer) bytes.fill(0); else read.call(this,bytes);
        window.__analysisReads++; window.__audioPeak=Math.max(...bytes);
      };
      AnalyserNode.prototype.getByteTimeDomainData=function(bytes){
        if(window.__silenceVisualizer) bytes.fill(128); else readWaveform.call(this,bytes);
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
      window.__visualEnergy=async()=>{
        const samples=[];
        for(let i=0;i<3;i++){
          await new Promise(resolve=>setTimeout(resolve,70));
          signatureContext.drawImage($('audio-canvas'),0,0,64,36);
          const data=signatureContext.getImageData(0,0,64,36).data;
          let sum=0,lit=0;
          for(let p=0;p<data.length;p+=4){
            const value=(data[p]+data[p+1]+data[p+2])/3;
            sum+=value; if(value>45) lit++;
          }
          samples.push({mean:sum/(data.length/4),lit:lit/(data.length/4)});
        }
        return {
          mean:samples.reduce((total,item)=>total+item.mean,0)/samples.length,
          lit:samples.reduce((total,item)=>total+item.lit,0)/samples.length
        };
      };
    `);
    await evaluate('await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return window.CVVideo.element.currentTime > .15 && window.CVVideo.element.webkitAudioDecodedByteCount > 0;'), 'WAV audio decoded');
    await evaluate('window.CVVideo.element.currentTime=.5;');
    await waitFor(() => evaluate('return !window.CVVideo.element.seeking;'), 'visualizer playback rewind');
    const renderStats = {};
    for (const mode of ['spectrum', 'waveform', 'envelope', 'radial', 'particles', 'aurora', 'tunnel', 'terrain', 'helix', 'grid', 'prism']) {
      await evaluate(`$('audio-visualizer').value='${mode}'; $('audio-visualizer').dispatchEvent(new Event('change'));`);
      await evaluate('window.__paintTimes=[];');
      await delay(180);
      const first = await evaluate("return $('audio-canvas').toDataURL();");
      await delay(150);
      const second = await evaluate("return $('audio-canvas').toDataURL();");
      // Some compositions can look identical across two nearby frames; retry
      // with a wider gap before calling it static.
      let changed = first !== second;
      for (let attempt = 0; !changed && attempt < 3; attempt++) {
        await delay(220);
        changed = await evaluate(`return $('audio-canvas').toDataURL()!==${JSON.stringify(first)};`);
      }
      assert.ok(changed, mode + ' reacts/animates during actual audio playback');
      fs.writeFileSync(path.join(dataDir, mode + '.png'), (await win.webContents.capturePage()).toPNG());
      assert.equal(await evaluate("return $('audio-canvas').width<=1440 && $('audio-canvas').height<=810;"), true);
      renderStats[mode] = await evaluate('return window.__paintTimes.reduce((a,b)=>a+b,0)/Math.max(1,window.__paintTimes.length);');
      if (mode === 'prism' || mode === 'tunnel') {
        const label = mode === 'prism' ? 'Prism' : 'Tunnel';
        const audible = await evaluate('return window.__visualEnergy();');
        await evaluate('window.__silenceVisualizer=true;');
        await delay(650);
        const silent = await evaluate('return window.__visualEnergy();');
        await evaluate('window.__silenceVisualizer=false;');
        await delay(250);
        assert.ok(audible.lit > silent.lit * 1.5 && audible.mean > silent.mean * 1.1,
          label + ' responds to analysed audio rather than only elapsed time: ' + JSON.stringify({ audible, silent }));
        for (const theme of ['cyberviewer', 'gray', 'light']) {
          await evaluate(`applyAppearanceTheme('${theme}','#00d4ff');`);
          await delay(100);
          fs.writeFileSync(path.join(dataDir, `${mode}-${theme}.png`), (await win.webContents.capturePage()).toPNG());
        }
        await evaluate("applyAppearanceTheme('cyberviewer','#00d4ff');");
        console.log(`PASS ${label} reacts to audio and renders in all appearance themes`);
      }
    }
    console.log('Mean drawing time (ms, software-rendered test): ' + JSON.stringify(renderStats));
    await evaluate(`const e=window.CVVideo.element;
      if(e.ended || e.currentTime>10){ e.currentTime=.5;
        await new Promise(resolve=>{ if(!e.seeking) return resolve(); e.addEventListener('seeked',resolve,{once:true}); });
        if(e.paused) await window.CVVideo.toggle(); }`);
    const counter = await evaluate('return {reads:window.__analysisReads,time:performance.now()};'); await delay(1000);
    const fps = await evaluate(`return (window.__analysisReads-${counter.reads})*1000/(performance.now()-${counter.time});`);
    assert.ok(fps > 10 && fps <= 32, 'Live analysis/drawing remains capped near 30 fps: ' + fps);
    assert.ok(await evaluate('return window.__audioPeak > 20;'), 'Analyser receives real audio, not CORS-muted silence');
    // Full-track waveform under the seek bar: decoded once from the file, not
    // the live analyser, so this check is independent of the styles above.
    // It runs after the fps probe because reading a wide canvas costs track
    // time, and the probe above is sensitive to how long the track keeps going.
    await waitFor(() => evaluate('return document.body.classList.contains("waveform-ready");'), 'track waveform ready');
    const wave = await evaluate(`const c=$('audio-track-waveform'), x=c.getContext('2d');
      const d=x.getImageData(0,0,c.width,c.height).data, heights=[];
      for(let px=0;px<c.width;px++){let top=-1,bottom=-1;
        for(let py=0;py<c.height;py++){const i=(py*c.width+px)*4;
          if(d[i+3]>10){if(top<0)top=py;bottom=py;}}
        heights.push(top<0?0:bottom-top+1);}
      return {width:c.width,height:c.height,lit:heights.filter(h=>h>0).length};`);
    assert.ok(wave.width > 100 && wave.height > 4, 'track waveform canvas has real pixel size');
    assert.ok(wave.lit > wave.width * .9, 'track waveform spans the whole seek bar: ' + wave.lit + '/' + wave.width);
    const waveBefore = await evaluate("return $('audio-track-waveform').toDataURL();");
    // A value far from the live position, so the repaint cannot be mistaken for
    // the timeline's own sync. No pause here: later assertions measure the shape
    // captured immediately before pausing, and pausing early would disturb them.
    await evaluate('window.CVAudioWaveform.setProgress(.02, 12);');
    await delay(120);
    assert.notEqual(await evaluate("return $('audio-track-waveform').toDataURL();"), waveBefore,
      'track waveform repaints its played portion');
    console.log('PASS full-track waveform is decoded from the file and drawn across the seek bar');
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
    // The 12 s fixture runs out during the checks above, and a completed track
    // reports paused+ended. Always rewind to the start and play from there, so
    // the assertion cannot race the end of the fixture.
    await evaluate(`const e=window.CVVideo.element;
      e.pause(); e.currentTime=0.2;
      await new Promise(r => { if(!e.seeking) return r(); e.addEventListener('seeked', r, {once:true}); });
      await window.CVVideo.toggle();`);
    await waitFor(() => evaluate('return !window.CVVideo.element.paused && !window.CVVideo.element.ended && window.CVVideo.element.currentTime < 5;'), 'playback restarted for the dialog check');
    await evaluate('$("btn-config").click();');
    assert.equal(await evaluate("return $('modal-config').classList.contains('active');"), true, 'Config dialog opens during playback');
    assert.equal(await evaluate('return !window.CVVideo.element.paused;'), true, 'Playback continues while the config dialog is open');
    await evaluate("$('cfg-lang').closest('.cfg-select-shell').querySelector('.cfg-select-trigger').click();");
    await waitFor(() => evaluate("return !!document.querySelector('.cfg-select-menu');"), 'configuration dropdown opens');
    assert.equal(await evaluate("return document.querySelectorAll('.cfg-select-menu .cfg-select-scroll[hidden]').length;"), 2,
      'Short configuration lists do not show scroll chevrons');
    await evaluate('window.CVConfigSelects.close();');
    await evaluate('window.closeModal("modal-config");');
    assert.equal(await evaluate("return !$('modal-config').classList.contains('active') && !window.CVVideo.element.paused;"), true, 'Playback continues after closing the config dialog');
    await evaluate("$('video-more').click();");
    await waitFor(() => evaluate("return !$('video-menu').hidden;"), 'visualization picker menu');
    win.webContents.debugger.attach('1.3');
    const point = selector => evaluate(`const r=document.querySelector('${selector}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
    const move = async selector => {
      const pos = await point(selector);
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...pos });
      return pos;
    };
    await move('.visualizer-arrow-next');
    await waitFor(() => evaluate("const b=document.querySelector('.visualizer-arrow-next');return b.classList.contains('is-hovered') && Number(getComputedStyle(b,'::after').opacity)>.9;"), 'right visualization tooltip');
    const hover = await evaluate(`return [...document.querySelectorAll('.visualizer-arrow')].map(button=>{
      const style=getComputedStyle(button),tip=getComputedStyle(button,'::after');
      return {direction:button.classList.contains('visualizer-arrow-next')?'next':'prev',active:button.classList.contains('is-hovered'),
        background:style.backgroundColor,border:style.borderColor,tooltipOpacity:Number(tip.opacity),tooltipRight:tip.right,
        tooltipTop:tip.top,buttonHeight:button.getBoundingClientRect().height};
    });`);
    assert.equal(hover.filter(item => item.active).length, 1, 'Only the hovered visualization arrow is active');
    assert.equal(hover.find(item => item.active).direction, 'next');
    assert.ok(hover.find(item => item.direction === 'next').tooltipOpacity > .9, 'The right arrow tooltip is visible: ' + JSON.stringify(hover));
    assert.equal(hover.find(item => item.direction === 'prev').tooltipOpacity, 0, 'The left tooltip clears immediately');
    assert.equal(hover[0].background, 'rgba(255, 255, 255, 0.04)', 'The previous arrow does not keep its hover tint');
    assert.equal(hover.find(item => item.direction === 'next').tooltipRight, '0px', 'The right tooltip is aligned inside the window edge');
    assert.equal(hover.find(item => item.active).tooltipTop, '42px', 'The tooltip uses the compact arrow offset');
    assert.equal(42 - hover.find(item => item.active).buttonHeight, 8, 'The tooltip keeps the standard 8px gap');
    fs.writeFileSync(path.join(dataDir, 'visualizer-arrow-tooltip.png'), (await win.webContents.capturePage()).toPNG());
    const triggerPoint = await point('#audio-visualizer-row .cfg-select-trigger');
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...triggerPoint, button: 'left', clickCount: 1 });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...triggerPoint, button: 'left', clickCount: 1 });
    await waitFor(() => evaluate("return !!document.querySelector('.cfg-select-menu');"), 'visualization list opens');
    const dropdown = await evaluate(`const menu=document.querySelector('.cfg-select-menu'),viewport=menu.querySelector('.cfg-select-options'),
      up=menu.querySelector('.cfg-select-scroll:first-child'),down=menu.querySelector('.cfg-select-scroll:last-child'),r=menu.getBoundingClientRect();
      return {expanded:$('audio-visualizer-row').querySelector('.cfg-select-trigger').getAttribute('aria-expanded'),options:viewport.children.length,
        overflow:viewport.scrollHeight>viewport.clientHeight+1,scrollTop:viewport.scrollTop,upHidden:up.hidden,downHidden:down.hidden,
        upDisabled:up.disabled,downDisabled:down.disabled,upLabel:up.getAttribute('aria-label'),downLabel:down.getAttribute('aria-label'),
        bounds:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},width:innerWidth,height:innerHeight,
        tooltips:[...document.querySelectorAll('.visualizer-arrow')].map(button=>Number(getComputedStyle(button,'::after').opacity))};`);
    assert.equal(dropdown.expanded, 'true');
    assert.ok(dropdown.options >= 12 && dropdown.overflow, 'The effects list exposes its overflow');
    assert.equal(dropdown.upHidden, false);
    assert.equal(dropdown.downHidden, false);
    assert.ok(dropdown.upLabel && dropdown.downLabel, 'Scroll chevrons have accessible names');
    assert.ok(dropdown.bounds.left >= 0 && dropdown.bounds.top >= 0 && dropdown.bounds.right <= dropdown.width && dropdown.bounds.bottom <= dropdown.height,
      'The dropdown stays inside the viewport: ' + JSON.stringify(dropdown.bounds));
    assert.deepEqual(dropdown.tooltips, [0, 0], 'Visualization tooltips stay hidden while the list is open');
    for (const theme of ['cyberviewer', 'gray', 'light']) {
      await evaluate(`applyAppearanceTheme('${theme}','#00d4ff');`);
      await delay(100);
      fs.writeFileSync(path.join(dataDir, `visualizer-picker-${theme}.png`), (await win.webContents.capturePage()).toPNG());
    }
    await evaluate("applyAppearanceTheme('cyberviewer','#00d4ff');");
    await evaluate("document.querySelector('.cfg-select-scroll:first-child').click();");
    await delay(450);
    assert.equal(await evaluate("return document.querySelector('.cfg-select-options').scrollTop;"), 0, 'The up chevron returns to the first option');
    assert.equal(await evaluate("return document.querySelector('.cfg-select-scroll:first-child').disabled;"), true, 'The up chevron disables at the top');
    await evaluate("document.querySelector('.cfg-select-scroll:last-child').click();");
    await delay(450);
    assert.ok(await evaluate("return document.querySelector('.cfg-select-options').scrollTop>0;"), 'The down chevron scrolls the list');
    assert.equal(await evaluate("return document.querySelector('.cfg-select-scroll:first-child').disabled;"), false, 'The up chevron enables after scrolling');
    await evaluate("document.querySelector('.cfg-select-options').scrollTop=0;");
    await delay(100);
    await evaluate("$('audio-visualizer-row').querySelector('.cfg-select-trigger').dispatchEvent(new KeyboardEvent('keydown',{key:'PageDown',bubbles:true,cancelable:true}));");
    await delay(450);
    assert.ok(await evaluate("return document.querySelector('.cfg-select-options').scrollTop>0;"), 'PageDown provides keyboard scrolling');
    await evaluate("document.querySelector('.cfg-select-option[aria-selected=\"true\"]').click();");
    assert.equal(await evaluate("return !!document.querySelector('.cfg-select-menu');"), false, 'Choosing an option closes the list');
    await evaluate("$('video-more').click();");
    assert.equal(await evaluate("return $('video-menu').hidden;"), true, 'The visualization menu closes after the picker check');
    win.webContents.debugger.detach();
    console.log('PASS visualization arrows, edge-safe tooltips and dropdown scroll navigation');
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
    // A plain stage click still toggles play/pause. Rewind first: the fixture is
    // short and a track that reaches its end is already paused, which would make
    // this pause assertion pass for the wrong reason.
    await evaluate(`const e=window.CVVideo.element;
      if(e.ended || e.currentTime > 8){ e.pause(); e.currentTime=0.2;
        await new Promise(r => { if(!e.seeking) return r(); e.addEventListener('seeked', r, {once:true}); }); }
      if(e.paused) await window.CVVideo.toggle();`);
    await waitFor(() => evaluate('return !window.CVVideo.element.paused && !window.CVVideo.element.ended;'), 'playing before the stage-click check');
    await evaluate(`const t=$('canvas-layer'); t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); t.dispatchEvent(new MouseEvent('click',{bubbles:true}));`);
    await waitFor(() => evaluate('return window.CVVideo.element.paused;'), 'plain stage click pauses');
    // Resume from a rewound position so the release measurement below starts
    // with the visualizer actually running.
    await evaluate(`const e=window.CVVideo.element; e.currentTime=0.2;
      await new Promise(r => { if(!e.seeking) return r(); e.addEventListener('seeked', r, {once:true}); });
      await window.CVVideo.toggle();`);
    await waitFor(() => evaluate('return !window.CVVideo.element.paused;'), 'resume after stage click check');
    // Give the visualizer time to reach full level: the pause-release measurement
    // compares frames, and a just-started visual has nothing to release yet.
    await delay(450);
    // Sample the release frame by frame inside the page. Counting painted
    // frames instead of wall-clock time keeps the ramp check honest on a loaded
    // machine: a slow machine paints fewer frames, it does not skip the ramp.
    // The window is bounded and only costs a few frames.
    const pauseFrames = await evaluate(`
      const e=window.CVVideo.element, before=window.__visualSignature(), frames=[];
      let capturing=true;
      const capture=()=>{ frames.push(window.__visualSignature()); if(capturing) requestAnimationFrame(capture); };
      const paused=new Promise(resolve=>e.addEventListener('pause',resolve,{once:true}));
      requestAnimationFrame(capture);
      e.pause(); await paused;
      await new Promise(r=>setTimeout(r,700));
      capturing=false;
      await new Promise(r=>requestAnimationFrame(r));
      return {before,frames};
    `);
    const painted = [];
    for (const frame of pauseFrames.frames) {
      const last = painted[painted.length - 1];
      if (!last || frame.some((value, i) => value !== last[i])) painted.push(frame);
    }
    const distance = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
    assert.ok(pauseFrames.frames.length >= 2, 'Pause is sampled across several frames: ' + pauseFrames.frames.length);
    assert.ok(painted.length >= 3, 'Pause paints a progressive release instead of snapping to rest: ' + painted.length + ' states');
    assert.ok(distance(pauseFrames.before, painted[painted.length - 1]) > 0,
      'the release settles into a different state than the playing frame');
    // Wait for the canvas to actually stop changing instead of assuming the
    // release finished within a fixed delay. Two matching samples are not
    // enough: the decay is slow enough that two close reads can coincide while
    // the ramp is still running, so stillness must hold for several reads.
    const stoppedStart = Date.now();
    let stopped = await evaluate("return $('audio-canvas').toDataURL();");
    let still = 0;
    while (still < 4) {
      await delay(150);
      const next = await evaluate("return $('audio-canvas').toDataURL();");
      still = next === stopped ? still + 1 : 0;
      stopped = next;
      if (Date.now() - stoppedStart > 8000) throw Error('Paused canvas never settled');
    }
    const releaseReads = await evaluate('return window.__analysisReads;');
    await delay(180);
    assert.equal(await evaluate("return $('audio-canvas').toDataURL();"), stopped, 'Paused canvas is static');
    await evaluate('window.CVAudioVisuals.refresh();');
    assert.equal(await evaluate("return $('audio-canvas').toDataURL();"), stopped, 'Idle repaint leaves no accumulating trails');
    assert.equal(await evaluate('return window.__analysisReads;'), releaseReads, 'Release reuses frozen samples without extra FFT work');
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
    console.log('PASS PCM WAV, every animated mode, smooth pause/end, 30 fps cap, hide/off and shared controls');
    await open('Silence.mp3'); await ready();
    await evaluate('await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return window.CVVideo.element.currentTime > .15 && window.CVVideo.element.webkitAudioDecodedByteCount > 0;'), 'MP3 decoder');
    await evaluate('window.CVVideo.element.pause();');
    console.log('PASS direct MP3 decoding without conversion');
    // Tags must enrich the caption without delaying playback or replacing the
    // name before the answer arrives.
    await open('Tagged.mp3'); await ready();
    // attach() must paint the file name synchronously, before any await, so
    // playback never waits on the tag lookup.
    const synchronousCaption = await evaluate(`const el=$('audio-name');
      let seen=null;
      const observer=new MutationObserver(() => { if (seen===null) seen=el.textContent; });
      observer.observe(el, { childList: true, characterData: true, subtree: true });
      window.CVAudioVisuals.attach(state.images[state.current]);
      const painted=el.textContent;
      observer.disconnect();
      return { painted, firstMutation: seen, tagsHidden: $('audio-tags').hidden };`);
    console.log('caption at attach: ' + JSON.stringify(synchronousCaption));
    assert.equal(synchronousCaption.painted, 'Tagged.mp3', 'attach paints the file name synchronously');
    assert.equal(synchronousCaption.tagsHidden, true, 'the tag line stays hidden until tags arrive');
    await waitFor(() => evaluate(`return $('audio-name').textContent === 'Tagged Track'
      && $('audio-tags').textContent === 'Tagged Artist · Tagged Album' && !$('audio-tags').hidden;`), 'ID3 tags reach the caption');
    await evaluate('await window.CVVideo.toggle();');
    await waitFor(() => evaluate('return window.CVVideo.element.currentTime > .15 && window.CVVideo.element.audioTracks !== undefined || window.CVVideo.element.webkitAudioDecodedByteCount > 0;'), 'tagged MP3 still plays');
    await evaluate('window.CVVideo.element.pause();');
    const captionRect = await evaluate(`
      const caption = document.querySelector('.audio-caption').getBoundingClientRect();
      return { x: Math.round(caption.left - 20), y: Math.round(caption.top - 12),
               width: Math.round(caption.width + 40), height: Math.round(caption.height + 24) };
    `);
    fs.writeFileSync(path.join(dataDir, 'tagged-caption.png'), (await win.webContents.capturePage(captionRect)).toPNG());
    // A track without tags keeps the plain name and hides the extra line.
    await open('Silence.mp3'); await ready();
    await delay(300);
    assert.equal(await evaluate(`return $('audio-name').textContent === 'Silence.mp3' && $('audio-tags').hidden
      && $('audio-tags').textContent === '';`), true, 'an untagged track keeps the plain file name');
    console.log('PASS ID3 title, artist and album enrich the caption after playback is already live');
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
    const originalVideoId = await evaluate('return window.CVWorkspace.model.activeId;');
    const videoNavDir = path.join(dataDir, 'video-navigation');
    fs.mkdirSync(videoNavDir);
    const videoNavFiles = ['a.webm', 'b.webm'].map(name => path.join(videoNavDir, name));
    for (const file of videoNavFiles) fs.copyFileSync(videoPath, file);
    await evaluate('await window.CVWorkspace.openFiles(' + JSON.stringify(videoNavFiles.map(file => ({ path: file, name: path.basename(file), size: 0 }))) + ');');
    await ready();
    await waitFor(() => evaluate('return state.images.length === 2;'), 'video navigation folder scan');
    const videoBrowsingId = await evaluate('return window.CVWorkspace.model.activeId;');
    await evaluate("window.CVVideo.sync(); $('video-next').click();");
    await ready();
    assert.equal(await evaluate('return window.CVWorkspace.model.activeId;'), videoBrowsingId,
      'video navigation keeps the current tab when the target is already open');
    await evaluate("window.CVVideo.sync(); $('video-prev').click();");
    await ready();
    const videoTabCount = await evaluate('return window.CVWorkspace.model.tabs.length;');
    await evaluate("state.settings.app.mediaSiblingsNewTab = true; window.CVVideo.sync(); $('video-next').click();");
    await waitFor(() => evaluate(`return window.CVWorkspace.model.tabs.length === ${videoTabCount + 1};`), 'video sibling in new tab');
    await ready();
    assert.notEqual(await evaluate('return window.CVWorkspace.model.activeId;'), videoBrowsingId);
    assert.equal(await evaluate('return window.CVWorkspace.model.active.image.file.name;'), 'b.webm');
    await evaluate(`state.settings.app.mediaSiblingsNewTab = false; await window.CVWorkspace.activate(${JSON.stringify(originalVideoId)});
      window.CVWorkspace.closeTabs(window.CVWorkspace.model.tabs.filter(tab => tab.image.file.path?.includes('video-navigation')).map(tab => tab.id));`);
    await ready();
    console.log('PASS local video siblings stay in the chosen tab or open an explicit duplicate tab');
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
