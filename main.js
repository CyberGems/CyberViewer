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
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); 
      if (data && data.app) {
        if (data.app.manualUpdateOnly === undefined) data.app.manualUpdateOnly = false;
        if (data.app.hudAutoHide === undefined) data.app.hudAutoHide = true;
        if (data.app.hudAutoHideDelay === undefined) data.app.hudAutoHideDelay = 2000;
      }
      return data;
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
      language: 'en',
      contextMenuEnabled: false,
      manualUpdateOnly: false,
      hudAutoHide: true,
      hudAutoHideDelay: 2000,
      showTopHints: true
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
    } else {
      // Si inicia minimizado por el sistema, creamos el tray si no existe
      if (!tray) createTray();
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
  const settingsLabel = lang === 'es' ? 'Configuración' : 'Settings';
  const exitLabel = lang === 'es' ? 'Salir' : 'Exit';

  tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: `CyberViewer v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: showLabel, click: () => { win.show(); win.focus(); } },
    { label: settingsLabel, click: () => { win.show(); win.focus(); win.webContents.send('open-settings'); } },
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
      win.maximize();
      win.focus();
    }
  });
}

// ── IPC HANDLERS ──
ipcMain.on('win-minimize', () => win.minimize());
ipcMain.on('win-maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('win-close', () => {
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
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(win, options);
  return result;
});
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
ipcMain.handle('save-image', async (event, { filePath, rotation, buffer, createCopy }) => {
  try {
    if (!filePath) return { success: false, error: 'Ruta no proporcionada' };

    let cleanPath = filePath;
    if (cleanPath.startsWith('file:///')) cleanPath = cleanPath.substring(8);
    else if (cleanPath.startsWith('file://')) cleanPath = cleanPath.substring(7);
    cleanPath = decodeURIComponent(cleanPath);
    if (process.platform === 'win32' && cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
    cleanPath = path.resolve(cleanPath);

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
    }

    console.log(`[LEVEL-20-GHOST] Procesando: ${targetPath}`);

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
    const tmpPath = targetPath + '.cybertmp.' + Date.now();

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Verificar que el directorio padre es escribible
        const dir = path.dirname(targetPath);
        try { fs.accessSync(dir, fs.constants.W_OK); } catch (e) {
          return { success: false, error: `No hay permisos de escritura en: ${dir}` };
        }

        fs.writeFileSync(tmpPath, dataToWrite);

        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        fs.renameSync(tmpPath, targetPath);

        console.log('[LEVEL-20-GHOST] Guardado exitoso:', targetPath);
        return { success: true, filePath: targetPath };
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

ipcMain.on('copy-image', (event, filePath) => {
  try {
    let cleanPath = filePath;
    if (cleanPath.startsWith('file:///')) cleanPath = cleanPath.substring(8);
    else if (cleanPath.startsWith('file://')) cleanPath = cleanPath.substring(7);
    cleanPath = decodeURIComponent(cleanPath);
    if (process.platform === 'win32' && cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
    cleanPath = path.resolve(cleanPath);

    fs.readFile(cleanPath, (err, data) => {
      if (err) {
        console.error('Failed to read file for clipboard:', err);
        return;
      }
      const img = nativeImage.createFromBuffer(data);
      if (!img.isEmpty()) {
        clipboard.writeImage(img);
      } else {
        console.error('Failed to load image for clipboard:', cleanPath);
      }
    });
  } catch (e) {
    console.error('Error copying image to clipboard:', e);
  }
});



ipcMain.handle('move-to-trash-direct', async (event, filePath) => {
  try {
    await shell.trashItem(filePath);
    return { success: true };
  } catch (e) {
    console.error('Error moving file to trash directly:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.on('show-item-in-folder', (event, filePath) => {
  try {
    if (!filePath) return;
    let cleanPath = filePath;
    if (cleanPath.startsWith('file:///')) cleanPath = cleanPath.substring(8);
    else if (cleanPath.startsWith('file://')) cleanPath = cleanPath.substring(7);
    cleanPath = decodeURIComponent(cleanPath);
    if (process.platform === 'win32' && cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
    cleanPath = path.resolve(cleanPath);

    if (fs.existsSync(cleanPath)) {
      shell.showItemInFolder(cleanPath);
    }
  } catch (e) {
    console.error('Error showing item in folder:', e);
  }
});

// Normaliza una ruta entrante (file://, %20, barra inicial en win32) a ruta de sistema.
function cleanFsPath(p) {
  let cleanPath = p;
  if (cleanPath.startsWith('file:///')) cleanPath = cleanPath.substring(8);
  else if (cleanPath.startsWith('file://')) cleanPath = cleanPath.substring(7);
  cleanPath = decodeURIComponent(cleanPath);
  if (process.platform === 'win32' && cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
  return path.resolve(cleanPath);
}

// Abre el diálogo nativo de Propiedades de Windows para un archivo. El script
// auxiliar (.wsf) se escribe una sola vez por sesión y se reutiliza, pasando
// carpeta/archivo como WScript.Arguments para no reescribirlo en cada llamada.
let propertiesScriptWritten = false;
function openNativeProperties(rawPath) {
  try {
    const absolutePath = cleanFsPath(rawPath);
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
                  WScript.Sleep 1800000 ' mantiene vivo el proceso mientras el diálogo está abierto
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
    require('child_process').execFile('wscript.exe', [propsWsfPath, folderPath, fileName]);
  } catch (e) {
    console.error('Error opening file properties via WSF:', e);
  }
}

// Botón discreto "Propiedades de Windows" dentro del panel in-app.
ipcMain.on('open-native-properties', (event, filePath) => {
  if (filePath) openNativeProperties(filePath);
});

// Datos del archivo para el panel in-app (tamaño y fechas frescas desde disco).
ipcMain.handle('get-file-info', (event, filePath) => {
  try {
    const stats = fs.statSync(cleanFsPath(filePath));
    return { size: stats.size, modified: stats.mtimeMs, created: stats.birthtimeMs };
  } catch (e) {
    return null;
  }
});

ipcMain.handle('validate-paths', (event, paths) => {
  try {
    if (!Array.isArray(paths)) return [];
    return paths.filter(p => {
      try {
        let cleanPath = p;
        if (cleanPath.startsWith('file:///')) cleanPath = cleanPath.substring(8);
        else if (cleanPath.startsWith('file://')) cleanPath = cleanPath.substring(7);
        cleanPath = decodeURIComponent(cleanPath);
        if (process.platform === 'win32' && cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
        cleanPath = path.resolve(cleanPath);
        return fs.existsSync(cleanPath);
      } catch (e) {
        return false;
      }
    });
  } catch (e) {
    console.error('Error validating paths:', e);
    return [];
  }
});

ipcMain.handle('register-context-menu', async (event, enable, lang) => {
  try {
    const isPackaged = app.isPackaged;
    let exePath = process.execPath;
    if (!isPackaged) {
      exePath = path.join(app.getAppPath(), 'dist', 'win-unpacked', 'CyberViewer.exe');
    }

    const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];
    const progIds = ['BMP Image', 'GIF Image', 'JPEG Image', 'PNG Image', 'WebP Image', 'TIFF Image'];
    const { exec } = require('child_process');

    if (enable) {
      if (!fs.existsSync(exePath)) {
        return { success: false, error: 'No se encontró el ejecutable. Construye la app primero.' };
      }

      const label = lang === 'es' ? 'Ver con CyberViewer' : 'View with CyberViewer';
      const assocLabel = lang === 'es' ? 'Abrir con CyberViewer' : 'Open with CyberViewer';

      let commands = [];
      for (const ext of extensions) {
        const regPath = `HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\CyberViewer`;
        commands.push(`reg add "${regPath}" /ve /d "${label}" /f`);
        commands.push(`reg add "${regPath}" /v Icon /d "\\"${exePath}\\"" /f`);
        commands.push(`reg add "${regPath}\\command" /ve /d "\\"${exePath}\\" \\"%1\\"" /f`);
      }

      for (const progId of progIds) {
        const regPath = `HKCU\\Software\\Classes\\${progId}\\shell\\open`;
        commands.push(`reg add "${regPath}" /ve /d "${assocLabel}" /f`);
        commands.push(`reg add "${regPath}" /v Icon /d "\\"${exePath}\\"" /f`);
      }

      const fullCommand = commands.join(' & ');

      return new Promise((resolve) => {
        exec(fullCommand, (err) => {
          if (err) {
            console.error('Error registering context menu:', err);
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
      });
    } else {
      let commands = [];
      for (const ext of extensions) {
        const regPath = `HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\CyberViewer`;
        commands.push(`reg delete "${regPath}" /f`);
      }

      for (const progId of progIds) {
        const regPath = `HKCU\\Software\\Classes\\${progId}\\shell\\open`;
        commands.push(`reg add "${regPath}" /ve /d "Open with CyberViewer" /f`);
        commands.push(`reg delete "${regPath}" /v Icon /f`);
      }

      const fullCommand = commands.join(' & ');

      return new Promise((resolve) => {
        exec(fullCommand, (err) => {
          // Ignore error since keys might not exist
          resolve({ success: true });
        });
      });
    }
  } catch (e) {
    console.error('Error in register-context-menu handler:', e);
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
    file: "File",
    edit: "Edit",
    view: "View",
    navigate: "Navigate",
    copy_image: "Copy Image",
    show_in_folder: "Show in Folder",
    hide_session: "Hide from this session",
    restore_hidden: "Restore hidden ({count})",
    copy_original: "Copy Original",
    go_start: "Go to Start",
    go_end: "Go to End",
    move_trash: "Move to Trash",
    open_folder: "Open image",
    close_image: "Close Image",
    copy_path: "Copy Image Path",
    config: "Configuration",
    about: "About",
    fit_window: "Fit to Window",
    reset_zoom: "Original Size 1:1",
    save_changes: "Save Changes",
    save_as: "Save As...",
    properties: "Properties",
    quit: "Quit",
    maximize: "Maximize",
    restore: "Restore",
    autohide_hud: "Auto-hide Toolbar",
    autohide_nav: "Auto-hide Nav Buttons",
    rotate: "Rotate",
    rotate_r: "Rotate Right 90° (Autosave)",
    rotate_l: "Rotate Left 90° (Autosave)",
    crop: "Crop Image",
    resize: "Resize Image",
    favorite_add: "Add to Favorites",
    favorite_remove: "Remove from Favorites",
  },
  es: {
    file: "Archivo",
    edit: "Editar",
    view: "Ver",
    navigate: "Navegar",
    copy_image: "Copiar Imagen",
    show_in_folder: "Mostrar en Carpeta",
    hide_session: "Ocultar de esta sesión",
    restore_hidden: "Restaurar ocultos ({count})",
    copy_original: "Copiar Original",
    go_start: "Ir al Principio",
    go_end: "Ir al Final",
    move_trash: "Mover a la Papelera",
    open_folder: "Abrir imagen",
    close_image: "Cerrar Imagen",
    copy_path: "Copiar ruta de la imagen",
    config: "Configuración",
    about: "Acerca de",
    fit_window: "Ajustar a la Ventana",
    reset_zoom: "Tamaño Original 1:1",
    save_changes: "Guardar Cambios",
    save_as: "Guardar Como...",
    properties: "Propiedades",
    quit: "Salir",
    maximize: "Maximizar",
    restore: "Restaurar",
    autohide_hud: "Ocultar barra automáticamente",
    autohide_nav: "Ocultar botones de navegación",
    rotate: "Rotar",
    rotate_r: "Rotar 90° Derecha (Auto-guardar)",
    rotate_l: "Rotar 90° Izquierda (Auto-guardar)",
    crop: "Recortar Imagen",
    resize: "Redimensionar Imagen",
    favorite_add: "Añadir a Favoritos",
    favorite_remove: "Quitar de Favoritos",
  }
};

// Menú contextual nativo para campos de texto
ipcMain.on('show-context-menu', (event, props) => {
  const settings = loadSettings();
  const lang = settings.app.language || 'en';
  const t = I18N_MAIN[lang] || I18N_MAIN.en;

  const win = BrowserWindow.fromWebContents(event.sender);
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
              fs.readFile(props.path, (err, data) => {
                if (!err) {
                  const img = nativeImage.createFromBuffer(data);
                  clipboard.writeImage(img);
                }
              });
            }
          },
          {
            label: t.copy_path,
            enabled: !!props.path,
            click: () => {
              if (props.path) {
                clipboard.writeText(props.path);
              }
            }
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
              const result = await dialog.showSaveDialog(win, {
                title: lang === 'es' ? 'Guardar como' : 'Save As',
                defaultPath: path.join(path.dirname(props.path), path.basename(props.path, ext) + '_copy' + ext),
                filters: [
                  { name: 'Images', extensions: [ext.substring(1)] },
                  { name: 'All Files', extensions: ['*'] }
                ]
              });
              if (!result.canceled && result.filePath) {
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
          { label: t.show_in_folder, click: () => shell.showItemInFolder(props.path) },
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
      { label: t.quit, click: () => win.close() }
    ];
  } else if (props.type === 'thumb') {
    template = [
      {
        label: t.file,
        submenu: [
          {
            label: t.copy_original,
            click: () => {
              fs.readFile(props.path, (err, data) => {
                if (!err) {
                  const img = nativeImage.createFromBuffer(data);
                  clipboard.writeImage(img);
                }
              });
            }
          },
          { label: t.show_in_folder, click: () => shell.showItemInFolder(props.path) }
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
      { label: t.quit, click: () => win.close() }
    ];
  } else {
    // Canvas context menu
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
            click: () => {
              if (props.path) {
                clipboard.writeText(props.path);
              }
            }
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
        label: win.isMaximized() ? t.restore : t.maximize,
        click: () => {
          if (win.isMaximized()) {
            win.unmaximize();
          } else {
            win.maximize();
          }
        }
      },
      { type: 'separator' },
      { label: t.quit, click: () => win.close() }
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
