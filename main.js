'use strict';

const {
  app, BrowserWindow, shell, ipcMain, screen, Tray, Menu,
  protocol, nativeImage, clipboard, dialog, globalShortcut
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { execFile, spawn } = require('child_process');

const {
  cleanFsPath, toMediaUrl, createPathAllowlist, MEDIA_EXTS,
  isExistingMediaFile, isVideoPath
} = require('./lib/paths');
const { createMediaResponse } = require('./lib/media-protocol');
const { clearThumbCache, evictThumbCache } = require('./lib/thumb-cache');
const { clampWindowBounds, MIN_W, MIN_H, nextBoundsAttempt, boundsMatch } = require('./lib/window-bounds');
const { initUpdater, setAutoCheckEnabled, isPortableBuild } = require('./lib/updater');
const { buildBackup, parseBackup } = require('./lib/settings-backup');
const autoBackup = require('./lib/auto-backup');
const { SessionStore } = require('./lib/session-store');
const { YouTubePlayer } = require('./lib/youtube-player');
const {
  TRAY_HELP_URLS, buildTrayHelpModel, taskbarSettingsLaunch
} = require('./lib/tray-help');
const CVMedia = require('./js/media-helpers');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'cvlocal',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: false
    }
  }
]);

const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const sessionStore = new SessionStore(app.getPath('userData'));
const menuI18n = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'i18n', 'menu.json'), 'utf8')
);

// ── Window lifecycle diagnostics ─────────────────────────────────────
// Symptom under investigation: when the app auto-starts with Windows
// (login item "--startup"), the window created hidden during early boot
// can present a black frame when it is later shown, until the app is
// relaunched. A BrowserWindow created before DWM/Explorer compositing is
// fully up may never receive a proper first frame. This small timeline
// log (<app logs>/cyberviewer-window.log) pins the exact breakpoint so
// the boot path can be analyzed per machine. Internal only, no UI text.
const WINDOW_DIAG_FILE = 'cyberviewer-window.log';

function diagWindow(event, extra) {
  try {
    const entry = {
      t: new Date().toISOString(),
      pid: process.pid,
      event,
      ...(extra || {})
    };
    const file = path.join(app.getPath('logs'), WINDOW_DIAG_FILE);
    let lines = [];
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    } catch (_) { /* first run */ }
    lines.push(JSON.stringify(entry));
    fs.writeFileSync(file, lines.slice(-200).join('\n') + '\n');
  } catch (_) { /* diagnostics must never break the app */ }
}

function diagGpuStatus() {
  try {
    const s = app.getGPUFeatureStatus();
    return {
      compositing: s['gpu_compositing'],
      rasterization: s['gpu_rasterization'],
      canvas2d: s['2d_canvas'],
      webgl: s['webgl']
    };
  } catch (_) {
    return null;
  }
}

// A window that was created hidden during early boot can otherwise end up
// presenting only its background color (black #080a0e) when first shown.
// Requesting a fresh renderer frame after the window becomes visible is
// cheap and resolves most of those cases.
function nudgeCompositorFrame() {
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.invalidate();
    diagWindow('compositor-nudge');
  } catch (_) { /* ignore */ }
}

/** Matches the config placeholder. Empty/missing settings resolve to this. */
const DEFAULT_TOGGLE_HOTKEY = 'Alt+Shift+V';

function isToggleHotkeyDisabled(value) {
  return value === 'disabled';
}

function resolveToggleHotkey(value) {
  if (isToggleHotkeyDisabled(value)) return '';
  const s = value == null ? '' : String(value).trim();
  return s || DEFAULT_TOGGLE_HOTKEY;
}

const pathAllowlist = createPathAllowlist([__dirname]);

function getUiLang() {
  try {
    const s = loadSettings();
    return (s.app && s.app.language) || 'en';
  } catch (_) {
    return 'en';
  }
}

function tMenu(key, lang) {
  const l = lang || getUiLang();
  const pack = menuI18n[l] || menuI18n.en || {};
  return pack[key] != null ? pack[key] : (menuI18n.en && menuI18n.en[key]) || key;
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (data && data.app) {
        if (data.app.checkUpdatesOnStartup === undefined) {
          data.app.checkUpdatesOnStartup = data.app.manualUpdateOnly === undefined
            ? true
            : !data.app.manualUpdateOnly;
        }
        if (!data.app.updateNotify || typeof data.app.updateNotify !== 'object') {
          data.app.updateNotify = {
            lastNotifiedAvailable: null,
            lastNotifiedDownloaded: null
          };
        }
        if (data.app.toolbarOpen === undefined) data.app.toolbarOpen = true;
        if (data.app.bannerAutoHide === undefined) data.app.bannerAutoHide = (data.app.hudAutoHide !== undefined ? data.app.hudAutoHide : true);
        if (data.app.hudAutoHideDelay === undefined) data.app.hudAutoHideDelay = 2000;
        if (data.app.disableTooltips === undefined) data.app.disableTooltips = false;
        if (data.app.showShortcutGuide === undefined) data.app.showShortcutGuide = true;
        if (data.app.alphaBackground === undefined) data.app.alphaBackground = 'checker-dark';
        if (data.app.imageOutline === undefined) data.app.imageOutline = false;
        if (!Array.isArray(data.app.recentFiles)) data.app.recentFiles = [];
        if (!Array.isArray(data.app.recentFolders)) data.app.recentFolders = [];
        if (data.app.slideshowIntervalMs === undefined) data.app.slideshowIntervalMs = 3000;
        if (data.app.slideshowLoop === undefined) data.app.slideshowLoop = true;
        if (data.app.slideshowEnterFullscreen === undefined) data.app.slideshowEnterFullscreen = true;
        delete data.app.allowMultipleInstances;
        if (data.app.restoreSession === undefined) data.app.restoreSession = false;
        if (data.app.showFileName === undefined) data.app.showFileName = true;
        if (data.app.animateGifs === undefined) data.app.animateGifs = true;
        if (typeof data.app.videoAutoplay !== 'boolean') data.app.videoAutoplay = true;
        if (data.app.closeChoiceMade === undefined) data.app.closeChoiceMade = false;
      if (data.app.dblClickAction === undefined) data.app.dblClickAction = 'fullscreen';
        if (data.app.toggleHotkey === undefined || data.app.toggleHotkey === '') {
          data.app.toggleHotkey = DEFAULT_TOGGLE_HOTKEY;
        }
      }
      return data;
    }
  } catch (e) {
    console.error('Error cargando settings:', e);
  }
  return {
    window: { width: 1280, height: 800, maximized: true },
    app: {
      closeToTray: false,
      closeImageOnTray: true,
      closeChoiceMade: false,
      trayRecentImages: true,
      startMinimized: false,
      autoStart: false,
      accentColor: '#00d4ff',
      appearanceTheme: 'cyberviewer',
      sidebarOpen: false,
      statusbarVisible: true,
      preferredDisplayId: 'auto',
      language: 'en',
      contextMenuEnabled: false,
      toggleHotkey: DEFAULT_TOGGLE_HOTKEY,
      checkUpdatesOnStartup: true,
      updateNotify: {
        lastNotifiedAvailable: null,
        lastNotifiedDownloaded: null
      },
      toolbarOpen: true,
      bannerAutoHide: true,
      hudAutoHideDelay: 2000,
      disableTooltips: false,
      showShortcutGuide: true,
      alphaBackground: 'checker-dark',
      imageOutline: false,
      recentFiles: [],
      recentFolders: [],
      slideshowIntervalMs: 3000,
      slideshowLoop: true,
      slideshowEnterFullscreen: true,
      restoreSession: false,
      videoAutoplay: true,
      showFileName: true,
      animateGifs: true,
      dblClickAction: 'fullscreen',
      navZoomMode: 'reset'
    }
  };
}

function saveSettings(data) {
  try {
    const current = loadSettings();
    const merged = {
      window: { ...current.window, ...(data.window || {}) },
      app: { ...current.app, ...(data.app || {}) }
    };
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
  } catch (e) {
    console.error('Error guardando settings:', e);
  }
}

function getFilePathFromArgs(args) {
  for (let arg of args) {
    arg = arg.replace(/^"(.*)"$/, '$1');
    if (MEDIA_EXTS.has(path.extname(arg).toLowerCase())) {
      try {
        if (isExistingMediaFile(arg)) {
          const resolved = path.resolve(arg);
          pathAllowlist.allow(resolved);
          return resolved;
        }
      } catch (_) { /* ignore */ }
    }
  }
  return null;
}

function resolveAllowedPath(rawPath) {
  const abs = cleanFsPath(rawPath);
  return pathAllowlist.assertAllowed(abs);
}

function registerMediaProtocol() {
  protocol.handle('cvlocal', async (request) => {
    try {
      return await createMediaResponse(request, pathAllowlist);
    } catch (e) {
      console.error('cvlocal protocol error:', e.message);
      return new Response('Bad Request', { status: 400 });
    }
  });
}

let win;
let youtubePlayer;
let tray = null;
let isQuitting = false;
// True between an explicit user quit request (tray Exit, first-close dialog)
// and the moment the window actually closes.
let quitRequested = false;
let quitWatchdog = null;

function armQuitWatchdog() {
  if (quitWatchdog) clearTimeout(quitWatchdog);
  quitWatchdog = setTimeout(() => {
    quitWatchdog = null;
    if (!win || win.isDestroyed()) return;
    // The renderer close chain did not complete (discard dialog dismissed,
    // session flush failed). Fall back to normal close semantics so the app
    // stays closable through the regular paths.
    isQuitting = false;
    quitRequested = false;
  }, 4000);
}

const initialFilePaths = process.argv.map(arg => getFilePathFromArgs([arg])).filter(Boolean);
const initialFilePath = initialFilePaths[0] || null;
const instanceHasInitialFile = !!initialFilePath;
let workspaceReady = false;
let workspaceCloseApproved = false;
const pendingOpenPaths = [...initialFilePaths];
// One resident process owns all tabs, the tray, and the session file.
function forwardOpenPaths(paths) {
  pendingOpenPaths.push(...paths);
  if (!workspaceReady || !win || win.isDestroyed()) return;
  const unique = [...new Set(pendingOpenPaths.splice(0))];
  if (unique.length) win.webContents.send('open-file', unique);
}

function resolveStartupBounds(settings) {
  const raw = settings.window && settings.window.bounds;
  const clamped = clampWindowBounds(raw, {
    displays: screen.getAllDisplays(),
    primary: screen.getPrimaryDisplay(),
    preferredDisplayId: settings.app && settings.app.preferredDisplayId,
    // A normal close should reopen centered on the last/selected monitor.
    // Maximized windows keep their native maximized restore behavior.
    center: settings.window && settings.window.maximized === false
  });
  const inflated = !!(
    raw &&
    Number.isFinite(raw.width) &&
    Number.isFinite(raw.height) &&
    (raw.width > clamped.width + 32 || raw.height > clamped.height + 32)
  );
  return { ...clamped, inflated };
}

/**
 * Applies bounds and corrects the mixed-DPI size inflation Windows produces
 * when a window is placed on a display with a different scale factor than the
 * one it was created on. A single setBounds can come back up to 20% larger,
 * which pushes the window off-center and past the work area edge.
 *
 * Returns the bounds the window actually has afterwards.
 */
function applyBoundsExact(target, want, area, maxPasses = 4) {
  if (!target || target.isDestroyed()) return want;
  let request = { ...want };
  try {
    target.setBounds(request);
    for (let pass = 0; pass < maxPasses; pass++) {
      const got = target.getBounds();
      if (boundsMatch(want, got)) break;
      request = nextBoundsAttempt(want, got, area);
      target.setBounds(request);
    }
  } catch (_) { /* ignore */ }
  return target.isDestroyed() ? want : target.getBounds();
}

