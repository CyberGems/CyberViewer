'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parse, isYouTube } = require('../js/youtube-source');
const { TabModel } = require('../js/tab-model');
const { sanitizeSession } = require('../lib/session-store');
const formats = require('../js/media-types');

describe('YouTube sources and workspace identity', () => {
  it('accepts supported links, canonicalizes tracking and retains start/index', () => {
    for (const url of ['https://youtu.be/M7lc1UVf-VE', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', 'youtube.com/shorts/M7lc1UVf-VE', 'https://www.youtube.com/live/M7lc1UVf-VE']) {
      assert.equal(parse(url).url, 'https://www.youtube.com/watch?v=M7lc1UVf-VE');
    }
    const source = parse('https://www.youtube.com/watch?v=M7lc1UVf-VE&list=PLC77007E23FF423C6&index=3&t=1h2m3s&si=tracking');
    assert.equal(source.index, 2); assert.equal(source.startSeconds, 3723);
    assert.equal(source.url, 'https://www.youtube.com/watch?v=M7lc1UVf-VE&list=PLC77007E23FF423C6');
    assert.equal(parse('https://www.youtube.com/playlist?list=PLC77007E23FF423C6').videoId, null);
  });
  it('rejects arbitrary origins, credentials, protocols and invalid IDs', () => {
    for (const value of ['https://youtube.com.evil.test/watch?v=M7lc1UVf-VE', 'https://evil.test/youtube.com/watch?v=M7lc1UVf-VE', 'file:///C:/private.txt', 'javascript:alert(1)', 'https://youtube.com@evil.test/watch?v=M7lc1UVf-VE', 'https://user@youtube.com/watch?v=M7lc1UVf-VE', 'https://youtube.com:8443/watch?v=M7lc1UVf-VE', 'https://youtube.com/watch?v=bad', 'https://youtube.com/playlist?list=<script>', 'https://youtube.com/', 'https://youtube.com/watch?v=M7lc1UVf-VE\nmalicious']) assert.equal(parse(value), null, value);
  });
  it('deduplicates equivalent links and keeps case-sensitive video IDs distinct', () => {
    const model = new TabModel();
    for (const value of ['https://youtu.be/M7lc1UVf-VE', 'https://www.youtube.com/watch?v=M7lc1UVf-VE&si=1', 'https://www.youtube.com/watch?v=m7lc1uvf-ve']) model.open({ file: { path: value, name: 'YouTube' } });
    assert.equal(model.tabs.length, 2);
    assert.equal(formats.isVideo(model.active.image), true);
    assert.equal(formats.isSupportedFile(model.active.image.file), true);
  });
  it('round-trips only validated YouTube sources with playback and playlist position', () => {
    const model = new TabModel();
    model.open({ file: { path: 'https://youtu.be/M7lc1UVf-VE', name: 'Example' } }, { view: { videoTime: 24, youtubeIndex: 3, youtubeVideoId: 'M7lc1UVf-VE' } });
    const restored = sanitizeSession(model.snapshot());
    assert.equal(restored.tabs[0].path, 'https://www.youtube.com/watch?v=M7lc1UVf-VE');
    assert.equal(restored.tabs[0].view.videoTime, 24);
    assert.equal(restored.tabs[0].view.youtubeIndex, 3);
    assert.equal(restored.tabs[0].view.youtubeVideoId, 'M7lc1UVf-VE');
    assert.equal(restored.tabs[0].source, 'youtube');
    assert.equal(isYouTube({ file: { path: restored.tabs[0].path } }), true);
    restored.tabs[0].path = 'https://arbitrary.test/video.mp4';
    assert.throws(() => sanitizeSession(restored), /INVALID_SESSION_TAB/);
  });
});
