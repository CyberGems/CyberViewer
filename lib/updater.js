'use strict';

const { autoUpdater } = require('electron-updater');
const { ipcMain, BrowserWindow, app, shell } = require('electron');

const GITHUB_REPO = 'CyberGems/CyberViewer';
const RELEASES_URL = 'https://github.com/CyberGems/CyberViewer/releases/latest';
const NOTES_MAX_CHARS = 8000;

let autoCheckEnabled = true;
let initialized = false;
let beforeQuitInstall = null;
let lastStatus = { state: 'idle' };
let cachedRelease = null;

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
  return `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`;
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

function rememberRelease(version, notes, url, body) {
  const sameRelease = cachedRelease && cachedRelease.version === version;
  const resolvedUrl = url || (sameRelease ? cachedRelease.url : null) || githubReleaseUrl(version);
  const resolvedNotes = notes || (sameRelease ? cachedRelease.notes : undefined);
  const resolvedBody = body || (sameRelease ? cachedRelease.body : undefined);
  cachedRelease = { version, notes: resolvedNotes, url: resolvedUrl, body: resolvedBody };
  return { notes: resolvedNotes, url: resolvedUrl, body: resolvedBody };
}

/**
 * Status broadcast for pending updates; releaseBody (raw release body for the
 * renderer's localized preview) is only attached when actually known.
 */
function pendingStatus(state, version, meta) {
  const status = { state, version, releaseNotes: meta.notes, releaseUrl: meta.url };
  if (meta.body) status.releaseBody = meta.body;
  return status;
}

async function fetchGithubReleaseMeta(version) {
  if (typeof fetch !== 'function') return null;
  const value = String(version || '');
  const tag = value.startsWith('v') ? value : `v${value}`;
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${encodeURIComponent(tag)}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'CyberViewer'
        }
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return {
      notes: extractReleaseNotes({ version, releaseNotes: data && data.body ? data.body : '' }),
      body: data && data.body ? data.body : undefined,
      url: data && data.html_url ? data.html_url : githubReleaseUrl(version)
    };
  } catch (_) {
    return null;
  }
}

function enrichFromGithubIfNeeded(version, alreadyHasNotes) {
  if (alreadyHasNotes && cachedRelease && cachedRelease.version === version &&
      cachedRelease.url && cachedRelease.body) return;
  void fetchGithubReleaseMeta(version).then((meta) => {
    if (!meta) return;
    if (lastStatus.state !== 'available' && lastStatus.state !== 'downloaded') return;
    if (lastStatus.version !== version) return;
    const next = rememberRelease(
      version,
      lastStatus.releaseNotes || meta.notes,
      meta.url,
      lastStatus.releaseBody || meta.body
    );
    if (next.notes === lastStatus.releaseNotes &&
        next.url === lastStatus.releaseUrl &&
        next.body === lastStatus.releaseBody) return;
    const status = { ...lastStatus, releaseNotes: next.notes, releaseUrl: next.url };
    if (next.body) status.releaseBody = next.body;
    else delete status.releaseBody;
    broadcast(status);
  });
}

function broadcast(status) {
  lastStatus = status;
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('update:status', status);
    } catch (_) { /* ignore */ }
  }
}

function getLastUpdateStatus() {
  return lastStatus;
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

  // checkUpdatesOnStartup=false ⇒ no silent startup check (user must ask)
  autoCheckEnabled = !(settings && settings.checkUpdatesOnStartup === false);

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => {
    broadcast({ state: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    // Never auto-download — install is always user-requested.
    const version = info.version;
    const meta = rememberRelease(version, extractReleaseNotes(info), undefined, rawReleaseBody(info));
    broadcast(pendingStatus('available', version, meta));
    enrichFromGithubIfNeeded(version, !!meta.notes);
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
    const version = info.version;
    const meta = rememberRelease(version, extractReleaseNotes(info), undefined, rawReleaseBody(info));
    broadcast(pendingStatus('downloaded', version, meta));
    enrichFromGithubIfNeeded(version, !!meta.notes);
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
  ipcMain.handle('update:get-status', () => getLastUpdateStatus());

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
    // Silent NSIS (/S): skip the Next/Next wizard; force relaunch after install.
    // First-time Setup.exe still shows the full UI (oneClick: false).
    setTimeout(() => {
      autoUpdater.quitAndInstall(true, true);
    }, 0);
    return { ok: true };
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