function persistWindowState() {
  if (!win || win.isDestroyed()) return;
  try {
    // Do not persist exclusive-fullscreen metrics as normal window bounds
    if (typeof win.isFullScreen === 'function' && win.isFullScreen()) return;

    const isMax = win.isMaximized();
    // Live bounds identify the monitor even while maximized
    const live = win.getBounds();
    const liveDisplay =
      (typeof screen.getDisplayMatching === 'function' && screen.getDisplayMatching(live)) ||
      screen.getDisplayNearestPoint({
        x: Math.round(live.x + live.width / 2),
        y: Math.round(live.y + live.height / 2)
      });

    // getNormalBounds avoids DPI-inflated maximized metrics on Windows
    const raw = typeof win.getNormalBounds === 'function' ? win.getNormalBounds() : live;
    const clamped = clampWindowBounds(raw, {
      displays: screen.getAllDisplays(),
      primary: screen.getPrimaryDisplay(),
      preferredDisplayId: loadSettings().app.preferredDisplayId,
      savedDisplayId: liveDisplay && liveDisplay.id
    });
    saveSettings({
      window: {
        maximized: isMax,
        bounds: {
          x: clamped.x,
          y: clamped.y,
          width: clamped.width,
          height: clamped.height,
          displayId: (liveDisplay && liveDisplay.id) || clamped.displayId
        }
      }
    });
  } catch (e) {
    console.error('Error persisting window state:', e);
  }
}

