'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseByteRange, createMediaResponse } = require('../lib/media-protocol');
const { createPathAllowlist, toMediaUrl, isExistingMediaFile, isExistingImageFile } = require('../lib/paths');
const { isVideo, isAudio, isPlayable, isSupportedFile, formatTime } = require('../js/media-types');
const { TabModel, cleanView } = require('../js/tab-model');

describe('media byte ranges', () => {
  it('handles closed, open and suffix ranges with bounds checks', () => {
    assert.deepEqual(parseByteRange('bytes=3-6', 10), { start: 3, end: 6 });
    assert.deepEqual(parseByteRange('bytes=3-', 10), { start: 3, end: 9 });
    assert.deepEqual(parseByteRange('bytes=-4', 10), { start: 6, end: 9 });
    assert.deepEqual(parseByteRange('bytes=8-100', 10), { start: 8, end: 9 });
    assert.deepEqual(parseByteRange('bytes=-100', 10), { start: 0, end: 9 });
    assert.equal(parseByteRange(null, 10), null);
    for (const range of ['bytes=', 'bytes=-', 'bytes=-0', 'bytes=10-', 'bytes=7-2', 'bytes=0-1,3-5', 'other=1-2', 'bytes=9007199254740992-']) assert.equal(parseByteRange(range, 10), false);
    assert.equal(parseByteRange('bytes=0-', 0), false);
  });
  it('serves precise bytes, HEAD and 416 responses, and keeps the path allowlist', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-video-range-'));
    try {
      const file = path.join(dir, 'clip #ñ %.mp4');
      fs.writeFileSync(file, Buffer.from('0123456789'));
      const allowlist = createPathAllowlist();
      const request = (range, method = 'GET') => ({ url: toMediaUrl(file), method, headers: new Map([['range', range]]) });
      assert.equal((await createMediaResponse(request(), allowlist)).status, 403);
      assert.equal(isExistingImageFile(file), false);
      assert.equal(isExistingMediaFile(file), true);
      assert.equal(allowlist.allowMediaFile(file), file);
      let response = await createMediaResponse(request('bytes=3-6'), allowlist);
      assert.equal(response.status, 206);
      assert.equal(response.headers.get('content-range'), 'bytes 3-6/10');
      assert.equal(response.headers.get('content-length'), '4');
      assert.equal(response.headers.get('content-type'), 'video/mp4');
      assert.equal(await response.text(), '3456');
      response = await createMediaResponse(request('bytes=-3'), allowlist);
      assert.equal(await response.text(), '789');
      response = await createMediaResponse(request(null, 'HEAD'), allowlist);
      assert.equal(response.status, 200); assert.equal(await response.text(), '');
      response = await createMediaResponse(request('bytes=3-6', 'HEAD'), allowlist);
      assert.equal(response.status, 200); assert.equal(response.headers.get('content-length'), '10');
      response = await createMediaResponse(request('bytes=99-'), allowlist);
      assert.equal(response.status, 416); assert.equal(response.headers.get('content-range'), 'bytes */10');
      response = await createMediaResponse(request(), allowlist);
      assert.equal(await response.text(), '0123456789');
      assert.equal((await createMediaResponse(request(null, 'POST'), allowlist)).status, 405);
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'private');
      assert.equal(allowlist.allowMediaFile(path.join(dir, 'notes.txt')), null);
      assert.equal(allowlist.allowMediaFile(dir), null);
      fs.unlinkSync(file);
      assert.equal((await createMediaResponse(request(), allowlist)).status, 404);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('mixed media tabs', () => {
  it('classifies audio separately and serves seekable audio with the right MIME', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-audio-range-'));
    try {
      const allowlist = createPathAllowlist();
      for (const [name, mime] of [['song.MP3', 'audio/mpeg'], ['tone.wav', 'audio/wav']]) {
        const file = path.join(dir, name);
        fs.writeFileSync(file, '0123456789');
        assert.equal(isAudio({ file: { name, path: file } }), true);
        assert.equal(isVideo(file), false);
        assert.equal(isPlayable(file), true);
        assert.equal(isSupportedFile({ name, path: file }), true);
        assert.equal(allowlist.allowMediaFile(file), file);
        const response = await createMediaResponse({ method: 'GET', url: toMediaUrl(file), headers: new Map([['range', 'bytes=2-4']]) }, allowlist);
        assert.equal(response.status, 206);
        assert.equal(response.headers.get('content-type'), mime);
        assert.equal(await response.text(), '234');
      }
      assert.equal(isAudio('picture.png'), false);
      assert.equal(isSupportedFile({ name: 'secret.txt', type: 'audio/mpeg' }), false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('classifies supported videos without admitting arbitrary files', () => {
    for (const name of ['clip.MP4', 'clip.m4v', 'clip.webm', 'clip.mov', 'clip.mkv']) {
      assert.equal(isVideo({ file: { name } }), true);
      assert.equal(isSupportedFile({ name }), true);
    }
    assert.equal(isVideo('photo.avif'), false);
    assert.equal(isSupportedFile({ name: 'secret.txt', type: 'video/mp4' }), false);
    assert.equal(isSupportedFile({ name: 'photo.png' }), true);
  });
  it('rejects WMV, AVI and FLV in file selection and native path grants', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-unsupported-video-'));
    try {
      const allowlist = createPathAllowlist();
      for (const name of ['clip.wmv', 'clip.AVI', 'clip.flv']) {
        const file = path.join(dir, name);
        fs.writeFileSync(file, 'unsupported video fixture');
        assert.equal(isVideo({ file: { name, path: file } }), false, name);
        assert.equal(isSupportedFile({ name, type: 'video/mp4' }), false, name);
        assert.equal(isSupportedFile({ name, path: file }), false, name);
        assert.equal(isExistingMediaFile(file), false, name);
        assert.equal(allowlist.allowMediaFile(file), null, name);
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('round-trips playback time without retaining a decoder or invalid state', () => {
    const model = new TabModel();
    const tab = model.open({ file: { name: 'clip.mp4', path: 'C:/clip.mp4' } });
    tab.view.videoTime = 132.5;
    assert.equal(model.snapshot().tabs[0].view.videoTime, 132.5);
    assert.equal(cleanView({ videoTime: -1 }).videoTime, 0);
    assert.equal(cleanView({ videoTime: Infinity }).videoTime, 0);
    assert.equal(formatTime(3661), '1:01:01');
    assert.equal(formatTime(65.9), '1:05');
  });
});
