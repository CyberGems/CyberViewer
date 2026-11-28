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
  // A short silent MP3, so the sidebar also holds a card from the playable
  // branch (audio and video return their own menu before the shared thumb one).
  // Valid MPEG-1 Layer III frames keep the metadata reader and the decoder
  // happy; only the card and its menu are exercised here.
  const silentFrame = Buffer.alloc(417);
  silentFrame.set([0xff, 0xfb, 0x90, 0x00]);
  fs.writeFileSync(path.join(dataDir, 'Track.mp3'), Buffer.concat(Array(60).fill(silentFrame)));
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
  await evaluate('scheduleMarqueeMeasure(); await new Promise(resolve => requestAnimationFrame(resolve));');
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
        overflow: strip && text ? text.scrollWidth - text.clientWidth : 0,
        textWidth: text ? text.clientWidth : 0,
        distance: text ? text.style.getPropertyValue('--marquee-distance') : '',
        duration: text ? text.style.getPropertyValue('--marquee-duration') : '',
        stripWidth: strip ? strip.clientWidth : 0
      };
    });
  `);
  console.log('captions: ' + JSON.stringify(captions, null, 2));
  assert.equal(captions.length, 4, 'three images plus one audio card rendered');
  assert.ok(captions.some(c => c.name === 'Track'), 'the audio card is among them');

  const long = captions.find(c => c.name.startsWith('A rather long'));
  const short = captions.find(c => c.name === 'Short');
  const audio = captions.find(c => c.name === 'Track');
  assert.ok(long, 'long caption card present');
  assert.ok(short, 'short caption card present');
  assert.ok(long.stripWidth > 0, 'caption strip has a measurable width');
  assert.equal(long.marquee, true, 'an overflowing name is marked to scroll');
  assert.match(long.distance, /^-\d+px$/, 'scroll distance is set in pixels');
  assert.match(long.duration, /^\d+(?:\.\d+)?s$/, 'scroll duration is set');
  assert.ok(parseInt(long.distance, 10) < 0, 'distance moves the text leftwards');
  assert.equal(short.marquee, false, 'a name that fits does not scroll');
  assert.equal(short.distance, '', 'a name that fits has no scroll distance');
  assert.equal(audio.marquee, false, 'the short audio caption does not scroll');
  assert.equal(audio.distance, '', 'the short audio caption has no scroll distance');
  assert.ok(captions.filter(c => c.marquee).every(c => c.overflow > 0),
    'only overflowing captions are marked to scroll');
  assert.ok(captions.filter(c => !c.marquee).every(c => c.overflow === 0),
    'captions that fit have no overflow');

  // At rest the caption must not move: the overflow is recorded, but no
  // animation runs until the pointer is over the card.
  const resting = await evaluate(`
    const item = document.querySelector('#sidebar .thumb-item');
    const text = item.querySelector('.thumb-name-text');
    const read = () => new DOMMatrixReadOnly(getComputedStyle(text).transform).m41;
    const first = read();
    await new Promise(r => setTimeout(r, 900));
    return { first, second: read(), animation: getComputedStyle(text).animationName,
             hovering: item.matches(':hover') };
  `);
  console.log('resting: ' + JSON.stringify(resting));
  assert.equal(resting.hovering, false, 'no pointer on the card at rest');
  assert.equal(resting.animation, 'none', 'a resting caption runs no animation');
  assert.equal(resting.first, resting.second, 'a resting caption does not move');

  await waitFor(() => evaluate('return !restorePointerPending || !!restorePointerAnchor;'),
    'restore pointer guard settled');
  await evaluate(`if (restorePointerPending && restorePointerAnchor) {
    updateRestorePointerGuard({ screenX: restorePointerAnchor.screenX + 3, screenY: restorePointerAnchor.screenY });
  }`);
  await waitFor(() => evaluate('return Date.now() >= ttRestoreSuppressUntil;'), 'restore tooltip suppression elapsed');

  // On hover the animation starts and advances. :hover only reacts to real
  // input, so this moves the OS cursor through the webContents.
  const cardPoint = await evaluate(`
    const item = document.querySelector('#sidebar .thumb-item');
    const rect = item.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + 12),
             width: rect.width, height: rect.height };
  `);
  assert.ok(cardPoint.width > 50 && cardPoint.height > 50, 'card has a hit area: ' + JSON.stringify(cardPoint));
  win.webContents.sendInputEvent({ type: 'mouseMove', x: cardPoint.x, y: cardPoint.y });
  win.webContents.sendInputEvent({ type: 'mouseMove', x: cardPoint.x + 4, y: cardPoint.y + 4 });
  await delay(120);
  const hover = await evaluate(`
    const item = document.querySelector('#sidebar .thumb-item');
    const text = item.querySelector('.thumb-name-text');
    const read = () => new DOMMatrixReadOnly(getComputedStyle(text).transform).m41;
    // The keyframes hold at 0 for the first 12% of the cycle (1.2s of the 10s
    // scroll), so the samples are taken once the movement has begun.
    await new Promise(r => setTimeout(r, 2400));
    const first = read();
    await new Promise(r => setTimeout(r, 1000));
    return { hovering: item.matches(':hover'), animation: getComputedStyle(text).animationName,
             state: getComputedStyle(text).animationPlayState, first, second: read(),
             tooltipText: $('titlebar-tooltip')?.querySelector('.tt-label')?.textContent,
             tooltipVisible: !!$('titlebar-tooltip') && !$('titlebar-tooltip').hidden };
  `);
  console.log('hover: ' + JSON.stringify(hover));
  assert.equal(hover.hovering, true, 'the cursor is over the card');
  assert.equal(hover.tooltipVisible, true, 'hovering a sidebar card opens its shared tooltip');
  assert.equal(hover.tooltipText, path.join(dataDir, names[0]), 'the card tooltip contains the complete file path');
  assert.equal(hover.animation, 'thumb-marquee', 'hovering starts the marquee');
  assert.equal(hover.state, 'running', 'the hovered marquee is running, not paused');
  assert.ok(hover.first < 0, 'the hovered caption has begun to shift: ' + hover.first);
  assert.ok(hover.second < hover.first, 'the hovered caption keeps moving: ' + hover.second);
  // Move away so the next checks see the resting state.
  win.webContents.sendInputEvent({ type: 'mouseMove', x: cardPoint.x, y: 700 });
  await delay(200);
  const afterLeave = await evaluate(`
    const text = document.querySelector('#sidebar .thumb-item .thumb-name-text');
    return { animation: getComputedStyle(text).animationName,
             transform: getComputedStyle(text).transform };
  `);
  console.log('after leave: ' + JSON.stringify(afterLeave));
  assert.equal(afterLeave.animation, 'none', 'leaving the card stops the marquee');
  assert.ok(afterLeave.transform === 'none' || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(afterLeave.transform),
    'the caption returns to its resting position: ' + afterLeave.transform);

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
    $('cfg-sidebar').checked = true;
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
  await waitFor(() => evaluate("return document.querySelector('#sidebar .thumb-item').offsetHeight === 56;"),
    'compact card height settled');
  toggled.height = await evaluate("return document.querySelector('#sidebar .thumb-item').offsetHeight;");
  assert.equal(toggled.compact, true, 'the switch applies compact mode');
  assert.equal(toggled.saved, true, 'the setting is persisted in state');
  assert.equal(toggled.height, 56, 'compact cards use their fixed 56px height: ' + toggled.height);
  assert.equal(toggled.nameDisplay, 'none', 'captions are hidden in compact mode');
  assert.equal(toggled.marquee, false, 'hidden captions are not left scrolling');
  assert.equal(toggled.imgHeight, 54, 'the preview fills the compact card inside its border');

  // A real cursor over a compact card must reveal its caption, and the card
  // must stay 56px so the row height does not jump while hovering.
  await evaluate('closeModal("modal-config");');
  await delay(200);
  const compactPoint = await evaluate(`
    const item = document.querySelector('#sidebar .thumb-item');
    const rect = item.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  `);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: compactPoint.x, y: compactPoint.y });
  win.webContents.sendInputEvent({ type: 'mouseMove', x: compactPoint.x + 1, y: compactPoint.y + 1 });
  // The card, the revealed strip and the index all animate for 200ms, so wait
  // for the index to actually land instead of guessing a delay.
  await waitFor(() => evaluate(`
    const idx = document.querySelector('#sidebar .thumb-item .thumb-idx');
    return Math.abs(parseFloat(getComputedStyle(idx).bottom) - 23) < 1;
  `), 'index steps above the revealed caption');
  const revealed = await evaluate(`
    const item = document.querySelector('#sidebar .thumb-item');
    const strip = item.querySelector('.thumb-name');
    return { hovering: item.matches(':hover'),
             display: getComputedStyle(strip).display,
             text: strip.textContent,
             marquee: strip.classList.contains('is-marquee'),
             animation: getComputedStyle(strip.querySelector('.thumb-name-text')).animationName,
             distance: strip.querySelector('.thumb-name-text').style.getPropertyValue('--marquee-distance'),
             idxBottom: getComputedStyle(item.querySelector('.thumb-idx')).bottom,
             height: item.offsetHeight };
  `);
  console.log('compact hover: ' + JSON.stringify(revealed));
  assert.equal(revealed.hovering, true, 'the cursor is over the compact card');
  assert.equal(revealed.display, 'flex', 'hovering a compact card reveals its caption');
  assert.ok(revealed.text.length > 0, 'the revealed caption carries the file name');
  assert.equal(revealed.marquee, true, 'the revealed caption scrolls when it does not fit: ' + revealed.distance);
  assert.equal(revealed.animation, 'thumb-marquee', 'the revealed caption animates while hovered');
  assert.ok(Math.abs(parseFloat(revealed.idxBottom) - 23) < 1, 'the index steps above the revealed caption: ' + revealed.idxBottom);
  assert.equal(revealed.height, 56, 'revealing the caption does not resize the card');
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

  // ── The header filename must not react to the pointer ──
  const headerPoint = await evaluate(`
    const item = document.querySelector('#sidebar .thumb-item');
    const rect = item.getBoundingClientRect();
    item.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.top + 20
    }));
    await new Promise(r => setTimeout(r, 60));
    const sub = document.querySelector('#custom-ctx-menu .menu-header-sub');
    if (!sub) return null;
    const box = sub.getBoundingClientRect();
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2),
             color: getComputedStyle(sub).color, cursor: getComputedStyle(sub).cursor };
  `);
  assert.ok(headerPoint, 'the thumbnail menu header shows the file name');
  assert.equal(headerPoint.cursor, 'default', 'the header keeps the default cursor');
  win.webContents.sendInputEvent({ type: 'mouseMove', x: headerPoint.x, y: headerPoint.y });
  win.webContents.sendInputEvent({ type: 'mouseMove', x: headerPoint.x + 4, y: headerPoint.y + 4 });
  await delay(400);
  const headerHover = await evaluate(`
    const sub = document.querySelector('#custom-ctx-menu .menu-header-sub');
    const card = $('titlebar-tooltip');
    return { hovering: sub.matches(':hover'), color: getComputedStyle(sub).color,
             tooltipText: card?.querySelector('.tt-label')?.textContent,
             tooltipVisible: !!card && !card.hidden && card.classList.contains('is-visible') };
  `);
  console.log('header: ' + JSON.stringify({ ...headerPoint, ...headerHover }));
  assert.equal(headerHover.hovering, true, 'the cursor is over the header text');
  assert.equal(headerHover.tooltipVisible, true, 'hovering the context header opens the shared tooltip');
  assert.equal(headerHover.tooltipText, path.join(dataDir, names[0]), 'the header tooltip contains the complete file path');
  assert.equal(headerHover.color, headerPoint.color,
    'the header keeps its colour on hover, so it never reads as clickable');

  // ── Audio cards get the same toggle and a file-path label ──
  await evaluate('hideCustomContextMenu();');
  const audioCard = await evaluate(`
    const card = [...document.querySelectorAll('#sidebar .thumb-item')]
      .find(item => (item.querySelector('.thumb-name')?.textContent || '') === 'Track');
    if (!card) return null;
    const rect = card.getBoundingClientRect();
    card.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.top + 20
    }));
    await new Promise(r => setTimeout(r, 80));
    const buttons = [...document.querySelectorAll('#custom-ctx-menu .menu-item')];
    const labels = buttons.map(b => (b.textContent || '').trim()).filter(Boolean);
    return { labels,
             compact: labels.some(l => l.includes('Compact cards')),
             hasFileLabel: labels.some(l => l.includes('Copy File Path')),
             hasImageLabel: labels.some(l => l.includes('Copy Image Path')) };
  `);
  console.log('audio menu: ' + JSON.stringify(audioCard));
  assert.ok(audioCard, 'the audio card is in the sidebar');
  assert.equal(audioCard.compact, true, 'an audio card menu lists the compact toggle');
  assert.equal(audioCard.hasFileLabel, true, 'the audio card copies a file path');
  assert.equal(audioCard.hasImageLabel, false, 'the audio card no longer mentions an image path');
  await evaluate('hideCustomContextMenu();');

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

    const headerTip = await evaluate(`
      const item = document.querySelector('#sidebar .thumb-item');
      const rect = item.getBoundingClientRect();
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
        clientX: rect.left + 20, clientY: rect.top + 20 }));
      await new Promise(r => setTimeout(r, 80));
      const sub = document.querySelector('#custom-ctx-menu .menu-header-sub');
      ttShow(sub);
      await new Promise(r => setTimeout(r, 240));
      const card = $('titlebar-tooltip');
      const menuRect = $('custom-ctx-menu').getBoundingClientRect();
      const tipRect = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      const left = Math.max(0, Math.floor(Math.min(menuRect.left, tipRect.left)) - 8);
      const top = Math.max(0, Math.floor(Math.min(menuRect.top, tipRect.top)) - 8);
      const right = Math.min(window.innerWidth, Math.ceil(Math.max(menuRect.right, tipRect.right)) + 8);
      const bottom = Math.min(window.innerHeight, Math.ceil(Math.max(menuRect.bottom, tipRect.bottom)) + 8);
      return { text: card.querySelector('.tt-label').textContent,
        hidden: card.hidden, className: card.className, opacity: style.opacity,
        anchored: ttAnchor === sub, restorePending: restorePointerPending,
        visible: !card.hidden && card.classList.contains('is-visible') && parseFloat(style.opacity) > 0.95,
        color: style.color, background: style.backgroundColor,
        inside: tipRect.left >= 0 && tipRect.top >= 0 && tipRect.right <= window.innerWidth && tipRect.bottom <= window.innerHeight,
        shot: { x: left, y: top, width: right - left, height: bottom - top } };
    `);
    console.log('header tooltip ' + theme + ': ' + JSON.stringify(headerTip));
    assert.equal(headerTip.visible, true, theme + ' header tooltip is painted');
    assert.equal(headerTip.text, path.join(dataDir, names[0]), theme + ' header tooltip keeps the full path');
    assert.equal(headerTip.inside, true, theme + ' header tooltip stays inside the window');
    assert.ok(headerTip.color && headerTip.background, theme + ' header tooltip uses themed colors');
    fs.writeFileSync(path.join(dataDir, `header-tooltip-${theme}.png`),
      (await win.webContents.capturePage(headerTip.shot)).toPNG());
    await evaluate('hideCustomContextMenu();');
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

  // A capture of the audio card menu itself, so the label, the size toggle and
  // the header styling can be checked by eye, not only through assertions.
  const menuShot = await evaluate(`
    const card = [...document.querySelectorAll('#sidebar .thumb-item')]
      .find(item => (item.querySelector('.thumb-name')?.textContent || '') === 'Track');
    const rect = card.getBoundingClientRect();
    card.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.top + 20
    }));
    await new Promise(r => setTimeout(r, 120));
    const menu = document.getElementById('custom-ctx-menu').getBoundingClientRect();
    return { x: Math.round(menu.left), y: Math.round(menu.top),
             width: Math.round(menu.width), height: Math.round(menu.height) };
  `);
  await delay(200);
  fs.writeFileSync(path.join(dataDir, 'audio-card-menu.png'),
    (await win.webContents.capturePage(menuShot)).toPNG());
  console.log('Screenshot: ' + path.join(dataDir, 'audio-card-menu.png'));
  await evaluate('hideCustomContextMenu();');

  console.log('PASS sidebar captions, marquee, compact mode, menu and themes');
  app.quit();
}).catch(error => {
  console.error(error && error.stack || error);
  app.exit(1);
});
