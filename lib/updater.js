'use strict';

const { autoUpdater } = require('electron-updater');
const { ipcMain, BrowserWindow, app, shell } = require('electron');

const RELEASES_URL = 'https://github.com/CyberGems/CyberViewer/releases/latest';

let autoCheckEnabled = true;
let initialized = false;
let beforeQuitInstall = null;

function isPortableBuild() {
  return !!(
    process.env.PORTABLE_EXECUTABLE_DIR ||
    process.env.PORTABLE_EXECUTABLE_FILE ||
    process.env.PORTABLE_EXECUTABLE_APP_FILENAME
  );
}

function canUseElectronUpdater() {
  return app.isPackaged && !isPortableBuild();
}

function broadcast(status) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('update:status', status);
    } catch (_) { /* ignore */ }
  }
}

/**
 * @param {object} settings - app settings slice
 * @param {{ beforeQuitInstall?: () => void }} [hooks]
 */
function initUpdater(settings, hooks = {}) {
  if (initialized) return;
  initialized = true;

  beforeQuitInstall = typeof hooks.beforeQuitInstall === 'function'
    ? hooks.beforeQuitInstall
    : null;

  // manualUpdateOnly=true ⇒ no silent startup check (user must ask)
  autoCheckEnabled = !(settings && settings.manualUpdateOnly);

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => {
    broadcast({ state: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    // Never auto-download — install is always user-requested.
    broadcast({ state: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    broadcast({
      state: 'not-available',
      version: (info && info.version) || app.getVersion()
    });
  });

  autoUpdater.on('download-progress', (p) => {
    broadcast({
      state: 'downloading',
      percent: Math.round(p.percent || 0),
      transferred: p.transferred,
      total: p.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcast({ state: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    broadcast({ state: 'error', message: String((err && err.message) || err) });
  });

  registerUpdateIpc();

  if (autoCheckEnabled && canUseElectronUpdater()) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => { /* offline: ignore */ });
    }, 8000);
  }
}

function setAutoCheckEnabled(enabled) {
  autoCheckEnabled = !!enabled;
}

function registerUpdateIpc() {
  ipcMain.handle('update:get-info', () => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
    portable: isPortableBuild(),
    canUpdate: canUseElectronUpdater(),
    releasesUrl: RELEASES_URL
  }));

  ipcMain.handle('update:check', async () => {
    if (!canUseElectronUpdater()) {
      // Dev / portable: open releases page as fallback after reporting
      return {
        ok: false,
        portable: isPortableBuild(),
        packaged: app.isPackaged,
        error: isPortableBuild()
          ? 'PORTABLE_NO_AUTO_UPDATE'
          : 'DEV_NO_AUTO_UPDATE',
        releasesUrl: RELEASES_URL,
        version: app.getVersion()
      };
    }

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Update check timed out')), 20000);
      });
      const result = await Promise.race([
        autoUpdater.checkForUpdates(),
        timeoutPromise
      ]);
      return {
        ok: true,
        version: result && result.updateInfo && result.updateInfo.version
      };
    } catch (err) {
      console.error('[Updater] Check failed:', err);
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('update:download', async () => {
    if (!canUseElectronUpdater()) {
      return { ok: false, error: 'UPDATE_NOT_SUPPORTED' };
    }
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('update:install', () => {
    if (!canUseElectronUpdater()) {
      return { ok: false, error: 'UPDATE_NOT_SUPPORTED' };
    }
    try {
      if (beforeQuitInstall) beforeQuitInstall();
    } catch (_) { /* ignore */ }
    // Show NSIS UI; force relaunch after install
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 0);
    return { ok: true };
  });

  ipcMain.handle('update:open-releases', async () => {
    await shell.openExternal(RELEASES_URL);
    return { ok: true };
  });
}

module.exports = {
  initUpdater,
  setAutoCheckEnabled,
  canUseElectronUpdater,
  isPortableBuild,
  RELEASES_URL
};
