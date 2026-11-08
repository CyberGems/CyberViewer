'use strict';

// Run with node test/video-speed-smoke.cjs. Never use the normal app profile.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
if (!process.versions.electron) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberviewer-speed-test-'));
  const env = { ...process.env, CV_SPEED_TEST_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(require('electron'), [__filename], {
    env, windowsHide: true, encoding: 'utf8', timeout: 45000
  });
  console.log(result.stdout || '');
  if (result.stderr) console.error(result.stderr);
  console.log('Isolated test data: ' + dataDir);
  if (result.error) console.error(result.error);
  process.exit(result.status === 0 ? 0 : 1);
}

const { app, BrowserWindow } = require('electron');
// The fixture is recorded from an offscreen canvas in a hidden test window.
// Use software rendering so frame delivery does not depend on GPU visibility.
app.disableHardwareAcceleration();
// Occluded/backgrounded windows get throttled and visibility-changed on
// Windows, which nondeterministically kills the hold-repeat input sections.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const dataDir = process.env.CV_SPEED_TEST_DIR;
if (!dataDir || !path.basename(dataDir).startsWith('cyberviewer-speed-test-')) throw new Error('Isolated profile required');
app.setPath('userData', dataDir);
app.setName('CyberViewer Speed Test');
process.argv.push('--startup');
fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ app: {
  language: 'es', restoreSession: false, closeChoiceMade: true, closeToTray: false,
  checkUpdatesOnStartup: false, toggleHotkey: 'disabled', contextMenuEnabled: false,
  videoAutoplay: false, autoBackup: { enabled: false }
}, window: { width: 1100, height: 800, maximized: false } }));
require('../main');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(callback, description) {
  const start = Date.now();
  while (Date.now() - start < 15000) { if (await callback()) return; await delay(50); }
  throw new Error('Timed out: ' + description);
}
app.whenReady().then(async () => {
  let win;
  await waitFor(() => (win = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('CyberViewer.html'))), 'main window');
  win.show();
  win.focus();
  const evaluate = body => win.webContents.executeJavaScript('(async()=>{' + body + '})()');
  await waitFor(() => evaluate('return window.CVWorkspace?.ready;'), 'workspace');
  // Generate a real decodable fixture without requiring FFmpeg on the host.
  const bytes = await evaluate(`
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
    const ctx = canvas.getContext('2d'), stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();
    for (const color of ['red', 'blue', 'green']) {
      ctx.fillStyle = color; ctx.fillRect(0, 0, 160, 90);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  `);
  const file = path.join(dataDir, 'speed.webm');
  assert.ok(bytes.length > 0, 'The canvas recorder produced a video fixture');
  fs.writeFileSync(file, Buffer.from(bytes));
  await evaluate('await openImagePath(' + JSON.stringify(file) + ');');
  await waitFor(() => evaluate('return !state.transitioning && window.CVVideo.element.readyState >= 2;'), 'decoded video');
  const snapshot = () => evaluate(`return {
    rate: window.CVVideo.element.playbackRate,
    display: $('video-speed-display').textContent,
    aria: $('video-speed-track').getAttribute('aria-valuenow'),
    stored: localStorage.getItem('cv_video_rate')
  };`);
  const expectRate = async rate => {
    const actual = await snapshot();
    assert.deepEqual(actual, { rate, display: rate.toFixed(2) + '×', aria: String(rate), stored: String(rate) });
  };
  await evaluate("$('video-speed').click(); window.CVVideo.setPlaybackRate(1);");
  await evaluate("$('video-speed-plus').click();");
  await expectRate(1.05);
  await evaluate("$('video-speed-plus').click();");
  await expectRate(1.1);
  await evaluate("$('video-speed-minus').click();");
  await expectRate(1.05);
  await evaluate('window.CVVideo.setPlaybackRate(.25);');
  for (let step = 1; step <= 55; step++) {
    await evaluate("$('video-speed-plus').click();");
    await expectRate(Number((.25 + step * .05).toFixed(2)));
  }
  await evaluate("$('video-speed-plus').click();");
  await expectRate(3);
  await evaluate('window.CVVideo.setPlaybackRate(1.05);');
  console.log('PASS all 0.05 speed steps, repeated +/- and upper bound');

  const rect = await evaluate("const r=$('video-speed-track').getBoundingClientRect(); return {left:r.left, top:r.top, width:r.width, height:r.height};");
  const point = ratio => ({ x: Math.round(rect.left + rect.width * ratio), y: Math.round(rect.top + rect.height / 2) });
  assert.equal(await evaluate(`return document.elementFromPoint(${point(.4).x}, ${point(.4).y})?.closest('#video-speed-track')?.id;`), 'video-speed-track', 'The track receives pointer input');
  const input = (type, ratio, extra = {}) => win.webContents.sendInputEvent({ type, ...point(ratio), ...extra });
  input('mouseMove', .4);
  input('mouseDown', .4, { button: 'left', clickCount: 1 });
  await waitFor(async () => (await snapshot()).rate !== 1.05, 'pointer changes speed');
  input('mouseMove', 1.2, { button: 'left' });
  await waitFor(async () => (await snapshot()).rate === 3, 'drag beyond right edge');
  input('mouseUp', 1.2, { button: 'left', clickCount: 1 });
  input('mouseMove', .1);
  await delay(100);
  await expectRate(3);
  input('mouseDown', -.2, { button: 'left', clickCount: 1 });
  input('mouseUp', -.2, { button: 'left', clickCount: 1 });
  await evaluate("if ($('video-speed-panel').hidden) $('video-speed').click();");
  input('mouseMove', .4);
  input('mouseDown', .4, { button: 'left', clickCount: 1 });
  input('mouseMove', -.2, { button: 'left' });
  await waitFor(async () => (await snapshot()).rate === .25, 'drag beyond left edge');
  input('mouseUp', -.2, { button: 'left', clickCount: 1 });
  console.log('PASS real pointer hit testing, dragging, bounds and release');

  const pressStep = async id => {
    const point = await evaluate(`const r=$('${id}').getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)};`);
    win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
    win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
    return point;
  };
  const releaseStep = point => win.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
  const expectStopped = async () => {
    const stopped = await snapshot();
    await delay(500);
    assert.deepEqual(await snapshot(), stopped, 'Repetition stops without an extra release click');
  };
  await evaluate('window.CVVideo.setPlaybackRate(1);');
  const plusPoint = await pressStep('video-speed-plus');
  await waitFor(async () => (await snapshot()).rate === 1.05, 'initial press steps once');
  releaseStep(plusPoint);
  await expectStopped();
  await expectRate(1.05);

  for (const [id, direction] of [['video-speed-plus', 1], ['video-speed-minus', -1]]) {
    await evaluate('window.CVVideo.setPlaybackRate(1);');
    const pressed = await pressStep(id);
    await waitFor(async () => direction * ((await snapshot()).rate - 1) >= .14, id + ' repeats while held');
    // Pointer capture must allow release outside the button without continuing.
    const outside = { x: pressed.x, y: pressed.y - 100 };
    win.webContents.sendInputEvent({ type: 'mouseMove', ...outside, button: 'left' });
    releaseStep(outside);
    await delay(50);
    await expectStopped();
  }
  for (const [id, start, limit] of [['video-speed-plus', 2.95, 3], ['video-speed-minus', .3, .25]]) {
    await evaluate(`window.CVVideo.setPlaybackRate(${start});`);
    const pressed = await pressStep(id);
    await waitFor(async () => (await snapshot()).rate === limit, 'hold reaches speed bound');
    await expectStopped();
    releaseStep(pressed);
  }
  console.log('PASS single pointer click, hold +/- repetition, outside release and speed bounds');

  for (const cancel of [
    "window.dispatchEvent(new PointerEvent('pointercancel'));",
    "window.dispatchEvent(new Event('blur'));",
    // An outside pointerdown closes the standalone popover through closeMenu.
    "document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));",
    'window.CVVideo.closeMenu();'
  ]) {
    await evaluate("if ($('video-speed-panel').hidden) $('video-speed').click(); window.CVVideo.setPlaybackRate(1);");
    const pressed = await pressStep('video-speed-plus');
    await waitFor(async () => (await snapshot()).rate >= 1.15, 'hold before cancellation');
    await evaluate(cancel);
    await expectStopped();
    releaseStep(pressed);
  }
  await evaluate("if ($('video-speed-panel').hidden) $('video-speed').click();");
  console.log('PASS hold cancellation on pointer cancel, blur, outside pointerdown and menu close');

  await evaluate(`window.CVVideo.setPlaybackRate(1); $('video-speed-track').focus();
    window.__speedSeekCalls = 0;
    const original = window.CVVideo.seekBy;
    window.CVVideo.seekBy = (...args) => { window.__speedSeekCalls++; return original(...args); };
    $('video-speed-track').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));`);
  await expectRate(1.05);
  assert.equal(await evaluate('return window.__speedSeekCalls;'), 0, 'Slider arrows must not seek the video');
  await evaluate("$('video-speed-track').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));");
  await expectRate(1);
  assert.equal(await evaluate('return window.__speedSeekCalls;'), 0);
  await evaluate("$('video-speed-plus').click();");
  await evaluate("window.CVVideo.closeMenu(); $('video-speed').click(); window.CVVideo.sync();");
  await expectRate(1.05);
  await evaluate('window.CVVideo.element.load();');
  await waitFor(() => evaluate('return window.CVVideo.element.readyState >= 2;'), 'reloaded video');
  await expectRate(1.05);
  for (const language of ['en', 'es']) {
    await evaluate(`state.settings.app.language='${language}'; updateLanguage('${language}');`);
    assert.equal(await evaluate("return $('video-speed-track').getAttribute('aria-label');"), language === 'en' ? 'Speed' : 'Velocidad');
  }
  console.log('PASS keyboard isolation, source reload, menu resync and bilingual accessible label');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
setTimeout(() => { console.error('Speed smoke timeout'); app.exit(2); }, 40000);
