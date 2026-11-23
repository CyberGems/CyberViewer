'use strict';

const { autoUpdater } = require('electron-updater');
const { CancellationToken } = require('builder-util-runtime');
const { ipcMain, BrowserWindow, app, shell } = require('electron');

const REPO_URL = 'https://github.com/CyberGems/CyberViewer';
const RELEASES_URL = REPO_URL + '/releases/latest';
const NOTES_MAX_CHARS = 8000;

let autoCheckEnabled = true;
let initialized = false;
let lastStatus = { state: 'idle' };
let activeCheck = null;
let activeDownload = null;
let lastDownloadSentAt = 0;

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

function githubReleaseUrl(version) {
  const value = String(version || '');
  const tag = value.startsWith('v') ? value : `v${value}`;
  return `${REPO_URL}/releases/tag/${tag}`;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<h[1-6][^>]*>/gi, '### ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function rawReleaseBody(info) {
  const raw = info && info.releaseNotes;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.length > 0) {
    const match = raw.find((note) => note && note.version === info.version) || raw[0];
    return match && match.note ? match.note : '';
  }
  return '';
}

function extractReleaseNotes(info) {
  const text = rawReleaseBody(info) ||
    (info && info.releaseName && info.releaseName !== info.version ? info.releaseName : '');
  const cleaned = stripHtml(text);
  if (!cleaned) return undefined;
  return cleaned.length > NOTES_MAX_CHARS
    ? `${cleaned.slice(0, NOTES_MAX_CHARS).trimEnd()}…`
    : cleaned;
}

function broadcast(status) {
  lastStatus = status;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('update:status', status);
  }
}

function getLastUpdateStatus() {
  return lastStatus;
}

async function enrichReleaseNotes(version, tag) {
  try {
    const response = await fetch(
      'https://api.github.com/repos/CyberGems/CyberViewer/releases/tags/' + encodeURIComponent(tag),
      {
        signal: globalThis.AbortSignal.timeout(10000),
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CyberViewer' }
      }
    );
    const data = response.ok ? await response.json() : null;
    const body = typeof data?.body === 'string' ? data.body.trim() : '';
    if (lastStatus.version !== version || !lastStatus.notesLoading) return;
    broadcast({
      ...lastStatus,
      ...(body && {
        releaseBody: body,
        releaseNotes: extractReleaseNotes({ version, releaseNotes: body })
      }),
      notesLoading: false
    });
  } catch (error) {
    if (lastStatus.version === version && lastStatus.notesLoading) {
      broadcast({ ...lastStatus, notesLoading: false });
    }
    console.warn('[Updater] Could not retrieve release notes:', error);
  }
}

function checkForUpdates() {
  if (['downloading', 'downloaded', 'installing'].includes(lastStatus.state)) {
    return Promise.resolve({ ok: true, available: true, version: lastStatus.version });
  }
  if (activeCheck) return activeCheck;

  activeCheck = autoUpdater.checkForUpdates().then(result => {
    if (!result?.isUpdateAvailable) {
      broadcast({ state: 'not-available' });
      return { ok: true, available: false };
    }

    const info = result.updateInfo;
    const { version } = info;
    if (lastStatus.version !== version) {
      const body = rawReleaseBody(info).trim();
      const tag = version.startsWith('v') ? version : 'v' + version;
      const needsNotes = !/<details\b|<!--\s*lang:es\s*-->/i.test(body);
      broadcast({
        state: 'available',
        version,
        releaseUrl: githubReleaseUrl(version),
        ...(body && { releaseBody: body }),
        releaseNotes: extractReleaseNotes(info),
        notesLoading: needsNotes,
        ...(isPortableBuild() && {
          portableUrl: REPO_URL + '/releases/download/' + tag + '/CyberViewer-Portable-' + tag.slice(1) + '.exe'
        })
      });
      if (needsNotes) void enrichReleaseNotes(version, tag);
    }
    return { ok: true, available: true, version };
  }).catch(error => {
    console.warn('[Updater] Check failed:', error);
    return { ok: false, error: error.message };
  }).finally(() => { activeCheck = null; });
  return activeCheck;
}

function trackDownloadRequests() {
  const executor = autoUpdater.httpExecutor;
  const createRequest = executor.createRequest.bind(executor);
  executor.createRequest = (options, onResponse) => {
    const download = activeDownload;
    if (!download) return createRequest(options, onResponse);

    // The writable side can close before the body arrives. Cancelling the
    // updater's token can reject the promise without stopping the transfer.
    const request = createRequest(options, response => {
      response.once('end', forget);
      response.once('error', forget);
      onResponse(response);
    });
    function forget() { download.requests.delete(request); }
    download.requests.add(request);
    request.once('abort', forget);
    request.once('error', forget);
    if (download.token.cancelled) request.abort();
    return request;
  };
}

