'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const { EventEmitter } = require('node:events');

/**
 * Load lib/updater.js with a stubbed electron / electron-updater surface.
 * Keeps process.env mutations for the duration of the returned helpers.
 */
function loadUpdaterWithStubs(env = {}) {
  const savedEnv = { ...process.env };
  // Clear portable markers then apply test env
  delete process.env.PORTABLE_EXECUTABLE_DIR;
  delete process.env.PORTABLE_EXECUTABLE_FILE;
  delete process.env.PORTABLE_EXECUTABLE_APP_FILENAME;
  Object.assign(process.env, env);

  const listeners = {};
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false });
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: null,
    on(ev, fn) {
      listeners[ev] = fn;
      return autoUpdater;
    },
    httpExecutor: {
      createRequest() {
        const request = new EventEmitter();
        request.abort = () => request.emit('abort');
        return request;
      }
    },
    checkForUpdates: async () => ({ isUpdateAvailable: false }),
    downloadUpdate: async () => {},
    quitAndInstall() {}
  };

  const ipcHandlers = {};
  const electronStub = {
    ipcMain: {
      handle(channel, fn) {
        ipcHandlers[channel] = fn;
      }
    },
    BrowserWindow: {
      getAllWindows: () => []
    },
    app: {
      isPackaged: env.PACKAGED === '1',
      getVersion: () => '1.0.0'
    },
    shell: {
      openExternal: async () => {}
    }
  };

  const electronUpdaterStub = { autoUpdater };

  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electronStub;
    if (request === 'electron-updater') return electronUpdaterStub;
    return origLoad.call(this, request, parent, isMain);
  };

  const updaterPath = require.resolve('../lib/updater');
  delete require.cache[updaterPath];

  let mod;
  try {
    mod = require('../lib/updater');
  } finally {
    Module._load = origLoad;
  }

  function restore() {
    globalThis.fetch = fetchBefore;
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
    delete require.cache[updaterPath];
  }

  return { mod, autoUpdater, ipcHandlers, electronStub, listeners, restore };
}

