
// ── Media / format helpers (cvlocal protocol) ──
// Use ?p=<absolute path> so Windows drive letters are never parsed as URL hosts.
function mediaUrl(fsPath, bust) {
  if (!fsPath) return '';
  const s = String(fsPath);
  if (s.startsWith('blob:') || s.startsWith('data:')) return s;
  if (s.startsWith('cvlocal:')) {
    try {
      const u = new URL(s.replace(/^cvlocal:/i, 'http:'));
      const p = u.searchParams.get('p');
      if (p) {
        let url = 'cvlocal://media/?p=' + encodeURIComponent(p);
        if (bust != null && bust !== false) url += '&t=' + encodeURIComponent(String(bust));
        return url;
      }
    } catch (_) { /* fall through */ }
  }
  let url = 'cvlocal://media/?p=' + encodeURIComponent(s);
  if (bust != null && bust !== false) url += '&t=' + encodeURIComponent(String(bust));
  return url;
}

function canvasExport(canvas, filePath) {
  const ext = (String(filePath || '').split('.').pop() || '').toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') {
    return {
      buffer: canvas.toDataURL('image/jpeg', 0.95).split(',')[1],
      filePath: filePath
    };
  }
  // Canvas edits are rasterized; keep PNG for lossless/alpha. Re-home exotic
  // containers (gif/webp/bmp/tiff) to .png so bytes match the extension.
  let outPath = filePath;
  if (ext !== 'png') {
    outPath = String(filePath).replace(/\.[^.]+$/i, '.png');
  }
  return {
    buffer: canvas.toDataURL('image/png').split(',')[1],
    filePath: outPath
  };
}

function syncCurrentIndex(idx) {
  state.currentIdx = idx;
  state.current = idx;
}

// ── BASE CONSTANTS & ELECTRON BRIDGE ──
const isElectron = (typeof window.electronAPI !== 'undefined');
const $ = id => document.getElementById(id);

function setCyberTooltip(el, text) {
  if (typeof el === 'string') el = $(el);
  if (!el) return;
  el.setAttribute('data-tooltip', text);
  el.removeAttribute('title');
  el.classList.add('cyber-tooltip');
}

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 20;
const PRELOAD_RANGE = 2;

// ── ELEMENTS ──
const app        = $('app');
const sidebar    = $('sidebar');
const viewerWrap = $('viewer-wrap');
const canvasL    = $('canvas-layer');
const mainImg    = $('main-img');
const spinner    = $('spinner');
const dropZone   = $('drop-zone');
const fileInput  = $('file-input');
const zoomHud    = $('zoom-hud');
const zoomVal    = $('zoom-val');
const btnOpen    = $('btn-open');
const btnConfig  = $('btn-config');
const btnAbout   = $('btn-about');

// ── STATE ──
let thumbObserver = null;
const state = {
  images: [],          // {file, url, w, h, loaded}
  currentIdx: -1,
  current: -1,
  viewMode: 'fit',     // 'fit', 'original', or 'custom'
  zoom: 1,
  panX: 0,
  panY: 0,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  panStartX: 0,
  panStartY: 0,
  transitioning: false,
  sidebarOpen: true,
  scanInProgress: false,
  preloadCache: new Map(),
  currentRotation: 0,
  hasChanges: false,
  isCropping: false,
  isGhost: false,
  zoomTimer: null,
  showingFavs: false,
  nonFavImages: [],
  nonFavCurrent: -1,
  settings: { 
    app: { 
      sidebarOpen: true, 
      statusbarVisible: true, 
      closeToTray: false, 
      autoStart: false, 
      accentColor: '#00d4ff',
      language: 'en',
      favorites: [],
      showTopHints: true,
      checkUpdatesOnStartup: true
    } 
  },
};

const I18N = {
  en: {
    no_images: "— no images —",
    navigate_hint: "NAVIGATE",
    zoom_hint: "ZOOM",
    pan_hint: "PAN",
    sidebar_title: "Sidebar",
    panel: "Panel",
    config: "Configuration",
    about: "About",
    minimize: "Minimize",
    maximize: "Maximize",
    close: "Close",
    center: "CENTER",
    main_img_alt: "Main Image",
    crop_confirm: "CROP & SAVE",
    crop_cancel: "CANCEL",
    crop_create_copy: "Create a Copy",
    crop_create_copy_desc: "Save as a new file without overwriting the original.",
    crop_copy_tooltip: "Enable to save as a new file, disable to overwrite original",
    drop_title: "CYBERVIEWER",
    drop_sub: "Drag images here<br>or click to select",
    drop_btn: "Select Files",
    open_dir: "OPEN",
    fit_to_window: "FIT",
    fullscreen: "FULLSCREEN",
    save: "SAVE",
    radar_tooltip: "SCAN: Folder preload progress / Thumbnails in memory\nHint: Close the sidebar to pause scanning",
    size_tooltip: "CANVAS: Physical resolution in pixels",
    weight_tooltip: "WEIGHT: File weight on disk",
    zoom_tooltip: "VIEW SCALE: Zoom percentage applied in the viewer",
    radar_lbl: "SCAN:",
    zoom_lbl: "ZOOM:",
    fs_badge: "FULLSCREEN",
    ghost_close_title: "Exit Fullscreen",
    config_title: "Configuration",
    personalization: "Personalization",
    accent_color: "Accent Color",
    accent_desc: "Define the primary neon accent color.",
    interface: "Interface",
    sidebar: "Sidebar",
    sidebar_desc: "Show thumbnail sidebar on start.",
    statusbar: "Status Bar",
    statusbar_desc: "Show bottom technical information.",
    system: "System",
    close_to_tray: "Close to Tray",
    close_to_tray_desc: "The app will keep running in the background.",
    auto_start: "Auto Start",
    auto_start_desc: "Launch with Windows (minimized).",
    context_menu: "Context Menu",
    context_menu_desc: "Add CyberViewer to the Windows Explorer right-click menu.",
    language_label: "Language",
    language_desc: "User interface language.",
    opening_monitor: "Target Monitor",
    opening_monitor_desc: "Last used monitor, or force a specific screen.",
    monitor_auto: "Last used",
    config_cancel: "Cancel",
    save_config: "Save Changes",
    // Toasts
    toast_saved: "SETTINGS SAVED",
    toast_copied: "IMAGE COPIED TO CLIPBOARD",
    toast_copy_error: "ERROR COPYING IMAGE",
    toast_no_images: "NO IMAGES LOADED TO COPY",
    toast_crop_confirm: "CROP APPLIED AND SAVED",
    toast_crop_cancel: "CROP CANCELLED",
    toast_hidden: "HIDDEN: ",
    toast_restored: "IMAGES RESTORED",
    // About Modal
    about_title: "[ABOUT]",
    about_subtitle: "v1.6.1 — Pro Viewer",
    about_desc: "Copyright (C) 2026 By CyberGems<br><span style=\"color:var(--cyber-muted);font-size:11px\">High Performance Image Engine</span>",
    about_formats: "Formats: JPG · PNG · GIF · WEBP · BMP · TIFF<br>Electron · Hardware Accelerated",
    about_dev_tools: "OPEN DEVTOOLS",
    about_understood: "UNDERSTOOD",
    // Titles for HUD buttons
    open_title: "Open image (Ctrl+O)",
    fit_title: "Fit to Window (F)",
    orig_title: "Original Size 1:1 (1)",
    fs_title: "Fullscreen (Enter)",
    save_title: "Save Changes (Ctrl+S)",
    rot_l_title: "Rotate Left (L)",
    rot_r_title: "Rotate Right (R)",
    crop_title: "Crop (C)",
    copy_title: "Copy Image (Ctrl+C)",
    ghost_title: "Ghost Mode (G)",
    trash_title: "Move to Trash (Delete)",
    // Additional toasts
    toast_saving_crop: "SAVING CROP...",
    toast_invalid_crop: "INVALID CROP AREA",
    toast_crop_saved: "CROP SAVED",
    toast_initializing_engine: "INITIALIZING ENGINE...",
    toast_focusing_workspace: "FOCUSING WORKSPACE...",
    toast_saving_changes: "SAVING CHANGES...",
    toast_changes_saved: "CHANGES SAVED",
    toast_path_not_found: "PATH NOT FOUND",
    toast_image_not_ready: "IMAGE NOT READY",
    resize_orig_title: "Original Size",
    resize_target_title: "Target Size",
    resize_alteration_lbl: "Alteration:",
    resize_est_weight_lbl: "Result:",
    resize_lock_aspect: "Lock aspect ratio",
    resize_width_tooltip: "Specify target width in pixels",
    resize_height_tooltip: "Specify target height in pixels",
    resize_slider_tooltip: "Adjust scale percentage",
    resize_width_slider_tooltip: "Adjust width scale percentage",
    resize_height_slider_tooltip: "Adjust height scale percentage",
    resize_preset_1_1: "Square aspect ratio (1080x1080 px)",
    resize_preset_720p: "High Definition 16:9 (1280x720 px)",
    resize_preset_1080p: "Full HD 16:9 (1920x1080 px)",
    resize_preset_25: "Scale down to 25%",
    resize_preset_50: "Scale down to 50%",
    resize_preset_200: "Scale up to 200%",
    resize_algo_nearest: "Nearest Neighbor resampling (Fast & sharp)",
    resize_algo_bilinear: "Bilinear resampling (Balanced & smooth)",
    resize_algo_bicubic: "Bicubic resampling (High quality & ultra smooth)",
    resize_algo_fast_lbl: "Fast",
    resize_algo_balanced_lbl: "Balanced",
    resize_algo_hq_lbl: "High Quality",
    resize_width_lbl: "WIDTH",
    resize_height_lbl: "HEIGHT",
    resize_copy_tooltip: "Enable to save as a new file, disable to overwrite original",
    resize_cancel_tooltip: "Cancel and close this dialog",
    resize_apply_tooltip: "Resize and save the image",
    resize_title: "[CYBERVIEWER RESIZE]",
    resize_dimensions: "Target Dimensions",
    width: "WIDTH (PX)",
    height: "HEIGHT (PX)",
    resize_percentage: "Percentage: ",
    resize_presets: "Quick Presets",
    resampling_quality: "Resampling Quality",
    resize_apply: "Resize & Save",
    resize_title_btn: "Resize Image (R)",
    toast_resize_success: "IMAGE RESIZED AND SAVED",
    toast_resize_error: "ERROR RESIZING IMAGE",
    resize_create_copy: "Create a Copy",
    resize_create_copy_desc: "Save as a new file without overwriting the original.",
    show_folder: "SHOW",
    show_folder_title: "Show in Folder (Ctrl+Shift+O)",
    menu: "Menu",
    menu_file: "File",
    menu_edit: "Edit",
    menu_view: "View",
    menu_go: "Go",
    menu_help: "Help",
    menu_open: "Open image",
    menu_paste: "Paste image",
    menu_close_image: "Close image",
    menu_show: "Show in Explorer",
    menu_copy_original: "Copy Original",
    menu_copy_path: "Copy Image Path",
    menu_save_as: "Save As...",
    menu_go_start: "Go to Start",
    menu_go_end: "Go to End",
    menu_hide_session: "Hide from this session",
    menu_restore_hidden: "Restore hidden ({count})",
    menu_maximize: "Maximize",
    menu_restore: "Restore",
    menu_quit: "Quit",
    menu_autohide_nav: "Auto-hide Nav Buttons",
    favorite_add: "Add to Favorites",
    favorite_remove: "Remove from Favorites",
    menu_save: "Save",
    menu_copy: "Copy Image",
    toast_pasted: "IMAGE PASTED FROM CLIPBOARD",
    toast_paste_empty: "NO IMAGE IN CLIPBOARD",
    toast_paste_error: "COULD NOT PASTE IMAGE",
    menu_props: "Properties",
    menu_trash: "Move to Trash",
    menu_rotate_l: "Rotate Left",
    menu_rotate_r: "Rotate Right",
    menu_crop: "Crop",
    menu_resize: "Resize",
    menu_fit: "Fit to Window",
    menu_original: "Actual Size (1:1)",
    menu_fullscreen: "Fullscreen",
    menu_sidebar: "Sidebar",
    menu_autohide: "Auto-hide HUD",
    menu_show_hints: "Keyboard Hints",
    menu_next: "Next Image",
    menu_prev: "Previous Image",
    menu_favorite: "Favorite",
    menu_favs_view: "Favorites View",
    menu_prefs: "Configuration",
    menu_about: "About",
    menu_updates: "Check for Updates",
    menu_devtools: "Developer Tools",
    crop_hint_txt: "CROP",
    resize_hint_txt: "RESIZE",
    ghost_hint_txt: "GHOST",
    fav_title: "Favorite (Ctrl+D)",
    toast_load_image_first: "LOAD AN IMAGE FIRST",
    show_favorites_lbl: "FAVORITES",
    show_all_lbl: "ALL",
    about_check_updates: "Check for Updates",
    about_check_on_startup: "Check for updates on startup",
    about_checking: "Checking updates...",
    about_up_to_date: "CyberViewer is up to date.",
    about_update_avail: "New version available!",
    about_update_err: "Could not check updates.",
    about_download_btn: "Download update",
    about_install_btn: "Install & restart",
    about_downloading: "Downloading… {percent}%",
    about_downloaded: "Update ready to install",
    about_open_releases: "Open releases page",
    about_portable_hint: "Portable builds update via GitHub Releases.",
    about_dev_hint: "Install the NSIS build to enable in-app updates.",
    about_notify_startup: "Update available: v{version}",
    cfg_hud_autohide: "Auto-hide Toolbar",
    cfg_hud_autohide_desc: "Hide the floating toolbar after inactivity.",
    cfg_nav_autohide: "Auto-hide Nav Buttons",
    cfg_nav_autohide_desc: "Hide navigation buttons after inactivity.",
    cfg_show_hints: "Title Bar Hints",
    cfg_show_hints_desc: "Show keyboard shortcuts in the title bar.",
    cfg_hud_delay: "Inactivity Hide Delay",
    cfg_seconds: "{seconds}s",
    prev_title: "Previous Image (ArrowLeft / A)",
    next_title: "Next Image (ArrowRight / D / Space)",
    center_title: "Center active thumbnail in sidebar",
    sidebar_favorites: "Favorites",
    sidebar_folder_empty: "—"
  },
  es: {
    no_images: "— sin imágenes —",
    navigate_hint: "NAVEGAR",
    zoom_hint: "ZOOM",
    pan_hint: "PAN",
    sidebar_title: "Panel lateral",
    panel: "Panel",
    config: "Configuración",
    about: "Acerca de",
    minimize: "Minimizar",
    maximize: "Maximizar",
    close: "Cerrar",
    center: "CENTRAR",
    main_img_alt: "Imagen principal",
    crop_confirm: "RECORTAR Y GUARDAR",
    crop_cancel: "CANCELAR",
    crop_create_copy: "Crear una Copia",
    crop_create_copy_desc: "Guardar como archivo nuevo sin sobrescribir el original.",
    crop_copy_tooltip: "Activar para guardar como archivo nuevo, desactivar para sobrescribir",
    drop_title: "CYBERVIEWER",
    drop_sub: "Arrastra imágenes aquí<br>o haz clic para seleccionar",
    drop_btn: "Seleccionar archivos",
    open_dir: "ABRIR",
    fit_to_window: "AJUSTAR",
    fullscreen: "PANTALLA",
    save: "GUARDAR",
    radar_tooltip: "ESCANEO: Progreso de precarga de la carpeta / Miniaturas en memoria\nConsejo: Cierra la barra lateral para pausar el escaneo",
    size_tooltip: "LIENZO: Resolución física en píxeles de la imagen",
    weight_tooltip: "PESO: Peso del archivo en disco",
    zoom_tooltip: "ESCALA DE VISTA: Porcentaje de zoom aplicado en el visor",
    radar_lbl: "ESCANEO:",
    zoom_lbl: "ZOOM:",
    fs_badge: "PANTALLA COMPLETA",
    ghost_close_title: "Salir de Pantalla Completa",
    config_title: "Configuración",
    personalization: "Personalización",
    accent_color: "Color de Acento",
    accent_desc: "Define el color principal de la interfaz neon.",
    interface: "Interfaz",
    sidebar: "Panel Lateral",
    sidebar_desc: "Mostrar miniaturas al iniciar.",
    statusbar: "Barra de Estado",
    statusbar_desc: "Mostrar información técnica inferior.",
    system: "Sistema",
    close_to_tray: "Cerrar a la Bandeja",
    close_to_tray_desc: "La app seguirá corriendo en segundo plano.",
    auto_start: "Inicio Automático",
    auto_start_desc: "Arrancar con Windows (minimizado).",
    context_menu: "Menú Contextual",
    context_menu_desc: "Añadir CyberViewer al menú contextual del Explorador de Windows.",
    language_label: "Idioma",
    language_desc: "Idioma de la interfaz de usuario.",
    opening_monitor: "Monitor de Apertura",
    opening_monitor_desc: "Último monitor usado, o forzar una pantalla concreta.",
    monitor_auto: "Último usado",
    config_cancel: "Cancelar",
    save_config: "Guardar Cambios",
    // Toasts
    toast_saved: "CONFIGURACIÓN GUARDADA",
    toast_copied: "IMAGEN COPIADA AL PORTAPAPELES",
    toast_copy_error: "ERROR AL COPIAR IMAGEN",
    toast_no_images: "NO HAY IMÁGENES PARA COPIAR",
    toast_crop_confirm: "RECORTE APLICADO Y GUARDADO",
    toast_crop_cancel: "RECORTE CANCELADO",
    toast_hidden: "OCULTO: ",
    toast_restored: "IMÁGENES RESTAURADAS",
    // About Modal
    about_title: "[ACERCA DE]",
    about_subtitle: "v1.6.1 — Visor Pro",
    about_desc: "Copyright (C) 2026 By CyberGems<br><span style=\"color:var(--cyber-muted);font-size:11px\">High Performance Image Engine</span>",
    about_formats: "Formatos: JPG · PNG · GIF · WEBP · BMP · TIFF<br>Electron · Hardware Accelerated",
    about_dev_tools: "ABRIR CONSOLA",
    about_understood: "ENTENDIDO",
    // Titles for HUD buttons
    open_title: "Abrir imagen (Ctrl+O)",
    fit_title: "Ajustar a la ventana (F)",
    orig_title: "Tamaño original 1:1 (1)",
    fs_title: "Pantalla completa (Enter)",
    save_title: "Guardar cambios (Ctrl+S)",
    rot_l_title: "Rotar a la izquierda (L)",
    rot_r_title: "Rotar a la derecha (R)",
    crop_title: "Recortar (C)",
    copy_title: "Copiar Imagen (Ctrl+C)",
    ghost_title: "Modo Ghost (G)",
    trash_title: "Mover a la Papelera (Delete)",
    // Additional toasts
    toast_saving_crop: "GUARDANDO RECORTE...",
    toast_invalid_crop: "ÁREA DE RECORTE INVÁLIDA",
    toast_crop_saved: "RECORTE GUARDADO",
    toast_initializing_engine: "INICIALIZANDO MOTOR...",
    toast_focusing_workspace: "ENFOCANDO ÁREA DE TRABAJO...",
    toast_saving_changes: "GUARDANDO CAMBIOS...",
    toast_changes_saved: "CAMBIOS GUARDADOS",
    toast_path_not_found: "RUTA NO ENCONTRADA",
    toast_image_not_ready: "IMAGEN NO LISTA",
    resize_orig_title: "Tamaño Original",
    resize_target_title: "Tamaño de Destino",
    resize_alteration_lbl: "Alteración:",
    resize_est_weight_lbl: "Resultado:",
    resize_lock_aspect: "Mantener proporción de aspecto",
    resize_width_tooltip: "Especificar ancho destino en píxeles",
    resize_height_tooltip: "Especificar alto destino en píxeles",
    resize_slider_tooltip: "Ajustar porcentaje de escala",
    resize_width_slider_tooltip: "Ajustar porcentaje de escala del ancho",
    resize_height_slider_tooltip: "Ajustar porcentaje de escala del alto",
    resize_preset_1_1: "Relación cuadrada (1080x1080 px)",
    resize_preset_720p: "Alta Definición 16:9 (1280x720 px)",
    resize_preset_1080p: "Full HD 16:9 (1920x1080 px)",
    resize_preset_25: "Reducir escala al 25%",
    resize_preset_50: "Reducir escala al 50%",
    resize_preset_200: "Aumentar escala al 200%",
    resize_algo_nearest: "Remuestreo por Vecino Más Próximo (Rápido y nítido)",
    resize_algo_bilinear: "Remuestreo Bilineal (Equilibrado y suave)",
    resize_algo_bicubic: "Remuestreo Bicúbico (Alta calidad y ultra suave)",
    resize_algo_fast_lbl: "Fast",
    resize_algo_balanced_lbl: "Balanced",
    resize_algo_hq_lbl: "High Quality",
    resize_width_lbl: "ANCHO",
    resize_height_lbl: "ALTO",
    resize_copy_tooltip: "Activar para guardar como archivo nuevo, desactivar para sobrescribir",
    resize_cancel_tooltip: "Cancelar y cerrar esta ventana",
    resize_apply_tooltip: "Redimensionar y guardar la imagen",
    resize_title: "[CYBERVIEWER REDIMENSIONAR]",
    resize_dimensions: "Dimensiones de Destino",
    width: "ANCHO (PX)",
    height: "ALTO (PX)",
    resize_percentage: "Porcentaje: ",
    resize_presets: "Ajustes Rápidos",
    resampling_quality: "Calidad de Remuestreo",
    resize_apply: "Redimensionar y Guardar",
    resize_title_btn: "Redimensionar Imagen (R)",
    toast_resize_success: "IMAGEN REDIMENSIONADA Y GUARDADA",
    toast_resize_error: "ERROR AL REDIMENSIONAR LA IMAGEN",
    resize_create_copy: "Crear una Copia",
    resize_create_copy_desc: "Guardar como archivo nuevo sin sobrescribir el original.",
    show_folder: "MOSTRAR",
    show_folder_title: "Mostrar en Carpeta (Ctrl+Shift+O)",
    menu: "Menú",
    menu_file: "Archivo",
    menu_edit: "Editar",
    menu_view: "Vista",
    menu_go: "Navegar",
    menu_help: "Ayuda",
    menu_open: "Abrir imagen",
    menu_paste: "Pegar imagen",
    menu_close_image: "Cerrar imagen",
    menu_show: "Mostrar en explorador",
    menu_copy_original: "Copiar Original",
    menu_copy_path: "Copiar ruta de la imagen",
    menu_save_as: "Guardar Como...",
    menu_go_start: "Ir al Principio",
    menu_go_end: "Ir al Final",
    menu_hide_session: "Ocultar de esta sesión",
    menu_restore_hidden: "Restaurar ocultos ({count})",
    menu_maximize: "Maximizar",
    menu_restore: "Restaurar",
    menu_quit: "Salir",
    menu_autohide_nav: "Ocultar botones de navegación",
    favorite_add: "Añadir a Favoritos",
    favorite_remove: "Quitar de Favoritos",
    menu_save: "Guardar",
    menu_copy: "Copiar imagen",
    toast_pasted: "IMAGEN PEGADA DESDE PORTAPAPELES",
    toast_paste_empty: "NO HAY IMAGEN EN EL PORTAPAPELES",
    toast_paste_error: "NO SE PUDO PEGAR LA IMAGEN",
    menu_props: "Propiedades",
    menu_trash: "Mover a papelera",
    menu_rotate_l: "Rotar izquierda",
    menu_rotate_r: "Rotar derecha",
    menu_crop: "Recortar",
    menu_resize: "Redimensionar",
    menu_fit: "Ajustar a ventana",
    menu_original: "Tamaño real (1:1)",
    menu_fullscreen: "Pantalla completa",
    menu_sidebar: "Barra lateral",
    menu_autohide: "Auto-ocultar HUD",
    menu_show_hints: "Atajos de teclado",
    menu_next: "Imagen siguiente",
    menu_prev: "Imagen anterior",
    menu_favorite: "Favorito",
    menu_favs_view: "Ver favoritos",
    menu_prefs: "Configuración",
    menu_about: "Acerca de",
    menu_updates: "Buscar actualizaciones",
    menu_devtools: "Herramientas de desarrollo",
    crop_hint_txt: "RECORTAR",
    resize_hint_txt: "REDIM",
    ghost_hint_txt: "GHOST",
    fav_title: "Favorito (Ctrl+D)",
    toast_load_image_first: "CARGA UNA IMAGEN PRIMERO",
    show_favorites_lbl: "FAVORITOS",
    show_all_lbl: "TODAS",
    about_check_updates: "Buscar Actualizaciones",
    about_check_on_startup: "Buscar actualizaciones al iniciar",
    about_checking: "Buscando actualizaciones...",
    about_up_to_date: "CyberViewer está actualizado.",
    about_update_avail: "¡Nueva versión disponible!",
    about_update_err: "No se pudo buscar actualizaciones.",
    about_download_btn: "Descargar actualización",
    about_install_btn: "Instalar y reiniciar",
    about_downloading: "Descargando… {percent}%",
    about_downloaded: "Actualización lista para instalar",
    about_open_releases: "Abrir página de releases",
    about_portable_hint: "La versión portable se actualiza desde GitHub Releases.",
    about_dev_hint: "Instala el setup NSIS para actualizar desde la app.",
    about_notify_startup: "Actualización disponible: v{version}",
    cfg_hud_autohide: "Ocultar barra automáticamente",
    cfg_hud_autohide_desc: "Ocultar la barra de herramientas tras inactividad.",
    cfg_nav_autohide: "Ocultar botones de navegación",
    cfg_nav_autohide_desc: "Ocultar botones de navegación tras inactividad.",
    cfg_show_hints: "Atajos de Título",
    cfg_show_hints_desc: "Mostrar accesos rápidos de teclado en la barra superior.",
    cfg_hud_delay: "Retraso de ocultación",
    cfg_seconds: "{seconds}s",
    prev_title: "Imagen Anterior (ArrowLeft / A)",
    next_title: "Imagen Siguiente (ArrowRight / D / Space)",
    center_title: "Centrar miniatura activa en el panel lateral",
    sidebar_favorites: "Favoritos",
    sidebar_folder_empty: "—"
  }
};

