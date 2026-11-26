'use strict';

// Sidebar caption behaviour: marquee on truncated names, compact cards mode,
// the Configuration switch and the context-menu entry. Runs one Electron window
// against an isolated profile with generated images.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const LABEL = 'Caption test';

if (!process.versions.electron) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberviewer-caption-test-'));
  const result = require('node:child_process').spawnSync(require('electron'), [__filename], {
    env: { ...process.env, CV_CAPTION_TEST_DIR: dataDir },
    windowsHide: true,
    encoding: 'utf8',
    timeout: 180000
  });
  console.log(result.stdout || '');
  if (result.stderr) console.error(result.stderr);
  if (result.error || result.status !== 0) {
    console.error(result.error || `Caption smoke exited ${result.status}`);
    console.error('Isolated test data: ' + dataDir);
    process.exit(1);
  }
  console.log('Caption test data and screenshots: ' + dataDir);
  process.exit(0);
}

const { app, BrowserWindow, nativeImage } = require('electron');
app.disableHardwareAcceleration();
const dataDir = process.env.CV_CAPTION_TEST_DIR;
if (!dataDir || !path.basename(dataDir).startsWith('cyberviewer-caption-test-')) {
  throw Error('Isolated profile required');
}
app.setPath('userData', dataDir);
app.setName('CyberViewer Caption Test');
process.argv.push('--startup');

const names = [
  'A rather long image file name that will not fit inside the sidebar card.png',
  'Short.png',
  'Medium length caption for a card.png'
];
if (!fs.existsSync(path.join(dataDir, names[0]))) {
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({
    app: {
      language: 'en', sidebarOpen: true, restoreSession: false, closeChoiceMade: true,
      closeToTray: false, checkUpdatesOnStartup: false, toggleHotkey: 'disabled',
      contextMenuEnabled: false, animateGifs: false, autoBackup: { enabled: false }
    },
    window: { width: 1100, height: 820, maximized: false }
  }));
  const colors = [[40, 90, 160], [160, 70, 40], [60, 150, 90]];
  names.forEach((name, i) => {
    const [r, g, b] = colors[i];
    const bitmap = Buffer.alloc(240 * 160 * 4);
    for (let p = 0; p < 240 * 160; p++) {
      bitmap[p * 4] = b; bitmap[p * 4 + 1] = g; bitmap[p * 4 + 2] = r; bitmap[p * 4 + 3] = 255;
    }
    const image = nativeImage.createFromBitmap(bitmap, { width: 240, height: 160 });
    fs.writeFileSync(path.join(dataDir, name), image.toPNG());
  });
}

require('../main');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(callback, label) {
  const start = Date.now();
  while (Date.now() - start < 20000) {
    if (await callback()) return;
    await delay(50);
  }
  throw Error('Timed out: ' + label);
}