function createWindow() {
  const settings = loadSettings();
  const startup = resolveStartupBounds(settings);
  // Frame colour matches the saved appearance theme so the window does not flash
  // dark before the renderer paints. Kept in sync with js/theme-boot.js.
  const themeName = ['cyberviewer', 'gray', 'light'].includes(settings.app && settings.app.appearanceTheme)
    ? settings.app.appearanceTheme
    : 'cyberviewer';
  const frameColor = themeName === 'light' ? '#eef1f6' : (themeName === 'gray' ? '#0d0d0d' : '#080a0e');
  diagWindow('window-creating', { startup: !!startup });
  // Prefer maximized when previously maximized, first-run, or saved size was DPI-inflated
  const startMaximized =
    settings.window.maximized === true ||
    settings.window.maximized == null ||
    startup.inflated;

  win = new BrowserWindow({
    x: startup.x,
    y: startup.y,
    width: startup.width,
    height: startup.height,
    minWidth: MIN_W,
    minHeight: MIN_H,
    title: 'CyberViewer',
    backgroundColor: frameColor,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    frame: false,
    titleBarStyle: 'hidden',
    // Native rounded corners only on Windows 11 (build >= 22000). No effect on Win10.
    roundedCorners: true,
    thickFrame: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false,
      enableWebSQL: false,
      webSecurity: true
    }
  });

  youtubePlayer = new YouTubePlayer(win);
  try {
    win.setBackgroundColor(frameColor);
  } catch (_) { /* ignore */ }

  // Debounce persistence — move/resize fire often and mixed-DPI getBounds is noisy
  let persistTimer = null;
  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      if (!win || win.isDestroyed()) return;
      if (win.isMaximized()) return;
      if (typeof win.isFullScreen === 'function' && win.isFullScreen()) return;
      persistWindowState();
    }, 400);
  };
  win.on('move', schedulePersist);
  win.on('resize', schedulePersist);

  let shown = false;
  const revealWindow = () => {
    if (shown || !win || win.isDestroyed()) return;
    shown = true;

    const isStartupLaunch = process.argv.includes('--startup');
    const shouldStartMinimized = settings.app.autoStart && isStartupLaunch;
    diagWindow('reveal', { isStartupLaunch, shouldStartMinimized });

    if (shouldStartMinimized) {
      if (!tray) createTray();
      diagWindow('startup-minimized-to-tray');
      return;
    }

    // Last-resort flash mitigation: show at opacity 0, settle layout, then fade in
    try { win.setOpacity(0); } catch (_) { /* ignore */ }

    // Place on the resolved startup display (keeps last-used monitor).
    // Corrected against the real result: Windows inflates the size when the
    // target display has a different scale factor than the one the window was
    // created on, which would leave it off-center and too large.
    try {
      const startupArea =
        (screen.getDisplayNearestPoint({
          x: startup.x + Math.floor(startup.width / 2),
          y: startup.y + Math.floor(startup.height / 2)
        }) || {}).workArea;
      applyBoundsExact(
        win,
        { x: startup.x, y: startup.y, width: startup.width, height: startup.height },
        startupArea
      );
    } catch (_) { /* ignore */ }

    win.show();

    if (startMaximized) {
      try {
        // Nudge onto the target display before maximize if needed
        const target =
          screen.getDisplayNearestPoint({
            x: startup.x + Math.floor(startup.width / 2),
            y: startup.y + Math.floor(startup.height / 2)
          });
        const cur = win.getBounds();
        const curDisp =
          (typeof screen.getDisplayMatching === 'function' && screen.getDisplayMatching(cur)) ||
          screen.getDisplayNearestPoint({
            x: Math.round(cur.x + cur.width / 2),
            y: Math.round(cur.y + cur.height / 2)
          });
        if (target && curDisp && target.id !== curDisp.id) {
          const wa = target.workArea || target.bounds;
          applyBoundsExact(
            win,
            {
              x: wa.x + 48,
              y: wa.y + 48,
              width: Math.min(startup.width, Math.max(800, wa.width - 96)),
              height: Math.min(startup.height, Math.max(500, wa.height - 96))
            },
            wa
          );
        }
        if (!win.isMaximized()) win.maximize();
      } catch (_) { /* ignore */ }
    }

    const fadeIn = () => {
      if (!win || win.isDestroyed()) return;
      try { win.setOpacity(1); } catch (_) { /* ignore */ }
    };
    // Two ticks: let Chromium/DWM composite the dark frame before becoming visible
    setTimeout(fadeIn, 32);
  };

  // Register before loadURL to avoid missing a fast ui-ready
  const onUiReady = () => {
    ipcMain.removeListener('ui-ready', onUiReady);
    diagWindow('ui-ready');
    revealWindow();
  };
  ipcMain.on('ui-ready', onUiReady);
  win.once('ready-to-show', () => {
    diagWindow('ready-to-show');
    // Fallback if renderer never acks
    setTimeout(() => revealWindow(), 1500);
  });
  win.on('closed', () => {
    ipcMain.removeListener('ui-ready', onUiReady);
  });

  const htmlPath = path.join(__dirname, 'CyberViewer.html');
  // theme-boot.js reads these to paint the first frame in the saved theme.
  const bootParams = new URLSearchParams({
    theme: themeName,
    accent: (settings.app && /^#[0-9A-Fa-f]{6}$/.test(settings.app.accentColor || ''))
      ? settings.app.accentColor
      : '#00d4ff'
  });
  const loadUrl = !app.isPackaged
    ? pathToFileURL(htmlPath).href + '?v=' + Date.now() + '&' + bootParams.toString()
    : pathToFileURL(htmlPath).href + '?' + bootParams.toString();
  win.loadURL(loadUrl);

  win.on('close', (event) => {
    if (!isQuitting) {
      const s = loadSettings().app;
      // Ask once unless the user already chose a closing behavior.
      if (!s.closeChoiceMade && !s.closeToTray) {
        event.preventDefault();
        // Make sure the window is visible so the dialog can be read
        if (win.isMinimized()) win.restore();
        if (!win.isVisible()) win.show();
        win.focus();
        try { win.webContents.send('confirm-first-close'); } catch (_) { /* ignore */ }
        return false;
      }
      if (s.closeToTray) {
        event.preventDefault();
        hideToTray();
        return false;
      }
    }
    if (quitWatchdog) {
      clearTimeout(quitWatchdog);
      quitWatchdog = null;
    }
    persistWindowState();
  });
  // Electron cancels a close when the renderer's beforeunload handler requests
  // confirmation. Only its explicit acknowledgement may retry the close.
  win.webContents.on('will-prevent-unload', () => {
    if (win.isDestroyed()) return;
    if (quitRequested) {
      // The user explicitly asked to quit (tray Exit, first-close dialog). The
      // renderer's beforeunload started its close chain (session flush, discard
      // confirmation) and re-requests the quit via 'workspace-close-ready'. The
      // prevention notice can arrive after that retry already started, so
      // cancelling the quit here would kill it in flight and leave the app
      // running with the window restored. Keep the quit alive; showing the
      // window lets a discard dialog (when the renderer opens one) be answered.
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
      armQuitWatchdog();
      return;
    }
    isQuitting = false;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  });

  win.on('show', () => {
    try { diagWindow('window-shown', { maximized: win.isMaximized() }); } catch (_) { /* ignore */ }
    // Chromium keeps :hover on the button clicked to minimize until the cursor
    // moves again; tell the renderer to re-hit-test on restore/show.
    try { win.webContents.send('window-restore'); } catch (_) { /* ignore */ }
    updateTrayMenu();
  });
  win.on('hide', () => updateTrayMenu());
  win.on('minimize', () => updateTrayMenu());
  win.on('restore', () => {
    try { win.webContents.send('window-restore'); } catch (_) { /* ignore */ }
    updateTrayMenu();
  });
  win.on('blur', () => {
    if (win && !win.isDestroyed()) win.webContents.send('window-blur');
  });

  win.on('maximize', () => {
    win.webContents.send('win-state', 'maximized');
    persistWindowState();
  });
  win.on('unmaximize', () => {
    // Ignore transient unmaximize while entering exclusive fullscreen
    if (typeof win.isFullScreen === 'function' && win.isFullScreen()) return;
    win.webContents.send('win-state', 'normal');
    // Re-clamp after unmaximize — Windows/DPI often restores oversized bounds
    setTimeout(() => {
      if (!win || win.isDestroyed() || win.isMaximized()) return;
      if (typeof win.isFullScreen === 'function' && win.isFullScreen()) return;
      try {
        const raw = win.getBounds();
        const clamped = clampWindowBounds(raw, {
          displays: screen.getAllDisplays(),
          primary: screen.getPrimaryDisplay(),
          preferredDisplayId: loadSettings().app.preferredDisplayId
        });
        if (raw.width > clamped.width + 8 || raw.height > clamped.height + 8) {
          const area = (screen.getDisplayMatching(raw) || screen.getPrimaryDisplay()).workArea;
          applyBoundsExact(
            win,
            { x: clamped.x, y: clamped.y, width: clamped.width, height: clamped.height },
            area
          );
        }
      } catch (_) { /* ignore */ }
      persistWindowState();
    }, 0);
  });

  // OS exclusive fullscreen ↔ renderer immersive (ghost) UI
  win.on('enter-full-screen', () => {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('fullscreen-changed', true);
  });
  win.on('leave-full-screen', () => {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('fullscreen-changed', false);
    // Restore maximize glyph after exclusive fullscreen ends
    try {
      win.webContents.send('win-state', win.isMaximized() ? 'maximized' : 'normal');
    } catch (_) { /* ignore */ }
    persistWindowState();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function hideToTray() {
  if (!win || win.isDestroyed()) return;
  persistWindowState();
  // Release decoded pixels while preserving tabs and pending rotations.
  try {
    const s = (loadSettings().app) || {};
    if (s.closeImageOnTray !== false && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send('suspend-workspace');
    }
  } catch (_) { /* ignore */ }
  if (win.isVisible()) win.hide();
  updateTrayMenu();
}

function showFromTray() {
  if (!win || win.isDestroyed()) return;
  diagWindow('show-from-tray');
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
  // The window was created hidden at login; ask the compositor for a fresh
  // frame once visible in case DWM never presented the boot-time frame.
  setTimeout(nudgeCompositorFrame, 200);
  updateTrayMenu();
}

function isWindowShown() {
  return !!(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized());
}

// Windows may emit a normal click around the same right-click that opens the
// tray context menu. Defer the click and cancel it when the right-click wins.
let trayRightClickSeq = 0;
let lastTrayRightClickAt = 0;
let trayClickTimer = null;

function resolveOpenTaskbarSettingsExe() {
  const candidates = [
    // Packaged extraResources (outside asar — required to spawn).
    path.join(process.resourcesPath || '', 'open-taskbar-settings.exe'),
    // Development copy kept beside the helper source.
    path.join(__dirname, 'electron', 'open-taskbar-settings.exe'),
    path.join(app.getAppPath(), 'electron', 'open-taskbar-settings.exe'),
    path.join(__dirname, 'open-taskbar-settings.exe')
  ];
  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (_) {
      return false;
    }
  }) || null;
}

async function openTaskbarIconSettings() {
  const helperPath = resolveOpenTaskbarSettingsExe();
  const launch = taskbarSettingsLaunch(process.platform, !!helperPath);
  if (process.platform === 'win32') {
    if (launch.method === 'native') {
      try {
        const child = spawn(helperPath, [], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
        child.once('error', (error) => {
          console.warn('Taskbar settings helper failed; opening Windows Settings:', error.message);
          void shell.openExternal(launch.uri);
        });
        child.unref();
        return { success: true, method: 'native' };
      } catch (error) {
        console.warn('Taskbar settings helper unavailable; using Windows Settings:', error.message);
      }
    }
  }

  await shell.openExternal(launch.uri);
  return { success: true, method: 'uri' };
}

function openTrayHelpUrl(key) {
  const url = TRAY_HELP_URLS[key];
  if (url) void shell.openExternal(url);
}

// Windows owns the lifecycle of native tray menus and their submenu flyouts.
// Keep the menu object stable while it is open; replacing it during a hover can
// make Windows redraw the menu or crash older Electron/Windows combinations.
let trayContextMenuOpen = false;
let trayContextMenuRebuildPending = false;
let trayContextMenuCloseFallback = null;
let pendingTrayAction = null;

function executePendingTrayAction() {
  const action = pendingTrayAction;
  pendingTrayAction = null;
  if (!action) return;

  if (action === 'quit') {
    isQuitting = true;
    quitRequested = true;
    app.quit();
    return;
  }
  if (action === 'hide') {
    hideToTray();
    return;
  }
  if (action === 'show') {
    showFromTray();
    return;
  }
  if (action === 'settings') {
    showFromTray();
    if (win && !win.isDestroyed()) win.webContents.send('open-settings');
    return;
  }
  if (action === 'about') {
    showFromTray();
    if (win && !win.isDestroyed()) win.webContents.send('menu-action', { action: 'show-about' });
    return;
  }
  if (action === 'help-pin') {
    showFromTray();
    if (win && !win.isDestroyed()) win.webContents.send('menu-action', { action: 'show-tray-pin-reminder' });
    return;
  }
  if (action === 'help-check-updates') {
    showFromTray();
    if (win && !win.isDestroyed()) win.webContents.send('menu-action', { action: 'check-updates' });
    return;
  }
  if (action && typeof action === 'object' && action.type === 'open-file') {
    showFromTray();
    if (win && !win.isDestroyed()) {
      try {
        pathAllowlist.allow(action.filePath);
      } catch (_) {}
      win.webContents.send('open-file', action.filePath);
    }
    return;
  }
  if (action === 'clear-recent') {
    clearRecentFilesFromMain();
    return;
  }
}

function clearRecentFilesFromMain() {
  const current = loadSettings();
  const appSettings = { ...(current.app || {}), recentFiles: [] };
  saveSettings({ app: appSettings });
  updateTrayMenu();
  if (win && !win.isDestroyed()) {
    win.webContents.send('recent-files-cleared');
  }
}

function onTrayContextMenuClosed() {
  if (!trayContextMenuOpen) return;
  trayContextMenuOpen = false;
  if (trayContextMenuCloseFallback) {
    clearTimeout(trayContextMenuCloseFallback);
    trayContextMenuCloseFallback = null;
  }

  // Windows can emit menu-will-close before the item click. Give the click
  // callback a short window to populate pendingTrayAction, as CyberLauncher
  // does for the same native menu lifecycle.
  setTimeout(() => {
    executePendingTrayAction();
    if (trayContextMenuRebuildPending) {
      trayContextMenuRebuildPending = false;
      rebuildTrayContextMenu();
    }
  }, 50);
}

function loadTrayMenuIcon(name) {
  const iconPath = path.join(__dirname, 'assets', 'menu-icons', name);
  try {
    if (!fs.existsSync(iconPath)) return null;
    const image = nativeImage.createFromPath(iconPath);
    return image.isEmpty() ? null : image;
  } catch (_) {
    return null;
  }
}

function loadTrayBrandIcon() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  try {
    if (!fs.existsSync(iconPath)) return null;
    const image = nativeImage.createFromPath(iconPath);
    return image.isEmpty() ? null : image.resize({ width: 16, height: 16 });
  } catch (_) {
    return null;
  }
}

function buildTrayContextMenuTemplate() {
  const lang = getUiLang();
  const t = menuI18n[lang] || menuI18n.en;
  const settings = loadSettings();
  const visible = isWindowShown();
  const shortcut = resolveToggleHotkey(settings.app && settings.app.toggleHotkey);
  const help = buildTrayHelpModel(t);
  const iconBrand = loadTrayBrandIcon();
  const iconShow = loadTrayMenuIcon('show-hide.png');
  const iconRecent = loadTrayMenuIcon('recent-images.png');
  const iconSettings = loadTrayMenuIcon('settings.png');
  const iconHelp = loadTrayMenuIcon('help.png');
  const iconFaq = loadTrayMenuIcon('faq.png');
  const iconChangelog = loadTrayMenuIcon('changelog.png');
  const iconHome = loadTrayMenuIcon('homepage.png');
  const iconDonate = loadTrayMenuIcon('donate.png');
  const iconAbout = loadTrayMenuIcon('about.png');
  const iconUpdate = loadTrayMenuIcon('update.png');
  const iconQuit = loadTrayMenuIcon('quit.png');

  const recentFiles = (settings.app && Array.isArray(settings.app.recentFiles)) ? settings.app.recentFiles : [];
  const showTrayRecents = !settings.app || settings.app.trayRecentImages !== false;
  let recentItem = null;
  if (showTrayRecents) {
    const validRecents = recentFiles.filter((p) => p && typeof p === 'string').slice(0, 10);
    const recentSubmenu = [];
    if (validRecents.length === 0) {
      recentSubmenu.push({
        label: t.tray_no_recent || 'No recent images',
        enabled: false
      });
    } else {
      validRecents.forEach((filePath) => {
        const name = (path.basename(filePath) || filePath).replace(/&/g, '&&');
        recentSubmenu.push({
          label: name,
          click: () => {
            pendingTrayAction = { type: 'open-file', filePath };
          }
        });
      });
      recentSubmenu.push({ type: 'separator' });
      recentSubmenu.push({
        label: t.tray_clear_recent || 'Clear recent list',
        click: () => {
          pendingTrayAction = 'clear-recent';
        }
      });
    }
    recentItem = {
      label: t.tray_recent_images || 'Recent images',
      ...(iconRecent ? { icon: iconRecent } : {}),
      submenu: recentSubmenu
    };
  }

  return [
    {
      label: 'CyberViewer v' + app.getVersion(),
      ...(iconBrand ? { icon: iconBrand } : {}),
      click: () => { pendingTrayAction = 'about'; }
    },
    { type: 'separator' },
    {
      label: visible ? t.tray_hide : t.tray_show,
      ...(iconShow ? { icon: iconShow } : {}),
      accelerator: shortcut || undefined,
      click: () => { pendingTrayAction = visible ? 'hide' : 'show'; }
    },
    ...(recentItem ? [recentItem] : []),
    {
      label: t.tray_settings,
      ...(iconSettings ? { icon: iconSettings } : {}),
      click: () => { pendingTrayAction = 'settings'; }
    },
    {
      label: help.label,
      ...(iconHelp ? { icon: iconHelp } : {}),
      submenu: [
        {
          label: help.pinLabel,
          ...(iconSettings ? { icon: iconSettings } : {}),
          click: () => { pendingTrayAction = 'help-pin'; }
        },
        { type: 'separator' },
        {
          label: help.docsLabel,
          ...(iconHelp ? { icon: iconHelp } : {}),
          click: () => openTrayHelpUrl('docs')
        },
        {
          label: help.faqLabel,
          ...(iconFaq ? { icon: iconFaq } : {}),
          click: () => openTrayHelpUrl('faq')
        },
        {
          label: help.changelogLabel,
          ...(iconChangelog ? { icon: iconChangelog } : {}),
          click: () => openTrayHelpUrl('changelog')
        },
        {
          label: help.websiteLabel,
          ...(iconHome ? { icon: iconHome } : {}),
          click: () => openTrayHelpUrl('website')
        },
        {
          label: help.donateLabel,
          ...(iconDonate ? { icon: iconDonate } : {}),
          click: () => openTrayHelpUrl('donate')
        },
        { type: 'separator' },
        {
          label: help.aboutLabel,
          ...(iconAbout ? { icon: iconAbout } : {}),
          click: () => { pendingTrayAction = 'about'; }
        },
        {
          label: help.updatesLabel,
          ...(iconUpdate ? { icon: iconUpdate } : {}),
          click: () => { pendingTrayAction = 'help-check-updates'; }
        }
      ]
    },
    { type: 'separator' },
    {
      label: t.tray_exit,
      ...(iconQuit ? { icon: iconQuit } : {}),
      click: () => { pendingTrayAction = 'quit'; }
    }
  ];
}

function rebuildTrayContextMenu() {
  if (!tray) return;
  if (trayContextMenuOpen) {
    trayContextMenuRebuildPending = true;
    return;
  }

  trayContextMenuRebuildPending = false;
  const menu = Menu.buildFromTemplate(buildTrayContextMenuTemplate());
  menu.on('menu-will-show', () => {
    trayContextMenuOpen = true;
    pendingTrayAction = null;
    if (trayContextMenuCloseFallback) clearTimeout(trayContextMenuCloseFallback);
    trayContextMenuCloseFallback = setTimeout(() => {
      if (trayContextMenuOpen) onTrayContextMenuClosed();
    }, 15000);
  });
  menu.on('menu-will-close', onTrayContextMenuClosed);
  tray.setContextMenu(menu);
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setToolTip('CyberViewer v' + app.getVersion());
  rebuildTrayContextMenu();
}

function createTray() {
  if (tray) return;
  tray = new Tray(path.join(__dirname, 'assets', 'icon.ico'));
  tray.setToolTip('CyberViewer v' + app.getVersion());
  rebuildTrayContextMenu();
  tray.on('click', () => {
    if (process.platform === 'win32') {
      const clickSeq = trayRightClickSeq;
      if (trayClickTimer) clearTimeout(trayClickTimer);
      trayClickTimer = setTimeout(() => {
        trayClickTimer = null;
        // A right-click can arrive before or after this deferred click.
        // Ignore both event orderings so opening the context menu cannot also
        // toggle the main window underneath it.
        if (trayRightClickSeq !== clickSeq || Date.now() - lastTrayRightClickAt < 400) return;
        if (trayContextMenuOpen) return;
        if (!win || win.isDestroyed()) return;
        if (isWindowShown()) hideToTray();
        else showFromTray();
      }, 120);
      return;
    }
    if (!win || win.isDestroyed()) return;
    if (isWindowShown()) hideToTray();
    else showFromTray();
  });
  tray.on('right-click', (_event, _bounds) => {
    trayRightClickSeq += 1;
    lastTrayRightClickAt = Date.now();
  });
}

// ── Global toggle hotkey ─────────────────────────────────────────────
// When the user sets an accelerator (e.g. "Alt+Shift+V") we register it globally
// so CyberViewer can be shown/hidden from anywhere. "disabled" (or a resolved
// empty value) unregisters the shortcut. Missing/blank settings use Alt+Shift+V.
function applyToggleHotkey(accelerator) {
  try { globalShortcut.unregisterAll(); } catch (_) { /* not registered yet */ }
  const acc = resolveToggleHotkey(accelerator);
  if (!acc) return { success: true }; // disabled by design
  try {
    globalShortcut.register(acc, () => {
      if (!win || win.isDestroyed()) return;
      if (isWindowShown()) hideToTray();
      else showFromTray();
    });
    if (!globalShortcut.isRegistered(acc)) {
      return { success: false, error: 'accelerator-in-use' };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message || 'invalid-accelerator' };
  }
}

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (_) { /* nothing registered */ }
});

