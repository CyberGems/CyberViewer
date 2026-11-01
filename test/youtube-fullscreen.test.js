'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { setImmediate } = require('node:timers');
const { FULLSCREEN_CONTROLS, isPlayerFrame } = require('../lib/youtube-fullscreen');

function harness() {
  const listeners = [], calls = [];
  const document = {
    fullscreenElement: null,
    documentElement: { requestFullscreen: () => { calls.push('enter'); return Promise.resolve(); } },
    exitFullscreen: () => { calls.push('exit'); return Promise.resolve(); },
    querySelector: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 450 }) }),
    addEventListener: (type, listener, capture) => { assert.equal(type, 'dblclick'); assert.equal(capture, true); listeners.push(listener); }
  };
  const context = vm.createContext({ window: {}, document, console });
  vm.runInContext(FULLSCREEN_CONTROLS, context);
  const dispatch = (values = {}) => {
    const event = { button: 0, clientX: 400, clientY: 225, target: { closest: () => null },
      preventDefault: () => calls.push('prevent'), stopImmediatePropagation: () => calls.push('stop'), ...values };
    listeners.forEach(listener => listener(event));
  };
  return { document, calls, context, dispatch, listeners };
}

describe('YouTube fullscreen gestures', () => {
  it('toggles the actual embed document and consumes the gesture once', async () => {
    const h = harness();
    h.dispatch();
    assert.deepEqual(h.calls, ['prevent', 'stop', 'enter']);
    h.dispatch();
    assert.deepEqual(h.calls, ['prevent', 'stop', 'enter', 'prevent', 'stop'], 'An in-flight transition cannot stack another request');
    await new Promise(resolve => setImmediate(resolve));
    h.calls.length = 0;
    h.document.fullscreenElement = {};
    h.dispatch();
    assert.deepEqual(h.calls, ['prevent', 'stop', 'exit']);
    vm.runInContext(FULLSCREEN_CONTROLS, h.context);
    assert.equal(h.listeners.length, 1);
  });
  it('preserves buttons, links, sliders, modified clicks and areas outside the video', () => {
    const h = harness();
    h.dispatch({ target: { closest: () => ({}) } });
    for (const key of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey']) h.dispatch({ [key]: true });
    h.dispatch({ button: 2 });
    h.dispatch({ clientX: 900 });
    h.dispatch({ clientY: 500 });
    h.document.querySelector = () => null;
    h.dispatch();
    assert.deepEqual(h.calls, []);
  });
  it('installs only in direct official HTTPS embed frames', () => {
    const contents = { mainFrame: {} };
    const frame = url => ({ url, parent: contents.mainFrame });
    for (const host of ['www.youtube.com', 'www.youtube-nocookie.com']) assert.equal(isPlayerFrame(frame(`https://${host}/embed/example`), contents), true);
    for (const url of ['https://www.youtube.com/watch?v=example', 'https://www.youtube.com.evil.test/embed/example', 'http://www.youtube.com/embed/example', 'https://www.youtube.com:8443/embed/example', 'file:///embed/example']) assert.equal(isPlayerFrame(frame(url), contents), false);
    assert.equal(isPlayerFrame({ ...frame('https://www.youtube.com/embed/example'), parent: {} }, contents), false);
    assert.equal(isPlayerFrame(null, contents), false);
  });
});