function initUpdater(settings) {
  if (initialized) return;
  initialized = true;
  setAutoCheckEnabled(settings?.checkUpdatesOnStartup !== false);
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null;
  trackDownloadRequests();

  autoUpdater.on('download-progress', ({ percent, transferred, total }) => {
    if (lastStatus.state !== 'downloading' || lastStatus.cancelling) return;
    const rounded = Math.round(percent || 0);
    const now = Date.now();
    if (rounded === lastStatus.percent && now - lastDownloadSentAt < 500) return;
    lastDownloadSentAt = now;
    broadcast({ ...lastStatus, percent: rounded, transferred, total });
  });

  autoUpdater.on('error', (error) => {
    if (lastStatus.state === 'installing') {
      console.error('[Updater] Installation failed:', error);
      broadcast({ ...lastStatus, state: 'downloaded', installFailed: true });
    }
  });

  registerUpdateIpc();
  if (autoCheckEnabled && app.isPackaged) {
    setTimeout(() => { if (autoCheckEnabled) void checkForUpdates(); }, 8000);
  }
}

function setAutoCheckEnabled(enabled) {
  autoCheckEnabled = !!enabled;
}

function finishDownload(state, downloadFailed = false) {
  const { version, releaseUrl, releaseNotes, releaseBody, notesLoading } = lastStatus;
  broadcast({ state, version, releaseUrl, releaseNotes, releaseBody, notesLoading, downloadFailed });
}

function registerUpdateIpc() {
  ipcMain.handle('update:get-status', getLastUpdateStatus);
  ipcMain.handle('update:get-info', () => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
    portable: isPortableBuild(),
    canUpdate: canUseElectronUpdater(),
    releasesUrl: RELEASES_URL
  }));

  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) return { ok: false, error: 'DEV_NO_AUTO_UPDATE' };
    let timeout;
    try {
      return await Promise.race([
        checkForUpdates(),
        new Promise(resolve => {
          timeout = setTimeout(() => resolve({ ok: false, error: 'Update check timed out' }), 20000);
        })
      ]);
    } finally {
      clearTimeout(timeout);
    }
  });

  ipcMain.handle('update:download', async (_event, version) => {
    await activeCheck;
    if (!canUseElectronUpdater() || lastStatus.state !== 'available' || lastStatus.version !== version) {
      return { ok: false };
    }

    const token = new CancellationToken();
    activeDownload = { token, requests: new Set() };
    lastDownloadSentAt = 0;
    broadcast({ ...lastStatus, state: 'downloading', percent: 0, downloadFailed: false });
    try {
      await autoUpdater.downloadUpdate(token);
      finishDownload('downloaded');
      return { ok: true };
    } catch (error) {
      if (!token.cancelled) console.error('[Updater] Download failed:', error);
      finishDownload('available', !token.cancelled);
      return { ok: token.cancelled };
    } finally {
      activeDownload = null;
      token.dispose();
    }
  });

  ipcMain.handle('update:cancel-download', (_event, version) => {
    if (lastStatus.state !== 'downloading' || lastStatus.version !== version || !activeDownload) return { ok: false };
    broadcast({ ...lastStatus, cancelling: true });
    activeDownload.token.cancel();
    for (const request of activeDownload.requests) request.abort();
    return { ok: true };
  });

  ipcMain.handle('update:install', (_event, version) => {
    if (!canUseElectronUpdater() || lastStatus.state !== 'downloaded' || lastStatus.version !== version) {
      return { ok: false };
    }

    broadcast({ ...lastStatus, state: 'installing', installFailed: false });
    try {
      // Silent NSIS (/S) with relaunch. First-time Setup.exe still uses the full UI.
      autoUpdater.quitAndInstall(true, true);
    } catch (error) {
      console.error('[Updater] Installation failed:', error);
      broadcast({ ...lastStatus, state: 'downloaded', installFailed: true });
    }
    return { ok: lastStatus.state === 'installing' };
  });

  ipcMain.handle('update:open-releases', async () => {
    await shell.openExternal(RELEASES_URL);
    return { ok: true };
  });

  ipcMain.handle('open-external', async (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'Invalid URL' };
  });

  ipcMain.handle('open-default-apps-settings', async () => {
    await shell.openExternal('ms-settings:defaultapps');
    return { ok: true };
  });
}

module.exports = {
  initUpdater,
  setAutoCheckEnabled,
  getLastUpdateStatus,
  canUseElectronUpdater,
  isPortableBuild,
  RELEASES_URL,
  githubReleaseUrl,
  extractReleaseNotes
};
