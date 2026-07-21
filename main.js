'use strict';

const {
  app, BrowserWindow, shell, ipcMain, screen, Tray, Menu,
  protocol, nativeImage, clipboard, dialog
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { Readable } = require('stream');
const { execFile } = require('child_process');

const {
  cleanFsPath, toMediaUrl, createPathAllowlist, IMAGE_EXTS, mimeForPath,
  isExistingImageFile
} = require('./lib/paths');
const { evictThumbCache } = require('./lib/thumb-cache');
const { clampWindowBounds } = require('./lib/window-bounds');
const { initUpdater, setAutoCheckEnabled } = require('./lib/updater');

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
const menuI18n = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'i18n', 'menu.json'), 'utf8')
);

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
        if (data.app.hudAutoHide === undefined) data.app.hudAutoHide = true;
        if (data.app.hudAutoHideDelay === undefined) data.app.hudAutoHideDelay = 2000;
        if (data.app.alphaBackground === undefined) data.app.alphaBackground = 'checker-dark';
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
      startMinimized: false,
      autoStart: false,
      accentColor: '#00d4ff',
      sidebarOpen: false,
      statusbarVisible: true,
      preferredDisplayId: 'auto',
      language: 'en',
      contextMenuEnabled: false,
      checkUpdatesOnStartup: true,
      hudAutoHide: true,
      hudAutoHideDelay: 2000,
      showTopHints: true,
      alphaBackground: 'checker-dark'
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
    if (arg.match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff|tif)$/i)) {
      try {
        if (fs.existsSync(arg)) {
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
      // Prefer ?p= absolute path — avoids Windows drive letters becoming URL hosts.
      const abs = cleanFsPath(request.url);
      if (!pathAllowlist.isAllowed(abs)) {
        console.warn('cvlocal forbidden:', abs);
        return new Response('Forbidden', { status: 403 });
      }
      let st;
      try {
        st = await fs.promises.stat(abs);
      } catch (_) {
        return new Response('Not Found', { status: 404 });
      }
      if (!st.isFile()) {
        return new Response('Not Found', { status: 404 });
      }

      // Stream file bytes — avoids loading multi-MB images fully into RAM.
      const nodeStream = fs.createReadStream(abs);
      const webStream = Readable.toWeb(nodeStream);
      const isThumb = abs.toLowerCase().includes(`${path.sep}thumb_cache${path.sep}`) ||
        abs.toLowerCase().includes('/thumb_cache/');
      return new Response(webStream, {
        headers: {
          'Content-Type': mimeForPath(abs),
          'Content-Length': String(st.size),
          'Cache-Control': isThumb ? 'private, max-age=86400' : 'no-cache'
        }
      });
    } catch (e) {
      console.error('cvlocal protocol error:', e.message);
      return new Response('Bad Request', { status: 400 });
    }
  });
}

let win;
let tray = null;
let isQuitting = false;

function resolveStartupBounds(settings) {
  const raw = settings.window && settings.window.bounds;
  const clamped = clampWindowBounds(raw, {
    displays: screen.getAllDisplays(),
    primary: screen.getPrimaryDisplay(),
    preferredDisplayId: settings.app && settings.app.preferredDisplayId
  });
  const inflated = !!(
    raw &&
    Number.isFinite(raw.width) &&
    Number.isFinite(raw.height) &&
    (raw.width > clamped.width + 32 || raw.height > clamped.height + 32)
  );
  return { ...clamped, inflated };
}