function updateLanguage(lang = 'en') {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (I18N[lang] && I18N[lang][key] !== undefined) {
      if (I18N[lang][key].includes('<')) {
        el.innerHTML = I18N[lang][key];
      } else {
        el.textContent = I18N[lang][key];
      }
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (I18N[lang] && I18N[lang][key] !== undefined) {
      setCyberTooltip(el, I18N[lang][key]);
    }
  });

  document.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
    const key = el.dataset.i18nTooltip;
    if (I18N[lang] && I18N[lang][key] !== undefined) {
      el.setAttribute('data-tooltip', I18N[lang][key]);
    }
  });

  document.querySelectorAll('[data-i18n-alt]').forEach(el => {
    const key = el.dataset.i18nAlt;
    if (I18N[lang] && I18N[lang][key] !== undefined) {
      el.setAttribute('alt', I18N[lang][key]);
    }
  });
  if (typeof syncFavoritesToggleButtonState === 'function') {
    syncFavoritesToggleButtonState(lang);
  }
  if (typeof updateSidebarFolderHeader === 'function') {
    updateSidebarFolderHeader();
  }
}

function closeImage() {
  state.scanInProgress = false;
  state.images.forEach(im => { if (im.url) URL.revokeObjectURL(im.url); });
  state.preloadCache.clear();
  state.images = [];
  syncCurrentIndex(-1);
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  state.currentRotation = 0;
  state.hasChanges = false;
  state.isCropping = false;

  updateSaveButton();
  updateHUDStates();

  dropZone.style.display = 'flex';

  mainImg.src = '';
  mainImg.classList.remove('loaded', 'slide-in-left', 'slide-in-right', 'slide-out-left', 'slide-out-right');
  mainImg.removeAttribute('src');
  
  canvasL.style.transform = '';
  canvasL.style.transition = '';

  const viewerFilename = $('viewer-filename');
  if (viewerFilename) {
    viewerFilename.textContent = '';
    viewerFilename.removeAttribute('data-tooltip');
    viewerFilename.classList.remove('cyber-tooltip', 'tooltip-bottom');
  }

  buildSidebar();
  updateCounter();
  updateFileStats();

  const radarPct = $('radar-pct');
  if (radarPct) radarPct.textContent = '0%';
  const radarCount = $('radar-count');
  if (radarCount) radarCount.textContent = ' [0/0] ';

  zoomVal.textContent = '100%';
  const zoomPct = $('zoom-pct');
  if (zoomPct) zoomPct.textContent = '100%';
  const zoomSlider = $('zoom-slider');
  if (zoomSlider) zoomSlider.value = 500;

  updateFavButtonState();
}

// ── FILE HANDLING ──
function loadFiles(files, initialIdx = 0) {
  // Cancelar cualquier scan previo antes de reemplazar datos
  state.scanInProgress = false;
  if (state.showingFavs) {
    state.showingFavs = false;
    if (typeof syncFavoritesToggleButtonState === 'function') {
      syncFavoritesToggleButtonState();
    }
  }
  const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif'];
  const imgs = Array.from(files).filter(f => {
    if (f.type.startsWith('image/')) return true;
    const ext = f.name.split('.').pop().toLowerCase();
    return allowedExts.includes(ext);
  });
  
  if (!imgs.length) {
    console.warn('No se encontraron imágenes válidas.');
    return;
  }

  // Revoke old URLs
  state.images.forEach(im => { if (im.url) URL.revokeObjectURL(im.url); });
  state.preloadCache.clear();
  state.images = imgs.map(f => ({ file: f, url: null, w: 0, h: 0, loaded: false, size: f.size }));

  const pathsToAllow = state.images.map(im => im.file && im.file.path).filter(Boolean);
  const finishLoad = () => {
    syncCurrentIndex(initialIdx);
    console.log('Archivos cargados:', state.images.length);
    dropZone.style.display = 'none';
    buildSidebar();
    showImage(initialIdx, null, true);
    startBackgroundScan();
  };

  if (isElectron && pathsToAllow.length && window.electronAPI.registerPaths) {
    window.electronAPI.registerPaths(pathsToAllow).then(finishLoad).catch(finishLoad);
  } else {
    finishLoad();
  }
}

async function scanFolder(filePath) {
  if (!isElectron || !filePath) return;
  const neighbors = await window.electronAPI.scanFolder(filePath);
  if (neighbors.length > 0) {
    const files = neighbors.map(p => {
      const name = p.path.split(/[\\/]/).pop();
      return { name, path: p.path, size: p.size, type: '' };
    });
    const targetIdx = neighbors.findIndex(p => p.path.toLowerCase() === filePath.toLowerCase());
    loadFiles(files, targetIdx !== -1 ? targetIdx : 0);
  } else {
    const name = filePath.split(/[\\/]/).pop();
    loadFiles([{ name, path: filePath, size: 0, type: '' }]);
  }
}

async function startBackgroundScan() {
  const total = state.images.length;
  if (total === 0) return;
  
  let processed = 0;
  let completedAll = true;
  state.scanInProgress = true;
  
  // ORDEN DE ESCANEO: Empezar desde el actual y expandirse (prioridad de cercanía)
  const start = state.currentIdx;
  const order = [];
  for (let i = 0; i < total; i++) {
    const idx = (start + i) % total;
    order.push(idx);
  }

  for (const idx of order) {
    if (!state.scanInProgress || !state.sidebarOpen) {
      updateThumbProgress(processed, total, true);
      completedAll = false;
      break;
    }
    const im = state.images[idx];
    if (im.hidden) continue;
    
    await window.electronAPI.getThumbnail(im.file.path);
    processed++;
    updateThumbProgress(processed, total);
    
    // Si la imagen está a la vista, cargar el thumb ahora mismo
    const imgEl = sidebar.querySelector(`.thumb-item[data-index="${idx}"] img`);
    if (imgEl && imgEl.style.opacity === '0') {
      loadThumb(idx, imgEl);
    }
  }
  
  if (completedAll) {
    state.scanInProgress = false;
  }
}

// ── SIDEBAR ──
function folderDirFromPath(filePath) {
  if (!filePath) return '';
  const norm = String(filePath).replace(/[\\/]+$/, '');
  const i = Math.max(norm.lastIndexOf('\\'), norm.lastIndexOf('/'));
  return i >= 0 ? norm.slice(0, i) : '';
}

function folderNameFromPath(dirPath) {
  if (!dirPath) return '';
  const norm = String(dirPath).replace(/[\\/]+$/, '');
  const parts = norm.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function updateSidebarFolderHeader() {
  const el = $('sidebar-folder');
  const nameEl = $('sidebar-folder-name');
  if (!el || !nameEl) return;

  const lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
  const t = I18N[lang] || I18N.en;

  if (state.showingFavs) {
    el.classList.remove('is-empty');
    el.classList.add('is-favs');
    el.setAttribute('aria-hidden', 'false');
    nameEl.textContent = t.sidebar_favorites || 'Favorites';
    setCyberTooltip(el, t.sidebar_favorites || 'Favorites');
    el.classList.add('tooltip-bottom');
    return;
  }

  el.classList.remove('is-favs');

  let filePath = null;
  const cur = state.images[state.currentIdx] || state.images[state.current];
  if (cur && cur.file && cur.file.path) {
    filePath = cur.file.path;
  } else {
    const first = state.images.find((im) => im && !im.hidden && im.file && im.file.path);
    if (first) filePath = first.file.path;
  }

  if (!filePath) {
    el.classList.add('is-empty');
    el.setAttribute('aria-hidden', 'true');
    nameEl.textContent = t.sidebar_folder_empty || '—';
    el.removeAttribute('data-tooltip');
    el.classList.remove('cyber-tooltip', 'tooltip-bottom');
    return;
  }

  const dir = folderDirFromPath(filePath);
  const name = folderNameFromPath(dir) || folderNameFromPath(filePath) || (t.sidebar_folder_empty || '—');
  el.classList.remove('is-empty');
  el.setAttribute('aria-hidden', 'false');
  nameEl.textContent = name;
  setCyberTooltip(el, dir || filePath);
  el.classList.add('tooltip-bottom');
}

function buildSidebar() {
  const container = $('sidebar-inner');
  if (!container) return;
  container.innerHTML = '';

  if (thumbObserver) thumbObserver.disconnect();
  thumbObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const idx = parseInt(entry.target.dataset.index);
        const img = entry.target.querySelector('img');
        if (img && img.style.opacity === '0') loadThumb(idx, img);
      }
    });
  }, { root: $('sidebar-scroll'), rootMargin: '400px' });

  const fragment = document.createDocumentFragment();

  state.images.forEach((im, i) => {
    if (im.hidden) return; // No renderizar si está oculto

    const item = document.createElement('div');
    item.className = 'thumb-item' + (i === state.currentIdx ? ' active' : '');
    item.dataset.index = i;

    const img = document.createElement('img');
    img.alt = '';
    img.style.opacity = '0';
    img.style.transition = 'opacity 200ms ease';
    img.draggable = false; // Bloquear drag nativo

    const idx = document.createElement('span');
    idx.className = 'thumb-idx';
    idx.textContent = i + 1;

    item.appendChild(img);
    item.appendChild(idx);

    thumbObserver.observe(item);

    item.addEventListener('contextmenu', (e) => {
      showCustomContextMenu(e, 'thumb', { 
        path: im.file.path,
        index: i
      });
    });

    item.addEventListener('click', () => {
      if (state.transitioning) return;
      const dir = i > state.currentIdx ? 'left' : 'right';
      showImage(i, dir);
    });

    fragment.appendChild(item);
  });

  container.appendChild(fragment);
  updateNavVisibility();
  updateSidebarFolderHeader();
}

