'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMediaResponse } = require('../lib/media-protocol');
const { createPathAllowlist, toMediaUrl } = require('../lib/paths');

const root = path.join(__dirname, '..');
const videoJs = fs.readFileSync(path.join(root, 'js', 'video-player.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const workspaceJs = fs.readFileSync(path.join(root, 'js', 'workspace.js'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

describe('video open performance pipeline', () => {
  it('records open timing milestones and exposes CVVideo.openTiming', () => {
    assert.match(videoJs, /performance\.measure\('cv-media-open'/);
    assert.match(videoJs, /console\.debug\('\[media-open\]'/);
    assert.match(videoJs, /openTiming:\s*\(\)\s*=>/);
  });

  it('defers audio track probing until after frame 0 is ready', () => {
    const readyStart = videoJs.indexOf('const ready = () =>');
    const loadTailStart = videoJs.indexOf('element.src = url;', readyStart);
    const probePos = videoJs.indexOf('getVideoAudioCodec(probePath)');
    const onReadyPos = videoJs.indexOf('onReady();', readyStart);
    assert.ok(readyStart >= 0 && loadTailStart > readyStart && onReadyPos > readyStart);
    assert.ok(probePos > onReadyPos && probePos < loadTailStart,
      'getVideoAudioCodec should run after onReady() instead of competing with initial video decode');
  });

  it('keeps the seek preview decoder unloaded until pointer hover', () => {
    const metaStart = videoJs.indexOf("element.addEventListener('loadedmetadata', () => {");
    const metaEnd = videoJs.indexOf('});', metaStart);
    assert.ok(metaStart >= 0 && metaEnd > metaStart);
    const metaBody = videoJs.slice(metaStart, metaEnd);
    assert.match(metaBody, /\$\('video-preview'\)\.removeAttribute\('src'\)/);
    assert.doesNotMatch(metaBody, /\$\('video-preview'\)\.src\s*=/);
    assert.match(videoJs, /const assigned = previewVideo\.src !== element\.currentSrc;/);
  });

  it('waits for mainImageReady before decoding video thumbnails and refreshes video siblings after merge', () => {
    const loadThumbStart = appJs.indexOf('async function loadThumb');
    const loadThumbEnd = appJs.indexOf('const work = (async () =>', loadThumbStart);
    const loadThumbBody = appJs.slice(loadThumbStart, loadThumbEnd);
    const earlyCachedPos = loadThumbBody.indexOf('if (im.thumbUrl)');
    const mainReadyAwaitPos = loadThumbBody.indexOf('await state.mainImageReady');
    assert.ok(earlyCachedPos >= 0 && mainReadyAwaitPos > earlyCachedPos);
    assert.match(loadThumbBody, /window\.CVFormats\.isVideo\(im\)\s*\|\|\s*mainIsVideo/);

    const mergeStart = appJs.indexOf('function mergeNeighbors');
    const mergeEnd = appJs.indexOf('function getRecentFiles', mergeStart);
    const mergeBody = appJs.slice(mergeStart, mergeEnd);
    assert.match(mergeBody, /schedulePriorityThumb\(targetIdx\);\s*\r?\n\s*if \(window\.CVVideo && window\.CVVideo\.active\(\)\) window\.CVVideo\.sync\(\);/);
  });

  it('defers folder scan during video open, avoids rebuilding sidebar twice, and skips stale session tab on launch-with-file', () => {
    const scanStart = workspaceJs.indexOf('async function scan');
    const scanEnd = workspaceJs.indexOf('function restoreSidebar', scanStart);
    const scanBody = workspaceJs.slice(scanStart, scanEnd);
    assert.ok(scanBody.indexOf('await state.mainImageReady') > 0);
    assert.ok(scanBody.indexOf('await state.mainImageReady') < scanBody.indexOf('scanFolder(filePath)'));
    assert.match(scanBody, /restoreSidebar\(tab,\s*\{\s*alreadyBuilt:\s*true\s*\}\)/);

    const restoreSidebarStart = workspaceJs.indexOf('function restoreSidebar');
    const restoreSidebarEnd = workspaceJs.indexOf('async function activate', restoreSidebarStart);
    const restoreSidebarBody = workspaceJs.slice(restoreSidebarStart, restoreSidebarEnd);
    assert.match(restoreSidebarBody, /if \(!alreadyBuilt \|\| changedHidden\) buildSidebar\(\);/);

    const restoreStart = workspaceJs.indexOf('async function restore()');
    const restoreEnd = workspaceJs.indexOf('async function edit(', restoreStart);
    const restoreBody = workspaceJs.slice(restoreStart, restoreEnd);
    assert.match(restoreBody, /if \(result\.hasPendingOpen\)/);
  });

  it('defers thumb cache eviction at startup, reports pending open files, and serializes video thumb decoders', () => {
    const bootStart = mainJs.indexOf('app.whenReady().then(() =>');
    const bootEnd = mainJs.indexOf('createWindow();', bootStart);
    const bootHead = mainJs.slice(bootStart, bootEnd);
    assert.match(bootHead, /scheduleThumbCacheEviction\(\)/);
    assert.doesNotMatch(bootHead, /evictThumbCache\(/);

    assert.match(mainJs, /const hasPendingOpen = pendingOpenPaths\.length > 0;/);
    assert.match(mainJs, /const videoThumbSlots = createSlotQueue\(1\);/);
    assert.match(mainJs, /const slotQueue = isVideo \? videoThumbSlots : thumbSlots;/);
  });

  it('serves multi-chunk ranges accurately with larger read stream buffers', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-media-stream-'));
    try {
      const file = path.join(dir, 'sample.mp4');
      const data = Buffer.alloc(600 * 1024);
      for (let i = 0; i < data.length; i++) data[i] = i & 0xff;
      fs.writeFileSync(file, data);
      const allowlist = createPathAllowlist();
      allowlist.allowMediaFile(file);
      const res = await createMediaResponse({
        url: toMediaUrl(file),
        method: 'GET',
        headers: new Map([['range', 'bytes=100-524387']])
      }, allowlist);
      assert.equal(res.status, 206);
      assert.equal(res.headers.get('content-range'), `bytes 100-524387/${data.length}`);
      const received = Buffer.from(await res.arrayBuffer());
      assert.deepEqual(received, data.subarray(100, 524388));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
