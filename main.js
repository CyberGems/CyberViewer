const { app, BrowserWindow, shell, ipcMain, screen, Tray, Menu, protocol, net, nativeImage, clipboard, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

// Registrar protocolo para carga ultra-rápida de imágenes locales
protocol.registerSchemesAsPrivileged([
  { scheme: 'cyber', privileges: { bypassCSP: true, stream: true, standard: true, secure: true, supportFetchAPI: true } }
]);

// ── PERSISTENCIA ──
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try { 
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); 
    }
  } catch (e) { console.error('Error cargando settings:', e); }
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
      language: 'en'
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
  } catch (e) { console.error('Error guardando settings:', e); }
}

function getFilePathFromArgs(args) {
  for (let arg of args) {
    // Limpiar comillas que a veces pone Windows
    arg = arg.replace(/^"(.*)"$/, '$1');
    if (arg.match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff|tif)$/i)) {
      try {
        if (fs.existsSync(arg)) return path.resolve(arg);
      } catch(e) {}
    }
  }
  return null;
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
    const visible = displays.some(d => {
      const b = d.bounds;
      return bounds.x < b.x + b.width && bounds.x + bounds.width > b.x &&
             bounds.y < b.y + b.height && bounds.y + bounds.height > b.y;
    });
    if (!visible) bounds = null;
  }

  const defaultW = 1280, defaultH = 800;
  let x, y, w, h;
  const preferredId = settings.app.preferredDisplayId;
  
  if (preferredId && preferredId !== 'auto') {
    // Buscar por ID exacto (convertir ambos a string para seguridad)
    const targetDisplay = displays.find(d => d.id.toString() === preferredId.toString()) || primary;
    w = bounds ? Math.max(800, bounds.width) : defaultW;
    h = bounds ? Math.max(500, bounds.height) : defaultH;
    
    // Calcular centro absoluto del monitor objetivo
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
      webSecurity: false, // ACTIVACIÓN RADICAL: Permite acceso directo a archivos
    },
  });

  // Guardar estado en tiempo real para no perder el monitor
  win.on('move', () => {
    if (!win.isMaximized()) saveSettings({ window: { bounds: win.getBounds(), maximized: false } });
  });
  win.on('resize', () => {
    if (!win.isMaximized()) saveSettings({ window: { bounds: win.getBounds(), maximized: false } });
  });

  // EXORCISMO DE CACHE (LEVEL 13)
  const session = win.webContents.session;
  session.clearCache();
  
  const htmlPath = path.join(__dirname, 'CyberViewer.html');
  win.loadURL(`file://${htmlPath}?v=${Date.now()}`);

  win.once('ready-to-show', () => {
    if (settings.window.maximized) win.maximize();
    
    const isStartupLaunch = process.argv.includes('--startup');
    const shouldStartMinimized = settings.app.autoStart && isStartupLaunch;

    if (!shouldStartMinimized) {
      win.show();
    } else {
      // Si inicia minimizado por el sistema, creamos el tray si no existe
      if (!tray) createTray();
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

  // Eventos de estado para el renderer
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
  
  const showLabel = lang === 'es' ? 'Mostrar CyberViewer' : 'Show CyberViewer';
  const exitLabel = lang === 'es' ? 'Salir' : 'Exit';

  tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: showLabel, click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: exitLabel, click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('CyberViewer');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
}

// ── IPC HANDLERS ──
ipcMain.on('win-minimize', () => win.minimize());
ipcMain.on('win-maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('win-close', () => {
  // Guardar estado antes de cerrar
  if (win) {
    const isMax = win.isMaximized();
    const bounds = win.getBounds();
    saveSettings({ window: { bounds, maximized: isMax } });
  }
  win.close();
});

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
  return result.filePaths[0];
});

ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('get-monitors', () => {
  return screen.getAllDisplays().map(d => ({
    id: d.id,
    label: `${d.id === screen.getPrimaryDisplay().id ? '[Principal] ' : ''}Monitor ${d.id}`,
    bounds: d.bounds
  }));
});
ipcMain.handle('scan-folder', (event, filePath) => {
  try {
    const dir = path.dirname(filePath);
    const files = fs.readdirSync(dir);
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];
    
    // Ordenamiento natural (como Windows Explorer)
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    
    const filtered = files
      .filter(f => allowedExts.includes(path.extname(f).toLowerCase()))
      .sort((a, b) => collator.compare(a, b));

    return filtered.map(f => {
      const fullPath = path.resolve(dir, f);
      const stats = fs.statSync(fullPath);
      return {
        path: fullPath,
        size: stats.size
      };
    });
  } catch (e) {
    console.error('Error escaneando carpeta:', e);
    return [];
  }
});