app.whenReady().then(async () => {
  let win;
  await waitFor(() => (win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('CyberViewer.html'))), 'window');
  const evaluate = body => win.webContents.executeJavaScript('(async()=>{' + body + '})()', true);
  await waitFor(() => evaluate('return !!(window.CVWorkspace && window.CVWorkspace.ready);'), 'workspace');

  const errors = [];
  win.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message);
  });

  const paths = names.map(name => path.join(dataDir, name));
  await evaluate('for (const p of ' + JSON.stringify(paths) + ') await openImagePath(p);');
  await waitFor(() => evaluate('return state.images.length >= 3 && !state.transitioning;'), 'images loaded');
  // The window can start with the sidebar closed; the captions only exist
  // while it is showing, so open it deterministically.
  await evaluate('setSidebarOpen(true);');
  await waitFor(() => evaluate('return document.getElementById("sidebar").getBoundingClientRect().width > 100;'), 'sidebar visible');
  await delay(250);

  const thumbState = await evaluate(`
    return state.images.map((im, i) => ({ i, name: im.file.name, url: im.thumbUrl, failed: !!im.thumbFailed,
      imgOpacity: (document.querySelector('.thumb-item[data-index="' + i + '"] .thumb-static') || {}).style?.opacity }));
  `);
  console.log('thumbs: ' + JSON.stringify(thumbState));
  await waitFor(() => evaluate(`
    return [...document.querySelectorAll('#sidebar .thumb-item .thumb-static')]
      .every(img => img.style.opacity === '1' && img.complete && img.naturalWidth > 0);
  `), 'sidebar thumbnails');

  // ── Marquee: only the overflowing caption scrolls ──
  await delay(400);
  const layoutProbe = await evaluate(`
    const sidebar = document.getElementById('sidebar');
    const item = document.querySelector('#sidebar .thumb-item');
    return { sidebarDisplay: getComputedStyle(sidebar).display,
             sidebarWidth: sidebar.getBoundingClientRect().width,
             itemWidth: item ? item.getBoundingClientRect().width : 0,
             stripDisplay: item ? getComputedStyle(item.querySelector('.thumb-name')).display : null,
             sidebarOpen: state.sidebarOpen,
             bodyClass: document.body.className };
  `);
  console.log('layout probe: ' + JSON.stringify(layoutProbe));
  const captions = await evaluate(`
    return [...document.querySelectorAll('#sidebar .thumb-item')].map(item => {
      const strip = item.querySelector('.thumb-name');
      const text = item.querySelector('.thumb-name-text');
      return {
        name: text ? text.textContent : null,
        marquee: !!strip && strip.classList.contains('is-marquee'),
        overflow: strip && text ? text.scrollWidth - strip.clientWidth : 0,
        distance: text ? text.style.getPropertyValue('--marquee-distance') : '',
        duration: text ? text.style.getPropertyValue('--marquee-duration') : '',
        stripWidth: strip ? strip.clientWidth : 0
      };
    });
  `);
  console.log('captions: ' + JSON.stringify(captions, null, 2));
  assert.equal(captions.length, 3, 'three cards rendered');

  const long = captions.find(c => c.name.startsWith('A rather long'));
  const short = captions.find(c => c.name === 'Short');
  assert.ok(long, 'long caption card present');
  assert.ok(short, 'short caption card present');
  assert.ok(long.stripWidth > 0, 'caption strip has a measurable width');
  assert.equal(long.marquee, true, 'an overflowing name scrolls');
  assert.match(long.distance, /^-\d+px$/, 'scroll distance is set in pixels');
  assert.match(long.duration, /^\d+s$/, 'scroll duration is set');
  assert.ok(parseInt(long.distance, 10) < 0, 'distance moves the text leftwards');
  assert.equal(short.marquee, false, 'a name that fits does not scroll');
  assert.equal(short.distance, '', 'a name that fits has no scroll distance');

  // The style must really animate: sample the transform matrix twice.
  // Keyframes hold at 0 during the first 12% of the 10s cycle, so the samples
  // start after that hold instead of reading two identical zero positions.
  const motion = await evaluate(`
    const text = document.querySelector('#sidebar .thumb-item .thumb-name-text');
    const read = () => new DOMMatrixReadOnly(getComputedStyle(text).transform).m41;
    await new Promise(r => setTimeout(r, 1700));
    const first = read();
    await new Promise(r => setTimeout(r, 900));
    return { first, second: read(), animation: getComputedStyle(text).animationName };
  `);
  console.log('marquee motion: ' + JSON.stringify(motion));
  assert.equal(motion.animation, 'thumb-marquee', 'the caption runs the marquee animation');
  assert.ok(motion.first < 0, 'the caption shifts left as the animation advances: ' + motion.first);
  assert.ok(motion.second < motion.first, 'the caption keeps moving between samples: ' + motion.second);

  // Hover must pause the animation instead of restarting it. :hover only
  // reacts to real input, so this moves the OS cursor through the webContents.
  const cardPoint = await evaluate(`
    const item = document.querySelector('#sidebar .thumb-item');
    const rect = item.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + 12),
             width: rect.width, height: rect.height };
  `);
  assert.ok(cardPoint.width > 50 && cardPoint.height > 50, 'card has a hit area: ' + JSON.stringify(cardPoint));
  win.webContents.sendInputEvent({ type: 'mouseMove', x: cardPoint.x, y: cardPoint.y });
  win.webContents.sendInputEvent({ type: 'mouseMove', x: cardPoint.x + 1, y: cardPoint.y + 1 });
  await delay(120);
  const hover = await evaluate(`
    const item = document.querySelector('#sidebar .thumb-item');
    const text = item.querySelector('.thumb-name-text');
    return { hovering: item.matches(':hover'), state: getComputedStyle(text).animationPlayState };
  `);
  console.log('hover: ' + JSON.stringify(hover));
  assert.equal(hover.hovering, true, 'the cursor is over the card');
  assert.equal(hover.state, 'paused', 'hovering pauses the marquee');
  // Move away so the next checks see the resting state.
  win.webContents.sendInputEvent({ type: 'mouseMove', x: cardPoint.x, y: 700 });

  // ── Compact cards: shorter cards, captions hidden until hover ──
  const before = await evaluate(`
    const item = document.querySelector('#sidebar .thumb-item');
    return { height: item.getBoundingClientRect().height,
             compact: document.body.classList.contains('compact-thumbs'),
             nameDisplay: getComputedStyle(item.querySelector('.thumb-name')).display };
  `);
  assert.equal(before.compact, false, 'compact mode is off by default');
  assert.equal(before.nameDisplay, 'flex', 'captions show by default');

  const toggled = await evaluate(`
    // The Settings controls are populated when the modal opens; the change
    // handler autosaves every control, so the rest must be in sync first.
    openConfig();
    await new Promise(r => setTimeout(r, 120));
    const box = $('cfg-compact-cards');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    // The card animates height for 200ms; measure once it has settled.
    await new Promise(r => setTimeout(r, 340));
    const item = document.querySelector('#sidebar .thumb-item');
    const strip = item.querySelector('.thumb-name');
    return { compact: document.body.classList.contains('compact-thumbs'),
             height: item.offsetHeight,
             saved: !!(state.settings && state.settings.app && state.settings.app.compactSidebarCards),
             nameDisplay: getComputedStyle(strip).display,
             marquee: strip.classList.contains('is-marquee'),
             imgHeight: item.querySelector('.thumb-static').offsetHeight };
  `);
  console.log('compact on: ' + JSON.stringify(toggled));
  assert.equal(toggled.compact, true, 'the switch applies compact mode');
  assert.equal(toggled.saved, true, 'the setting is persisted in state');
  assert.ok(toggled.height <= 66 && toggled.height >= 60, 'compact cards are 64px tall: ' + toggled.height);
  assert.equal(toggled.nameDisplay, 'none', 'captions are hidden in compact mode');
  assert.equal(toggled.marquee, false, 'hidden captions are not left scrolling');
  assert.ok(toggled.imgHeight >= 60 && toggled.imgHeight <= 64, 'the preview fills the compact card: ' + toggled.imgHeight);

  // A real cursor over a compact card must reveal its caption, and the card
  // must stay 64px so the row height does not jump while hovering.
  await evaluate('closeModal("modal-config");');
  await delay(200);
  const compactPoint = await evaluate(`
    const item = document.querySelector('#sidebar .thumb-item');
    const rect = item.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  `);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: compactPoint.x, y: compactPoint.y });
  win.webContents.sendInputEvent({ type: 'mouseMove', x: compactPoint.x + 1, y: compactPoint.y + 1 });
  // The index offset animates with the card's 200ms transition.
  await delay(320);
  const revealed = await evaluate(`
    const item = document.querySelector('#sidebar .thumb-item');
    const strip = item.querySelector('.thumb-name');
    return { hovering: item.matches(':hover'),
             display: getComputedStyle(strip).display,
             text: strip.textContent,
             marquee: strip.classList.contains('is-marquee'),
             distance: strip.querySelector('.thumb-name-text').style.getPropertyValue('--marquee-distance'),
             idxBottom: getComputedStyle(item.querySelector('.thumb-idx')).bottom,
             height: item.offsetHeight };
  `);
  console.log('compact hover: ' + JSON.stringify(revealed));
  assert.equal(revealed.hovering, true, 'the cursor is over the compact card');
  assert.equal(revealed.display, 'flex', 'hovering a compact card reveals its caption');
  assert.ok(revealed.text.length > 0, 'the revealed caption carries the file name');
  assert.equal(revealed.marquee, true, 'the revealed caption scrolls when it does not fit: ' + revealed.distance);
  assert.ok(Math.abs(parseFloat(revealed.idxBottom) - 23) < 1, 'the index steps above the revealed caption: ' + revealed.idxBottom);
  assert.equal(revealed.height, 64, 'revealing the caption does not resize the card');
  win.webContents.sendInputEvent({ type: 'mouseMove', x: compactPoint.x, y: 760 });
  await delay(120);

  // ── Context menu exposes the same toggle ──
  const menuState = await evaluate(`
    closeModal('modal-config');
    await new Promise(r => setTimeout(r, 160));
    const item = document.querySelector('#sidebar .thumb-item');
    const rect = item.getBoundingClientRect();
    item.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.top + 20
    }));
    await new Promise(r => setTimeout(r, 60));
    const buttons = [...document.querySelectorAll('#custom-ctx-menu .menu-item')];
    const target = buttons.find(b => (b.textContent || '').trim().includes('Compact cards'));
    return { visible: !document.getElementById('custom-ctx-menu').hidden,
             found: !!target, checked: target ? target.classList.contains('checked') : null,
             labels: buttons.map(b => (b.textContent || '').trim()).filter(Boolean) };
  `);
  console.log('menu: ' + JSON.stringify(menuState));
  assert.equal(menuState.found, true, 'the thumbnail menu lists the compact toggle');
  assert.equal(menuState.checked, true, 'the menu entry reflects the current value');

  const menuOff = await evaluate(`
    const buttons = [...document.querySelectorAll('#custom-ctx-menu .menu-item')];
    const target = buttons.find(b => (b.textContent || '').trim().includes('Compact cards'));
    target.click();
    await new Promise(r => setTimeout(r, 260));
    return { compact: document.body.classList.contains('compact-thumbs'),
             saved: state.settings.app.compactSidebarCards,
             box: $('cfg-compact-cards').checked };
  `);
  console.log('menu toggle off: ' + JSON.stringify(menuOff));
  assert.equal(menuOff.compact, false, 'the menu entry turns compact mode off');
  assert.equal(menuOff.saved, false, 'the setting is persisted from the menu');
  assert.equal(menuOff.box, false, 'the Settings switch stays in sync');

  // ── Every theme keeps the compact card and its revealed caption readable ──
  const themes = ['cyberviewer', 'gray', 'light'];
  for (const theme of themes) {
    const sample = await evaluate(`
      applyAppearanceTheme('${theme}', '#00d4ff');
      closeModal('modal-config');
      document.body.classList.add('compact-thumbs');
      const item = document.querySelector('#sidebar .thumb-item');
      const style = document.createElement('style');
      style.textContent = '.thumb-item.__probe .thumb-name{display:flex!important}';
      document.head.appendChild(style);
      item.classList.add('__probe');
      // The card transitions all properties for 200ms, height included, so
      // the measurement waits for the transition to settle.
      await new Promise(r => setTimeout(r, 320));
      const strip = item.querySelector('.thumb-name');
      const cs = getComputedStyle(strip);
      const itemStyle = getComputedStyle(item);
      // offsetHeight is layout-only, so an open modal's scale cannot skew it.
      const result = {
        theme: document.documentElement.getAttribute('data-theme'),
        height: item.offsetHeight,
        itemHeight: itemStyle.height,
        itemMinHeight: itemStyle.minHeight,
        itemBoxSizing: itemStyle.boxSizing,
        itemDisplay: itemStyle.display,
        itemFlex: itemStyle.flex,
        rectHeight: item.getBoundingClientRect().height,
        compactClass: document.body.classList.contains('compact-thumbs'),
        parent: item.parentElement && (item.parentElement.id || item.parentElement.className),
        parentDisplay: item.parentElement && getComputedStyle(item.parentElement).display,
        color: cs.color,
        background: cs.backgroundColor,
        font: cs.fontSize,
        overflow: strip.scrollWidth > strip.clientWidth
      };
      item.classList.remove('__probe');
      style.remove();
      return result;
    `);
    console.log('theme ' + theme + ': ' + JSON.stringify(sample));
    assert.equal(sample.theme, theme, 'theme applied');
    console.log("HEIGHT-DEBUG");
    assert.ok(sample.color && sample.color !== 'rgba(0, 0, 0, 0)', theme + ' caption has a colour');
    assert.ok(sample.background && sample.background !== 'rgba(0, 0, 0, 0)', theme + ' caption has a backdrop');
  }

  // ── Layout sanity: compact mode really fits more cards ──
  const density = await evaluate(`
    applyAppearanceTheme('cyberviewer', '#00d4ff');
    document.body.classList.remove('compact-thumbs');
    // Both values come from offsetHeight after the 200ms card transition.
    await new Promise(r => setTimeout(r, 320));
    const normal = document.querySelector('#sidebar .thumb-item').offsetHeight;
    document.body.classList.add('compact-thumbs');
    await new Promise(r => setTimeout(r, 320));
    const compact = document.querySelector('#sidebar .thumb-item').offsetHeight;
    return { normal, compact };
  `);
  console.log('density: ' + JSON.stringify(density));
  assert.ok(density.compact < density.normal, 'compact cards are shorter than normal ones');

  assert.deepEqual(errors, [], 'no console errors: ' + errors.join(' | '));

  // Two cropped captures so the two modes can be compared by eye, with real
  // thumbnails rather than only computed styles.
  const sidebarRect = await evaluate(`
    const rect = document.getElementById('sidebar').getBoundingClientRect();
    return { x: Math.round(rect.left), y: Math.round(rect.top),
             width: Math.round(rect.width), height: Math.round(Math.min(rect.height, 340)) };
  `);
  const capture = async (name) => {
    await delay(350);
    const target = path.join(dataDir, name);
    const image = await win.webContents.capturePage(sidebarRect);
    fs.writeFileSync(target, image.toPNG());
    console.log('Screenshot: ' + target);
  };
  await evaluate('document.body.classList.remove("compact-thumbs"); scheduleMarqueeMeasure();');
  await capture('sidebar-normal.png');
  await evaluate('document.body.classList.add("compact-thumbs"); scheduleMarqueeMeasure();');
  await capture('sidebar-compact.png');

  console.log('PASS sidebar captions, marquee, compact mode, menu and themes');
  app.quit();
}).catch(error => {
  console.error(error && error.stack || error);
  app.exit(1);
});