// ── CONTEXT MENU ──
window.addEventListener('contextmenu', (e) => {
  if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
  
  e.preventDefault();
  
  if (e.target.closest('.thumb-item')) return;
  if (e.target.closest('#kbd-hint')) return; // Evitar menú en HUD
  if (e.target.closest('#topbar')) return;    // Evitar menú en barra de título
  if (e.target.closest('#sidebar')) return;   // Evitar menú en barra lateral

  const isInsideViewer = e.target.closest('#viewer-wrap');
  if (isInsideViewer && state.images.length > 0) {
    const rect = mainImg.getBoundingClientRect();
    const onImage = (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
    if (onImage) {
      showCustomContextMenu(e, 'image', { 
        path: state.images[state.currentIdx]?.file?.path || null,
        index: state.currentIdx
      });
    } else {
      showCustomContextMenu(e, 'canvas', { 
        path: state.images[state.currentIdx]?.file?.path || null
      });
    }
  } else {
    showCustomContextMenu(e, 'canvas', {
      path: null
    });
  }
});

function showCustomContextMenu(e, type, data) {
  e.preventDefault();
  e.stopPropagation();

  // Close main/burger menu if open
  const mainMenu = $('main-menu');
  const btnMenu = $('btn-menu');
  if (mainMenu && mainMenu.classList.contains('open')) {
    mainMenu.classList.remove('open');
    if (btnMenu) btnMenu.classList.remove('open');
  }

  const menu = $('custom-ctx-menu');
  if (!menu) return;

  menu.innerHTML = '';
  menu.className = 'menu-panel context-menu-panel';

  const template = buildMenuTemplate(type, data);
  if (!template || template.length === 0) return;

  renderMenuTemplate(menu, template);

  menu.style.display = 'block';
  menu.style.visibility = 'hidden';

  const menuW = menu.offsetWidth;
  const menuH = menu.offsetHeight;

  let x = e.clientX;
  let y = e.clientY;

  const winW = window.innerWidth;
  const winH = window.innerHeight;

  if (x + menuW > winW) {
    x = winW - menuW - 10;
  }
  if (y + menuH > winH) {
    y = winH - menuH - 10;
  }
  
  x = Math.max(10, x);
  y = Math.max(10, y);

  const submenuW = 216;
  if (x + menuW + submenuW > winW) {
    menu.classList.add('open-left');
  }

  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.style.visibility = 'visible';
  menu.classList.add('open');

  const closeListener = (evt) => {
    if (!menu.contains(evt.target)) {
      hideCustomContextMenu();
      document.removeEventListener('click', closeListener);
      document.removeEventListener('contextmenu', closeListener);
    }
  };
  
  setTimeout(() => {
    document.addEventListener('click', closeListener);
    document.addEventListener('contextmenu', closeListener);
  }, 50);
}

function hideCustomContextMenu() {
  const menu = $('custom-ctx-menu');
  if (menu) {
    menu.style.display = 'none';
    menu.classList.remove('open');
  }
}

function buildMenuTemplate(type, data) {
  const lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
  const getTxt = (key, count) => {
    let t = I18N[lang][key] || I18N.en[key] || '';
    if (count !== undefined) t = t.replace('{count}', count);
    return t;
  };

  const hasImages = state.images.length > 0;
  const isFav = hasImages && state.settings.app.favorites && state.images[state.currentIdx]?.file?.path && state.settings.app.favorites.includes(state.images[state.currentIdx].file.path);

  if (type === 'thumb') {
    const hiddenCount = state.images.filter(im => im.hidden).length;
    return [
      {
        label: getTxt('menu_file'),
        isSub: true,
        items: [
          {
            label: getTxt('menu_copy_original'),
            action: () => window.electronAPI.copyImage(data.path)
          },
          {
            label: getTxt('menu_show'),
            action: () => window.electronAPI.showItemInFolder(data.path)
          }
        ]
      },
      {
        label: getTxt('menu_go'),
        isSub: true,
        items: [
          {
            label: getTxt('menu_go_start'),
            action: () => showImage(0, 'right', true)
          },
          {
            label: getTxt('menu_go_end'),
            action: () => showImage(state.images.length - 1, 'left', true)
          }
        ]
      },
      { type: 'separator' },
      {
        label: getTxt('menu_hide_session'),
        action: () => executeAction({ action: 'remove-from-list', index: data.index })
      },
      {
        label: getTxt('menu_restore_hidden', hiddenCount),
        enabled: hiddenCount > 0,
        visible: hiddenCount > 0,
        action: () => executeAction({ action: 'restore-hidden' })
      },
      { type: 'separator' },
      {
        label: getTxt('menu_trash'),
        shortcut: 'Del',
        danger: true,
        action: () => executeAction({ action: 'request-delete', index: data.index, path: data.path })
      },
      { type: 'separator' },
      {
        label: getTxt('menu_quit'),
        action: () => window.electronAPI.close()
      }
    ];
  } else if (type === 'image') {
    const hiddenCount = state.images.filter(im => im.hidden).length;
    return [
      {
        label: getTxt('menu_file'),
        isSub: true,
        items: [
          {
            label: getTxt('menu_copy'),
            shortcut: 'Ctrl+C',
            action: () => copyToClipboard()
          },
          {
            label: getTxt('menu_paste'),
            shortcut: 'Ctrl+V',
            action: () => pasteFromClipboard()
          },
          {
            label: getTxt('menu_copy_path'),
            enabled: !!data.path,
            visible: !!data.path,
            action: () => {
              if (data.path) {
                navigator.clipboard.writeText(data.path);
                showToast(lang === 'es' ? 'RUTA COPIADA' : 'PATH COPIED', 'success');
              }
            }
          },
          {
            label: getTxt('menu_save'),
            shortcut: 'Ctrl+S',
            enabled: state.hasChanges || !data.path,
            action: () => saveCurrent()
          },
          {
            label: getTxt('menu_save_as'),
            action: () => showSaveAsDialog(data.path)
          },
          {
            label: getTxt('menu_close_image'),
            action: () => closeImage()
          }
        ]
      },
      {
        label: getTxt('menu_edit'),
        isSub: true,
        items: [
          {
            label: getTxt('menu_rotate_r'),
            shortcut: 'E',
            action: () => rotateAndSave(90)
          },
          {
            label: getTxt('menu_rotate_l'),
            shortcut: 'Q',
            action: () => rotateAndSave(-90)
          },
          { type: 'separator' },
          {
            label: getTxt('menu_crop'),
            shortcut: 'C',
            action: () => $('btn-crop').click()
          },
          {
            label: getTxt('menu_resize'),
            shortcut: 'R',
            action: () => $('btn-resize').click()
          },
          { type: 'separator' },
          {
            label: isFav ? getTxt('favorite_remove') : getTxt('favorite_add'),
            shortcut: 'Ctrl+D',
            action: () => toggleFavorite()
          }
        ]
      },
      {
        label: getTxt('menu_view'),
        isSub: true,
        enabled: !!data.path,
        visible: !!data.path,
        items: [
          {
            label: getTxt('menu_show'),
            action: () => window.electronAPI.showItemInFolder(data.path)
          },
          {
            label: getTxt('menu_props'),
            action: () => showPropertiesPanel(data.path)
          }
        ]
      },
      { type: 'separator' },
      {
        label: getTxt('menu_trash'),
        shortcut: 'Del',
        danger: true,
        action: () => executeAction({ action: 'request-delete', index: data.index, path: data.path })
      },
      { type: 'separator' },
      {
        label: getTxt('menu_hide_session'),
        action: () => executeAction({ action: 'remove-from-list', index: data.index })
      },
      {
        label: getTxt('menu_restore_hidden', hiddenCount),
        enabled: hiddenCount > 0,
        visible: hiddenCount > 0,
        action: () => executeAction({ action: 'restore-hidden' })
      },
      { type: 'separator' },
      {
        label: getTxt('menu_quit'),
        action: () => window.electronAPI.close()
      }
    ];
  } else {
    // Canvas context menu
    const hiddenCount = state.images.filter(im => im.hidden).length;
    return [
      {
        label: getTxt('menu_file'),
        isSub: true,
        items: [
          {
            label: getTxt('menu_open'),
            shortcut: 'Ctrl+O',
            action: () => $('btn-open-hud').click()
          },
          {
            label: getTxt('menu_paste'),
            shortcut: 'Ctrl+V',
            action: () => pasteFromClipboard()
          },
          {
            label: getTxt('menu_close_image'),
            enabled: hasImages,
            visible: hasImages,
            action: () => closeImage()
          },
          {
            label: getTxt('menu_copy_path'),
            enabled: hasImages && !!data.path,
            visible: hasImages,
            action: () => {
              if (data.path) {
                navigator.clipboard.writeText(data.path);
                showToast(lang === 'es' ? 'RUTA COPIADA' : 'PATH COPIED', 'success');
              }
            }
          }
        ]
      },
      {
        label: getTxt('menu_view'),
        isSub: true,
        items: [
          {
            label: getTxt('menu_fit'),
            shortcut: 'F',
            enabled: hasImages,
            action: () => $('btn-fit-hud').click()
          },
          {
            label: getTxt('menu_original'),
            shortcut: '1',
            enabled: hasImages,
            action: () => $('btn-orig-hud').click()
          },
          { type: 'separator' },
          {
            label: getTxt('menu_autohide'),
            type: 'checkbox',
            checked: !!state.settings.app.hudAutoHide,
            action: () => {
              state.settings.app.hudAutoHide = !state.settings.app.hudAutoHide;
              if (isElectron) window.electronAPI.saveSettings(state.settings.app);
              applySettings();
              resetHudTimer();
            }
          },
          {
            label: getTxt('menu_autohide_nav'),
            type: 'checkbox',
            checked: state.settings.app.navAutoHide !== false,
            action: () => {
              state.settings.app.navAutoHide = !state.settings.app.navAutoHide;
              if (isElectron) window.electronAPI.saveSettings(state.settings.app);
              applySettings();
              resetHudTimer();
            }
          },
          {
            label: getTxt('menu_show_hints'),
            type: 'checkbox',
            checked: state.settings.app.showTopHints !== false,
            action: () => {
              state.settings.app.showTopHints = (state.settings.app.showTopHints !== false) ? false : true;
              if (isElectron) window.electronAPI.saveSettings(state.settings.app);
              applySettings();
            }
          }
        ]
      },
      {
        label: getTxt('menu_edit'),
        isSub: true,
        enabled: hasImages,
        items: [
          {
            label: getTxt('menu_rotate_r'),
            shortcut: 'E',
            action: () => rotateAndSave(90)
          },
          {
            label: getTxt('menu_rotate_l'),
            shortcut: 'Q',
            action: () => rotateAndSave(-90)
          },
          { type: 'separator' },
          {
            label: getTxt('menu_crop'),
            shortcut: 'C',
            action: () => $('btn-crop').click()
          },
          {
            label: getTxt('menu_resize'),
            shortcut: 'R',
            action: () => $('btn-resize').click()
          },
          { type: 'separator' },
          {
            label: isFav ? getTxt('favorite_remove') : getTxt('favorite_add'),
            shortcut: 'Ctrl+D',
            action: () => toggleFavorite()
          }
        ]
      },
      { type: 'separator' },
      {
        label: getTxt('config'),
        action: () => openConfig()
      },
      {
        label: getTxt('about'),
        action: () => openAbout()
      },
      { type: 'separator' },
      {
        label: getTxt('menu_maximize'),
        action: () => {
          if (isElectron) window.electronAPI.maximize();
        }
      },
      { type: 'separator' },
      {
        label: getTxt('menu_quit'),
        action: () => window.electronAPI.close()
      }
    ];
  }
}

function renderMenuTemplate(container, template) {
  template.forEach(item => {
    if (item.type === 'separator') {
      const sep = document.createElement('div');
      sep.className = 'menu-divider';
      container.appendChild(sep);
      return;
    }

    if (item.visible === false) return;

    if (item.isSub) {
      const cat = document.createElement('div');
      cat.className = 'menu-cat';
      cat.setAttribute('data-sub', '');
      if (item.enabled === false) cat.classList.add('disabled');

      const label = document.createElement('span');
      label.className = 'menu-label';
      label.textContent = item.label;
      cat.appendChild(label);

      const arrow = document.createElement('span');
      arrow.className = 'menu-arrow';
      arrow.innerHTML = '&#8250;';
      cat.appendChild(arrow);

      const sub = document.createElement('div');
      sub.className = 'menu-sub';
      renderMenuTemplate(sub, item.items);
      cat.appendChild(sub);

      container.appendChild(cat);
    } else {
      const btn = document.createElement('button');
      btn.className = 'menu-item';
      if (item.enabled === false) btn.classList.add('disabled');
      if (item.type === 'checkbox') {
        const check = document.createElement('span');
        check.className = 'menu-check';
        check.innerHTML = '&#10003;';
        btn.appendChild(check);
        if (item.checked) btn.classList.add('checked');
      }

      const label = document.createElement('span');
      label.className = 'menu-label';
      label.textContent = item.label;
      btn.appendChild(label);

      if (item.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.className = 'menu-shortcut';
        shortcut.textContent = item.shortcut;
        btn.appendChild(shortcut);
      }

      if (item.danger) {
        btn.classList.add('danger');
      }

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideCustomContextMenu();
        if (item.action) item.action();
      });

      container.appendChild(btn);
    }
  });
}

async function showSaveAsDialog(filePath) {
  if (!isElectron) return;
  const lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
  const im = state.images[state.current];
  const sourcePath = filePath || imageDiskPath(im);
  const defaultName = sourcePath
    ? sourcePath.replace(/\.[^.]+$/, (m) => '_copy' + m)
    : ((im && im.file && im.file.name) || clipboardDefaultName());
  const ext = (defaultName.split('.').pop() || 'png').toLowerCase();

  const options = {
    title: lang === 'es' ? 'Guardar como' : 'Save As',
    defaultPath: defaultName,
    filters: [
      { name: 'Images', extensions: [ext] },
      { name: 'All Files', extensions: ['*'] }
    ]
  };

  const result = await window.electronAPI.showSaveDialog(options);
  if (result && !result.canceled && result.filePath) {
    await saveAsPath(result.filePath);
  }
}

function executeAction(data) {
  const lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
  switch (data.action) {
    case 'remove-from-list':
      if (data.index !== undefined) {
        const removed = state.images[data.index];
        removed.hidden = true;
        
        const visible = state.images.filter(im => !im.hidden);
        if (visible.length === 0) {
          location.reload();
        } else {
          // Buscar siguiente visible
          let next = data.index;
          while(next < state.images.length && state.images[next].hidden) next++;
          if (next >= state.images.length) {
             next = data.index;
             while(next >= 0 && state.images[next].hidden) next--;
          }
          
          buildSidebar();
          showImage(next, null);
          const lang = state.settings.app.language || 'en';
          showToast((I18N[lang].toast_hidden || 'HIDDEN: ') + removed.file.name.toUpperCase());
        }
      }
      break;
    case 'restore-hidden':
      state.images.forEach(im => im.hidden = false);
      buildSidebar();
      showToast(I18N[lang].toast_restored, 'success');
      break;
    case 'go-start':
      showImage(0, 'right', true);
      break;
    case 'go-end':
      showImage(state.images.length - 1, 'left', true);
      break;
    case 'request-delete':
      if (data.index !== undefined && data.path) {
        const name = data.path.split(/[\\/]/).pop();
        showCyberConfirm({
          title: lang === 'es' ? 'Mover a la papelera' : 'Move to Trash',
          message: lang === 'es' 
            ? '¿Estás seguro de que quieres mover esta imagen a la papelera de reciclaje?' 
            : 'Are you sure you want to move this image to the Recycle Bin?',
          detail: name,
          danger: true,
          onConfirm: async () => {
            try {
              const result = await window.electronAPI.moveToTrashDirect(data.path);
              if (result && result.success) {
                handleFileDeleted(data.index);
              }
            } catch (err) {
              console.error('Error al mover a la papelera:', err);
            }
          }
        });
      }
      break;
    case 'file-deleted':
      if (data.index !== undefined) {
        handleFileDeleted(data.index);
      }
      break;
    case 'open-dir':
      btnOpen.click();
      break;
    case 'show-config':
      btnConfig.click();
      break;
    case 'toggle-autohide':
      state.settings.app.hudAutoHide = !state.settings.app.hudAutoHide;
      if (isElectron) {
        window.electronAPI.saveSettings(state.settings.app);
      }
      applySettings();
      resetHudTimer();
      break;
    case 'toggle-autohide-nav':
      state.settings.app.navAutoHide = !state.settings.app.navAutoHide;
      if (isElectron) {
        window.electronAPI.saveSettings(state.settings.app);
      }
      applySettings();
      resetHudTimer();
      break;
    case 'rotate-r-save':
      rotateAndSave(90);
      break;
    case 'rotate-l-save':
      rotateAndSave(-90);
      break;
    case 'crop':
      const btnCrop = $('btn-crop');
      if (btnCrop) btnCrop.click();
      break;
    case 'resize':
      const btnResize = $('btn-resize');
      if (btnResize) btnResize.click();
      break;
    case 'toggle-favorite':
      toggleFavorite();
      break;
    case 'show-about':
      btnAbout.click();
      break;
    case 'fit-to-window': {
      const im = state.images[state.current];
      if (im && im.w) {
        state.viewMode = 'fit';
        fitToWindow(im.w, im.h);
      }
      break;
    }
    case 'reset-zoom': {
      const im = state.images[state.current];
      if (im && im.w) {
        state.viewMode = 'original';
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        applyTransform(false);
        updateFileStats();
      }
      break;
    }
    case 'save-changes':
      saveCurrent();
      break;
    case 'save-as':
      if (data.targetPath) {
        saveAsPath(data.targetPath);
      }
      break;
    case 'show-properties':
      showPropertiesPanel(data.path);
      break;
    case 'close-image':
      closeImage();
      break;
    case 'toggle-hints':
      state.settings.app.showTopHints = (state.settings.app.showTopHints !== false) ? false : true;
      if (isElectron) window.electronAPI.saveSettings(state.settings.app);
      applySettings();
      break;
  }
}

if (isElectron) {
  window.electronAPI.onMenuAction((data) => {
    executeAction(data);
  });
}

async function saveAsPath(targetPath) {
  if (state.current === -1) return;
  const im = state.images[state.current];
  if (!mainImg.complete || mainImg.naturalWidth === 0) {
    const lang = state.settings.app.language || 'en';
    showToast(I18N[lang].toast_image_not_ready, 'error');
    return;
  }

  const lang = state.settings.app.language || 'en';
  showToast(lang === 'es' ? 'GUARDANDO COPIA...' : 'SAVING COPY...', 'info');

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const iw = mainImg.naturalWidth;
    const ih = mainImg.naturalHeight;
    const rotation = state.currentRotation;

    if (rotation === 90 || rotation === 270) {
      canvas.width = ih;
      canvas.height = iw;
    } else {
      canvas.width = iw;
      canvas.height = ih;
    }

    const rad = rotation * Math.PI / 180;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(mainImg, -iw / 2, -ih / 2);

    const dataUrl = canvas.toDataURL('image/png');
    const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);

    const result = await window.electronAPI.saveImage({
      filePath: targetPath,
      buffer: base64Data
    });

    if (result.success) {
      const currentPath = imageDiskPath(im);
      bindImageToDiskPath(im, targetPath);
      if (window.electronAPI.registerPaths) {
        await window.electronAPI.registerPaths([targetPath]);
      }

      if (currentPath) {
        const currentDir = currentPath.substring(0, Math.max(currentPath.lastIndexOf('\\'), currentPath.lastIndexOf('/')));
        const targetDir = targetPath.substring(0, Math.max(targetPath.lastIndexOf('\\'), targetPath.lastIndexOf('/')));

        if (currentDir && targetDir && currentDir.toLowerCase() === targetDir.toLowerCase() &&
            currentPath.toLowerCase() !== targetPath.toLowerCase()) {
          const newImg = {
            file: {
              name: targetPath.split(/[\\/]/).pop(),
              path: targetPath,
              size: 0
            }
          };
          state.images.splice(state.current + 1, 0, newImg);
          buildSidebar();
          showImage(state.current + 1, null);
          showToast(lang === 'es' ? 'COPIA GUARDADA' : 'COPY SAVED', 'success');
          return;
        }
      }

      state.currentRotation = 0;
      state.hasChanges = false;
      buildSidebar();
      showImage(state.current, null, true);
      showToast(lang === 'es' ? 'IMAGEN GUARDADA' : 'IMAGE SAVED', 'success');
    } else {
      showToast(result.error || 'ERROR', 'error');
    }
  } catch (e) {
    console.error('Error in saveAsPath:', e);
    showToast('ERROR: ' + (e.message || 'Unknown'), 'error');
  }
}

async function loadThumb(i, imgEl) {
  if (!state.sidebarOpen) return;
  const im = state.images[i];
  
  if (isElectron && im.file?.path) {
    const thumbUrl = await window.electronAPI.getThumbnail(im.file.path);
    if (thumbUrl) {
      imgEl.onload = () => { imgEl.style.opacity = '1'; };
      imgEl.src = thumbUrl;
      return;
    }
  }

  const url = getUrl(i);
  imgEl.onload = () => { imgEl.style.opacity = '1'; };
  imgEl.src = url;
}

function updateThumbProgress(p, t, paused = false) {
  const total = t !== undefined ? t : state.images.length;
  const pct = total > 0 ? Math.round((p / total) * 100) : 0;
  $('radar-pct').textContent = pct + '%';
  $('radar-count').textContent = `[${p}/${total}]`;
}

function getUrl(i) {
  const im = state.images[i];
  if (im.url) return im.url;
  
  if (im.file && im.file.path) {
    // Serve via cvlocal:// (webSecurity-safe)
    im.url = mediaUrl(im.file.path, Date.now());
  } else if (im.file) {
    im.url = URL.createObjectURL(im.file);
  }
  return im.url;
}