// ── SISTEMA DE CACHE DE MINIATURAS ──
const thumbCachePath = path.join(app.getPath('userData'), 'thumb_cache');
if (!fs.existsSync(thumbCachePath)) fs.mkdirSync(thumbCachePath, { recursive: true });

ipcMain.handle('get-thumbnail', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    // Normalizar ruta para evitar duplicados por mayúsculas/minúsculas en Windows
    const normalizedPath = path.resolve(filePath).toLowerCase();
    const hash = crypto.createHash('md5').update(normalizedPath + stats.mtimeMs).digest('hex');
    const cacheFile = path.join(thumbCachePath, `${hash}.jpg`);

    if (fs.existsSync(cacheFile)) {
      return pathToFileURL(cacheFile).toString();
    }

    const img = nativeImage.createFromPath(filePath);
    if (img.isEmpty()) return null;

    const thumb = img.resize({ height: 100, quality: 'better' });
    fs.writeFileSync(cacheFile, thumb.toJPEG(80));
    
    return pathToFileURL(cacheFile).toString();
  } catch (e) {
    return null;
  }
});
ipcMain.handle('save-image', async (event, { filePath, rotation, buffer }) => {
  try {
    if (!filePath) return { success: false, error: 'Ruta no proporcionada' };

    let cleanPath = filePath;
    if (cleanPath.startsWith('file:///')) cleanPath = cleanPath.substring(8);
    else if (cleanPath.startsWith('file://')) cleanPath = cleanPath.substring(7);
    cleanPath = decodeURIComponent(cleanPath);
    if (process.platform === 'win32' && cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
    cleanPath = path.resolve(cleanPath);

    console.log(`[LEVEL-20-GHOST] Procesando: ${cleanPath}`);

    let dataToWrite;

    if (buffer) {
      // ── Modo directo: el renderer envía la imagen ya renderizada (canvas → base64) ──
      dataToWrite = Buffer.from(buffer, 'base64');
    } else {
      // ── Modo legacy: cargar desde disco y procesar con nativeImage ──
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
      for (let i = 0; i < times; i++) { img = img.rotate(90); }
      dataToWrite = img.toJPEG(95);
    }

    // ── ESCRITURA ATÓMICA: archivo temporal + rename ──
    const tmpPath = cleanPath + '.cybertmp.' + Date.now();

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Verificar que el directorio padre es escribible
        const dir = path.dirname(cleanPath);
        try { fs.accessSync(dir, fs.constants.W_OK); } catch (e) {
          return { success: false, error: `No hay permisos de escritura en: ${dir}` };
        }

        fs.writeFileSync(tmpPath, dataToWrite);

        if (fs.existsSync(cleanPath)) {
          fs.unlinkSync(cleanPath);
        }
        fs.renameSync(tmpPath, cleanPath);

        console.log('[LEVEL-20-GHOST] Guardado exitoso:', cleanPath);
        return { success: true };
      } catch (e) {
        console.warn(`[LEVEL-20] Reintento ${attempt + 1} fallido:`, e.message);
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return { success: false, error: 'No se pudo escribir el archivo (archivo en uso o permisos insuficientes)' };
  } catch (e) {
    console.error('[LEVEL-20-GHOST] Error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.on('save-settings', (event, newSettings) => {
  saveSettings({ app: newSettings });
  
  // Aplicar cambios que requieren acción de Electron
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
    // Si cambia de idioma, recrear el tray para actualizar textos
    tray.destroy();
    tray = null;
    createTray();
  }
});

const I18N_MAIN = {
  en: {
    copy_image: "Copy Image",
    show_in_folder: "Show in Folder",
    hide_session: "Hide from this session",
    restore_hidden: "Restore hidden ({count})",
    copy_original: "Copy Original",
    go_start: "Go to Start",
    go_end: "Go to End",
    move_trash: "Move to Trash",
    open_folder: "Open Folder",
    config: "Configuration",
    about: "About",
  },
  es: {
    copy_image: "Copiar Imagen",
    show_in_folder: "Mostrar en Carpeta",
    hide_session: "Ocultar de esta sesión",
    restore_hidden: "Restaurar ocultos ({count})",
    copy_original: "Copiar Original",
    go_start: "Ir al Principio",
    go_end: "Ir al Final",
    move_trash: "Mover a la Papelera",
    open_folder: "Abrir Carpeta",
    config: "Configuración",
    about: "Acerca de",
  }
};

// Menú contextual nativo para campos de texto
ipcMain.on('show-context-menu', (event, props) => {
  const settings = loadSettings();
  const lang = settings.app.language || 'en';
  const t = I18N_MAIN[lang] || I18N_MAIN.en;

  const win = BrowserWindow.fromWebContents(event.sender);
  let template = [];

  if (props.type === 'main-image') {
    template = [
      { 
        label: t.copy_image, 
        click: () => {
          const img = nativeImage.createFromPath(props.path);
          clipboard.writeImage(img);
        } 
      },
      { label: t.show_in_folder, click: () => shell.showItemInFolder(props.path) },
      { type: 'separator' },
      { label: t.hide_session, click: () => event.sender.send('menu-action', { action: 'remove-from-list', index: props.index }) },
      { 
        label: t.restore_hidden.replace('{count}', props.hiddenCount || 0), 
        enabled: !!props.hiddenCount,
        visible: !!props.hiddenCount,
        click: () => event.sender.send('menu-action', { action: 'restore-hidden' }) 
      }
    ];
  } else if (props.type === 'thumb') {
    template = [
      { 
        label: t.copy_original, 
        click: () => {
          const img = nativeImage.createFromPath(props.path);
          clipboard.writeImage(img);
        } 
      },
      { label: t.show_in_folder, click: () => shell.showItemInFolder(props.path) },
      { type: 'separator' },
      { label: t.go_start, click: () => event.sender.send('menu-action', { action: 'go-start' }) },
      { label: t.go_end, click: () => event.sender.send('menu-action', { action: 'go-end' }) },
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
          shell.trashItem(props.path).then(() => {
            event.sender.send('menu-action', { action: 'file-deleted', index: props.index });
          });
        }
      }
    ];
  } else {
    template = [
      { label: t.open_folder, click: () => event.sender.send('menu-action', { action: 'open-dir' }) },
      { type: 'separator' },
      { label: t.config, click: () => event.sender.send('menu-action', { action: 'show-config' }) },
      { label: t.about, click: () => event.sender.send('menu-action', { action: 'show-about' }) }
    ];
  }

  if (template.length > 0) {
    const menu = Menu.buildFromTemplate(template);
    menu.popup(win);
  }
});

// ── APP LIFECYCLE ──
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show(); // Asegurar que sale de la bandeja
      win.focus();
      
      const filePath = getFilePathFromArgs(commandLine);
      if (filePath) win.webContents.send('open-file', filePath);
    }
  });

  app.whenReady().then(() => {
    // Protocolo eliminado para usar file:// directo (máximo rendimiento)
    createWindow();
    
    win.webContents.setBackgroundThrottling(false);
    const settings = loadSettings();
    if (settings.app.closeToTray) createTray();

    // Si se abrió con un archivo directamente
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