ipcMain.handle('open-taskbar-settings', async () => {
  try {
    return await openTaskbarIconSettings();
  } catch (error) {
    console.error('Failed to open Windows tray icon settings:', error);
    return { success: false, error: error && error.message ? error.message : String(error) };
  }
});

// ── IPC ──
ipcMain.on('win-minimize', () => win.minimize());
ipcMain.on('win-maximize', () => {
  if (!win || win.isDestroyed()) return;
  // Leave exclusive fullscreen before toggle maximize/restore
  if (typeof win.isFullScreen === 'function' && win.isFullScreen()) {
    win.setFullScreen(false);
  }
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('win-close', () => win.close());
ipcMain.on('workspace-ready', event => {
  if (!win || event.sender !== win.webContents) return;
  workspaceReady = true;
  forwardOpenPaths([]);
});
ipcMain.on('workspace-close-ready', event => {
  if (!win || event.sender !== win.webContents || workspaceCloseApproved) return;
  workspaceCloseApproved = true;
  isQuitting = true;
  app.quit();
});
ipcMain.handle('session:load', () => {
  if (!loadSettings().app.restoreSession) return { ok: true, session: { version: 1, activeId: null, tabs: [] } };
  const result = sessionStore.read();
  result.session.tabs = result.session.tabs.map(tab => {
    // Inactive paths are validated only when activated. An offline network
    // folder must not stall restoration of every other tab.
    const draftPath = tab.draftId ? sessionStore.draftPath(tab.draftId) : null;
    if (draftPath) pathAllowlist.allow(draftPath);
    return { ...tab, draftPath };
  });
  return result;
});
ipcMain.handle('session:save', (_event, snapshot) => {
  if (!loadSettings().app.restoreSession) return { ok: false, error: 'SESSION_DISABLED' };
  try { sessionStore.write(snapshot); return { ok: true }; }
  catch (error) { console.error('Unable to save session:', error); return { ok: false, error: error.message }; }
});
ipcMain.handle('session:save-draft', (_event, base64) => {
  if (!loadSettings().app.restoreSession) return { ok: false, error: 'SESSION_DISABLED' };
  try { return { ok: true, id: sessionStore.saveDraft(base64) }; }
  catch (error) { return { ok: false, error: error.message }; }
});
ipcMain.handle('session:clear', () => {
  try { sessionStore.clear(); return { ok: true }; }
  catch (error) { return { ok: false, error: error.message }; }
});

// ── First-close choice (CyberNotes pattern) ──
// The renderer asks after the window's close event was intercepted. "remember"
// persists the choice (closeChoiceMade + closeToTray) so future closes act
// silently; without it the dialog asks again on the next close.
ipcMain.handle('first-close-choice', (_e, action, remember) => {
  if (action !== 'tray' && action !== 'quit') return false;
  if (remember) {
    const app = Object.assign({}, loadSettings().app, {
      closeChoiceMade: true,
      closeToTray: action === 'tray'
    });
    saveSettings({ app });
  }

  if (action === 'tray') {
    // Hiding needs the tray icon to exist so the window can be brought back
    if (!tray) createTray();
    hideToTray();
    return true;
  }
  isQuitting = true;
  quitRequested = true;
  app.quit();
  return true;
});
ipcMain.on('win-devtools', () => {
  // DevTools only outside packaged builds
  if (!app.isPackaged && win && !win.isDestroyed()) {
    win.webContents.openDevTools();
  }
});

ipcMain.handle('youtube:open', async (event, id, value, bounds) => {
  if (!youtubePlayer?.accepts(event)) return { ok: false };
  try { return { ok: await youtubePlayer.open(id, value, bounds) }; }
  catch (_) { return { ok: false }; }
});
ipcMain.on('youtube:resize', (event, id, bounds) => { if (youtubePlayer?.accepts(event)) youtubePlayer.resize(id, bounds); });
ipcMain.on('youtube:command', (event, id, value) => { if (youtubePlayer?.accepts(event)) youtubePlayer.command(id, value); });
ipcMain.on('youtube:close', (event, id) => { if (youtubePlayer?.accepts(event)) youtubePlayer.close(id); });
ipcMain.on('youtube:state', (event, value) => youtubePlayer?.report(event, value));

ipcMain.handle('win-set-fullscreen', (event, flag) => {
  if (!win || win.isDestroyed()) return false;
  const want = !!flag;
  try {
    if (win.isFullScreen() === want) return want;
    win.setFullScreen(want);
    return win.isFullScreen();
  } catch (e) {
    console.error('setFullScreen failed:', e);
    return false;
  }
});

ipcMain.handle('win-is-fullscreen', () => {
  if (!win || win.isDestroyed()) return false;
  try {
    return !!win.isFullScreen();
  } catch (_) {
    return false;
  }
});

ipcMain.handle('open-file-dialog', async () => {
  const lang = getUiLang();
  const result = await dialog.showOpenDialog(win, {
    title: tMenu('dialog_open_title', lang),
    filters: [
      {
        name: tMenu('dialog_open_filter_media', lang),
        extensions: [...MEDIA_EXTS].map(ext => ext.slice(1))
      },
      { name: tMenu('dialog_open_filter_all', lang), extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled || !result.filePaths.length) return null;
  for (const filePath of result.filePaths) pathAllowlist.allowMediaFile(filePath);
  return result.filePaths;
});

/**
 * Resolve first image in a directory (natural sort) and allowlist it.
 * @param {string} dirPath
 * @returns {Promise<{ok:boolean, path?:string, dir?:string, count?:number, empty?:boolean, error?:string}>}
 */
async function resolveFirstImageInDir(dirPath) {
  try {
    const dir = path.resolve(dirPath);
    let st;
    try {
      st = await fs.promises.stat(dir);
    } catch (_) {
      return { ok: false, error: 'NOT_FOUND' };
    }
    if (!st.isDirectory()) return { ok: false, error: 'NOT_DIR' };

    const files = await fs.promises.readdir(dir);
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const imageNames = files
      .filter((f) => MEDIA_EXTS.has(path.extname(f).toLowerCase()))
      .sort((a, b) => collator.compare(a, b));

    if (!imageNames.length) {
      return { ok: false, empty: true, dir };
    }

    for (const name of imageNames) {
      const fullPath = path.resolve(dir, name);
      try {
        const fst = await fs.promises.stat(fullPath);
        if (!fst.isFile()) continue;
        const allowed = pathAllowlist.allowMediaFile(fullPath);
        if (!allowed) continue;
        return { ok: true, path: allowed, dir, count: imageNames.length };
      } catch (_) { /* skip */ }
    }
    return { ok: false, empty: true, dir };
  } catch (e) {
    console.error('resolveFirstImageInDir failed:', e);
    return { ok: false, error: e.message || 'OPEN_FOLDER_FAILED' };
  }
}

/**
 * Pick a folder, find the first image (natural sort), allowlist it, return its path.
 * Renderer then uses existing scan-folder from that image.
 */
ipcMain.handle('open-folder-dialog', async () => {
  const lang = getUiLang();
  const result = await dialog.showOpenDialog(win, {
    title: tMenu('dialog_open_folder_title', lang),
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true };
  }
  return resolveFirstImageInDir(result.filePaths[0]);
});

/** Open a known folder path (recent folders) without a dialog. */
ipcMain.handle('open-folder-path', async (event, dirPath) => {
  if (!dirPath || typeof dirPath !== 'string') {
    return { ok: false, error: 'BAD_PATH' };
  }
  return resolveFirstImageInDir(dirPath);
});

ipcMain.handle('get-settings', () => {
  const settings = loadSettings();
  // Manual launch (opened from the icon/shortcut without a file argument) always
  // starts with the sidebar closed, ignoring the state persisted from the previous
  // session. Instances launched to open an image keep their own startup behavior.
  if (!instanceHasInitialFile && settings.app) {
    settings.app.sidebarOpen = false;
  }
  return settings;
});
ipcMain.handle('get-version', () => app.getVersion());
// Diagnostics snapshot for the About modal's copy button (CyberFeeds pattern)
ipcMain.handle('get-diagnostics', () => ({
  app: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  osRelease: os.release(),
  osType: os.type(),
  portable: isPortableBuild()
}));
ipcMain.handle('open-data-folder', async () => {
  try {
    const dataPath = app.getPath('userData');
    const error = await shell.openPath(dataPath);
    return error ? { ok: false, error } : { ok: true, path: dataPath };
  } catch (e) {
    console.error('Error abriendo la carpeta de datos:', e);
    return { ok: false, error: e.message || 'OPEN_DATA_FOLDER_FAILED' };
  }
});
ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(win, options);
  if (!result.canceled && result.filePath) {
    pathAllowlist.allow(result.filePath);
  }
  return result;
});

const SETTINGS_BACKUP_MAX_BYTES = 2 * 1024 * 1024;

ipcMain.handle('settings:export-backup', async (_event, appSettings) => {
  const lang = getUiLang();
  const result = await dialog.showSaveDialog(win, {
    title: tMenu('dialog_export_settings_title', lang),
    defaultPath: 'CyberViewer-settings.json',
    filters: [
      { name: tMenu('dialog_settings_filter', lang), extensions: ['json'] },
      { name: tMenu('dialog_save_filter_all', lang), extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    const current = loadSettings();
    const appData = (appSettings && typeof appSettings === 'object')
      ? { ...current.app, ...appSettings }
      : current.app;
    const backup = buildBackup(appData, { appVersion: app.getVersion() });
    fs.writeFileSync(result.filePath, JSON.stringify(backup, null, 2), 'utf8');
    return { ok: true, path: result.filePath };
  } catch (e) {
    return { ok: false, error: e.message || 'WRITE_FAILED' };
  }
});

ipcMain.handle('settings:import-backup', async () => {
  const lang = getUiLang();
  const result = await dialog.showOpenDialog(win, {
    title: tMenu('dialog_import_settings_title', lang),
    filters: [
      { name: tMenu('dialog_settings_filter', lang), extensions: ['json'] },
      { name: tMenu('dialog_open_filter_all', lang), extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  const filePath = result.filePaths[0];
  try {
    const st = await fs.promises.stat(filePath);
    if (!st.isFile() || st.size > SETTINGS_BACKUP_MAX_BYTES) {
      return { ok: false, error: 'INVALID_FILE' };
    }
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const parsed = parseBackup(raw);
    if (!parsed.ok) return parsed;
    return { ok: true, settings: parsed.settings, favorites: parsed.favorites };
  } catch (e) {
    return { ok: false, error: e.message || 'READ_FAILED' };
  }
});

// ── Automatic scheduled backups ──
// Mirrors the CyberFeeds auto-backup model, hardened with the shared, sanitized
// backup format, corruption-flagged listings, and a safety snapshot taken
// before every restore so a restore is always reversible.

const AUTO_BACKUP_MAX_READ_BYTES = 2 * 1024 * 1024;

let autoBackupTimer = null;
let isAutoBackingUp = false;

function getDefaultBackupDirectory() {
  return path.join(app.getPath('userData'), 'backups');
}

/** Custom directory when configured and usable, otherwise the default one. */
function getResolvedBackupDirectory() {
  const settings = loadSettings();
  const custom = autoBackup.pickAutoBackupSettings(settings.app.autoBackup).customPath;
  if (custom) {
    try {
      if (!fs.existsSync(custom)) fs.mkdirSync(custom, { recursive: true });
      return custom;
    } catch (err) {
      console.error('[AutoBackup] Custom backup path unusable, using default:', err);
    }
  }
  const defaultDir = getDefaultBackupDirectory();
  try {
    if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });
  } catch (err) {
    console.error('[AutoBackup] Error creating default backup directory:', err);
  }
  return defaultDir;
}

function readBackupEntry(dir, filename) {
  let stats;
  try {
    stats = fs.statSync(path.join(dir, filename));
  } catch (_) {
    return null;
  }
  const info = autoBackup.makeBackupInfo(dir, filename, stats);
  // Flag unreadable/oversized/corrupt files so the UI can disable their restore.
  info.valid = true;
  if (stats.size > AUTO_BACKUP_MAX_READ_BYTES) {
    info.valid = false;
  } else {
    try {
      info.valid = parseBackup(fs.readFileSync(path.join(dir, filename), 'utf-8')).ok;
    } catch (_) {
      info.valid = false;
    }
  }
  return info;
}

async function performAutoBackup(trigger = 'manual', opts = {}) {
  if (isAutoBackingUp) return { ok: false, error: 'Backup in progress' };
  isAutoBackingUp = true;
  try {
    const settings = loadSettings();
    const ab = autoBackup.pickAutoBackupSettings(settings.app.autoBackup);
    const targetDir = getResolvedBackupDirectory();
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const filename0 = autoBackup.formatBackupFilename(new Date());
    let finalPath = path.join(targetDir, filename0);
    // Filenames have second resolution: wait for the next second if a backup
    // already owns this name (e.g. a safety snapshot right after a manual run).
    for (let attempt = 0; attempt < 5 && fs.existsSync(finalPath); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      finalPath = path.join(targetDir, autoBackup.formatBackupFilename(new Date()));
    }
    if (fs.existsSync(finalPath)) return { ok: false, error: 'FILENAME_COLLISION' };
    const filename = path.basename(finalPath);
    const tmpPath = path.join(targetDir, `${filename}.tmp`);

    const data = buildBackup(settings.app, { appVersion: app.getVersion() });
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, finalPath);

    const updatedSettings = {
      ...settings,
      app: {
        ...settings.app,
        autoBackup: { ...ab, lastBackupTime: Date.now() }
      }
    };
    saveSettings(updatedSettings);

    // Protected paths (e.g. the file being restored) survive this prune pass.
    const protectedPaths = new Set(Array.isArray(opts.keepPaths) ? opts.keepPaths.filter(Boolean) : []);
    pruneOldBackups(targetDir, ab.maxBackups, protectedPaths);

    console.log(`[AutoBackup] Backup completed (${trigger}): ${finalPath}`);
    return { ok: true, filePath: finalPath };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[AutoBackup] Error performing backup:', errorMsg);
    return { ok: false, error: errorMsg };
  } finally {
    isAutoBackingUp = false;
  }
}

function pruneOldBackups(dir, maxBackups, protectedPaths = new Set()) {
  try {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter(autoBackup.isBackupFilename);
    const entries = files
      .map((file) => {
        try {
          const stats = fs.statSync(path.join(dir, file));
          return autoBackup.makeBackupInfo(dir, file, stats);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
    const sorted = autoBackup.sortBackupsNewestFirst(entries);
    const toPrune = autoBackup.selectBackupsToPrune(sorted, maxBackups)
      .filter((item) => !protectedPaths.has(item.filePath));
    for (const item of toPrune) {
      try {
        fs.unlinkSync(item.filePath);
        console.log(`[AutoBackup] Pruned old backup file: ${item.filename}`);
      } catch (err) {
        console.error(`[AutoBackup] Failed to prune file ${item.filename}:`, err);
      }
    }
  } catch (err) {
    console.error('[AutoBackup] Error during backup pruning:', err);
  }
}

async function checkAndRunScheduledBackup(isStartup = false) {
  const settings = loadSettings();
  const now = Date.now();
  if (!autoBackup.shouldRunBackup(settings.app.autoBackup, now, isStartup)) return;
  await performAutoBackup(isStartup ? 'startup' : 'scheduled');
}

async function listAutoBackups() {
  try {
    const dir = getResolvedBackupDirectory();
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(autoBackup.isBackupFilename);
    const list = files.map((file) => readBackupEntry(dir, file)).filter(Boolean);
    return autoBackup.sortBackupsNewestFirst(list);
  } catch (err) {
    console.error('[AutoBackup] Failed to list auto backups:', err);
    return [];
  }
}

/**
 * Restore an auto backup file. Before applying anything, a safety snapshot of
 * the current state is written; if that fails the restore is aborted so the
 * operation stays reversible. Returns parsed settings for the renderer to apply
 * through the same path as a manual import.
 */
async function restoreAutoBackup(filePath) {
  try {
    const dir = getResolvedBackupDirectory();
    if (!autoBackup.isPathInside(dir, filePath)) {
      return { ok: false, error: 'OUTSIDE_BACKUP_DIR' };
    }
    const st = await fs.promises.stat(filePath);
    if (!st.isFile() || st.size > AUTO_BACKUP_MAX_READ_BYTES) {
      return { ok: false, error: 'INVALID_FILE' };
    }
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = parseBackup(raw);
    if (!parsed.ok) return parsed;

    const safety = await performAutoBackup('pre-restore', { keepPaths: [filePath] });
    if (!safety.ok) return { ok: false, error: 'SAFETY_BACKUP_FAILED' };

    console.log(`[AutoBackup] Restoring backup: ${filePath}`);
    return { ok: true, settings: parsed.settings, favorites: parsed.favorites };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[AutoBackup] Error restoring backup:', msg);
    return { ok: false, error: msg };
  }
}

async function deleteAutoBackup(filePath) {
  try {
    const dir = getResolvedBackupDirectory();
    if (!autoBackup.isPathInside(dir, filePath)) {
      return { ok: false, error: 'OUTSIDE_BACKUP_DIR' };
    }
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[AutoBackup] Error deleting backup:', msg);
    return { ok: false, error: msg };
  }
}

function initAutoBackup() {
  rescheduleAutoBackup();
  // Startup check: give the window time to settle before writing files.
  setTimeout(() => {
    void checkAndRunScheduledBackup(true);
  }, 10000);
}

function rescheduleAutoBackup() {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
  // Hourly check; the frequency decision itself lives in shouldRunBackup.
  autoBackupTimer = setInterval(() => {
    void checkAndRunScheduledBackup(false);
  }, 60 * 60 * 1000);
}

ipcMain.handle('auto-backup:dir', async () => {
  const settings = loadSettings();
  const ab = autoBackup.pickAutoBackupSettings(settings.app.autoBackup);
  return { ok: true, dir: getResolvedBackupDirectory(), custom: !!ab.customPath };
});

ipcMain.handle('auto-backup:list', async () => {
  const list = await listAutoBackups();
  return { ok: true, backups: list, ...autoBackup.summarizeBackups(list) };
});

ipcMain.handle('auto-backup:run', async () => {
  return performAutoBackup('manual-trigger');
});

ipcMain.handle('auto-backup:pick-folder', async () => {
  const lang = getUiLang();
  const result = await dialog.showOpenDialog(win, {
    title: tMenu('dialog_backup_pick_folder_title', lang),
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  return { ok: true, path: result.filePaths[0] };
});

ipcMain.handle('auto-backup:open-folder', async () => {
  const dir = getResolvedBackupDirectory();
  const error = await shell.openPath(dir);
  return error ? { ok: false, error } : { ok: true, dir };
});

ipcMain.handle('auto-backup:restore', async (_event, filePath) => {
  return restoreAutoBackup(filePath);
});

ipcMain.handle('auto-backup:delete', async (_event, filePath) => {
  return deleteAutoBackup(filePath);
});

// ── Print / PDF export (Chromium engine, no native deps) ──
// The renderer bakes the current image (rotation) to a PNG data URL, then
// asks the main process to render it in a hidden window and call the native
// print/PrintToPDF path. v1 is single-page fit; never upscales small images.

async function loadPrintWindow(html) {
  const printWin = new BrowserWindow({
    width: 800, height: 600, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });

  // Do not put the whole image-backed HTML into a data: URL. Large photos become
  // huge base64 strings and can exceed Chromium URL limits, causing PDF export to
  // fail before printToPDF runs. A temporary file keeps the navigation URL small.
  const tmpHtmlPath = path.join(
    app.getPath('temp'),
    'cyberviewer-print-' + process.pid + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.html'
  );
  try {
    fs.writeFileSync(tmpHtmlPath, html, 'utf8');
    await printWin.loadURL(pathToFileURL(tmpHtmlPath).toString());
    await printWin.webContents.executeJavaScript(`
      Promise.all(Array.from(document.images).map((img) => {
        if (img.complete && img.naturalWidth > 0) return true;
        return new Promise((resolve, reject) => {
          img.onload = () => resolve(true);
          img.onerror = () => reject(new Error('Image failed to load for print/PDF'));
        });
      }))
    `, true);
  } finally {
    try { fs.unlinkSync(tmpHtmlPath); } catch (_) { /* best-effort temp cleanup */ }
  }
  return printWin;
}

ipcMain.handle('export-image-pdf', async (event, { dataUrl, width, height, title, options, savePath }) => {
  try {
    if (!dataUrl) return { success: false, error: 'No image data' };

    let targetPath = savePath;
    if (!targetPath) {
      const lang = getUiLang();
      const t = menuI18n[lang] || menuI18n.en;
      const baseName = (title || 'image').replace(/[\\/:*?"<>|]/g, '_');
      const result = await dialog.showSaveDialog(win, {
        title: t.export_pdf || 'Export PDF',
        defaultPath: baseName + '.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      targetPath = result.filePath;
    }

    const printOpts = CVMedia.resolveExportOptions(options, width, height, 'pdf');
    const html = CVMedia.bakePrintHtml(dataUrl, width, height, title);
    const printWin = await loadPrintWindow(html);
    let pdfBuffer;
    try {
      pdfBuffer = await printWin.webContents.printToPDF(printOpts);
    } finally {
      if (!printWin.isDestroyed()) printWin.destroy();
    }

    const tmpPath = targetPath + '.cybertmp.' + Date.now();
    fs.writeFileSync(tmpPath, pdfBuffer);
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    fs.renameSync(tmpPath, targetPath);
    pathAllowlist.allow(targetPath);
    return { success: true, filePath: targetPath };
  } catch (e) {
    console.error('export-image-pdf error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('print-image', async (event, { dataUrl, width, height, title, options }) => {
  try {
    if (!dataUrl) return { success: false, error: 'No image data' };
    const printOpts = CVMedia.resolveExportOptions(options, width, height, 'print');
    const html = CVMedia.bakePrintHtml(dataUrl, width, height, title);
    const printWin = await loadPrintWindow(html);
    const printResult = await new Promise((resolve) => {
      printWin.webContents.print(printOpts, (success, failureReason) => {
        resolve({ success, failureReason });
      });
    });
    if (!printWin.isDestroyed()) printWin.destroy();
    if (!printResult.success && printResult.failureReason && printResult.failureReason !== 'canceled') {
      console.error('print-image failed:', printResult.failureReason);
      return { success: false, error: printResult.failureReason };
    }
    if (win && !win.isDestroyed()) win.focus();
    return { success: true };
  } catch (e) {
    console.error('print-image error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-monitors', () => {
  const lang = getUiLang();
  const primaryId = screen.getPrimaryDisplay().id;
  const primaryPrefix = tMenu('monitor_primary', lang);
  const monLabel = tMenu('monitor_label', lang);
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: `${d.id === primaryId ? primaryPrefix : ''}${monLabel.replace('{id}', String(d.id))}`,
    bounds: d.bounds
  }));
});

ipcMain.handle('to-media-url', (event, filePath) => {
  try {
    const abs = resolveAllowedPath(filePath);
    return toMediaUrl(abs);
  } catch (e) {
    return null;
  }
});

/** Register existing supported media files (widens allowlist to their parent dirs). */
ipcMain.handle('register-paths', (event, paths) => {
  try {
    if (!Array.isArray(paths)) return { success: false, registered: [] };
    const registered = [];
    const max = 5000;
    for (let i = 0; i < paths.length && registered.length < max; i++) {
      const p = paths[i];
      if (!p) continue;
      const abs = pathAllowlist.allowMediaFile(p);
      if (abs) registered.push(abs);
    }
    return { success: true, registered, count: registered.length };
  } catch (e) {
    return { success: false, error: e.message, registered: [] };
  }
});

/** Default directory for saving pasted images (no dialog). Allowlist it so save-image
    can write files there without a per-file prompt. Falls back to app data on error. */
ipcMain.handle('get-default-save-dir', () => {
  try {
    const dir = app.getPath('pictures');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* ignore */ }
    pathAllowlist.allow(dir);
    return dir;
  } catch (e) {
    const fallback = app.getPath('userData');
    pathAllowlist.allow(fallback);
    return fallback;
  }
});

ipcMain.handle('scan-folder', async (event, filePath) => {
  try {
    const absFile = cleanFsPath(filePath);
    // Only scan neighbors of an existing supported media file.
    if (!isExistingMediaFile(absFile)) {
      return [];
    }
    pathAllowlist.allow(absFile);
    const dir = path.dirname(absFile);

    // withFileTypes returns Dirent entries whose isFile() needs no extra stat,
    // so we skip one syscall per directory entry vs the bare-name path.
    const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

    const imageDirents = dirents
      .filter((d) => (d.isFile() || d.isSymbolicLink()) && MEDIA_EXTS.has(path.extname(d.name).toLowerCase()))
      .sort((a, b) => collator.compare(a.name, b.name));

    // Stat in parallel for sizes — the old serial await-per-file loop serialized N
    // syscalls on the main event loop; Promise.all fans them out via libuv's pool.
    const results = await Promise.all(imageDirents.map(async (d) => {
      const fullPath = path.resolve(dir, d.name);
      try {
        const stats = await fs.promises.stat(fullPath); // follows symlinks
        if (!stats.isFile()) return null;
        return { path: fullPath, size: stats.size };
      } catch (_) {
        return null; // skip unreadable
      }
    }));
    return results.filter(Boolean);
  } catch (e) {
    console.error('Error escaneando carpeta:', e);
    return [];
  }
});

const thumbCachePath = path.join(app.getPath('userData'), 'thumb_cache');
if (!fs.existsSync(thumbCachePath)) fs.mkdirSync(thumbCachePath, { recursive: true });
pathAllowlist.allow(thumbCachePath);

ipcMain.handle('clear-thumbnail-cache', () => {
  try {
    return { ok: true, ...clearThumbCache(thumbCachePath) };
  } catch (e) {
    console.error('Error limpiando la caché de miniaturas:', e);
    return { ok: false, error: e.message || 'CLEAR_THUMB_CACHE_FAILED' };
  }
});

/**
 * Limit concurrent nativeImage thumb work to avoid CPU spikes on large folders.
 * Priority waiters (current image) jump the queue so the open image is never
 * stuck behind dozens of sibling thumbnails.
 */
const THUMB_CONCURRENCY = 3;
let thumbInFlight = 0;
/** @type {{ resolve: () => void, priority: boolean }[]} */
const thumbWaiters = [];

let evictTimer = null;
function scheduleThumbCacheEviction() {
  if (evictTimer) return;
  evictTimer = setTimeout(() => {
    evictTimer = null;
    try {
      evictThumbCache(thumbCachePath);
    } catch (_) {}
  }, 10000);
}

function acquireThumbSlot(priority) {
  if (thumbInFlight < THUMB_CONCURRENCY) {
    thumbInFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const entry = { resolve, priority: !!priority };
    if (entry.priority) {
      // Ahead of the first non-priority waiter (preserve FIFO among priorities)
      let insertAt = 0;
      while (insertAt < thumbWaiters.length && thumbWaiters[insertAt].priority) {
        insertAt++;
      }
      thumbWaiters.splice(insertAt, 0, entry);
    } else {
      thumbWaiters.push(entry);
    }
  }).then(() => {
    thumbInFlight++;
  });
}

function releaseThumbSlot() {
  thumbInFlight = Math.max(0, thumbInFlight - 1);
  const next = thumbWaiters.shift();
  if (next) next.resolve();
}

async function renderBrowserImageThumb(abs, cacheFile) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#000;overflow:hidden;width:160px;height:120px}
    img{position:absolute;left:0;top:0;max-width:none;opacity:0}
    canvas{position:absolute;left:0;top:0;width:160px;height:120px}
  </style></head><body><img id="src"><canvas id="canvas" width="160" height="120"></canvas><script>
    const done = (payload) => window.__thumbDone = payload;
    const img = document.getElementById('src');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    img.onload = () => {
      try {
        const scale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const x = Math.floor((canvas.width - w) / 2);
        const y = Math.floor((canvas.height - h) / 2);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, x, y, w, h);
        done({ ok: true, dataUrl: canvas.toDataURL('image/jpeg', 0.8) });
      } catch (e) {
        done({ ok: false, error: e.message });
      }
    };
    img.onerror = () => done({ ok: false, error: 'Image frame failed to load' });
    img.src = ${JSON.stringify(pathToFileURL(abs).toString())};
  </script></body></html>`;

  const frameWin = new BrowserWindow({
    width: 160,
    height: 120,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: false, webSecurity: false }
  });
  try {
    await frameWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const result = await frameWin.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          if (window.__thumbDone) return resolve(window.__thumbDone);
          if (Date.now() - start > 5000) return resolve({ ok: false, error: 'Image frame timeout' });
          setTimeout(tick, 30);
        };
        tick();
      })
    `, true);
    if (!result || !result.ok || !result.dataUrl) return false;
    const base64 = String(result.dataUrl).split(',')[1];
    if (!base64) return false;
    await fs.promises.writeFile(cacheFile, Buffer.from(base64, 'base64'));
    return true;
  } finally {
    if (!frameWin.isDestroyed()) frameWin.destroy();
  }
}

async function renderVideoThumb(abs, cacheFile) {
  const frameWin = new BrowserWindow({
    width: 160, height: 100, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false }
  });
  try {
    await frameWin.loadFile(path.join(__dirname, 'assets', 'video-thumbnail.html'));
    const dataUrl = await frameWin.webContents.executeJavaScript(`window.renderVideoThumbnail(${JSON.stringify(toMediaUrl(abs))})`);
    if (!dataUrl || !dataUrl.startsWith('data:image/jpeg;base64,')) return false;
    await fs.promises.writeFile(cacheFile, Buffer.from(dataUrl.split(',')[1], 'base64'));
    return true;
  } finally { if (!frameWin.isDestroyed()) frameWin.destroy(); }
}

ipcMain.handle('get-thumbnail', async (event, filePath, opts) => {
  try {
    const abs = resolveAllowedPath(filePath);
    const priority = !!(opts && opts.priority);
    const stats = await fs.promises.stat(abs);
    const normalizedPath = abs.toLowerCase();
    const ext = path.extname(abs).toLowerCase();
    const isGif = ext === '.gif';
    const isAvif = ext === '.avif';
    const isVideo = isVideoPath(abs);
    const thumbVersion = isVideo ? 'video-frame-v1' : isGif ? 'gif-frame-v2' : isAvif ? 'avif-browser-v1' : 'still-v1';
    const hash = crypto.createHash('md5').update(normalizedPath + stats.mtimeMs + thumbVersion).digest('hex');
    const cacheFile = path.join(thumbCachePath, `${hash}.jpg`);

    // Cache hits never wait on the generation queue
    if (fs.existsSync(cacheFile)) {
      return toMediaUrl(cacheFile);
    }

    await acquireThumbSlot(priority);
    try {
      if (fs.existsSync(cacheFile)) {
        return toMediaUrl(cacheFile);
      }
      if (isVideo) {
        if (!await renderVideoThumb(abs, cacheFile)) return null;
      } else if ((isGif || isAvif) && await renderBrowserImageThumb(abs, cacheFile)) {
        // Browser-decoded formats use a static thumbnail so animated sources
        // do not keep repainting the sidebar. Chromium also provides the AVIF
        // decoder that nativeImage does not guarantee across platforms.
      } else {
        let thumb = null;
        if (typeof nativeImage.createThumbnailFromPath === 'function') {
          try {
            thumb = await nativeImage.createThumbnailFromPath(abs, { width: 160, height: 100 });
          } catch (_) {
            thumb = null;
          }
        }
        if (!thumb || thumb.isEmpty()) {
          const img = nativeImage.createFromPath(abs);
          if (img.isEmpty()) return null;
          thumb = img.resize({ height: 100, quality: 'good' });
        }
        await fs.promises.writeFile(cacheFile, thumb.toJPEG(80));
      }
      scheduleThumbCacheEviction();
      return toMediaUrl(cacheFile);
    } finally {
      releaseThumbSlot();
    }
  } catch (e) {
    return null;
  }
});

ipcMain.handle('save-image', async (event, { filePath, rotation, buffer, createCopy, copySuffix }) => {
  try {
    if (!filePath) return { success: false, error: 'Ruta no proporcionada' };

    const cleanPath = resolveAllowedPath(filePath);
    if (isVideoPath(cleanPath)) return { success: false, error: tMenu('video_edit_unsupported', getUiLang()) };
    let targetPath = cleanPath;

    if (createCopy) {
      const dir = path.dirname(cleanPath);
      const ext = path.extname(cleanPath);
      const base = path.basename(cleanPath, ext);
      const suffix = (typeof copySuffix === 'string' && copySuffix) ? copySuffix : '_resized';
      let candidate = path.join(dir, `${base}${suffix}${ext}`);
      let counter = 1;
      while (fs.existsSync(candidate)) {
        counter++;
        candidate = path.join(dir, `${base}${suffix} (${counter})${ext}`);
      }
      targetPath = candidate;
      pathAllowlist.allow(targetPath);
    }

    let dataToWrite;
    if (buffer) {
      dataToWrite = Buffer.from(buffer, 'base64');
    } else {
      let img = nativeImage.createFromPath(cleanPath);
      if (img.isEmpty()) {
        try {
          const raw = fs.readFileSync(cleanPath);
          img = nativeImage.createFromBuffer(raw);
        } catch (e) {
          return { success: false, error: `No se pudo leer la imagen: ${e.message}` };
        }
      }
      if (img.isEmpty()) {
        return { success: false, error: 'Formato de imagen no soportado por el motor nativo' };
      }
      const times = Math.floor((rotation || 0) / 90);
      for (let i = 0; i < times; i++) img = img.rotate(90);
      const ext = path.extname(targetPath).toLowerCase();
      dataToWrite = (ext === '.png') ? img.toPNG() : img.toJPEG(95);
    }

    const tmpPath = targetPath + '.cybertmp.' + Date.now();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const dir = path.dirname(targetPath);
        try {
          fs.accessSync(dir, fs.constants.W_OK);
        } catch (e) {
          return { success: false, error: `No hay permisos de escritura en: ${dir}` };
        }

        fs.writeFileSync(tmpPath, dataToWrite);
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        fs.renameSync(tmpPath, targetPath);
        return { success: true, filePath: targetPath };
      } catch (e) {
        console.warn(`Save retry ${attempt + 1} failed:`, e.message);
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return { success: false, error: 'No se pudo escribir el archivo (archivo en uso o permisos insuficientes)' };
  } catch (e) {
    if (e.code === 'PATH_NOT_ALLOWED') {
      return { success: false, error: 'Ruta no permitida' };
    }
    console.error('save-image error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.on('copy-image', (event, filePath) => {
  try {
    const cleanPath = resolveAllowedPath(filePath);
    fs.readFile(cleanPath, (err, data) => {
      if (err) {
        console.error('Failed to read file for clipboard:', err);
        return;
      }
      const img = nativeImage.createFromBuffer(data);
      if (!img.isEmpty()) clipboard.writeImage(img);
    });
  } catch (e) {
    console.error('Error copying image to clipboard:', e);
  }
});

ipcMain.on('copy-image-buffer', (event, base64) => {
  try {
    if (!base64 || typeof base64 !== 'string') return;
    const img = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'));
    if (!img.isEmpty()) clipboard.writeImage(img);
  } catch (e) {
    console.error('Error copying image buffer to clipboard:', e);
  }
});

ipcMain.handle('clipboard:read-image', () => {
  try {
    const img = clipboard.readImage();
    if (!img || img.isEmpty()) {
      return { ok: false, error: 'NO_IMAGE' };
    }
    const size = img.getSize();
    return {
      ok: true,
      buffer: img.toPNG().toString('base64'),
      width: size.width,
      height: size.height,
      mime: 'image/png'
    };
  } catch (e) {
    console.error('Error reading clipboard image:', e);
    return { ok: false, error: String((e && e.message) || e) };
  }
});

async function trashFile(filePath) {
  const abs = resolveAllowedPath(filePath);
  await shell.trashItem(abs);
  return { success: true };
}

ipcMain.handle('move-to-trash', async (event, filePath) => {
  try {
    return await trashFile(filePath);
  } catch (e) {
    console.error('Error moving file to trash:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.on('show-item-in-folder', (event, filePath) => {
  try {
    if (!filePath) return;
    const abs = resolveAllowedPath(filePath);
    if (fs.existsSync(abs)) shell.showItemInFolder(abs);
  } catch (e) {
    console.error('Error showing item in folder:', e);
  }
});

ipcMain.handle('open-containing-folder', async (event, filePath) => {
  try {
    if (!filePath) return { success: false, error: 'BAD_PATH' };
    const abs = resolveAllowedPath(filePath);
    const dir = path.dirname(abs);
    if (!fs.existsSync(dir)) return { success: false, error: 'FOLDER_NOT_FOUND' };
    const error = await shell.openPath(dir);
    return error ? { success: false, error } : { success: true };
  } catch (e) {
    console.error('Error opening containing folder:', e);
    return { success: false, error: e.message || 'OPEN_FOLDER_FAILED' };
  }
});

let propertiesScriptWritten = false;
function openNativeProperties(rawPath) {
  try {
    const absolutePath = resolveAllowedPath(rawPath);
    const folderPath = path.dirname(absolutePath).replace(/\//g, '\\');
    const fileName = path.basename(absolutePath);
    const propsWsfPath = path.join(app.getPath('temp'), 'cyberviewer_properties.wsf');
    const wsfContent = `<?xml version="1.0" encoding="utf-8" ?>
<package>
   <job id="GetProperties">
      <script language="VBScript">
         <![CDATA[
         If WScript.Arguments.Count >= 2 Then
            Set objShell = CreateObject("Shell.Application")
            Set objFolder = objShell.NameSpace(WScript.Arguments(0))
            If Not objFolder Is Nothing Then
               Set objFolderItem = objFolder.ParseName(WScript.Arguments(1))
               If Not objFolderItem Is Nothing Then
                  objFolderItem.InvokeVerb "Properties"
                  WScript.Sleep 1800000
               End If
            End If
         End If
         ]]>
      </script>
   </job>
</package>`;
    if (!propertiesScriptWritten || !fs.existsSync(propsWsfPath)) {
      fs.writeFileSync(propsWsfPath, wsfContent, 'utf-8');
      propertiesScriptWritten = true;
    }
    execFile('wscript.exe', [propsWsfPath, folderPath, fileName]);
  } catch (e) {
    console.error('Error opening file properties via WSF:', e);
  }
}

ipcMain.on('open-native-properties', (event, filePath) => {
  if (filePath) openNativeProperties(filePath);
});

let wallpaperScriptWritten = false;
async function setDesktopWallpaper(filePath, style = 'fill') {
  try {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Platform not supported' };
    }
    const cleanPath = resolveAllowedPath(filePath);
    if (!fs.existsSync(cleanPath)) {
      return { success: false, error: 'File not found' };
    }

    const styleMap = {
      'fill': '10',
      'fit': '6',
      'center': '0',
      'span': '22',
      'stretch': '2'
    };
    const styleCode = styleMap[style] || '10';

    const ext = path.extname(cleanPath).toLowerCase();
    let targetPath = cleanPath;
    if (!['.jpg', '.jpeg', '.png', '.bmp'].includes(ext)) {
      let img = nativeImage.createFromPath(cleanPath);
      if (img.isEmpty()) {
        const raw = fs.readFileSync(cleanPath);
        img = nativeImage.createFromBuffer(raw);
      }
      if (img.isEmpty()) {
        return { success: false, error: 'Unable to process image format' };
      }
      const cachePath = path.join(app.getPath('userData'), 'wallpaper_cache.png');
      fs.writeFileSync(cachePath, img.toPNG());
      targetPath = cachePath;
    }

    const scriptPath = path.join(app.getPath('userData'), 'set_wallpaper.ps1');
    const psScriptContent = `param(
    [Parameter(Mandatory=$true)][string]$ImagePath,
    [string]$Style = "10"
)
$ErrorActionPreference = 'Stop'
Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'WallpaperStyle' -Value $Style
Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'TileWallpaper' -Value '0'
$code = @'
using System;
using System.Runtime.InteropServices;
public class WallpaperHelper {
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
}
'@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
[WallpaperHelper]::SystemParametersInfo(0x0014, 0, $ImagePath, 0x01 -bor 0x02)
`;

    if (!wallpaperScriptWritten || !fs.existsSync(scriptPath)) {
      fs.writeFileSync(scriptPath, psScriptContent, 'utf-8');
      wallpaperScriptWritten = true;
    }

    return await new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath, targetPath, styleCode],
        { windowsHide: true },
        (err) => {
          if (err) {
            console.error('Failed to set wallpaper:', err);
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        }
      );
    });
  } catch (err) {
    console.error('Error setting desktop wallpaper:', err);
    return { success: false, error: err.message };
  }
}

ipcMain.handle('set-wallpaper', (event, filePath, style) => setDesktopWallpaper(filePath, style));

// Set the wallpaper from in-memory image bytes (e.g. an image pasted from the
// clipboard or dropped from a browser, which has no file on disk): the bytes
// are materialized to the wallpaper cache in userData and applied from there,
// reusing setDesktopWallpaper (which converts unsupported formats to PNG).
const WALLPAPER_CACHE_EXTS = ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'gif'];
const WALLPAPER_DATA_MAX_BYTES = 32 * 1024 * 1024;
ipcMain.handle('set-wallpaper-data', (event, dataBase64, ext, style) => {
  const cleanExt = String(ext || '').toLowerCase().replace(/^\./, '');
  if (!WALLPAPER_CACHE_EXTS.includes(cleanExt)) {
    return { success: false, error: 'Unsupported image format' };
  }
  if (typeof dataBase64 !== 'string' || !dataBase64) {
    return { success: false, error: 'Invalid image data' };
  }
  // base64 inflates by ~4/3; reject oversized payloads before decoding
  if (Math.floor((dataBase64.length * 3) / 4) > WALLPAPER_DATA_MAX_BYTES) {
    return { success: false, error: 'Image too large' };
  }
  try {
    const buffer = Buffer.from(dataBase64, 'base64');
    if (!buffer.length) return { success: false, error: 'Invalid image data' };
    const cachePath = path.join(app.getPath('userData'), `wallpaper_cache.${cleanExt}`);
    fs.writeFileSync(cachePath, buffer);
    pathAllowlist.allow(cachePath);
    return setDesktopWallpaper(cachePath, style);
  } catch (err) {
    console.error('Error materializing wallpaper image:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('get-file-info', (event, filePath) => {
  try {
    const stats = fs.statSync(resolveAllowedPath(filePath));
    return { size: stats.size, modified: stats.mtimeMs, created: stats.birthtimeMs };
  } catch (e) {
    return null;
  }
});

/**
 * Check which paths still exist as image files.
 * Does NOT expand the allowlist — call register-paths after for paths you will open.
 */
ipcMain.handle('validate-paths', (event, paths) => {
  try {
    if (!Array.isArray(paths)) return [];
    return paths.filter((p) => {
      try {
        return isExistingMediaFile(p);
      } catch (_) {
        return false;
      }
    }).map((p) => {
      try {
        return cleanFsPath(p);
      } catch (_) {
        return p;
      }
    });
  } catch (e) {
    console.error('Error validating paths:', e);
    return [];
  }
});

function runRegCommands(commands) {
  return new Promise((resolve) => {
    if (!commands.length) {
      resolve({ success: true });
      return;
    }
    const runNext = (i) => {
      if (i >= commands.length) {
        resolve({ success: true });
        return;
      }
      const [cmd, ...args] = commands[i];
      execFile(cmd, args, (err) => {
        if (err && cmd === 'reg' && args[0] === 'delete') {
          // ignore missing keys
        } else if (err) {
          console.error('Registry command failed:', err.message);
          resolve({ success: false, error: err.message });
          return;
        }
        runNext(i + 1);
      });
    };
    runNext(0);
  });
}

ipcMain.handle('register-context-menu', async (event, enable, lang) => {
  try {
    const isPackaged = app.isPackaged;
    let exePath = process.execPath;
    if (!isPackaged) {
      exePath = path.join(app.getAppPath(), 'dist', 'win-unpacked', 'CyberViewer.exe');
    }

    const extensions = [...MEDIA_EXTS];
    const progIds = ['BMP Image', 'GIF Image', 'JPEG Image', 'PNG Image', 'WebP Image', 'TIFF Image', 'icofile'];

    if (enable) {
      if (!fs.existsSync(exePath)) {
        return { success: false, error: 'No se encontró el ejecutable. Construye la app primero.' };
      }

      const label = lang === 'es' ? 'Ver con CyberViewer' : 'View with CyberViewer';
      const assocLabel = lang === 'es' ? 'Abrir con CyberViewer' : 'Open with CyberViewer';
      const commands = [];

      for (const ext of extensions) {
        const regPath = `HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\CyberViewer`;
        commands.push(['reg', 'add', regPath, '/ve', '/d', label, '/f']);
        commands.push(['reg', 'add', regPath, '/v', 'Icon', '/d', exePath, '/f']);
        commands.push(['reg', 'add', `${regPath}\\command`, '/ve', '/d', `"${exePath}" "%1"`, '/f']);
      }
      for (const progId of progIds) {
        const regPath = `HKCU\\Software\\Classes\\${progId}\\shell\\open`;
        commands.push(['reg', 'add', regPath, '/ve', '/d', assocLabel, '/f']);
        commands.push(['reg', 'add', regPath, '/v', 'Icon', '/d', exePath, '/f']);
      }
      return runRegCommands(commands);
    }

    const commands = [];
    for (const ext of extensions) {
      const regPath = `HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\CyberViewer`;
      commands.push(['reg', 'delete', regPath, '/f']);
    }
    for (const progId of progIds) {
      const regPath = `HKCU\\Software\\Classes\\${progId}\\shell\\open`;
      commands.push(['reg', 'add', regPath, '/ve', '/d', 'Open with CyberViewer', '/f']);
      commands.push(['reg', 'delete', regPath, '/v', 'Icon', '/f']);
    }
    return runRegCommands(commands);
  } catch (e) {
    console.error('Error in register-context-menu handler:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.on('save-settings', (event, newSettings) => {
  const currentSettings = loadSettings();
  saveSettings({ app: newSettings });

  const prevAuto = autoBackup.pickAutoBackupSettings(currentSettings.app.autoBackup);
  const nextAuto = autoBackup.pickAutoBackupSettings(newSettings.autoBackup);
  if (
    prevAuto.enabled !== nextAuto.enabled ||
    prevAuto.frequency !== nextAuto.frequency ||
    prevAuto.customPath !== nextAuto.customPath
  ) {
    rescheduleAutoBackup();
  }

  if (newSettings.checkUpdatesOnStartup !== undefined) {
    setAutoCheckEnabled(!!newSettings.checkUpdatesOnStartup);
  }

  if (newSettings.autoStart !== undefined) {
    app.setLoginItemSettings({
      openAtLogin: newSettings.autoStart,
      path: app.getPath('exe'),
      args: ['--startup']
    });
  }

  if (!tray) {
    createTray();
  } else if (tray) {
    // The icon is resident: never destroy it here. Recreating the Tray resets
    // Windows per-icon "always show" pinning, sending the icon back to the
    // overflow area. updateTrayMenu() refreshes labels (e.g. on language
    // change) without changing the icon identity.
    updateTrayMenu();
  }

  // (Re)apply the global toggle hotkey whenever the setting may have changed.
  if (newSettings.toggleHotkey !== undefined) {
    applyToggleHotkey(newSettings.toggleHotkey);
  }
});

ipcMain.on('show-context-menu', (event, props) => {
  const settings = loadSettings();
  const lang = settings.app.language || 'en';
  const t = menuI18n[lang] || menuI18n.en;
  const browserWin = BrowserWindow.fromWebContents(event.sender);
  let template = [];

  if (props.isEditable) {
    template = [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { role: 'selectAll' }
    ];
  } else if (props.type === 'image' || props.type === 'main-image') {
    template = [
      {
        label: t.file,
        submenu: [
          {
            label: t.copy_image,
            click: () => {
              try {
                const abs = resolveAllowedPath(props.path);
                fs.readFile(abs, (err, data) => {
                  if (!err) {
                    const img = nativeImage.createFromBuffer(data);
                    clipboard.writeImage(img);
                  }
                });
              } catch (_) { /* ignore */ }
            }
          },
          {
            label: t.copy_path,
            enabled: !!props.path,
            click: () => { if (props.path) clipboard.writeText(props.path); }
          },
          {
            label: t.save_as,
            click: async () => {
              const ext = path.extname(props.path || '');
              const base = path.basename(props.path || 'image', ext) || 'image';
              const dir = props.path ? path.dirname(props.path) : app.getPath('pictures');
              const result = await dialog.showSaveDialog(browserWin, {
                title: tMenu('dialog_save_as_title', lang),
                defaultPath: path.join(dir, `${base}_copy.png`),
                filters: [
                  { name: 'PNG', extensions: ['png'] },
                  { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
                  { name: tMenu('dialog_save_filter_all', lang), extensions: ['*'] }
                ]
              });
              if (!result.canceled && result.filePath) {
                const targetPath = /\.[^\\/]+$/.test(result.filePath) ? result.filePath : result.filePath + '.png';
                pathAllowlist.allow(targetPath);
                event.sender.send('menu-action', { action: 'save-as', targetPath });
              }
            }
          },
          {
            label: t.close_image,
            click: () => event.sender.send('menu-action', { action: 'close-image' })
          }
        ]
      },
      {
        label: t.edit,
        submenu: [
          {
            label: t.rotate,
            submenu: [
              { label: t.rotate_r, click: () => event.sender.send('menu-action', { action: 'rotate-r-save' }) },
              { label: t.rotate_l, click: () => event.sender.send('menu-action', { action: 'rotate-l-save' }) }
            ]
          },
          { label: t.crop, click: () => event.sender.send('menu-action', { action: 'crop' }) },
          { label: t.resize, click: () => event.sender.send('menu-action', { action: 'resize' }) },
          { label: t.adjust, click: () => event.sender.send('menu-action', { action: 'adjust' }) },
          {
            label: props.isFavorite ? t.favorite_remove : t.favorite_add,
            click: () => event.sender.send('menu-action', { action: 'toggle-favorite' })
          }
        ]
      },
      {
        label: t.view,
        submenu: [
          {
            label: t.show_in_folder,
            click: () => {
              try { shell.showItemInFolder(resolveAllowedPath(props.path)); } catch (_) { /* ignore */ }
            }
          },
          {
            label: t.properties,
            click: () => event.sender.send('menu-action', { action: 'show-properties', path: props.path })
          }
        ]
      },
      { type: 'separator' },
      {
        label: t.move_trash,
        click: () => {
          event.sender.send('menu-action', { action: 'request-delete', index: props.index, path: props.path });
        }
      },
      { type: 'separator' },
      { label: t.hide_session, click: () => event.sender.send('menu-action', { action: 'remove-from-list', index: props.index }) },
      {
        label: t.restore_hidden.replace('{count}', props.hiddenCount || 0),
        enabled: !!props.hiddenCount,
        visible: !!props.hiddenCount,
        click: () => event.sender.send('menu-action', { action: 'restore-hidden' })
      },
      { type: 'separator' },
      { label: t.quit, click: () => browserWin.close() }
    ];
  } else if (props.type === 'thumb') {
    template = [
      {
        label: t.file,
        submenu: [
          {
            label: t.copy_image,
            click: () => {
              try {
                const abs = resolveAllowedPath(props.path);
                fs.readFile(abs, (err, data) => {
                  if (!err) {
                    const img = nativeImage.createFromBuffer(data);
                    clipboard.writeImage(img);
                  }
                });
              } catch (_) { /* ignore */ }
            }
          },
          {
            label: t.show_in_folder,
            click: () => {
              try { shell.showItemInFolder(resolveAllowedPath(props.path)); } catch (_) { /* ignore */ }
            }
          }
        ]
      },
      {
        label: t.navigate,
        submenu: [
          { label: t.go_start, click: () => event.sender.send('menu-action', { action: 'go-start' }) },
          { label: t.go_end, click: () => event.sender.send('menu-action', { action: 'go-end' }) }
        ]
      },
      { type: 'separator' },
      { label: t.hide_session, click: () => event.sender.send('menu-action', { action: 'remove-from-list', index: props.index }) },
      {
        label: t.restore_hidden.replace('{count}', props.hiddenCount || 0),
        enabled: !!props.hiddenCount,
        visible: !!props.hiddenCount,
        click: () => event.sender.send('menu-action', { action: 'restore-hidden' })
      },
      { type: 'separator' },
      {
        label: t.move_trash,
        click: () => {
          event.sender.send('menu-action', { action: 'request-delete', index: props.index, path: props.path });
        }
      },
      { type: 'separator' },
      { label: t.quit, click: () => browserWin.close() }
    ];
  } else {
    const hasImages = !!props.hiddenCount || (props.type === 'canvas' && props.hasImages);
    template = [
      {
        label: t.file,
        submenu: [
          { label: t.open_folder, click: () => event.sender.send('menu-action', { action: 'open-dir' }) },
          {
            label: t.close_image,
            enabled: hasImages,
            visible: hasImages,
            click: () => event.sender.send('menu-action', { action: 'close-image' })
          },
          {
            label: t.copy_path,
            enabled: hasImages && !!props.path,
            click: () => { if (props.path) clipboard.writeText(props.path); }
          }
        ]
      },
      {
        label: t.view,
        submenu: [
          {
            label: t.fit_window,
            enabled: hasImages,
            click: () => event.sender.send('menu-action', { action: 'fit-to-window' })
          },
          {
            label: t.reset_zoom,
            enabled: hasImages,
            click: () => event.sender.send('menu-action', { action: 'reset-zoom' })
          },
          { type: 'separator' },
          {
            label: t.autohide_nav,
            type: 'checkbox',
            checked: !!props.navAutoHide,
            click: () => event.sender.send('menu-action', { action: 'toggle-autohide-nav' })
          }
        ]
      },
      {
        label: t.edit,
        enabled: hasImages,
        submenu: [
          {
            label: t.rotate,
            submenu: [
              { label: t.rotate_r, click: () => event.sender.send('menu-action', { action: 'rotate-r-save' }) },
              { label: t.rotate_l, click: () => event.sender.send('menu-action', { action: 'rotate-l-save' }) }
            ]
          },
          { label: t.crop, click: () => event.sender.send('menu-action', { action: 'crop' }) },
          { label: t.resize, click: () => event.sender.send('menu-action', { action: 'resize' }) },
          { label: t.adjust, click: () => event.sender.send('menu-action', { action: 'adjust' }) },
          {
            label: props.isFavorite ? t.favorite_remove : t.favorite_add,
            click: () => event.sender.send('menu-action', { action: 'toggle-favorite' })
          }
        ]
      },
      { type: 'separator' },
      { label: t.config, click: () => event.sender.send('menu-action', { action: 'show-config' }) },
      { label: t.about, click: () => event.sender.send('menu-action', { action: 'show-about' }) },
      { type: 'separator' },
      {
        label: browserWin.isMaximized() ? t.restore : t.maximize,
        click: () => {
          if (browserWin.isMaximized()) browserWin.unmaximize();
          else browserWin.maximize();
        }
      },
      { type: 'separator' },
      { label: t.quit, click: () => browserWin.close() }
    ];
  }

  if (template.length > 0) {
    Menu.buildFromTemplate(template).popup(browserWin);
  }
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    forwardOpenPaths(commandLine.map(arg => getFilePathFromArgs([arg])).filter(Boolean));
    if (win) {
      diagWindow('second-instance');
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      setTimeout(nudgeCompositorFrame, 200);
    }
  });

  app.whenReady().then(() => {
    diagWindow('boot', {
      packaged: app.isPackaged,
      startupArg: process.argv.includes('--startup'),
      gpu: diagGpuStatus()
    });
    registerMediaProtocol();
    pathAllowlist.allow(thumbCachePath);
    evictThumbCache(thumbCachePath);

    createWindow();
    win.webContents.setBackgroundThrottling(false);

    const settings = loadSettings();
    initUpdater(settings.app, {
      beforeQuitInstall: () => { isQuitting = true; }
    });
    createTray();
    applyToggleHotkey(settings.app && settings.app.toggleHotkey);
    initAutoBackup();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