function updateSidebarActive() {
  const items = sidebar.querySelectorAll('.thumb-item');
  items.forEach((el, i) => {
    el.classList.toggle('active', i === state.current);
  });
  // Scroll into view
  const active = sidebar.querySelector('.thumb-item.active');
  if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── SHOW IMAGE ──
// ── UI STABILIZER (LEVEL 9 NUCLEAR) ──
function stabilizeUI() {
  const tb = $('topbar');
  const sb = $('statusbar');
  const app = $('app');
  if (tb) {
    tb.style.display = 'flex';
    tb.style.height = '48px';
    tb.style.background = 'var(--cyber-panel)';
  }
  if (sb) {
    sb.style.display = 'flex';
    sb.style.height = '28px';
  }
}
window.addEventListener('load', stabilizeUI);
setInterval(stabilizeUI, 3000);

function showImage(idx, direction, isInitial = false) {
  if (idx < 0 || idx >= state.images.length) return;
  if (state.transitioning && direction !== null) return;

  state.transitioning = true;

  const doLoad = () => {
    syncCurrentIndex(idx);
    updateSidebarActive();
    updateCounter();
    updateFileStats();
    updateFavButtonState();

    // Reset rotation al cambiar
    state.currentRotation = 0;
    state.hasChanges = false;
    updateSaveButton();

    mainImg.style.transform = `rotate(0deg)`; // Limpiar rotación visual

    spinner.classList.add('active');
    mainImg.classList.remove('loaded', 'slide-in-left', 'slide-in-right', 'slide-out-left', 'slide-out-right');
    
    // Scroll inteligente: 'center' para carga inicial/manual, 'nearest' para navegación
    const activeThumb = sidebar.querySelector(`.thumb-item[data-index="${idx}"]`);
    if (activeThumb) {
      activeThumb.scrollIntoView({ 
        behavior: isInitial ? 'auto' : 'smooth', 
        block: isInitial ? 'center' : 'nearest' 
      });
    }

    const url = getUrl(idx);
    const im = state.images[idx];
    
    // Update filename info
    const viewerFilename = $('viewer-filename');
    if (viewerFilename) {
      viewerFilename.textContent = im.file.name;
      if (im.file && im.file.path) {
        setCyberTooltip(viewerFilename, im.file.path);
        viewerFilename.classList.add('tooltip-bottom');
      } else {
        viewerFilename.removeAttribute('data-tooltip');
        viewerFilename.classList.remove('cyber-tooltip', 'tooltip-bottom');
      }
    }

    if (im.loaded) {
      displayImage(url, im.w, im.h, direction);
    } else {
      const tmp = new Image();
      tmp.onload = () => {
        im.loaded = true;
        im.w = tmp.naturalWidth;
        im.h = tmp.naturalHeight;
        displayImage(url, im.w, im.h, direction);
      };
      tmp.onerror = () => {
        spinner.classList.remove('active');
        state.transitioning = false;
      };
      tmp.src = url;
    }

    // Preload adjacent
    setTimeout(() => preloadAdjacent(idx), 80);
  };

  // Animate OUT current image
  if (direction && mainImg.classList.contains('loaded')) {
    const outClass = direction === 'left' ? 'slide-out-left' : 'slide-out-right';
    mainImg.classList.add(outClass);
    setTimeout(doLoad, 80);
  } else {
    mainImg.style.opacity = '1';
    mainImg.style.transition = 'none'; // Sin transición para máxima velocidad inicial
    doLoad();
  }
}

function displayImage(url, w, h, direction) {
  spinner.classList.remove('active');
  mainImg.src = url;
  mainImg.classList.remove('slide-in-left', 'slide-in-right', 'slide-out-left', 'slide-out-right');

  mainImg.style.width  = w + 'px';
  mainImg.style.height = h + 'px';

  if (state.viewMode === 'original') {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
  } else if (state.viewMode === 'custom') {
    state.panX = 0;
    state.panY = 0;
  } else { // 'fit'
    const vw = viewerWrap.clientWidth - 24;
    const vh = viewerWrap.clientHeight - 24;
    if (w && h) {
      state.zoom = Math.min(vw / w, vh / h);
    } else {
      state.zoom = 1;
    }
    state.panX = 0;
    state.panY = 0;
  }
  applyTransform(false);
  updateFileStats();

  if (direction) {
    const inClass = direction === 'left' ? 'slide-in-left' : 'slide-in-right';
    mainImg.style.opacity = ''; // Limpiar opacidad inline para dejar que el CSS actúe
    mainImg.classList.add('loaded', inClass);
    mainImg.addEventListener('animationend', () => {
      mainImg.classList.remove('slide-in-left', 'slide-in-right');
      state.transitioning = false;
    }, { once: true });
  } else {
    mainImg.style.opacity = ''; // Limpiar opacidad inline
    mainImg.classList.add('loaded');
    state.transitioning = false;
  }
}

// ── PRELOAD ──
function preloadAdjacent(idx) {
  for (let d = 1; d <= PRELOAD_RANGE; d++) {
    [idx + d, idx - d].forEach(i => {
      if (i >= 0 && i < state.images.length && !state.images[i].loaded) {
        const url = getUrl(i);
        if (state.preloadCache.has(url)) return;

        const tmp = new Image();
        
        // Mantener el tamaño de la caché bajo control (ej. máximo 15 imágenes precargadas)
        if (state.preloadCache.size > 15) {
          const firstKey = state.preloadCache.keys().next().value;
          state.preloadCache.delete(firstKey);
        }
        
        state.preloadCache.set(url, tmp);

        tmp.onload = () => {
          state.images[i].loaded = true;
          state.images[i].w = tmp.naturalWidth;
          state.images[i].h = tmp.naturalHeight;
        };
        tmp.src = url;
      }
    });
  }
}
// ── IMAGE ROTATION & SAVE ──
function rotate(deg) {
  if (state.current === -1) return;
  
  // Seguridad: Si estamos recortando, cancelar recorte antes de rotar
  if (state.isCropping) {
    state.isCropping = false;
    $('crop-overlay').classList.remove('active');
  }

  state.currentRotation = (state.currentRotation + deg) % 360;
  if (state.currentRotation < 0) state.currentRotation += 360;
  
  mainImg.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
  mainImg.style.transform = `rotate(${state.currentRotation}deg)`;
  state.hasChanges = true;
  updateSaveButton();
  updateHUDStates();
}

async function rotateAndSave(deg) {
  rotate(deg);
  await saveCurrent();
}

function updateSaveButton() {
  const btn = $('btn-save');
  if (!btn) return;
  const im = state.images[state.current];
  const unsavedClipboard = !!(im && !imageDiskPath(im));
  if (state.hasChanges || state.isCropping || unsavedClipboard) btn.classList.add('active');
  else btn.classList.remove('active');
}

// ── CROP LOGIC PRO ──
let cropState = {
  active: false,
  x: 50, y: 50, w: 200, h: 200,
  isResizing: false,
  isMoving: false,
  handle: null,
  startX: 0, startY: 0,
  startRect: {}
};

function startCrop() {
  if (state.current === -1) return;
  if (!mainImg.complete || mainImg.naturalWidth === 0) {
    showToast(I18N[state.settings.app.language || 'en'].toast_initializing_engine, 'info');
    return;
  }
  
  // Smart crop framing: leave room below for crop action panel + handles
  const vw = viewerWrap.clientWidth;
  const vh = viewerWrap.clientHeight;
  const iw = mainImg.naturalWidth;
  const ih = mainImg.naturalHeight;
  const isVert = state.currentRotation === 90 || state.currentRotation === 270;
  const curW = isVert ? ih : iw;
  const curH = isVert ? iw : ih;

  const SIDE = 28;
  const ABOVE = 28;
  const BELOW = 118; // gap + crop-actions (buttons + copy toggle)
  const availW = Math.max(120, vw - SIDE * 2);
  const availH = Math.max(120, vh - ABOVE - BELOW);

  state.viewMode = 'custom';
  state.zoom = Math.min(availW / curW, availH / curH, 1);
  state.panX = 0;
  // Bias upward so leftover space sits under the image for controls
  state.panY = (ABOVE - BELOW) / 2;
  applyTransform(true);
  
  showToast(I18N[state.settings.app.language || 'en'].toast_focusing_workspace, 'info', 700);
  
  // Wait for transform, then calibrate crop overlay to the visible image
  setTimeout(() => { calibrateAndShowCrop(); }, 260);
}

function calibrateAndShowCrop() {
  dismissToasts();
  // DETECCIÓN POR CONTACTO FÍSICO
  const imgB = mainImg.getBoundingClientRect();
  const wrapB = viewerWrap.getBoundingClientRect();
  
  const realX = imgB.left - wrapB.left;
  const realY = imgB.top - wrapB.top;
  const realW = imgB.width;
  const realH = imgB.height;

  cropState.active = true;
  state.isCropping = true;
  $('crop-overlay').classList.add('active');
  $('kbd-hint').classList.add('hud-hidden');
  const filename = $('viewer-filename');
  if (filename) filename.classList.add('hud-hidden-fade');
  const nav = $('nav-container');
  if (nav) nav.classList.add('hud-hidden-fade');
  
  // El marco nace ABRAZANDO los bordes reales
  cropState.x = realX;
  cropState.y = realY;
  cropState.w = realW;
  cropState.h = realH;
  
  // Guardamos la referencia base para el cálculo de píxeles
  cropState.imgRealRect = { x: realX, y: realY, w: realW, h: realH };
  
  updateCropUI();
  updateSaveButton();
  updateHUDStates();
}

function updateCropActionsPlacement() {
  const actions = $('crop-actions');
  if (!actions || !cropState.active) return;
  const wrapH = viewerWrap.clientHeight;
  const gap = 14;
  const needed = actions.offsetHeight + gap;
  const spaceBelow = wrapH - (cropState.y + cropState.h);
  if (spaceBelow < needed + 4) {
    actions.style.top = 'auto';
    actions.style.bottom = `calc(100% + ${gap}px)`;
  } else {
    actions.style.top = `calc(100% + ${gap}px)`;
    actions.style.bottom = 'auto';
  }
}

function updateCropUI() {
  const rect = $('crop-rect');
  rect.style.left = cropState.x + 'px';
  rect.style.top = cropState.y + 'px';
  rect.style.width = cropState.w + 'px';
  rect.style.height = cropState.h + 'px';
  updateCropActionsPlacement();
}

$('btn-crop').onclick = startCrop;
$('btn-crop-cancel').onclick = () => {
  cropState.active = false;
  state.isCropping = false;
  $('crop-overlay').classList.remove('active');
  $('kbd-hint').classList.remove('hud-hidden');
  const filename = $('viewer-filename');
  if (filename) filename.classList.remove('hud-hidden-fade');
  updateSaveButton();
  updateHUDStates();
  if (typeof resetHudTimer === 'function') resetHudTimer();
};

$('crop-rect').onmousedown = (e) => {
  if (!cropState.active) return;
  if (e.target.closest('#crop-actions')) return;
  e.stopPropagation();
  
  if (e.target.classList.contains('crop-handle')) {
    cropState.isResizing = true;
    cropState.handle = e.target.className.split(' ').find(c => c.startsWith('ch-'));
  } else {
    cropState.isMoving = true;
  }
  
  cropState.startX = e.clientX;
  cropState.startY = e.clientY;
  cropState.startRect = { x: cropState.x, y: cropState.y, w: cropState.w, h: cropState.h };
};

window.addEventListener('mousemove', (e) => {
  if (!cropState.active) return;
  if (!cropState.isMoving && !cropState.isResizing) return;
  
  const dx = e.clientX - cropState.startX;
  const dy = e.clientY - cropState.startY;
  
  if (cropState.isMoving) {
    cropState.x = cropState.startRect.x + dx;
    cropState.y = cropState.startRect.y + dy;
  } else if (cropState.isResizing) {
    const h = cropState.handle;
    const r = cropState.startRect;
    const minSize = 50;

    // Corner classes are ch-tl/tr/bl/br — substring checks like '-l' fail on those.
    const resizeLeft = (h === 'ch-l' || h === 'ch-tl' || h === 'ch-bl');
    const resizeRight = (h === 'ch-r' || h === 'ch-tr' || h === 'ch-br');
    const resizeTop = (h === 'ch-t' || h === 'ch-tl' || h === 'ch-tr');
    const resizeBottom = (h === 'ch-b' || h === 'ch-bl' || h === 'ch-br');

    let x = r.x;
    let y = r.y;
    let w = r.w;
    let ht = r.h;

    if (resizeRight) {
      w = Math.max(minSize, r.w + dx);
    }
    if (resizeBottom) {
      ht = Math.max(minSize, r.h + dy);
    }
    if (resizeLeft) {
      const newW = Math.max(minSize, r.w - dx);
      x = r.x + (r.w - newW);
      w = newW;
    }
    if (resizeTop) {
      const newH = Math.max(minSize, r.h - dy);
      y = r.y + (r.h - newH);
      ht = newH;
    }

    cropState.x = x;
    cropState.y = y;
    cropState.w = w;
    cropState.h = ht;
  }
  
  updateCropUI();
});

window.addEventListener('mouseup', () => {
  cropState.isMoving = false;
  cropState.isResizing = false;
});

$('btn-crop-confirm').onclick = async () => {
  showToast(I18N[state.settings.app.language || 'en'].toast_saving_crop, 'info');
  
  // 1. Extraer el ratio de escala respecto a los píxeles originales
  const isVert = state.currentRotation === 90 || state.currentRotation === 270;
  const origW = isVert ? mainImg.naturalHeight : mainImg.naturalWidth;
  const origH = isVert ? mainImg.naturalWidth : mainImg.naturalHeight;
  
  const scale = origW / cropState.imgRealRect.w;
  
  // 2. Renderizar imagen completa con rotación
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = origW;
  fullCanvas.height = origH;
  const fctx = fullCanvas.getContext('2d');
  
  fctx.translate(fullCanvas.width/2, fullCanvas.height/2);
  fctx.rotate(state.currentRotation * Math.PI / 180);
  fctx.drawImage(mainImg, -mainImg.naturalWidth/2, -mainImg.naturalHeight/2);
  
  // 3. Recorte preciso sobre el canvas rotado
  // Usamos Math.round para evitar sangrado de píxeles
  const relX = Math.round((cropState.x - cropState.imgRealRect.x) * scale);
  const relY = Math.round((cropState.y - cropState.imgRealRect.y) * scale);
  const finalW = Math.round(cropState.w * scale);
  const finalH = Math.round(cropState.h * scale);
  
  // Validar dimensiones mínimas
  if (finalW < 1 || finalH < 1) {
    showToast(I18N[state.settings.app.language || 'en'].toast_invalid_crop, 'error');
    return;
  }

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = finalW;
  cropCanvas.height = finalH;
  const cctx = cropCanvas.getContext('2d');
  
  cctx.drawImage(fullCanvas, relX, relY, finalW, finalH, 0, 0, finalW, finalH);
  
  const im = state.images[state.current];
  const idx = state.current;
  let fpath = imageDiskPath(im);

  if (!fpath) {
    fpath = await ensureImageDiskPath(im);
    if (!fpath) return;
  }

  const createCopy = !!($('cfg-crop-copy') && $('cfg-crop-copy').checked);
  const exported = canvasExport(cropCanvas, fpath);
  const result = await window.electronAPI.saveImage({
    filePath: exported.filePath,
    buffer: exported.buffer,
    createCopy,
    copySuffix: '_cropped'
  });

  if (result.success) {
    showToast(I18N[state.settings.app.language || 'en'].toast_crop_saved, 'success');
    cropState.active = false;
    state.isCropping = false;
    $('crop-overlay').classList.remove('active');
    $('kbd-hint').classList.remove('hud-hidden');
    const filenameEl = $('viewer-filename');
    if (filenameEl) filenameEl.classList.remove('hud-hidden-fade');
    if (typeof resetHudTimer === 'function') resetHudTimer();

    const savedPath = result.filePath || exported.filePath;

    if (createCopy) {
      const newImg = {
        file: {
          name: savedPath.split(/[\\/]/).pop(),
          path: savedPath,
          size: 0
        }
      };
      state.images.splice(idx + 1, 0, newImg);
      if (window.electronAPI.registerPaths) {
        await window.electronAPI.registerPaths([savedPath]);
      }
      buildSidebar();
      showImage(idx + 1, null);
      updateHUDStates();
      return;
    }

    if (im.file) im.file.path = savedPath;
    im.path = savedPath;
    
    // Recargar con cache-buster
    mainImg.src = mediaUrl(savedPath, Date.now());
    
    // Esperar a que la imagen cargue para actualizar HUD y dimensiones en el estado
    mainImg.onload = () => {
      // RESETEAR TRANSFORMACIONES SOLO CUANDO LA IMAGEN ESTÁ LISTA
      state.currentRotation = 0;
      state.panX = 0;
      state.panY = 0;
      mainImg.style.transition = 'none';
      mainImg.style.transform = 'none';

      im.w = mainImg.naturalWidth;
      im.h = mainImg.naturalHeight;
      state.hasChanges = false;
      updateSaveButton();
      updateHUDStates();
      updateFileStats();
      // Auto-fit de la nueva imagen con dimensiones reales
      fitToWindow(im.w, im.h);
      
      // Restaurar transición suave después de un frame
      requestAnimationFrame(() => {
        mainImg.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
      });

      mainImg.onload = null; // Limpiar listener
    };
  } else {
    showToast('ERROR: ' + result.error, 'error');
  }
};

async function saveCurrent() {
  if (state.current === -1) return;
  const im = state.images[state.current];
  const needsSave = state.hasChanges || !imageDiskPath(im);
  if (!needsSave) return;

  let fpath = imageDiskPath(im);
  if (!fpath) {
    fpath = await ensureImageDiskPath(im);
    if (!fpath) return;
  }
  if (!mainImg.complete || mainImg.naturalWidth === 0) {
    showToast(I18N[state.settings.app.language || 'en'].toast_image_not_ready, 'error');
    return;
  }

  showToast(I18N[state.settings.app.language || 'en'].toast_saving_changes, 'info');

  try {
    // ── Renderizar imagen rotada en canvas ──
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const iw = mainImg.naturalWidth;
    const ih = mainImg.naturalHeight;
    const rotation = state.currentRotation;

    if (rotation === 90 || rotation === 270) {
      canvas.width = ih;
      canvas.height = iw;
    } else {
      canvas.width = iw;
      canvas.height = ih;
    }

    const rad = rotation * Math.PI / 180;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(mainImg, -iw / 2, -ih / 2);

    // Exportar como PNG base64 (sin pérdida, preserva transparencia)
    const dataUrl = canvas.toDataURL('image/png');
    const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);

    const result = await window.electronAPI.saveImage({
      filePath: fpath,
      buffer: base64Data
    });

    if (result.success) {
      bindImageToDiskPath(im, result.filePath || fpath);
      if (window.electronAPI.registerPaths) {
        await window.electronAPI.registerPaths([result.filePath || fpath]);
      }

      // Escuchar el load de la nueva imagen para actualizar dimensiones en el estado
      mainImg.onload = () => {
        // RESETEAR TRANSFORMACIONES SOLO CUANDO LA IMAGEN ESTÁ LISTA
        state.currentRotation = 0;
        state.hasChanges = false;
        mainImg.style.transition = 'none';
        mainImg.style.transform = 'none';

        im.w = mainImg.naturalWidth;
        im.h = mainImg.naturalHeight;
        updateSaveButton();
        updateHUDStates();
        updateFileStats();
        fitToWindow(im.w, im.h);

        // Restaurar transición suave después de un frame
        requestAnimationFrame(() => {
          mainImg.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        });

        mainImg.onload = null;
      };

      mainImg.src = mediaUrl(imageDiskPath(im), Date.now());
      showToast(I18N[state.settings.app.language || 'en'].toast_changes_saved, 'success');
    } else {
      showToast(result.error || 'ERROR', 'error');
    }
  } catch (e) {
    console.error('Error en saveCurrent:', e);
    showToast('ERROR: ' + (e.message || 'Unknown'), 'error');
  }
}
// ── RESIZE MODAL LOGIC ──
let resizeState = {
  aspectRatio: 1,
  lockAspect: true,
  currentAlgo: 'nearest'
};

