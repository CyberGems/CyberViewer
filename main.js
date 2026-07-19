'use strict';

const {
  app, BrowserWindow, shell, ipcMain, screen, Tray, Menu,
  protocol, nativeImage, clipboard, dialog, net
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');

const {
  cleanFsPath, toMediaUrl, createPathAllowlist, IMAGE_EXTS
} = require('./lib/paths');
const { evictThumbCache } = require('./lib/thumb-cache');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'cvlocal',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false
    }
  }
]);

const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const menuI18n = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'i18n', 'menu.json'), 'utf8')
);

const pathAllowlist = createPathAllowlist([__dirname]);

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (data && data.app) {
        if (data.app.manualUpdateOnly === undefined) data.app.manualUpdateOnly = false;
        if (data.app.hudAutoHide === undefined) data.app.hudAutoHide = true;
        if (data.app.hudAutoHideDelay === undefined) data.app.hudAutoHideDelay = 2000;
        if (data.app.onboardingSeen === undefined) data.app.onboardingSeen = false;
      }
      return data;
    }
  } catch (e) {
    console.error('Error cargando settings:', e);
  }
  return {
    window: { width: 1280, height: 800, maximized: false },
    app: {
      closeToTray: false,
      startMinimized: false,
      autoStart: false,
      accentColor: '#00d4ff',
      sidebarOpen: true,
      statusbarVisible: true,
      preferredDisplayId: 'auto',
      language: 'en',
      contextMenuEnabled: false,
      manualUpdateOnly: false,
      hudAutoHide: true,
      hudAutoHideDelay: 2000,
      showTopHints: true,
      onboardingSeen: false
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
      let urlPath = request.url.slice('cvlocal://'.length);
      if (urlPath.startsWith('/')) urlPath = urlPath.slice(1);
      const q = urlPath.indexOf('?');
      if (q !== -1) urlPath = urlPath.slice(0, q);
      const abs = cleanFsPath(urlPath);
      if (!pathAllowlist.isAllowed(abs)) {
        return new Response('Forbidden', { status: 403 });
      }
      if (!fs.existsSync(abs)) {
        return new Response('Not Found', { status: 404 });
      }
      return net.fetch(pathToFileURL(abs).toString());
    } catch (e) {
      console.error('cvlocal protocol error:', e.message);
      return new Response('Bad Request', { status: 400 });
    }
  });
}

let win;
let tray = null;
let isQuitting = false;