function persistWindowState() {
  if (!win || win.isDestroyed()) return;
  try {
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
    minWidth: 800,
    minHeight: 500,
    title: 'CyberViewer',
    backgroundColor: '#080a0e',
    icon: path.join(__dirname, 'assets', 'icon.png'),
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

  try {
    win.setBackgroundColor('#080a0e');
  } catch (_) { /* ignore */ }

  // Debounce persistence — move/resize fire often and mixed-DPI getBounds is noisy
  let persistTimer = null;
  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      if (!win.isMaximized()) persistWindowState();
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

    if (shouldStartMinimized) {
      if (!tray) createTray();
      return;
    }

    // Last-resort flash mitigation: show at opacity 0, settle layout, then fade in
    try { win.setOpacity(0); } catch (_) { /* ignore */ }

    // Place on the resolved startup display (keeps last-used monitor)
    try {
      win.setBounds({
        x: startup.x,
        y: startup.y,
        width: startup.width,
        height: startup.height
      });
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
          win.setBounds({
            x: wa.x + 48,
            y: wa.y + 48,
            width: Math.min(startup.width, Math.max(800, wa.width - 96)),
            height: Math.min(startup.height, Math.max(500, wa.height - 96))
          });
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
    revealWindow();
  };
  ipcMain.on('ui-ready', onUiReady);
  win.once('ready-to-show', () => {
    // Fallback if renderer never acks
    setTimeout(() => revealWindow(), 1500);
  });
  win.on('closed', () => {
    ipcMain.removeListener('ui-ready', onUiReady);
  });

  const htmlPath = path.join(__dirname, 'CyberViewer.html');
  const loadUrl = !app.isPackaged
    ? pathToFileURL(htmlPath).href + '?v=' + Date.now()
    : pathToFileURL(htmlPath).href;
  win.loadURL(loadUrl);

  win.on('close', (event) => {
    if (!isQuitting && loadSettings().app.closeToTray) {
      event.preventDefault();
      hideToTray();
      return false;
    }
    persistWindowState();
  });

  win.on('show', () => updateTrayMenu());
  win.on('hide', () => updateTrayMenu());
  win.on('minimize', () => updateTrayMenu());
  win.on('restore', () => updateTrayMenu());

  win.on('maximize', () => {
    win.webContents.send('win-state', 'maximized');
    persistWindowState();
  });
  win.on('unmaximize', () => {
    win.webContents.send('win-state', 'normal');
    // Re-clamp after unmaximize — Windows/DPI often restores oversized bounds
    setTimeout(() => {
      if (!win || win.isDestroyed() || win.isMaximized()) return;
      try {
        const raw = win.getBounds();
        const clamped = clampWindowBounds(raw, {
          displays: screen.getAllDisplays(),
          primary: screen.getPrimaryDisplay(),
          preferredDisplayId: loadSettings().app.preferredDisplayId
        });
        if (raw.width > clamped.width + 8 || raw.height > clamped.height + 8) {
          win.setBounds({
            x: clamped.x,
            y: clamped.y,
            width: clamped.width,
            height: clamped.height
          });
        }
      } catch (_) { /* ignore */ }
      persistWindowState();
    }, 0);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function hideToTray() {
  if (!win || win.isDestroyed()) return;
  persistWindowState();
  if (win.isVisible()) win.hide();
  updateTrayMenu();
}

function showFromTray() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
  updateTrayMenu();
}

function isWindowShown() {
  return !!(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized());
}

function updateTrayMenu() {
  if (!tray) return;
  const settings = loadSettings();
  const lang = settings.app.language || 'en';
  const t = menuI18n[lang] || menuI18n.en;
  const visible = isWindowShown();

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `CyberViewer v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    {
      label: visible ? (t.tray_hide || t.tray_show) : t.tray_show,
      click: () => { visible ? hideToTray() : showFromTray(); }
    },
    {
      label: t.tray_settings,
      click: () => {
        showFromTray();
        if (win && !win.isDestroyed()) win.webContents.send('open-settings');
      }
    },
    { type: 'separator' },
    {
      label: t.tray_exit,
      click: () => { isQuitting = true; app.quit(); }
    }
  ]));
}

function createTray() {
  if (tray) return;
  tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
  tray.setToolTip('CyberViewer');
  updateTrayMenu();
  tray.on('click', () => {
    if (!win || win.isDestroyed()) return;
    if (isWindowShown()) hideToTray();
    else showFromTray();
  });
}

// ── IPC ──
ipcMain.on('win-minimize', () => win.minimize());
ipcMain.on('win-maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.on('win-close', () => win.close());
ipcMain.on('win-devtools', () => {
  // DevTools only outside packaged builds
  if (!app.isPackaged && win && !win.isDestroyed()) {
    win.webContents.openDevTools();
  }
});

ipcMain.handle('open-file-dialog', async () => {
  const lang = getUiLang();
  const result = await dialog.showOpenDialog(win, {
    title: tMenu('dialog_open_title', lang),
    filters: [
      {
        name: tMenu('dialog_open_filter_images', lang),
        extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif']
      },
      { name: tMenu('dialog_open_filter_all', lang), extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  pathAllowlist.allow(filePath);
  return filePath;
});

ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(win, options);
  if (!result.canceled && result.filePath) {
    pathAllowlist.allow(result.filePath);
  }
  return result;
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

/** Register only existing image files (widens allowlist to their parent dirs). */
ipcMain.handle('register-paths', (event, paths) => {
  try {
    if (!Array.isArray(paths)) return { success: false, registered: [] };
    const registered = [];
    const max = 5000;
    for (let i = 0; i < paths.length && registered.length < max; i++) {
      const p = paths[i];
      if (!p) continue;
      const abs = pathAllowlist.allowImageFile(p);
      if (abs) registered.push(abs);
    }
    return { success: true, registered, count: registered.length };
  } catch (e) {
    return { success: false, error: e.message, registered: [] };
  }
});

ipcMain.handle('scan-folder', async (event, filePath) => {
  try {
    const absFile = cleanFsPath(filePath);
    // Only scan neighbors of an existing image file (prevents arbitrary directory reads).
    if (!isExistingImageFile(absFile)) {
      return [];
    }
    pathAllowlist.allow(absFile);
    const dir = path.dirname(absFile);

    const files = await fs.promises.readdir(dir);
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

    const imageNames = files
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort((a, b) => collator.compare(a, b));

    const results = [];
    for (const f of imageNames) {
      const fullPath = path.resolve(dir, f);
      try {
        const stats = await fs.promises.stat(fullPath);
        if (stats.isFile()) {
          results.push({ path: fullPath, size: stats.size });
        }
      } catch (_) { /* skip unreadable */ }
    }
    return results;
  } catch (e) {
    console.error('Error escaneando carpeta:', e);
    return [];
  }
});

const thumbCachePath = path.join(app.getPath('userData'), 'thumb_cache');
if (!fs.existsSync(thumbCachePath)) fs.mkdirSync(thumbCachePath, { recursive: true });
pathAllowlist.allow(thumbCachePath);

/** Limit concurrent nativeImage thumb work to avoid CPU spikes on large folders. */
const THUMB_CONCURRENCY = 3;
let thumbInFlight = 0;
const thumbWaiters = [];

function acquireThumbSlot() {
  if (thumbInFlight < THUMB_CONCURRENCY) {
    thumbInFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    thumbWaiters.push(resolve);
  }).then(() => {
    thumbInFlight++;
  });
}

function releaseThumbSlot() {
  thumbInFlight = Math.max(0, thumbInFlight - 1);
  const next = thumbWaiters.shift();
  if (next) next();
}

ipcMain.handle('get-thumbnail', async (event, filePath) => {
  try {
    const abs = resolveAllowedPath(filePath);
    const stats = await fs.promises.stat(abs);
    const normalizedPath = abs.toLowerCase();
    const hash = crypto.createHash('md5').update(normalizedPath + stats.mtimeMs).digest('hex');
    const cacheFile = path.join(thumbCachePath, `${hash}.jpg`);

    if (fs.existsSync(cacheFile)) {
      return toMediaUrl(cacheFile);
    }

    await acquireThumbSlot();
    try {
      if (fs.existsSync(cacheFile)) {
        return toMediaUrl(cacheFile);
      }
      const img = nativeImage.createFromPath(abs);
      if (img.isEmpty()) return null;

      const thumb = img.resize({ height: 100, quality: 'better' });
      await fs.promises.writeFile(cacheFile, thumb.toJPEG(80));
      evictThumbCache(thumbCachePath);
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
        return isExistingImageFile(p);
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

    const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];
    const progIds = ['BMP Image', 'GIF Image', 'JPEG Image', 'PNG Image', 'WebP Image', 'TIFF Image'];

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
  saveSettings({ app: newSettings });

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

  if (newSettings.closeToTray && !tray) {
    createTray();
  } else if (!newSettings.closeToTray && tray) {
    tray.destroy();
    tray = null;
  } else if (tray) {
    tray.destroy();
    tray = null;
    createTray();
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
            label: t.save_changes,
            enabled: !!props.hasChanges,
            click: () => event.sender.send('menu-action', { action: 'save-changes' })
          },
          {
            label: t.save_as,
            click: async () => {
              const ext = path.extname(props.path);
              const result = await dialog.showSaveDialog(browserWin, {
                title: tMenu('dialog_save_as_title', lang),
                defaultPath: path.join(path.dirname(props.path), path.basename(props.path, ext) + '_copy' + ext),
                filters: [
                  {
                    name: tMenu('dialog_save_filter_images', lang),
                    extensions: [ext.substring(1) || 'png']
                  },
                  { name: tMenu('dialog_save_filter_all', lang), extensions: ['*'] }
                ]
              });
              if (!result.canceled && result.filePath) {
                pathAllowlist.allow(result.filePath);
                event.sender.send('menu-action', { action: 'save-as', targetPath: result.filePath });
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
            label: t.copy_original,
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
            label: t.autohide_hud,
            type: 'checkbox',
            checked: !!props.hudAutoHide,
            click: () => event.sender.send('menu-action', { action: 'toggle-autohide' })
          },
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
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      const filePath = getFilePathFromArgs(commandLine);
      if (filePath) win.webContents.send('open-file', filePath);
    }
  });

  app.whenReady().then(() => {
    registerMediaProtocol();
    pathAllowlist.allow(thumbCachePath);
    evictThumbCache(thumbCachePath);

    createWindow();
    win.webContents.setBackgroundThrottling(false);

    const settings = loadSettings();
    initUpdater(settings.app, {
      beforeQuitInstall: () => { isQuitting = true; }
    });
    if (settings.app.closeToTray) createTray();

    const initialFile = getFilePathFromArgs(process.argv);
    if (initialFile) {
      win.webContents.once('did-finish-load', () => {
        win.webContents.send('open-file', initialFile);
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