function openResizeModal() {
  try {
    const idx = state.current;
    const lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
    const i18nLang = I18N[lang] || I18N.en || {};

    if (idx === undefined || idx === -1) {
      showToast(i18nLang.toast_image_not_ready || 'IMAGE NOT READY', 'error');
      return;
    }
    const im = state.images[idx];
    if (!im || !im.w) {
      showToast(i18nLang.toast_image_not_ready || 'IMAGE NOT READY', 'error');
      return;
    }
    
    const wInput = $('resize-width');
    const hInput = $('resize-height');
    
    wInput.value = im.w;
    hInput.value = im.h;
    $('resize-slider').value = 100;
    $('resize-slider-w').value = 100;
    $('resize-slider-h').value = 100;
    $('slider-w-pct').textContent = '100%';
    $('slider-h-pct').textContent = '100%';
    
    resizeState.aspectRatio = im.w / im.h;
    resizeState.lockAspect = true;
    updateAspectLockButton();
    syncSliderVisibility();
    
    selectResampleAlgo('nearest');
    
    $('hud-orig-dims').innerHTML = `${im.w} <span style="font-size: 13px; color: var(--cyber-muted);">×</span> ${im.h} <span style="font-size: 11px; color: var(--cyber-muted);">PX</span>`;
    updateResizeDestInfo();
    
    openModal('modal-resize');
  } catch (e) {
    console.error('Error opening resize modal:', e);
    showToast('ERROR: ' + e.message, 'error');
  }
}

const SVG_LOCKED = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
const SVG_UNLOCKED = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><path d="M18.84 12.2a4.49 4.49 0 0 0-6.36-6.36l-1.54 1.54"></path><path d="M8.9 14.9L7.36 16.4a4.49 4.49 0 0 0 6.36 6.36l1.54-1.54"></path></svg>`;

function updateAspectLockButton() {
  const btn = $('btn-aspect-lock');
  if (resizeState.lockAspect) {
    btn.classList.add('active');
    $('aspect-lock-icon').innerHTML = SVG_LOCKED;
  } else {
    btn.classList.remove('active');
    $('aspect-lock-icon').innerHTML = SVG_UNLOCKED;
  }
}

function syncSliderVisibility() {
  if (resizeState.lockAspect) {
    $('slider-locked-container').style.display = 'block';
    $('slider-unlocked-container').style.display = 'none';
  } else {
    $('slider-locked-container').style.display = 'none';
    $('slider-unlocked-container').style.display = 'flex';
  }
}

function syncSlidersFromInputs() {
  const idx = state.current;
  if (idx === undefined || idx === -1) return;
  const im = state.images[idx];
  if (!im || !im.w || !im.h) return;

  const w = parseFloat($('resize-width').value) || 0;
  const h = parseFloat($('resize-height').value) || 0;

  const pctW = Math.round((w / im.w) * 100);
  const pctH = Math.round((h / im.h) * 100);

  if (resizeState.lockAspect) {
    $('resize-slider').value = Math.min(400, Math.max(10, pctW));
  } else {
    $('resize-slider-w').value = Math.min(400, Math.max(10, pctW));
    $('resize-slider-h').value = Math.min(400, Math.max(10, pctH));
    $('slider-w-pct').textContent = `${pctW}%`;
    $('slider-h-pct').textContent = `${pctH}%`;
  }
}

$('btn-aspect-lock').addEventListener('click', () => {
  resizeState.lockAspect = !resizeState.lockAspect;
  updateAspectLockButton();
  syncSliderVisibility();
  if (resizeState.lockAspect) {
    let w = parseFloat($('resize-width').value) || 0;
    if (w > 16384) {
      w = 16384;
      $('resize-width').value = 16384;
    }
    if (w > 0) {
      let h = Math.round(w / resizeState.aspectRatio);
      if (h > 16384) {
        h = 16384;
        $('resize-width').value = Math.round(h * resizeState.aspectRatio);
      }
      $('resize-height').value = h;
    }
  }
  syncSlidersFromInputs();
  updateResizeDestInfo();
});

$('resize-width').addEventListener('input', () => {
  let w = parseFloat($('resize-width').value) || 0;
  if (w > 16384) {
    w = 16384;
    $('resize-width').value = 16384;
  }
  if (resizeState.lockAspect && w > 0) {
    let h = Math.round(w / resizeState.aspectRatio);
    if (h > 16384) {
      h = 16384;
      $('resize-width').value = Math.round(h * resizeState.aspectRatio);
      w = parseFloat($('resize-width').value) || 0;
    }
    $('resize-height').value = h;
  }
  syncSlidersFromInputs();
  updateResizeDestInfo();
});

$('resize-height').addEventListener('input', () => {
  let h = parseFloat($('resize-height').value) || 0;
  if (h > 16384) {
    h = 16384;
    $('resize-height').value = 16384;
  }
  if (resizeState.lockAspect && h > 0) {
    let w = Math.round(h * resizeState.aspectRatio);
    if (w > 16384) {
      w = 16384;
      $('resize-height').value = Math.round(w / resizeState.aspectRatio);
      h = parseFloat($('resize-height').value) || 0;
    }
    $('resize-width').value = w;
  }
  syncSlidersFromInputs();
  updateResizeDestInfo();
});

$('resize-slider').addEventListener('input', (e) => {
  const idx = state.current;
  if (idx === undefined || idx === -1) return;
  const im = state.images[idx];
  if (!im) return;
  const pct = parseInt(e.target.value);
  
  let w = Math.round(im.w * (pct / 100));
  let h = Math.round(im.h * (pct / 100));
  if (w > 16384) {
    w = 16384;
    h = Math.round(w / resizeState.aspectRatio);
  }
  if (h > 16384) {
    h = 16384;
    w = Math.round(h * resizeState.aspectRatio);
  }
  $('resize-width').value = w;
  $('resize-height').value = h;
  updateResizeDestInfo();
});

$('resize-slider-w').addEventListener('input', (e) => {
  const idx = state.current;
  if (idx === undefined || idx === -1) return;
  const im = state.images[idx];
  if (!im) return;
  const pct = parseInt(e.target.value);
  
  let w = Math.round(im.w * (pct / 100));
  if (w > 16384) w = 16384;
  $('resize-width').value = w;
  $('slider-w-pct').textContent = `${pct}%`;
  updateResizeDestInfo();
});

$('resize-slider-h').addEventListener('input', (e) => {
  const idx = state.current;
  if (idx === undefined || idx === -1) return;
  const im = state.images[idx];
  if (!im) return;
  const pct = parseInt(e.target.value);
  
  let h = Math.round(im.h * (pct / 100));
  if (h > 16384) h = 16384;
  $('resize-height').value = h;
  $('slider-h-pct').textContent = `${pct}%`;
  updateResizeDestInfo();
});

function updateResizeDestInfo() {
  const idx = state.current;
  if (idx === undefined || idx === -1) return;
  const im = state.images[idx];
  if (!im || !im.w || !im.h) return;

  const w = parseInt($('resize-width').value) || 0;
  const h = parseInt($('resize-height').value) || 0;
  
  // 1. Update preset highlights
  updatePresetActiveStates(w, h);

  // 2. Calculate Scale Factor & Alteration percentage
  const scaleW = w / im.w;
  const scaleH = h / im.h;
  const scalePercent = Math.round(scaleW * 100);
  const alteration = scalePercent - 100;
  const sign = alteration > 0 ? '+' : '';
  
  $('hud-scale-stats').textContent = `${scalePercent}% (${sign}${alteration}%)`;

  // 3. Estimate disk weight
  let origWeightText = '0 KB';
  let estWeightText = '0 KB';
  if (im.size) {
    origWeightText = formatBytes(im.size);
    // Area scaling factor (w * h) / (im.w * im.h)
    const areaScale = (w * h) / (im.w * im.h);
    
    // Apply empirical multiplier based on selected algorithm to reflect complexity/weight difference
    let algoMultiplier = 1.0;
    if (resizeState.currentAlgo === 'nearest') {
      algoMultiplier = 0.85; // Fast (Nearest Neighbor) is usually smaller/less complex
    } else if (resizeState.currentAlgo === 'bicubic') {
      algoMultiplier = 1.15; // High Quality (Bicubic) preserves more fine details/gradients (larger file)
    } // Bilinear (balanced) is 1.0
    
    const estimatedSize = im.size * areaScale * algoMultiplier;
    estWeightText = formatBytes(estimatedSize);
  }
  
  $('hud-weight-stats').textContent = `${origWeightText} → ~${estWeightText}`;
}

function updatePresetActiveStates(w, h) {
  const idx = state.current;
  if (idx === undefined || idx === -1) return;
  const im = state.images[idx];
  if (!im || !im.w || !im.h) return;

  const presets = [
    { el: $('preset-1080'), type: 'dims', w: 1080, h: 1080 },
    { el: $('preset-720'), type: 'dims', w: 1280, h: 720 },
    { el: $('preset-1080p'), type: 'dims', w: 1920, h: 1080 },
    { el: $('preset-pct25'), type: 'scale', val: 0.25 },
    { el: $('preset-pct50'), type: 'scale', val: 0.50 },
    { el: $('preset-pct200'), type: 'scale', val: 2.00 }
  ];

  presets.forEach(p => {
    if (!p.el) return;
    let isActive = false;
    if (p.type === 'dims') {
      if (resizeState.lockAspect) {
        isActive = (w === p.w);
      } else {
        isActive = (w === p.w && h === p.h);
      }
    } else if (p.type === 'scale') {
      const scaleW = w / im.w;
      const scaleH = h / im.h;
      if (Math.abs(scaleW - scaleH) < 0.005) {
        const currentScale = scaleW;
        isActive = (Math.abs(currentScale - p.val) < 0.005);
      }
    }
    p.el.classList.toggle('active', isActive);
  });
}

function applyResizePreset(w, h) {
  $('resize-width').value = w;
  if (resizeState.lockAspect) {
    $('resize-height').value = Math.round(w / resizeState.aspectRatio);
  } else {
    $('resize-height').value = h;
  }
  syncSlidersFromInputs();
  updateResizeDestInfo();
}

function applyResizeScalePreset(scale) {
  const idx = state.current;
  if (idx === undefined || idx === -1) return;
  const im = state.images[idx];
  if (!im) return;
  $('resize-width').value = Math.round(im.w * scale);
  $('resize-height').value = Math.round(im.h * scale);
  syncSlidersFromInputs();
  updateResizeDestInfo();
}

function selectResampleAlgo(algo) {
  resizeState.currentAlgo = algo;
  ['nearest', 'bilinear', 'bicubic'].forEach(a => {
    $(`btn-algo-${a}`).classList.toggle('active', a === algo);
  });
  updateResizeDestInfo();
}

$('btn-resize').addEventListener('click', openResizeModal);

$('btn-confirm-resize').addEventListener('click', async () => {
  try {
    const idx = state.current;
    if (idx === undefined || idx === -1) return;
    const im = state.images[idx];
    if (!im) return;
    let fpath = imageDiskPath(im);
    const lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
    const i18nLang = I18N[lang] || I18N.en || {};

    if (!fpath) {
      fpath = await ensureImageDiskPath(im);
      if (!fpath) return;
    }
    
    const targetW = parseInt($('resize-width').value) || 0;
    const targetH = parseInt($('resize-height').value) || 0;
    
    if (targetW < 1 || targetH < 1) {
      showToast(i18nLang.toast_invalid_crop || 'Dimensiones inválidas', 'error');
      return;
    }
    
    showToast(lang === 'es' ? 'REDIMENSIONANDO IMAGEN...' : 'RESIZING IMAGE...', 'info');
    
    // Realizar redimensión en un canvas offscreen
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    
    const algo = resizeState.currentAlgo;
    if (algo === 'nearest') {
      ctx.imageSmoothingEnabled = false;
    } else if (algo === 'bilinear') {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
    } else { // bicubic
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }
    
    // Dibujar la imagen en las nuevas dimensiones
    ctx.drawImage(mainImg, 0, 0, targetW, targetH);
    
    const exported = canvasExport(canvas, fpath);
    const createCopy = $('cfg-resize-copy').checked;
    
    const result = await window.electronAPI.saveImage({
      filePath: exported.filePath,
      buffer: exported.buffer,
      createCopy: createCopy
    });
    
    if (result.success) {
      showToast(i18nLang.toast_resize_success || 'IMAGEN REDIMENSIONADA', 'success');
      closeModal('modal-resize');
      
      if (createCopy) {
        // Generar objeto de nueva imagen
        const newImg = {
          file: {
            name: result.filePath.split(/[\\/]/).pop(),
            path: result.filePath,
            size: 0
          }
        };
        // Insertarla justo después de la actual
        state.images.splice(idx + 1, 0, newImg);
        
        // Reconstruir la barra y mostrar la nueva imagen
        buildSidebar();
        showImage(idx + 1, null);
      } else {
        const savedPath = result.filePath || exported.filePath;
        if (im.file) im.file.path = savedPath;
        im.path = savedPath;
        // Recargar imagen con cache-buster
        mainImg.src = mediaUrl(savedPath, Date.now());
        
        mainImg.onload = () => {
          state.currentRotation = 0;
          state.panX = 0;
          state.panY = 0;
          mainImg.style.transition = 'none';
          mainImg.style.transform = 'none';
          
          im.w = mainImg.naturalWidth;
          im.h = mainImg.naturalHeight;
          state.hasChanges = false;
          updateSaveButton();
          updateHUDStates();
          updateFileStats();
          fitToWindow(im.w, im.h);
          
          requestAnimationFrame(() => {
            mainImg.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
          });
          mainImg.onload = null;
        };
      }
    } else {
      showToast('ERROR: ' + result.error, 'error');
    }
  } catch (e) {
    console.error('Error confirming resize:', e);
    showToast('ERROR: ' + e.message, 'error');
  }
});

// ── ZOOM & PAN ──
function fitToWindow(w, h) {
  const vw = viewerWrap.clientWidth - 24;
  const vh = viewerWrap.clientHeight - 24;
  if (!w || !h) { state.zoom = 1; return; }
  const scale = Math.min(vw / w, vh / h);
  state.zoom = scale;
  state.panX = 0;
  state.panY = 0;
  mainImg.style.width  = w + 'px';
  mainImg.style.height = h + 'px';
  applyTransform(false);
}

function applyTransform(animate) {
  const t = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  canvasL.style.transition = animate ? 'transform 200ms cubic-bezier(.25,.46,.45,.94)' : 'none';
  canvasL.style.transform = t;
  updateZoomHUD();
}

function sliderToZoom(val) {
  const minL = Math.log10(ZOOM_MIN);
  const maxL = Math.log10(ZOOM_MAX);
  const t = Math.max(0, Math.min(1, val / 1000));
  return Math.pow(10, minL + (maxL - minL) * t);
}

function zoomToSlider(zoom) {
  const minL = Math.log10(ZOOM_MIN);
  const maxL = Math.log10(ZOOM_MAX);
  const t = (Math.log10(zoom) - minL) / (maxL - minL);
  return Math.round(Math.max(0, Math.min(1000, t * 1000)));
}

function updateZoomHUD() {
  const pct = Math.round(state.zoom * 100);
  zoomVal.textContent = pct + '%';
  $('zoom-pct').textContent = pct + '%';
  const slider = $('zoom-slider');
  if (slider) slider.value = zoomToSlider(state.zoom);
  // Floating HUD only in fullscreen; statusbar zoom-% always updates
  if (!state.isGhost) {
    zoomHud.classList.remove('visible');
    clearTimeout(state.zoomTimer);
    return;
  }
  zoomHud.classList.add('visible');
  clearTimeout(state.zoomTimer);
  state.zoomTimer = setTimeout(() => zoomHud.classList.remove('visible'), 1200);
}

$('zoom-slider').addEventListener('input', (e) => {
  if (state.images.length === 0) return;
  const val = parseInt(e.target.value, 10);
  const newZoom = sliderToZoom(val);
  state.viewMode = 'custom';
  state.zoom = newZoom;
  state.panX = 0;
  state.panY = 0;
  applyTransform(true);
});

$('zoom-slider').addEventListener('wheel', (e) => {
  if (state.images.length === 0) return;
  e.preventDefault();
  e.stopPropagation();
  const delta = e.deltaY < 0 ? -15 : 15;
  let val = parseInt($('zoom-slider').value, 10) + delta;
  val = Math.max(0, Math.min(1000, val));
  $('zoom-slider').value = val;
  $('zoom-slider').dispatchEvent(new Event('input'));
}, { passive: false });

function updateFileStats() {
  if (state.current === -1) {
    $('img-dims').innerText = '0 x 0px';
    $('img-weight').innerText = '0 KB';
    return;
  }
  const im = state.images[state.current];
  $('img-dims').innerText = `${im.w || mainImg.naturalWidth} x ${im.h || mainImg.naturalHeight}px`;
  
  let sizeText = '0 KB';
  if (im.size) {
    if (im.size > 1024 * 1024) {
      sizeText = (im.size / (1024 * 1024)).toFixed(2) + ' MB';
    } else {
      sizeText = (im.size / 1024).toFixed(1) + ' KB';
    }
  }
  $('img-weight').innerText = sizeText;
}

function zoomAt(delta, cx, cy) {
  state.viewMode = 'custom';
  const rect = viewerWrap.getBoundingClientRect();
  const ox = cx - rect.left - rect.width / 2;
  const oy = cy - rect.top  - rect.height / 2;

  const oldZoom = state.zoom;
  let newZoom = state.zoom * (1 + delta * 0.001);
  newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));

  const ratio = newZoom / oldZoom;
  state.panX = ox + (state.panX - ox) * ratio;
  state.panY = oy + (state.panY - oy) * ratio;
  state.zoom = newZoom;
  applyTransform(false);
}

// ── NAVIGATION ──
function prev() {
  if (state.images.length === 0 || state.transitioning) return;
  const next = (state.current - 1 + state.images.length) % state.images.length;
  showImage(next, 'right');
}

function next() {
  if (state.images.length === 0 || state.transitioning) return;
  const nxt = (state.current + 1) % state.images.length;
  showImage(nxt, 'left');
}

// ── UI UPDATES ──
function visibleImageCount() {
  return state.images.filter(im => !im.hidden).length;
}

function updateNavVisibility() {
  const nav = $('nav-container');
  if (!nav) return;
  nav.classList.toggle('nav-useless', visibleImageCount() <= 1);
}

function updateCounter() {
  if (state.images.length === 0) {
    $('img-counter').textContent = '';
    updateNavVisibility();
    return;
  }
  $('img-counter').textContent = (state.current + 1) + ' / ' + state.images.length;
  updateNavVisibility();
}

// ── MOUSE / TOUCH ──
viewerWrap.addEventListener('wheel', e => {
  if (state.images.length === 0 || state.isCropping) return;
  e.preventDefault();
  const delta = -e.deltaY;
  zoomAt(delta, e.clientX, e.clientY);
}, { passive: false });

viewerWrap.addEventListener('mousedown', e => {
  if (e.target.closest('#kbd-hint') || e.target.closest('#topbar') || e.target.closest('#sidebar')) return;
  if (e.button !== 0 || state.images.length === 0 || state.isCropping) return;
  state.dragging = true;
  state.dragStartX = e.clientX;
  state.dragStartY = e.clientY;
  state.panStartX  = state.panX;
  state.panStartY  = state.panY;
  viewerWrap.classList.add('dragging');
});

window.addEventListener('mousemove', e => {
  if (!state.dragging) return;
  state.panX = state.panStartX + (e.clientX - state.dragStartX);
  state.panY = state.panStartY + (e.clientY - state.dragStartY);
  applyTransform(false);
});

window.addEventListener('mouseup', () => {
  state.dragging = false;
  viewerWrap.classList.remove('dragging');
});

// Double click = fit or 1:1
viewerWrap.addEventListener('dblclick', e => {
  if (e.target.closest('#kbd-hint') || e.target.closest('#topbar') || e.target.closest('#sidebar')) return;
  if (state.images.length === 0) return;
  const im = state.images[state.current];
  if (!im || !im.w) return;
  const vw = viewerWrap.clientWidth, vh = viewerWrap.clientHeight;
  const fitScale = Math.min((vw - 24) / im.w, (vh - 24) / im.h, 1);
  if (Math.abs(state.zoom - 1) < 0.05) {
    state.viewMode = 'fit';
    state.zoom = fitScale;
    state.panX = 0;
    state.panY = 0;
  } else {
    state.viewMode = 'original';
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
  }
  applyTransform(true);
});

// Touch pinch
let lastPinchDist = 0;
viewerWrap.addEventListener('touchstart', e => {
  if (e.target.closest('#kbd-hint') || e.target.closest('#topbar') || e.target.closest('#sidebar')) return;
  if (e.touches.length === 2) {
    lastPinchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  } else if (e.touches.length === 1) {
    state.dragging = true;
    state.dragStartX = e.touches[0].clientX;
    state.dragStartY = e.touches[0].clientY;
    state.panStartX  = state.panX;
    state.panStartY  = state.panY;
  }
});

viewerWrap.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 2) {
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    if (lastPinchDist > 0) {
      const ratio = dist / lastPinchDist;
      const rect = viewerWrap.getBoundingClientRect();
      const ox = cx - rect.left - rect.width / 2;
      const oy = cy - rect.top  - rect.height / 2;
      state.viewMode = 'custom';
      const oldZoom = state.zoom;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoom * ratio));
      const r = newZoom / oldZoom;
      state.panX = ox + (state.panX - ox) * r;
      state.panY = oy + (state.panY - oy) * r;
      state.zoom = newZoom;
      applyTransform(false);
    }
    lastPinchDist = dist;
  } else if (e.touches.length === 1 && state.dragging) {
    state.panX = state.panStartX + (e.touches[0].clientX - state.dragStartX);
    state.panY = state.panStartY + (e.touches[0].clientY - state.dragStartY);
    applyTransform(false);
  }
}, { passive: false });

viewerWrap.addEventListener('touchend', e => {
  if (e.touches.length < 2) lastPinchDist = 0;
  if (e.touches.length === 0) state.dragging = false;
});

// ── KEYBOARD ──
document.addEventListener('keydown', e => {
  // Escape always closes overlays, even when an input has focus
  if (e.key === 'Escape' || e.key === 'Esc') {
    const menuPanel = $('main-menu');
    if (menuPanel && menuPanel.classList.contains('open')) {
      menuPanel.classList.remove('open');
      const btnMenu = $('btn-menu');
      if (btnMenu) btnMenu.classList.remove('open');
      e.preventDefault();
      return;
    }
    if (state.isGhost) toggleFullscreen();
    closeModal('modal-config');
    closeModal('modal-resize');
    closeModal('modal-properties');
    closeModal('modal-cyber-confirm');
    const aboutOverlay = $('about-overlay');
    if (aboutOverlay) aboutOverlay.classList.remove('active');
    e.preventDefault();
    return;
  }

  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const isCtrl = e.ctrlKey || e.metaKey;

  // Shortcuts globales
  if (isCtrl) {
    switch (e.key.toLowerCase()) {
      case 'o': 
        e.preventDefault(); 
        if (e.shiftKey) {
          if (checkImageLoaded()) $('btn-show-folder').click();
        } else {
          $('btn-open-hud').click();
        }
        break;
      case 's': e.preventDefault(); if (checkImageLoaded()) saveCurrent(); break;
      case 'c': e.preventDefault(); if (checkImageLoaded()) copyToClipboard(); break;
      case 'v': e.preventDefault(); pasteFromClipboard(); break;
      case 'd': e.preventDefault(); if (checkImageLoaded()) toggleFavorite(); break;
      case ',': e.preventDefault(); openConfig(); break;
      case 'f': e.preventDefault(); if (checkImageLoaded()) toggleFullscreen(); break;
      case 'i': if (e.shiftKey) { e.preventDefault(); window.electronAPI.openDevTools(); } break;
    }
  }

  switch (e.key.toLowerCase()) {
    case 'arrowright': case 'arrowdown': case ' ': case 'd': 
      if (!isCtrl) { e.preventDefault(); next(); }
      break;
    case 'arrowleft':  case 'arrowup':   case 'a': 
      if (!isCtrl) { e.preventDefault(); prev(); }
      break;
    case 'q': if (checkImageLoaded()) rotate(-90); break;
    case 'e': if (checkImageLoaded()) rotate(90); break;
    case 'c': 
      if (!isCtrl) {
        e.preventDefault();
        if (checkImageLoaded()) {
          const btn = $('btn-crop');
          if (btn) btn.click();
        }
      }
      break;
    case 'l': if (checkImageLoaded()) rotate(-90); break;
    case 'r': 
      if (!isCtrl) {
        e.preventDefault();
        if (checkImageLoaded()) {
          const btn = $('btn-resize');
          if (btn) btn.click();
        }
      }
      break;
    case 'g': case 'G': if (!isCtrl && checkImageLoaded()) toggleFullscreen(); break;
    case 'f': if (!isCtrl && checkImageLoaded()) $('btn-fit-hud').click(); break;
    case '1': if (!isCtrl && checkImageLoaded()) $('btn-orig-hud').click(); break;
    case 'delete': 
      if (checkImageLoaded()) removeCurrentImage();
      break;
    case 'enter':
      e.preventDefault();
      if (checkImageLoaded()) toggleFullscreen();
      break;
    case '+': case '=':
      if (checkImageLoaded()) zoomAt(150, viewerWrap.clientWidth/2, viewerWrap.clientHeight/2);
      break;
    case '-':
      if (checkImageLoaded()) zoomAt(-150, viewerWrap.clientWidth/2, viewerWrap.clientHeight/2);
      break;
    case '0':
      if (checkImageLoaded()) {
        const im = state.images[state.current];
        if (im && im.w) { state.viewMode = 'fit'; fitToWindow(im.w, im.h); }
      }
      break;
  }
});

function handleFileDeleted(index) {
  if (index < 0 || index >= state.images.length) return;
  const im = state.images[index];

  if (im.file && im.file.path) {
    const p = im.file.path;
    const favs = state.settings.app.favorites || [];
    const newFavs = favs.filter(x => x !== p);
    if (newFavs.length !== favs.length) {
      state.settings.app.favorites = newFavs;
      if (isElectron) {
        window.electronAPI.saveSettings(state.settings.app);
      }
    }
    
    if (state.showingFavs) {
      const nidx = state.nonFavImages.findIndex(x => x.file && x.file.path === p);
      if (nidx !== -1) {
        state.nonFavImages.splice(nidx, 1);
        if (state.nonFavCurrent >= state.nonFavImages.length) {
          state.nonFavCurrent = state.nonFavImages.length - 1;
        }
      }
    }
  }

  if (im.url) URL.revokeObjectURL(im.url);
  state.images.splice(index, 1);
  
  if (state.images.length === 0) {
    syncCurrentIndex(-1);
    mainImg.classList.remove('loaded');
    mainImg.src = '';
    dropZone.style.display = 'flex';
    sidebar.innerHTML = '';
    const viewerFilename = $('viewer-filename');
    if (viewerFilename) viewerFilename.textContent = '';
  } else {
    const nextIdx = Math.min(index, state.images.length - 1);
    syncCurrentIndex(nextIdx);
    buildSidebar();
    showImage(nextIdx, null);
  }
  updateCounter();
}

async function trashCurrentImage() {
  const idx = state.current;
  if (idx === -1) return;
  const im = state.images[idx];
  if (!im) return;

  const lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
  showCyberConfirm({
    title: lang === 'es' ? 'Mover a la papelera' : 'Move to Trash',
    message: lang === 'es' 
      ? '¿Estás seguro de que quieres mover esta imagen a la papelera de reciclaje?' 
      : 'Are you sure you want to move this image to the Recycle Bin?',
    detail: im.file ? im.file.name : (im.url || ''),
    danger: true,
    onConfirm: async () => {
      if (isElectron && im.file && im.file.path) {
        try {
          const result = await window.electronAPI.moveToTrashDirect(im.file.path);
          if (result && result.success) {
            handleFileDeleted(idx);
          }
        } catch (err) {
          console.error('Error al mover a la papelera:', err);
        }
      } else {
        handleFileDeleted(idx);
      }
    }
  });
}

async function copyToClipboard() {
  const idx = state.currentIdx;
  if (idx === -1) return;
  const im = state.images[idx];
  const lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
  const i18nLang = I18N[lang] || I18N.en || {};
  
  if (isElectron && im.file && im.file.path) {
    try {
      window.electronAPI.copyImage(im.file.path);
      showToast(i18nLang.toast_copied || 'IMAGEN COPIADA', 'success');
    } catch (err) {
      console.error('Error al copiar por Electron:', err);
      showToast(i18nLang.toast_copy_error || 'ERROR AL COPIAR', 'error');
    }
  } else {
    try {
      const response = await fetch(im.url || getUrl(idx));
      const blob = await response.blob();
      const item = new ClipboardItem({ [blob.type || 'image/png']: blob });
      await navigator.clipboard.write([item]);
      showToast(i18nLang.toast_copied || 'IMAGEN COPIADA', 'success');
    } catch (err) {
      console.error('Error al copiar:', err);
      showToast(i18nLang.toast_copy_error || 'ERROR AL COPIAR', 'error');
    }
  }
}

function clipboardDefaultName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `clipboard-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}