describe('updater helpers', () => {
  it('detects portable via env', () => {
    const { mod, restore } = loadUpdaterWithStubs({
      PORTABLE_EXECUTABLE_DIR: 'C:\\portable'
    });
    try {
      assert.equal(mod.isPortableBuild(), true);
      assert.equal(mod.canUseElectronUpdater(), false);
    } finally {
      restore();
    }
  });

  it('disables updater when not packaged', () => {
    const { mod, restore } = loadUpdaterWithStubs({ PACKAGED: '0' });
    try {
      assert.equal(mod.isPortableBuild(), false);
      assert.equal(mod.canUseElectronUpdater(), false);
    } finally {
      restore();
    }
  });

  it('init sets autoDownload false', () => {
    const { mod, autoUpdater, ipcHandlers, restore } = loadUpdaterWithStubs({
      PACKAGED: '1'
    });
    try {
      mod.initUpdater({ checkUpdatesOnStartup: false });
      assert.equal(autoUpdater.autoDownload, false);
      assert.equal(autoUpdater.autoInstallOnAppQuit, false);
      assert.equal(typeof ipcHandlers['update:check'], 'function');
      assert.equal(typeof ipcHandlers['update:download'], 'function');
      assert.equal(typeof ipcHandlers['update:install'], 'function');
      assert.equal(typeof ipcHandlers['update:get-status'], 'function');
    } finally {
      restore();
    }
  });

  function provideRelease(updater, updateInfo) {
    updater.checkForUpdates = async () => ({ isUpdateAvailable: true, updateInfo });
  }

  it('normalizes release notes and returns availability without downloading', async () => {
    const { mod, autoUpdater, ipcHandlers, restore } = loadUpdaterWithStubs({ PACKAGED: '1' });
    try {
      mod.initUpdater({ checkUpdatesOnStartup: false });
      const body = '<h2>Highlights</h2><ul><li>Faster startup</li></ul>';
      provideRelease(autoUpdater, { version: '1.2.3', releaseNotes: body });
      let downloads = 0;
      autoUpdater.downloadUpdate = async () => { downloads++; };

      assert.deepEqual(await ipcHandlers['update:check'](), { ok: true, available: true, version: '1.2.3' });
      const status = ipcHandlers['update:get-status']();
      assert.equal(status.state, 'available');
      assert.equal(status.version, '1.2.3');
      assert.equal(status.releaseUrl, mod.githubReleaseUrl('1.2.3'));
      assert.equal(status.releaseBody, body);
      assert.equal(status.releaseNotes, '### Highlights\n- Faster startup');
      assert.equal(downloads, 0);
    } finally {
      restore();
    }
  });

  it('keeps the matching raw Atom notes through download and readiness', async () => {
    const { mod, autoUpdater, ipcHandlers, restore } = loadUpdaterWithStubs({ PACKAGED: '1' });
    try {
      mod.initUpdater({ checkUpdatesOnStartup: false });
      const body = '<h3>Novedades</h3><p>Notas listas para instalar</p>';
      provideRelease(autoUpdater, {
        version: '2.0.0',
        releaseNotes: [
          { version: '1.0.0', note: 'old' },
          { version: '2.0.0', note: body }
        ]
      });
      await ipcHandlers['update:check']();
      autoUpdater.downloadUpdate = async () => {
        const status = mod.getLastUpdateStatus();
        assert.equal(status.state, 'downloading');
        assert.equal(status.releaseBody, body);
        assert.deepEqual(await ipcHandlers['update:check'](), { ok: true, available: true, version: '2.0.0' });
      };

      assert.equal((await ipcHandlers['update:download'](null, '2.0.0')).ok, true);
      const status = mod.getLastUpdateStatus();
      assert.equal(status.state, 'downloaded');
      assert.equal(status.releaseNotes, '### Novedades\nNotas listas para instalar');
      assert.equal(status.releaseBody, body);
    } finally {
      restore();
    }
  });

  it('uses the release name until GitHub returns the full notes', async () => {
    const { mod, autoUpdater, ipcHandlers, restore } = loadUpdaterWithStubs({ PACKAGED: '1' });
    try {
      let resolveNotes;
      globalThis.fetch = () => new Promise(resolve => { resolveNotes = resolve; });
      mod.initUpdater({ checkUpdatesOnStartup: false });
      provideRelease(autoUpdater, { version: '1.2.3', releaseName: 'CyberViewer v1.2.3' });
      await ipcHandlers['update:check']();

      const status = mod.getLastUpdateStatus();
      assert.equal(status.releaseNotes, 'CyberViewer v1.2.3');
      assert.equal('releaseBody' in status, false);
      assert.equal(status.notesLoading, true);

      await ipcHandlers['update:download'](null, '1.2.3');
      const body = '- English note\n<details><summary>Español</summary>- Nota en español</details>';
      resolveNotes({ ok: true, json: async () => ({ body }) });
      await Promise.resolve();
      await Promise.resolve();
      const ready = mod.getLastUpdateStatus();
      assert.equal(ready.state, 'downloaded');
      assert.equal(ready.releaseBody, body);
      assert.equal(ready.notesLoading, false);
    } finally {
      restore();
    }
  });

  it('installs only the downloaded version, silently and with relaunch', async () => {
    const { mod, autoUpdater, ipcHandlers, restore } = loadUpdaterWithStubs({ PACKAGED: '1' });
    try {
      mod.initUpdater({ checkUpdatesOnStartup: false });
      const calls = [];
      autoUpdater.quitAndInstall = (...args) => { calls.push(args); };
      provideRelease(autoUpdater, { version: '2.0.0' });
      await ipcHandlers['update:check']();
      assert.equal(ipcHandlers['update:install'](null, '2.0.0').ok, false);
      assert.equal((await ipcHandlers['update:download'](null, '3.0.0')).ok, false);
      await ipcHandlers['update:download'](null, '2.0.0');
      assert.equal(ipcHandlers['update:install'](null, '3.0.0').ok, false);
      assert.equal(ipcHandlers['update:install'](null, '2.0.0').ok, true);
      assert.equal(ipcHandlers['update:install'](null, '2.0.0').ok, false);
      assert.deepEqual(calls, [[true, true]]);
    } finally {
      restore();
    }
  });

  it('throttles progress and aborts the request while keeping the release available for retry', async () => {
    const { mod, autoUpdater, ipcHandlers, listeners, restore } = loadUpdaterWithStubs({ PACKAGED: '1' });
    try {
      mod.initUpdater({ checkUpdatesOnStartup: false });
      provideRelease(autoUpdater, { version: '2.0.0', releaseNotes: 'Release note' });
      await ipcHandlers['update:check']();
      let aborted = false;
      autoUpdater.downloadUpdate = token => {
        return token.createPromise(() => {
          const request = autoUpdater.httpExecutor.createRequest({}, () => {});
          request.on('abort', () => { aborted = true; });
        });
      };

      const download = ipcHandlers['update:download'](null, '2.0.0');
      await Promise.resolve();
      listeners['download-progress']({ percent: 12.4, transferred: 10, total: 100 });
      listeners['download-progress']({ percent: 12.2, transferred: 11, total: 100 });
      assert.equal(mod.getLastUpdateStatus().percent, 12);
      assert.equal(mod.getLastUpdateStatus().transferred, 10, 'same-percent ticks are coalesced');

      listeners['download-progress']({ percent: 13.0, transferred: 12, total: 100 });
      assert.equal(mod.getLastUpdateStatus().transferred, 12, 'a new percent always broadcasts');
      await new Promise(resolve => setTimeout(resolve, 520));
      listeners['download-progress']({ percent: 13.2, transferred: 20, total: 100 });
      assert.equal(mod.getLastUpdateStatus().transferred, 20, 'the keepalive passes after 500ms');

      assert.equal(ipcHandlers['update:cancel-download'](null, '3.0.0').ok, false);
      assert.equal(ipcHandlers['update:cancel-download'](null, '2.0.0').ok, true);
      await download;
      assert.equal(aborted, true);
      assert.equal(mod.getLastUpdateStatus().state, 'available');
      assert.equal(mod.getLastUpdateStatus().releaseBody, 'Release note');
      assert.equal(mod.getLastUpdateStatus().downloadFailed, false);

      autoUpdater.downloadUpdate = async () => {};
      assert.equal((await ipcHandlers['update:download'](null, '2.0.0')).ok, true);
      assert.equal(mod.getLastUpdateStatus().state, 'downloaded');
    } finally {
      restore();
    }
  });

  it('reports the direct portable asset and keeps native installation unavailable', async () => {
    const { mod, autoUpdater, ipcHandlers, restore } = loadUpdaterWithStubs({
      PACKAGED: '1', PORTABLE_EXECUTABLE_DIR: 'C:\\portable'
    });
    try {
      mod.initUpdater({ checkUpdatesOnStartup: false });
      provideRelease(autoUpdater, { version: '2.0.0' });
      assert.equal((await ipcHandlers['update:check']()).available, true);
      assert.equal(mod.getLastUpdateStatus().portableUrl,
        'https://github.com/CyberGems/CyberViewer/releases/download/v2.0.0/CyberViewer-Portable-2.0.0.exe');
      assert.equal((await ipcHandlers['update:download'](null, '2.0.0')).ok, false);
      assert.equal(ipcHandlers['update:install'](null, '2.0.0').ok, false);
    } finally {
      restore();
    }
  });

  it('exports releases URL', () => {
    const { mod, restore } = loadUpdaterWithStubs();
    try {
      assert.match(mod.RELEASES_URL, /github\.com\/CyberGems\/CyberViewer/);
    } finally {
      restore();
    }
  });
});