function createWindow() {
  const settings = loadSettings();
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();

  let bounds = settings.window.bounds;
  if (bounds) {
    const visible = displays.some((d) => {
      const b = d.bounds;
      return bounds.x < b.x + b.width && bounds.x + bounds.width > b.x &&
        bounds.y < b.y + b.height && bounds.y + bounds.height > b.y;
    });
    if (!visible) bounds = null;
  }

  const defaultW = 1280;
  const defaultH = 800;
  let x, y, w, h;
  const preferredId = settings.app.preferredDisplayId;

  if (preferredId && preferredId !== 'auto') {
    const targetDisplay = displays.find((d) => d.id.toString() === preferredId.toString()) || primary;
    w = bounds ? Math.max(800, bounds.width) : defaultW;
    h = bounds ? Math.max(500, bounds.height) : defaultH;
    x = Math.floor(targetDisplay.bounds.x + (targetDisplay.bounds.width - w) / 2);
    y = Math.floor(targetDisplay.bounds.y + (targetDisplay.bounds.height - h) / 2);
  } else {
    x = bounds ? bounds.x : Math.round(primary.bounds.x + (primary.bounds.width - defaultW) / 2);
    y = bounds ? bounds.y : Math.round(primary.bounds.y + (primary.bounds.height - defaultH) / 2);
    w = bounds ? Math.max(800, bounds.width) : defaultW;
    h = bounds ? Math.max(500, bounds.height) : defaultH;
  }

  win = new BrowserWindow({
    x, y, width: w, height: h,
    minWidth: 800, minHeight: 500,
    title: 'CyberViewer',
    backgroundColor: '#080a0e',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    frame: false,
    titleBarStyle: 'hidden',
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

  win.on('move', () => {
    if (!win.isMaximized()) saveSettings({ window: { bounds: win.getBounds(), maximized: false } });
  });
  win.on('resize', () => {
    if (!win.isMaximized()) saveSettings({ window: { bounds: win.getBounds(), maximized: false } });
  });

  const htmlPath = path.join(__dirname, 'CyberViewer.html');
  const loadUrl = !app.isPackaged
    ? pathToFileURL(htmlPath).href + '?v=' + Date.now()
    : pathToFileURL(htmlPath).href;
  win.loadURL(loadUrl);

  let wasMaximizedOnStart = settings.window.maximized;

  win.once('ready-to-show', () => {
    const isStartupLaunch = process.argv.includes('--startup');
    const shouldStartMinimized = settings.app.autoStart && isStartupLaunch;

    if (!shouldStartMinimized) {
      if (wasMaximizedOnStart) {
        win.show();
        win.maximize();
        wasMaximizedOnStart = false;
      } else {
        win.show();
      }
    } else if (!tray) {
      createTray();
    }
  });

  win.on('show', () => {
    if (wasMaximizedOnStart) {
      wasMaximizedOnStart = false;
      win.show();
      win.maximize();
    }
  });

  win.on('close', (event) => {
    if (!isQuitting && loadSettings().app.closeToTray) {
      event.preventDefault();
      win.hide();
      return false;
    }

    const isMax = win.isMaximized();
    const windowState = { maximized: isMax };
    if (!isMax) windowState.bounds = win.getBounds();
    saveSettings({ window: windowState });
  });

  win.on('maximize', () => win.webContents.send('win-state', 'maximized'));
  win.on('unmaximize', () => win.webContents.send('win-state', 'normal'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray() {
  if (tray) return;
  const settings = loadSettings();
  const lang = settings.app.language || 'en';
  const t = menuI18n[lang] || menuI18n.en;

  tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: `CyberViewer v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: t.tray_show, click: () => { win.show(); win.focus(); } },
    { label: t.tray_settings, click: () => { win.show(); win.focus(); win.webContents.send('open-settings'); } },
    { type: 'separator' },
    { label: t.tray_exit, click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('CyberViewer');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.maximize();
      win.focus();
    }
  });
}

// ── IPC ──
ipcMain.on('win-minimize', () => win.minimize());
ipcMain.on('win-maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.on('win-close', () => win.close());
ipcMain.on('win-devtools', () => win.webContents.openDevTools());

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Abrir Imagen',
    filters: [
      { name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif'] },
      { name: 'Todos los archivos', extensions: ['*'] }
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

ipcMain.handle('check-updates', async () => {
  try {
    const response = await fetch('https://api.github.com/repos/CyberGems/CyberViewer/releases/latest', {
      headers: { 'User-Agent': 'CyberViewer-App' }
    });
    if (!response.ok) return { success: false, error: 'HTTP ' + response.status };
    const data = await response.json();
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-monitors', () => {
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: `${d.id === screen.getPrimaryDisplay().id ? '[Principal] ' : ''}Monitor ${d.id}`,
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

ipcMain.handle('register-paths', (event, paths) => {
  try {
    if (!Array.isArray(paths)) return { success: false };
    for (const p of paths) {
      if (p) pathAllowlist.allow(cleanFsPath(p));
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('scan-folder', (event, filePath) => {
  try {
    const absFile = cleanFsPath(filePath);
    pathAllowlist.allow(absFile);
    const dir = path.dirname(absFile);
    pathAllowlist.allow(dir);

    const files = fs.readdirSync(dir);
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

    const filtered = files
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort((a, b) => collator.compare(a, b));

    return filtered.map((f) => {
      const fullPath = path.resolve(dir, f);
      const stats = fs.statSync(fullPath);
      return { path: fullPath, size: stats.size };
    });
  } catch (e) {
    console.error('Error escaneando carpeta:', e);
    return [];
  }
});

const thumbCachePath = path.join(app.getPath('userData'), 'thumb_cache');
if (!fs.existsSync(thumbCachePath)) fs.mkdirSync(thumbCachePath, { recursive: true });
pathAllowlist.allow(thumbCachePath);

ipcMain.handle('get-thumbnail', async (event, filePath) => {
  try {
    const abs = resolveAllowedPath(filePath);
    const stats = fs.statSync(abs);
    const normalizedPath = abs.toLowerCase();
    const hash = crypto.createHash('md5').update(normalizedPath + stats.mtimeMs).digest('hex');
    const cacheFile = path.join(thumbCachePath, `${hash}.jpg`);

    if (fs.existsSync(cacheFile)) {
      return toMediaUrl(cacheFile);
    }

    const img = nativeImage.createFromPath(abs);
    if (img.isEmpty()) return null;

    const thumb = img.resize({ height: 100, quality: 'better' });
    fs.writeFileSync(cacheFile, thumb.toJPEG(80));
    evictThumbCache(thumbCachePath);
    return toMediaUrl(cacheFile);
  } catch (e) {
    return null;
  }
});

ipcMain.handle('save-image', async (event, { filePath, rotation, buffer, createCopy }) => {
  try {
    if (!filePath) return { success: false, error: 'Ruta no proporcionada' };

    const cleanPath = resolveAllowedPath(filePath);
    let targetPath = cleanPath;

    if (createCopy) {
      const dir = path.dirname(cleanPath);
      const ext = path.extname(cleanPath);
      const base = path.basename(cleanPath, ext);
      let candidate = path.join(dir, `${base}_resized${ext}`);
      let counter = 1;
      while (fs.existsSync(candidate)) {
        counter++;
        candidate = path.join(dir, `${base}_resized (${counter})${ext}`);
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

ipcMain.handle('move-to-trash-direct', async (event, filePath) => {
  try {
    return await trashFile(filePath);
  } catch (e) {
    console.error('Error moving file to trash directly:', e);
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

ipcMain.handle('validate-paths', (event, paths) => {
  try {
    if (!Array.isArray(paths)) return [];
    return paths.filter((p) => {
      try {
        const abs = cleanFsPath(p);
        if (!fs.existsSync(abs)) return false;
        pathAllowlist.allow(abs);
        return true;
      } catch (_) {
        return false;
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
                title: lang === 'es' ? 'Guardar como' : 'Save As',
                defaultPath: path.join(path.dirname(props.path), path.basename(props.path, ext) + '_copy' + ext),
                filters: [
                  { name: 'Images', extensions: [ext.substring(1)] },
                  { name: 'All Files', extensions: ['*'] }
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