function imageDiskPath(im) {
  if (!im) return null;
  return (im.file && im.file.path) || im.path || null;
}

function bindImageToDiskPath(im, diskPath, { revokeBlob = true } = {}) {
  if (!im || !diskPath) return;
  const name = diskPath.split(/[\\/]/).pop();
  if (revokeBlob && im.url && String(im.url).startsWith('blob:')) {
    try { URL.revokeObjectURL(im.url); } catch (_) { /* ignore */ }
    im.url = null;
  }
  im.file = { name, path: diskPath, size: im.size || 0 };
  im.path = diskPath;
  im.fromClipboard = false;
  if (revokeBlob) {
    im.loaded = false;
  }
}

async function promptSavePathForImage(im) {
  if (!isElectron || !window.electronAPI.showSaveDialog) return null;
  const lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
  const defaultName = (im && im.file && im.file.name) || clipboardDefaultName();
  const result = await window.electronAPI.showSaveDialog({
    title: lang === 'es' ? 'Guardar imagen' : 'Save image',
    defaultPath: defaultName,
    filters: [
      { name: 'PNG', extensions: ['png'] },
      { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (!result || result.canceled || !result.filePath) return null;
  // Keep blob URL alive until pixels are written / reloaded from disk
  bindImageToDiskPath(im, result.filePath, { revokeBlob: false });
  return result.filePath;
}

async function ensureImageDiskPath(im) {
  const existing = imageDiskPath(im);
  if (existing) return existing;
  return promptSavePathForImage(im);
}

function insertPastedImage(blob, mime = 'image/png') {
  const name = clipboardDefaultName();
  const file = new File([blob], name, { type: mime || 'image/png' });
  const url = URL.createObjectURL(file);
  const im = {
    file: { name, path: null, size: blob.size || file.size || 0 },
    url,
    w: 0,
    h: 0,
    loaded: false,
    size: blob.size || file.size || 0,
    fromClipboard: true
  };

  dropZone.style.display = 'none';

  if (!state.images.length) {
    state.images = [im];
    buildSidebar();
    showImage(0, null, true);
  } else {
    const insertAt = state.current >= 0 ? state.current + 1 : state.images.length;
    state.images.splice(insertAt, 0, im);
    buildSidebar();
    showImage(insertAt, null, true);
  }
  updateSaveButton();
}

async function pasteFromClipboard() {
  const lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
  const t = I18N[lang] || I18N.en || {};

  try {
    if (isElectron && window.electronAPI.readClipboardImage) {
      const res = await window.electronAPI.readClipboardImage();
      if (!res || !res.ok) {
        showToast(t.toast_paste_empty || 'NO IMAGE IN CLIPBOARD', 'info');
        return;
      }
      const raw = atob(res.buffer);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.mime || 'image/png' });
      insertPastedImage(blob, res.mime || 'image/png');
      showToast(t.toast_pasted || 'IMAGE PASTED', 'success');
      return;
    }

    if (!navigator.clipboard || !navigator.clipboard.read) {
      showToast(t.toast_paste_error || 'COULD NOT PASTE IMAGE', 'error');
      return;
    }
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (!type) continue;
      const blob = await item.getType(type);
      insertPastedImage(blob, type);
      showToast(t.toast_pasted || 'IMAGE PASTED', 'success');
      return;
    }
    showToast(t.toast_paste_empty || 'NO IMAGE IN CLIPBOARD', 'info');
  } catch (err) {
    console.error('Error pegando desde clipboard:', err);
    showToast(t.toast_paste_error || 'COULD NOT PASTE IMAGE', 'error');
  }
}

function checkImageLoaded() {
  if (state.current === -1 || !state.images.length) {
    const lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
    const msg = I18N[lang]?.toast_load_image_first || 'LOAD AN IMAGE FIRST';
    showToast(msg, 'info');
    return false;
  }
  return true;
}

function dismissToasts() {
  document.querySelectorAll('.cyber-toast').forEach(el => el.remove());
}

function showToast(txt, type = 'info', durationMs = 2500) {
  dismissToasts();

  const t = document.createElement('div');
  t.className = 'cyber-toast';
  
  let bg = 'rgba(0, 212, 255, 0.95)'; // Cyan por defecto (info)
  if (type === 'error') bg = 'rgba(255, 80, 80, 0.95)';
  if (type === 'success') bg = 'rgba(0, 255, 170, 0.95)';

  const duration = Math.max(400, Number(durationMs) || 2500);
  const fadeAt = Math.max(200, duration - 300);

  // Keep toasts near the top so they don't cover crop/action panels
  t.style.cssText = `
    position:fixed;top:64px;bottom:auto;left:50%;transform:translateX(-50%);
    background:${bg};color:#000;padding:8px 24px;
    border-radius:2px;font-family:var(--font-ui);
    font-size:12px;font-weight:700;z-index:12000;
    box-shadow: 0 0 20px ${bg.replace('0.95', '0.4')};
    animation: toast-in 220ms ease, toast-out 280ms ease ${fadeAt}ms forwards;
    pointer-events: none;
    letter-spacing: 1px;
    white-space: nowrap;
  `;
  t.textContent = txt;
  document.body.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, duration);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes toast-in { from { opacity:0; transform:translateX(-50%) translateY(-12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
  @keyframes toast-out { to { opacity:0; transform:translateX(-50%) translateY(-12px); } }
`;
document.head.appendChild(style);

// ── BUTTONS ──
$('btn-open-hud').addEventListener('click', () => {
  if (isElectron) {
    window.electronAPI.openFile().then(path => { if (path) scanFolder(path); });
  } else {
    fileInput.click();
  }
});
$('btn-drop-open').addEventListener('click', () => {
  if (isElectron) {
    window.electronAPI.openFile().then(path => { if (path) scanFolder(path); });
  } else {
    fileInput.click();
  }
});
fileInput.addEventListener('change', e => loadFiles(e.target.files));

$('btn-show-folder').addEventListener('click', () => {
  if (!checkImageLoaded()) return;
  const path = state.images[state.current].file.path;
  if (path && isElectron) {
    window.electronAPI.showItemInFolder(path);
  }
});

$('btn-fit-hud').addEventListener('click', () => {
  if (!checkImageLoaded()) return;
  const im = state.images[state.current];
  if (im && im.w) { state.viewMode = 'fit'; state.panX=0; state.panY=0; fitToWindow(im.w, im.h); }
});

$('btn-orig-hud').addEventListener('click', () => {
  if (!checkImageLoaded()) return;
  state.viewMode = 'original';
  state.zoom = 1; state.panX = 0; state.panY = 0;
  applyTransform(true);
});

$('btn-fs-hud').addEventListener('click', () => {
  if (!checkImageLoaded()) return;
  toggleFullscreen();
});

$('btn-rot-l').addEventListener('click', () => {
  if (!checkImageLoaded()) return;
  rotate(-90);
});
$('btn-rot-r').addEventListener('click', () => {
  if (!checkImageLoaded()) return;
  rotate(90);
});
$('btn-save').addEventListener('click', () => {
  if (!checkImageLoaded()) return;
  saveCurrent();
});

$('btn-copy').addEventListener('click', () => {
  if (!checkImageLoaded()) return;
  copyToClipboard();
});

$('btn-trash').addEventListener('click', () => {
  if (!checkImageLoaded()) return;
  trashCurrentImage();
});



$('btn-prev').addEventListener('click', (e) => {
  e.currentTarget.blur();
  prev();
});
$('btn-next').addEventListener('click', (e) => {
  e.currentTarget.blur();
  next();
});

$('sidebar-handle').addEventListener('click', () => {
  state.sidebarOpen = !state.sidebarOpen;
  sidebar.style.display = state.sidebarOpen ? '' : 'none';
  document.body.classList.toggle('sidebar-open', state.sidebarOpen);
  
  const handle = $('sidebar-handle');
  handle.style.left = state.sidebarOpen ? 'var(--panel-w)' : '0';
  $('sidebar-handle-arrow').textContent = state.sidebarOpen ? '◂' : '▸';
  
  if (state.settings && state.settings.app) {
    state.settings.app.sidebarOpen = state.sidebarOpen;
    if (isElectron) {
      window.electronAPI.saveSettings(state.settings.app);
    }
  }
  
  if (state.sidebarOpen) {
    startBackgroundScan();
  } else {
    state.scanInProgress = false;
    updateThumbProgress(0, 0, true);
  }
});

// ── FULLSCREEN ──
function toggleFullscreen() {
  document.body.classList.add('no-hud-transition');
  
  state.isGhost = !state.isGhost;
  if (state.isGhost) state.isCropping = false; // AISLAMIENTO TOTAL
  document.body.classList.toggle('ghost-mode', state.isGhost);
  updateHUDStates();
  resetHudTimer();
  
  // Forzar reflow para aplicar los cambios de layout instantáneamente sin animación
  document.body.offsetHeight;
  
  setTimeout(() => {
    document.body.classList.remove('no-hud-transition');
    const im = state.images[state.current];
    if (im) {
      if (state.viewMode === 'original') {
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        applyTransform(false);
      } else if (state.viewMode === 'fit') {
        fitToWindow(im.w, im.h);
      } else {
        applyTransform(false);
      }
    }
  }, 100);
}

// ── DRAG & DROP ──
let dragCount = 0;

document.addEventListener('dragenter', e => {
  if (e.dataTransfer.types.includes('Files')) {
    e.preventDefault();
    dragCount++;
    app.classList.add('drag-over');
  }
});

document.addEventListener('dragleave', () => {
  dragCount--;
  if (dragCount <= 0) { dragCount = 0; app.classList.remove('drag-over'); }
});

document.addEventListener('dragover', e => e.preventDefault());

document.addEventListener('drop', e => {
  e.preventDefault();
  dragCount = 0;
  app.classList.remove('drag-over');
  if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files);
});

// ── RESIZE ──
window.addEventListener('resize', () => {
  if (state.images.length && state.current >= 0) {
    const im = state.images[state.current];
    if (im && im.w && state.viewMode === 'fit') fitToWindow(im.w, im.h);
  }
});

// ── MODAL HELPERS ──
function openModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.add('active');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  const focusable = el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable) {
    setTimeout(() => focusable.focus(), 0);
  }
}
function closeModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('active');
  el.removeAttribute('aria-modal');
  if (id === 'modal-config') clearConfigAccentPreview();
}
window.closeModal = closeModal;

function hexToRgbTriplet(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return '0, 212, 255';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return '0, 212, 255';
  return `${r}, ${g}, ${b}`;
}

function setConfigAccentPreview(hex) {
  const modal = $('modal-config');
  if (!modal || !hex) return;
  modal.style.setProperty('--preview-accent', hex);
  modal.style.setProperty('--preview-accent-rgb', hexToRgbTriplet(hex));
}

function clearConfigAccentPreview() {
  const modal = $('modal-config');
  if (!modal) return;
  modal.style.removeProperty('--preview-accent');
  modal.style.removeProperty('--preview-accent-rgb');
}

// Wire modal dismiss controls (CSP blocks inline onclick)
document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal(btn.getAttribute('data-close-modal'));
  });
});
['modal-resize', 'modal-config', 'modal-properties', 'modal-cyber-confirm'].forEach(id => {
  const overlay = $(id);
  if (!overlay) return;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(id);
  });
});

// ── CONFIG LOGIC ──
function openConfig() {
  if (!state.settings) return;
  const s = state.settings.app;
  $('cfg-sidebar').checked = s.sidebarOpen;
  $('cfg-statusbar').checked = s.statusbarVisible;
  $('cfg-tray').checked = s.closeToTray;
  $('cfg-autostart').checked = s.autoStart;
  $('cfg-contextmenu').checked = s.contextMenuEnabled || false;
  $('cfg-lang').value = s.language || 'en';
  
  // HUD Auto-hide settings
  $('cfg-hud-autohide').checked = s.hudAutoHide;
  $('cfg-nav-autohide').checked = s.navAutoHide !== false;
  $('cfg-show-hints').checked = s.showTopHints !== false;
  $('cfg-hud-delay').value = s.hudAutoHideDelay;
  $('cfg-hud-delay-val').textContent = (s.hudAutoHideDelay / 1000).toFixed(1) + 's';
  $('cfg-hud-delay').disabled = !s.hudAutoHide;
  $('cfg-hud-delay-row').style.opacity = s.hudAutoHide ? '1' : '0.5';
  
  // Monitor selection
  if (isElectron) {
    window.electronAPI.getMonitors().then(displays => {
      const select = $('cfg-monitor');
      // Limpiar salvo el primero
      while (select.options.length > 1) select.remove(1);
      
      displays.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.label;
        select.appendChild(opt);
      });
      select.value = s.preferredDisplayId || 'auto';
    });
  }

  // Set active color + live preview in modal
  const accent = s.accentColor || '#00d4ff';
  document.querySelectorAll('#modal-config .color-opt').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.color === accent);
  });
  setConfigAccentPreview(accent);
  
  openModal('modal-config');
}

document.querySelectorAll('#modal-config .color-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('#modal-config .color-opt').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    setConfigAccentPreview(opt.dataset.color);
  });
});

$('cfg-hud-delay').addEventListener('input', (e) => {
  $('cfg-hud-delay-val').textContent = (e.target.value / 1000).toFixed(1) + 's';
});
$('cfg-hud-autohide').addEventListener('change', (e) => {
  $('cfg-hud-delay').disabled = !e.target.checked;
  $('cfg-hud-delay-row').style.opacity = e.target.checked ? '1' : '0.5';
});

$('btn-save-config').addEventListener('click', async () => {
  const activeOpt = document.querySelector('#modal-config .color-opt.active');
  const accentColor = (activeOpt && activeOpt.dataset.color) || '#00d4ff';
  const contextMenuEnabled = $('cfg-contextmenu').checked;
  const newSettings = {
    sidebarOpen: $('cfg-sidebar').checked,
    statusbarVisible: $('cfg-statusbar').checked,
    closeToTray: $('cfg-tray').checked,
    autoStart: $('cfg-autostart').checked,
    preferredDisplayId: $('cfg-monitor').value,
    language: $('cfg-lang').value,
    accentColor: accentColor,
    contextMenuEnabled: contextMenuEnabled,
    hudAutoHide: $('cfg-hud-autohide').checked,
    navAutoHide: $('cfg-nav-autohide').checked,
    showTopHints: $('cfg-show-hints').checked,
    hudAutoHideDelay: parseInt($('cfg-hud-delay').value, 10)
  };
  
  if (isElectron) {
    const lang = newSettings.language || 'en';
    window.electronAPI.registerContextMenu(contextMenuEnabled, lang).then(res => {
      if (res && !res.success) {
        showToast(lang === 'es' ? 'AVISO: ' + res.error : 'WARNING: ' + res.error, 'warning');
      }
    }).catch(err => console.error('Error saving context menu:', err));
  }
  
  state.settings.app = Object.assign({}, state.settings.app, newSettings);
  applySettings();
  if (isElectron) window.electronAPI.saveSettings(state.settings.app);
  closeModal('modal-config');
  const lang = newSettings.language || 'en';
  showToast(I18N[lang].toast_saved, 'success');
});

function applySettings() {
  const s = state.settings.app;
  
  // Accent color
  document.documentElement.style.setProperty('--cyber-accent', s.accentColor);
  // Convert hex to RGB for variables
  const r = parseInt(s.accentColor.slice(1,3), 16);
  const g = parseInt(s.accentColor.slice(3,5), 16);
  const b = parseInt(s.accentColor.slice(5,7), 16);
  document.documentElement.style.setProperty('--cyber-accent-rgb', `${r}, ${g}, ${b}`);
  
  // Visibility
  state.sidebarOpen = s.sidebarOpen;
  if (s.preferredDisplayId) $('cfg-monitor').value = s.preferredDisplayId;
  sidebar.style.display = s.sidebarOpen ? '' : 'none';
  document.body.classList.toggle('sidebar-open', s.sidebarOpen);
  const handle = $('sidebar-handle');
  if (handle) {
    handle.style.left = s.sidebarOpen ? 'var(--panel-w)' : '0';
    $('sidebar-handle-arrow').textContent = s.sidebarOpen ? '◂' : '▸';
  }
  $('statusbar').style.display = s.statusbarVisible ? '' : 'none';
  document.body.classList.toggle('statusbar-visible', s.statusbarVisible);

  // Title bar hints visibility
  const showHints = s.showTopHints !== false;
  const hintsEl = $('top-hints');
  if (hintsEl) {
    hintsEl.classList.toggle('hidden', !showHints);
  }

  // Language
  const lang = s.language || 'en';
  updateLanguage(lang);
}



// ── ELECTRON WINDOW CONTROLS ──


if (isElectron) {
  $('win-min').addEventListener('click', () => window.electronAPI.minimize());
  $('win-max').addEventListener('click', () => window.electronAPI.maximize());
  $('win-close').addEventListener('click', () => window.electronAPI.close());
  $('ghost-close').addEventListener('click', () => toggleFullscreen());

  const WIN_MAX_ICO = '<svg class="win-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';
  const WIN_RESTORE_ICO = '<svg class="win-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6"/><path d="M3 21l7-7"/><path d="M20 10h-6V4"/><path d="M21 3l-7 7"/></svg>';

  window.electronAPI.onWinState(winState => {
    const btn = $('win-max');
    const uiLang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
    const t = I18N[uiLang] || I18N.en;
    if (winState === 'maximized') {
      btn.classList.add('maximized');
      btn.title = t.menu_restore || 'Restore';
      btn.innerHTML = WIN_RESTORE_ICO;
    } else {
      btn.classList.remove('maximized');
      btn.title = t.maximize || 'Maximize';
      btn.innerHTML = WIN_MAX_ICO;
    }
  });

  window.electronAPI.onOpenFile(async path => {
    // 1. Escanear la carpeta para obtener vecinos
    const neighbors = await window.electronAPI.scanFolder(path);
    
    if (neighbors.length > 0) {
      const files = neighbors.map(n => {
        const name = n.path.split(/[\\/]/).pop();
        return { name, path: n.path, size: n.size, type: '' };
      });
      
      const targetIdx = neighbors.findIndex(n => n.path.toLowerCase() === path.toLowerCase());
      loadFiles(files, targetIdx !== -1 ? targetIdx : 0);
    } else {
      // Fallback: cargar solo el archivo original
      const name = path.split(/[\\/]/).pop();
      const mockFile = { name, path: path, size: 0, type: '' }; 
      loadFiles([mockFile]);
    }
  });

  window.electronAPI.onOpenSettings(() => {
    openConfig();
  });

  // Load settings from Electron
  window.electronAPI.getSettings().then(s => {
    if (s && s.app) {
      state.settings.app = { ...state.settings.app, ...s.app };
      if (state.settings.app.checkUpdatesOnStartup === undefined) {
        state.settings.app.checkUpdatesOnStartup = state.settings.app.manualUpdateOnly === undefined
          ? true
          : !state.settings.app.manualUpdateOnly;
      }
      applySettings();
      // Startup update check is owned by main (electron-updater); listen for notify
      if (window.electronAPI.onUpdateStatus) {
        window.electronAPI.onUpdateStatus((status) => {
          if (window.__cvApplyUpdateStatus) window.__cvApplyUpdateStatus(status);
          if (
            status &&
            status.state === 'available' &&
            state.settings.app.checkUpdatesOnStartup !== false
          ) {
            const lang = state.settings.app.language || 'en';
            const msg = (I18N[lang].about_notify_startup || 'Update available: v{version}')
              .replace('{version}', status.version || '');
            showToast(msg, 'info');
          }
        });
      }
    }
  }).catch(err => console.error('Error cargando settings:', err));
} else {
  // Modo browser
  applySettings();
}

// ── HUD SYNC ──
function updateHUDStates() {
  const rotL = $('btn-rot-l');
  const rotR = $('btn-rot-r');
  const crop = $('btn-crop');
  const fsBtn = $('btn-fs-hud');
  const save = $('btn-save');

  const hasChanges = (state.currentRotation !== 0);

  // ROTACIÓN / GUARDAR
  if (hasChanges) {
    if (rotL) rotL.classList.add('active');
    if (rotR) rotR.classList.add('active');
    if (save) save.classList.add('active');
  } else {
    if (rotL) rotL.classList.remove('active');
    if (rotR) rotR.classList.remove('active');
    if (save) save.classList.remove('active');
  }

  // RECORTE
  if (state.isCropping) {
    if (crop) crop.classList.add('active');
  } else {
    if (crop) crop.classList.remove('active');
  }

  // FULLSCREEN
  if (state.isGhost) {
    if (fsBtn) fsBtn.classList.add('active');
  } else {
    if (fsBtn) fsBtn.classList.remove('active');
  }
}

$('btn-center').addEventListener('click', () => {
  const scrollArea = $('sidebar-scroll');
  const activeThumb = sidebar.querySelector('.thumb-item.active');
  if (activeThumb && scrollArea) {
    activeThumb.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

// Modificar confirmCrop y cancelCrop para limpiar
// (Ya gestionado por listeners directos arriba)

// ── ABOUT MODAL + UPDATES ──
(function() {
  const overlay = document.createElement('div');
  overlay.id = 'about-overlay';
  overlay.className = 'modal-overlay';
  document.body.appendChild(overlay);

  let updateStatus = { state: 'idle' };
  let unsubUpdateStatus = null;

  function tAbout() {
    const lang = (state.settings.app && state.settings.app.language) || 'en';
    return I18N[lang] || I18N.en;
  }

  function applyUpdateStatus(status) {
    updateStatus = status || { state: 'idle' };
    syncUpdateActions(overlay);
  }
  window.__cvApplyUpdateStatus = applyUpdateStatus;

  function renderUpdateStatusText(el) {
    if (!el) return;
    const t = tAbout();
    const s = updateStatus;
    el.style.color = 'var(--cyber-muted)';
    // Banner already covers available/downloaded
    if (s.state === 'available' || s.state === 'downloaded') {
      el.textContent = '';
      return;
    }
    if (s.state === 'checking') {
      el.textContent = t.about_checking;
    } else if (s.state === 'not-available') {
      el.textContent = t.about_up_to_date;
      el.style.color = 'var(--cyber-accent3)';
    } else if (s.state === 'downloading') {
      el.textContent = (t.about_downloading || 'Downloading… {percent}%')
        .replace('{percent}', String(s.percent || 0));
      el.style.color = 'var(--cyber-accent)';
    } else if (s.state === 'error') {
      el.textContent = `${t.about_update_err}${s.message ? ' (' + s.message + ')' : ''}`;
      el.style.color = 'var(--cyber-accent2)';
    } else {
      el.textContent = '';
    }
  }

  function syncUpdateBanner(root) {
    if (!root) return;
    const banner = root.querySelector('#about-update-banner');
    if (!banner) return;
    const t = tAbout();
    const s = updateStatus;
    banner.classList.remove('visible', 'ready');
    if (s.state === 'available') {
      banner.textContent = `${t.about_update_avail} (v${s.version || ''})`;
      banner.classList.add('visible');
    } else if (s.state === 'downloaded') {
      banner.textContent = `${t.about_downloaded}${s.version ? ' (v' + s.version + ')' : ''}`;
      banner.classList.add('visible', 'ready');
    } else {
      banner.textContent = '';
    }
  }

  function syncUpdateActions(root) {
    if (!root) return;
    const checkBtn = root.querySelector('#about-btn-update');
    const downloadBtn = root.querySelector('#about-btn-download');
    const installBtn = root.querySelector('#about-btn-install');
    const progress = root.querySelector('#about-update-progress');
    const bar = root.querySelector('#about-update-bar');
    const statusEl = root.querySelector('#about-update-status');
    const s = updateStatus.state;

    if (checkBtn) {
      checkBtn.disabled = s === 'checking' || s === 'downloading';
      checkBtn.style.display = (s === 'available' || s === 'downloaded' || s === 'downloading') ? 'none' : '';
    }
    if (downloadBtn) {
      downloadBtn.style.display = s === 'available' ? '' : 'none';
      downloadBtn.disabled = false;
    }
    if (installBtn) {
      installBtn.style.display = s === 'downloaded' ? '' : 'none';
    }
    if (progress) {
      progress.style.display = s === 'downloading' ? '' : 'none';
    }
    if (bar) {
      bar.style.width = Math.max(0, Math.min(100, s === 'downloading' ? (updateStatus.percent || 0) : 0)) + '%';
    }
    renderUpdateStatusText(statusEl);
    syncUpdateBanner(root);
  }

  window.checkUpdatesGlobal = async function(manual = true) {
    const t = tAbout();
    if (!isElectron || !window.electronAPI.checkForUpdates) return;

    updateStatus = { state: 'checking' };
    syncUpdateActions(overlay);

    const res = await window.electronAPI.checkForUpdates();
    if (!res || !res.ok) {
      if (res && (res.portable || res.error === 'PORTABLE_NO_AUTO_UPDATE' || res.error === 'DEV_NO_AUTO_UPDATE')) {
        updateStatus = {
          state: 'error',
          message: res.portable ? t.about_portable_hint : t.about_dev_hint
        };
        syncUpdateActions(overlay);
        if (manual && window.electronAPI.openReleasesPage) {
          // Keep status visible; user can click Open releases
        }
        return res;
      }
      updateStatus = { state: 'error', message: (res && res.error) || 'Update check failed' };
      syncUpdateActions(overlay);
      return res;
    }

    // Events usually settle UI first; safety net if still checking
    if (updateStatus.state === 'checking') {
      updateStatus = {
        state: 'not-available',
        version: res.version || ''
      };
      syncUpdateActions(overlay);
    }
    return res;
  };

  async function openAbout() {
    const lang = state.settings.app.language || 'en';
    const t = I18N[lang] || I18N.en;
    const version = isElectron ? await window.electronAPI.getVersion() : '1.6.1';
    const subtitle = lang === 'es' ? `v${version} — Visor Pro` : `v${version} — Pro Viewer`;
    const updateInfo = (isElectron && window.electronAPI.getUpdateInfo)
      ? await window.electronAPI.getUpdateInfo()
      : { canUpdate: false, portable: false };

    overlay.innerHTML = `
      <div class="modal-box" style="max-width:400px" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div class="modal-title">${t.about_title}</div>
          <button class="win-btn" id="about-close-btn">&#10005;</button>
        </div>
        <div class="modal-body">
          <div style="font-size:18px;color:var(--cyber-accent);letter-spacing:0.4px;margin-bottom:4px">
            [Cyber<span style="color:var(--cyber-accent3)">Viewer</span>]
          </div>
          <div style="font-size:11px;color:var(--cyber-muted);margin-bottom:20px">${subtitle}</div>
          <img src="assets/icon.png" style="width:64px;height:64px;margin-bottom:20px;filter:drop-shadow(0 0 5px rgba(var(--cyber-icon-rgb), 0.45))" alt="Logo">
          <div style="font-size:12px;color:var(--cyber-text);line-height:1.8">
            ${t.about_desc}
          </div>
          <div style="margin-top:20px;font-size:11px;color:var(--cyber-muted)">
            ${t.about_formats}
          </div>
          
          <div style="margin-top:20px; border-top: 1px solid var(--cyber-border); padding-top: 15px; text-align: left;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <span style="font-size:11px; color:var(--cyber-text); font-family:var(--font-ui); text-transform:uppercase;">
                ${t.about_check_on_startup}
              </span>
              <label class="switch">
                <input type="checkbox" id="about-startup-update-toggle" ${state.settings.app.checkUpdatesOnStartup !== false ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </div>
            <div id="about-update-banner" class="about-update-banner" aria-live="polite"></div>
            <div id="about-update-progress" class="about-update-progress" style="display:none;margin-bottom:10px;">
              <div class="about-update-track"><div id="about-update-bar" class="about-update-bar"></div></div>
            </div>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <button id="about-btn-update" class="top-btn" style="padding: 4px 12px; font-size:10px; border-color:var(--cyber-accent); color:var(--cyber-accent); cursor:pointer;">
                ${t.about_check_updates}
              </button>
              <button id="about-btn-download" class="top-btn active" style="display:none;padding: 4px 12px; font-size:10px; cursor:pointer;">
                ${t.about_download_btn}
              </button>
              <button id="about-btn-install" class="top-btn active" style="display:none;padding: 4px 12px; font-size:10px; cursor:pointer;">
                ${t.about_install_btn}
              </button>
              <button id="about-btn-releases" class="top-btn" style="padding: 4px 12px; font-size:10px; border-color:var(--cyber-muted); color:var(--cyber-muted); cursor:pointer;">
                ${t.about_open_releases}
              </button>
            </div>
            <div id="about-update-status" style="margin-top:10px;font-size:10px; font-family:var(--font-ui); color:var(--cyber-muted);"></div>
            ${!updateInfo.canUpdate ? `<div style="margin-top:8px;font-size:10px;color:var(--cyber-muted)">${updateInfo.portable ? t.about_portable_hint : t.about_dev_hint}</div>` : ''}
          </div>
        </div>
        <div class="modal-footer">
          <button id="about-close" class="top-btn active">${t.about_understood}</button>
        </div>
      </div>
    `;

    overlay.querySelector('#about-close').addEventListener('click', closeAbout);
    overlay.querySelector('#about-close-btn').addEventListener('click', closeAbout);
    
    const toggle = overlay.querySelector('#about-startup-update-toggle');
    toggle.addEventListener('change', () => {
      state.settings.app.checkUpdatesOnStartup = toggle.checked;
      if (isElectron) {
        window.electronAPI.saveSettings(state.settings.app);
      }
    });

    overlay.querySelector('#about-btn-update').addEventListener('click', () => {
      window.checkUpdatesGlobal(true);
    });
    overlay.querySelector('#about-btn-download').addEventListener('click', async () => {
      updateStatus = { state: 'downloading', percent: 0 };
      syncUpdateActions(overlay);
      const res = await window.electronAPI.downloadUpdate();
      if (!res || !res.ok) {
        updateStatus = { state: 'error', message: (res && res.error) || 'Download failed' };
        syncUpdateActions(overlay);
      }
    });
    overlay.querySelector('#about-btn-install').addEventListener('click', () => {
      window.electronAPI.installUpdate();
    });
    overlay.querySelector('#about-btn-releases').addEventListener('click', () => {
      if (window.electronAPI.openReleasesPage) window.electronAPI.openReleasesPage();
    });

    if (unsubUpdateStatus) unsubUpdateStatus();
    if (window.electronAPI.onUpdateStatus) {
      unsubUpdateStatus = window.electronAPI.onUpdateStatus((status) => {
        applyUpdateStatus(status);
      });
    }

    syncUpdateActions(overlay);
    overlay.classList.add('active');
  }

  function closeAbout() {
    overlay.classList.remove('active');
    if (unsubUpdateStatus) {
      unsubUpdateStatus();
      unsubUpdateStatus = null;
    }
  }

  overlay.addEventListener('click', e => { if (e.target === overlay) closeAbout(); });
  $('btn-about').addEventListener('click', openAbout);
  $('logo-trigger').addEventListener('click', openAbout);
})();

$('btn-config').addEventListener('click', openConfig);

// ── MAIN MENU (☰) ──
(function initMainMenu() {
  const btn = $('btn-menu');
  const panel = $('main-menu');
  if (!btn || !panel) return;

  function closeMenu() {
    panel.classList.remove('open');
    btn.classList.remove('open');
    const a = document.activeElement;
    if (a && panel.contains(a)) a.blur();
  }
  function refreshMenuState() {
    const hasImg = state.current !== -1 && state.images && state.images.length > 0;
    panel.querySelectorAll('[data-needs-image]').forEach(el => el.classList.toggle('disabled', !hasImg));
    const ah = panel.querySelector('[data-action="autohide"]');
    if (ah) ah.classList.toggle('checked', !!(state.settings && state.settings.app && state.settings.app.hudAutoHide));
    const sb = panel.querySelector('[data-action="sidebar"]');
    if (sb) sb.classList.toggle('checked', !!state.sidebarOpen);
    const th = panel.querySelector('[data-action="toggle-hints"]');
    if (th) th.classList.toggle('checked', !!(state.settings && state.settings.app && state.settings.app.showTopHints !== false));
  }
  function openMenu() {
    if (typeof hideCustomContextMenu === 'function') hideCustomContextMenu();
    refreshMenuState();
    panel.classList.add('open');
    btn.classList.add('open');
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.contains('open') ? closeMenu() : openMenu();
  });
  document.addEventListener('click', e => {
    if (panel.classList.contains('open') && !e.target.closest('.menu-wrap')) closeMenu();
  });

  function closeOpenModals() {
    closeModal('modal-config');
    closeModal('modal-resize');
    closeModal('modal-properties');
    closeModal('modal-cyber-confirm');
    const aboutOverlay = $('about-overlay');
    if (aboutOverlay) aboutOverlay.classList.remove('active');
  }

  function runAction(action) {
    // Leave modal context so menu actions (and subsequent UI) aren't blocked
    if (action !== 'resize' && action !== 'preferences' && action !== 'about' && action !== 'check-updates') {
      closeOpenModals();
    }
    switch (action) {
      case 'open-folder':    $('btn-open-hud').click(); break;
      case 'paste-image':    pasteFromClipboard(); break;
      case 'close-image':    closeImage(); break;
      case 'show-folder':    $('btn-show-folder').click(); break;
      case 'save':           saveCurrent(); break;
      case 'copy':           copyToClipboard(); break;
      case 'properties': {
        const im = state.images[state.current];
        const fpath = im && (im.path || (im.file ? im.file.path : null));
        if (fpath) showPropertiesPanel(fpath);
        break;
      }
      case 'trash':          removeCurrentImage(); break;
      case 'rotate-left':    rotate(-90); break;
      case 'rotate-right':   rotate(90); break;
      case 'crop':           $('btn-crop').click(); break;
      case 'resize':         $('btn-resize').click(); break;
      case 'fit':            $('btn-fit-hud').click(); break;
      case 'original':       $('btn-orig-hud').click(); break;
      case 'fullscreen':     toggleFullscreen(); break;
      case 'sidebar':        $('sidebar-handle').click(); break;
      case 'autohide':
        state.settings.app.hudAutoHide = !state.settings.app.hudAutoHide;
        if (isElectron) window.electronAPI.saveSettings(state.settings.app);
        applySettings();
        if (typeof resetHudTimer === 'function') resetHudTimer();
        break;
      case 'toggle-hints':
        state.settings.app.showTopHints = (state.settings.app.showTopHints !== false) ? false : true;
        if (isElectron) window.electronAPI.saveSettings(state.settings.app);
        applySettings();
        break;
      case 'next':           next(); break;
      case 'prev':           prev(); break;
      case 'favorite':       $('btn-fav').click(); break;
      case 'favorites-view':
        (async () => {
          const wasShowing = state.showingFavs;
          await toggleFavoritesView();
          // entering favorites view shows the full list in the sidebar — expand it if collapsed
          if (!wasShowing && state.showingFavs && !state.sidebarOpen) $('sidebar-handle').click();
        })();
        break;
      case 'preferences':    $('btn-config').click(); break;
      case 'about':          $('btn-about').click(); break;
      case 'check-updates':
        $('btn-about').click();
        setTimeout(() => {
          if (typeof window.checkUpdatesGlobal === 'function') window.checkUpdatesGlobal(true);
        }, 80);
        break;
    }
  }

  panel.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      if (item.classList.contains('disabled')) return;
      const action = item.dataset.action;
      runAction(action);
      if (action === 'autohide' || action === 'sidebar') { item.blur(); refreshMenuState(); } else closeMenu();
    });
  });
})();

// ── HUD AUTO-HIDE (Sincronizado) ──
let hudTimer = null;
const elementsToHide = [
  { el: $('topbar'), hideClass: 'hud-hidden-top' },
  { el: $('statusbar'), hideClass: 'hud-hidden-bottom' },
  { el: $('kbd-hint'), hideClass: 'hud-hidden-fade' },
  { el: $('ghost-close'), hideClass: 'hud-hidden-fade' },
  { el: $('viewer-filename'), hideClass: 'hud-hidden-fade' },
  { el: $('nav-container'), hideClass: 'hud-hidden-fade' }
];

function resetHudTimer() {
  clearTimeout(hudTimer);

  // During crop, keep chrome out of the way — never re-reveal filename/HUD
  if (state.isCropping) {
    const filename = $('viewer-filename');
    if (filename) filename.classList.add('hud-hidden-fade');
    const kbd = $('kbd-hint');
    if (kbd) kbd.classList.add('hud-hidden');
    const nav = $('nav-container');
    if (nav) nav.classList.add('hud-hidden-fade');
    return;
  }

  elementsToHide.forEach(item => {
    if (item.el) item.el.classList.remove(item.hideClass);
  });
  
  const hudEnabled = state.settings?.app?.hudAutoHide !== false;
  const navEnabled = state.settings?.app?.navAutoHide !== false;
  
  if (!hudEnabled && !navEnabled) {
    return;
  }
  
  // No ocultar si el ratón está sobre el HUD
  const isHovering = elementsToHide.some(item => item.el && item.el.matches(':hover'));
  if (isHovering) return;

  const delay = (state.settings && state.settings.app && state.settings.app.hudAutoHideDelay !== undefined)
    ? state.settings.app.hudAutoHideDelay
    : 2000;

  hudTimer = setTimeout(() => {
    if (state.images.length > 0) {
      elementsToHide.forEach(item => {
        if (item.el) {
          if (item.el.id === 'nav-container') {
            if (navEnabled) item.el.classList.add(item.hideClass);
          } else {
            if (hudEnabled) {
              const isTopbarOrStatusbar = (item.el.id === 'topbar' || item.el.id === 'statusbar');
              if (isTopbarOrStatusbar && !state.isGhost) return;
              item.el.classList.add(item.hideClass);
            }
          }
        }
      });
    }
  }, delay);
}

window.addEventListener('mousemove', resetHudTimer);
elementsToHide.forEach(item => {
  if (item.el) {
    item.el.addEventListener('mouseenter', () => clearTimeout(hudTimer));
    item.el.addEventListener('mouseleave', resetHudTimer);
  }
});

// ── FAVORITES SYSTEM ──
function toggleFavorite() {
  const idx = state.current;
  if (idx === -1) return;
  const im = state.images[idx];
  if (!im || !im.file || !im.file.path) return;
  
  const path = im.file.path;
  let favs = state.settings.app.favorites || [];
  const index = favs.indexOf(path);
  
  const lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
  
  if (index === -1) {
    favs.push(path);
    showToast(lang === 'es' ? 'AÑADIDO A FAVORITOS' : 'ADDED TO FAVORITES', 'success');
  } else {
    favs.splice(index, 1);
    showToast(lang === 'es' ? 'ELIMINADO DE FAVORITOS' : 'REMOVED FROM FAVORITES', 'info');
  }
  
  state.settings.app.favorites = favs;
  if (isElectron) {
    window.electronAPI.saveSettings(state.settings.app);
  }
  
  updateFavButtonState();
}

function updateFavButtonState() {
  const btn = $('btn-fav');
  if (!btn) return;
  
  const idx = state.current;
  if (idx === -1) {
    btn.classList.remove('favorited');
    btn.innerHTML = '&#9734;';
    return;
  }
  const im = state.images[idx];
  if (!im || !im.file || !im.file.path) {
    btn.classList.remove('favorited');
    btn.innerHTML = '&#9734;';
    return;
  }
  
  const favs = state.settings.app.favorites || [];
  const isFav = favs.includes(im.file.path);
  if (isFav) {
    btn.classList.add('favorited');
    btn.innerHTML = '&#9733;';
  } else {
    btn.classList.remove('favorited');
    btn.innerHTML = '&#9734;';
  }
}

function syncFavoritesToggleButtonState(lang) {
  const btn = $('btn-toggle-favs');
  if (!btn) return;
  if (!lang) {
    lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
  }
  const favLbl = btn.querySelector('.fav-lbl');
  const favStar = btn.querySelector('.fav-star');
  
  if (state.showingFavs) {
    btn.classList.add('active');
    setCyberTooltip(btn, lang === 'es' ? 'Mostrar galería completa' : 'Show full gallery');
    if (favLbl) favLbl.textContent = lang === 'es' ? 'TODAS' : 'ALL';
    if (favStar) favStar.innerHTML = '&#9734;';
  } else {
    btn.classList.remove('active');
    setCyberTooltip(btn, lang === 'es' ? 'Mostrar Favoritos' : 'Show Favorites');
    if (favLbl) favLbl.textContent = lang === 'es' ? 'FAVORITOS' : 'FAVORITES';
    if (favStar) favStar.innerHTML = '&#9733;';
  }
}

async function toggleFavoritesView() {
  const btn = $('btn-toggle-favs');
  if (!btn) return;
  const lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
  
  if (!state.showingFavs) {
    const favs = state.settings.app.favorites || [];
    if (favs.length === 0) {
      showToast(lang === 'es' ? 'No hay favoritos guardados' : 'No favorites saved', 'info');
      return;
    }
    
    if (isElectron) {
      const validFavs = await window.electronAPI.validatePaths(favs);
      if (validFavs.length !== favs.length) {
        state.settings.app.favorites = validFavs;
        window.electronAPI.saveSettings(state.settings.app);
      }
      
      if (validFavs.length === 0) {
        showToast(lang === 'es' ? 'No hay favoritos guardados en disco' : 'No favorites found on disk', 'info');
        return;
      }
      
      state.nonFavImages = [...state.images];
      state.nonFavCurrent = state.current;
      
      const mapped = validFavs.map(p => {
        const name = p.split(/[\\/]/).pop();
        return {
          file: { name, path: p, size: 0, type: '' },
          url: null,
          loaded: false,
          w: 0,
          h: 0
        };
      });
      
      state.showingFavs = true;
      syncFavoritesToggleButtonState(lang);
      
      state.images = mapped;
      buildSidebar();
      dropZone.style.display = 'none';
      showImage(0, null, true);
      showToast(lang === 'es' ? 'VISTA DE FAVORITOS ACTIVA' : 'FAVORITES VIEW ACTIVE', 'success');
    } else {
      state.nonFavImages = [...state.images];
      state.nonFavCurrent = state.current;
      
      const mapped = favs.map(p => {
        const name = p.split(/[\\/]/).pop();
        return {
          file: { name, path: p, size: 0, type: '' },
          url: p,
          loaded: false,
          w: 0,
          h: 0
        };
      });
      
      state.showingFavs = true;
      syncFavoritesToggleButtonState(lang);
      
      state.images = mapped;
      buildSidebar();
      dropZone.style.display = 'none';
      showImage(0, null, true);
      showToast(lang === 'es' ? 'VISTA DE FAVORITOS ACTIVA' : 'FAVORITES VIEW ACTIVE', 'success');
    }
  } else {
    state.showingFavs = false;
    syncFavoritesToggleButtonState(lang);
    
    state.images = [...state.nonFavImages];
    buildSidebar();
    if (state.nonFavCurrent !== -1 && state.nonFavCurrent < state.images.length) {
      showImage(state.nonFavCurrent, null, true);
    } else if (state.images.length > 0) {
      showImage(0, null, true);
    } else {
      syncCurrentIndex(-1);
      mainImg.classList.remove('loaded');
      mainImg.src = '';
      dropZone.style.display = 'flex';
      $('sidebar-inner').innerHTML = '';
      const viewerFilename = $('viewer-filename');
      if (viewerFilename) viewerFilename.textContent = '';
      updateCounter();
    }
    showToast(lang === 'es' ? 'GALERÍA COMPLETA RESTAURADA' : 'FULL GALLERY RESTORED', 'info');
  }
}

$('btn-fav').addEventListener('click', toggleFavorite);
$('btn-toggle-favs').addEventListener('click', toggleFavoritesView);

// ── CUSTOM CONFIRMATION DIALOG ──
let confirmCallback = null;

$('btn-confirm-cancel').addEventListener('click', () => {
  closeModal('modal-cyber-confirm');
});
$('btn-confirm-ok').addEventListener('click', () => {
  closeModal('modal-cyber-confirm');
  if (confirmCallback) confirmCallback();
});

function showCyberConfirm({ title, message, detail, danger = true, onConfirm }) {
  $('confirm-title').textContent = title;
  $('confirm-message').textContent = message;
  $('confirm-detail').textContent = detail || '';
  confirmCallback = onConfirm;
  
  const box = document.querySelector('.confirm-modal-box');
  const iconBox = $('confirm-icon-box');
  const okBtn = $('btn-confirm-ok');
  
  if (danger) {
    box.style.borderColor = 'var(--cyber-accent2)';
    box.style.boxShadow = '0 0 25px rgba(255, 45, 120, 0.25)';
    iconBox.style.color = 'var(--cyber-accent2)';
    iconBox.style.borderColor = 'rgba(255, 45, 120, 0.3)';
    iconBox.style.background = 'rgba(255, 45, 120, 0.1)';
    iconBox.innerHTML = '&#128465;&#xFE0E;'; // Trash bin icon
    
    okBtn.style.borderColor = 'var(--cyber-accent2)';
    okBtn.style.color = 'var(--cyber-accent2)';
  } else {
    box.style.borderColor = 'var(--cyber-accent)';
    box.style.boxShadow = '0 0 25px rgba(var(--cyber-accent-rgb), 0.25)';
    iconBox.style.color = 'var(--cyber-accent)';
    iconBox.style.borderColor = 'rgba(var(--cyber-accent-rgb), 0.3)';
    iconBox.style.background = 'rgba(var(--cyber-accent-rgb), 0.1)';
    iconBox.innerHTML = '&#9888;&#xFE0E;'; // Warning sign
    
    okBtn.style.borderColor = 'var(--cyber-accent)';
    okBtn.style.color = 'var(--cyber-accent)';
  }
  
  const lang = state.settings.app.language || 'en';
  $('btn-confirm-cancel').textContent = lang === 'es' ? 'ABORTAR' : 'ABORT';
  okBtn.textContent = lang === 'es' ? 'CONFIRMAR' : 'CONFIRM';
  
  openModal('modal-cyber-confirm');
}

// ── PROPERTIES PANEL ──
function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  if (bytes > 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

let propsNativePath = null;

async function showPropertiesPanel(rawPath) {
  const im = state.images[state.current];
  if (!im) return;

  const lang = (state.settings && state.settings.app && state.settings.app.language) || 'en';
  const es = lang === 'es';

  const fpath = (im.file && im.file.path) || im.path || rawPath || '';
  const name = (im.file && im.file.name) || (fpath ? fpath.split(/[\\/]/).pop() : '-');
  propsNativePath = fpath;

  // Etiquetas i18n
  $('props-title').textContent = es ? 'PROPIEDADES' : 'PROPERTIES';
  $('props-k-name').textContent = es ? 'Nombre' : 'Name';
  $('props-k-format').textContent = es ? 'Formato' : 'Format';
  $('props-k-dims').textContent = es ? 'Dimensiones' : 'Dimensions';
  $('props-k-size').textContent = es ? 'Tamaño' : 'Size';
  $('props-k-modified').textContent = es ? 'Modificado' : 'Modified';
  $('props-k-path').textContent = es ? 'Ruta' : 'Path';
  $('props-native-label').textContent = es ? 'Propiedades de Windows' : 'Windows properties';
  setCyberTooltip($('props-native-btn'), es
    ? 'Abrir el diálogo nativo de Windows (puede tardar un par de segundos)'
    : 'Open the native Windows dialog (may take a couple of seconds)');
  $('props-close-btn').textContent = es ? 'CERRAR' : 'CLOSE';

  // Datos disponibles al instante
  $('props-name').textContent = name;
  const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : '';
  $('props-format').textContent = ext || '-';
  const w = im.w || mainImg.naturalWidth || 0;
  const h = im.h || mainImg.naturalHeight || 0;
  $('props-dims').textContent = (w && h) ? `${w} x ${h} px` : '-';
  $('props-size').textContent = im.size ? formatBytes(im.size) : '…';
  $('props-modified').textContent = '…';
  $('props-path').textContent = fpath || '-';
  setCyberTooltip($('props-path'), fpath || '');

  // Vista previa (imagen ya cargada en memoria)
  const preview = $('props-preview');
  if (mainImg.src) { preview.src = mainImg.src; preview.style.display = ''; }
  else { preview.style.display = 'none'; }

  openModal('modal-properties');

  // Tamaño y fecha frescos desde disco
  let size = im.size, modified = null;
  if (isElectron && fpath && window.electronAPI.getFileInfo) {
    try {
      const info = await window.electronAPI.getFileInfo(fpath);
      if (info) { size = info.size; modified = info.modified; }
    } catch (e) { /* se mantienen los valores de fallback */ }
  }
  // Evita pisar un panel ya cerrado o cambiado a otra imagen
  if (!$('modal-properties').classList.contains('active') || propsNativePath !== fpath) return;
  $('props-size').textContent = (size || size === 0) ? formatBytes(size) : '-';
  $('props-modified').textContent = modified
    ? new Date(modified).toLocaleString(es ? 'es-ES' : undefined)
    : '-';
}

$('props-native-btn').addEventListener('click', () => {
  if (propsNativePath && isElectron && window.electronAPI.openNativeProperties) {
    window.electronAPI.openNativeProperties(propsNativePath);
  }
});

// ── INIT ──
updateCounter();
resetHudTimer();

// Tell main process the first paint is ready (avoids white flash on win.show)
if (isElectron && window.electronAPI && typeof window.electronAPI.uiReady === 'function') {
  const notifyReady = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try { window.electronAPI.uiReady(); } catch (_) { /* ignore */ }
      });
    });
  };
  if (document.readyState === 'complete') notifyReady();
  else window.addEventListener('load', notifyReady, { once: true });
}
