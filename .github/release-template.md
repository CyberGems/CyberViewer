<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberViewer/main/assets/icon.png" width="120" alt="CyberViewer">
</p>

## 🖼️ CyberViewer {{VERSION}}: Release Notes

### 🚀 What's new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! Use 25-45 words for the summary, lead with user-facing changes, and do not repeat the app name or version. -->
<!-- changelog-summary:start -->
Video playback arrives with local files plus isolated YouTube videos and playlists, alongside image tabs with optional session restore, scheduled automatic backups, a redesigned About dialog, and correct window centering on mixed-DPI monitors.
<!-- changelog-summary:end -->

---

### ✨ Key Features & Highlights

- 🎬 **Integrated video playback**:
  - Play local videos in lightweight media tabs alongside images, with MP4, M4V, WebM, MOV and Matroska (MKV) support and matching Windows file associations.
  - Refined playback controls and immersive fullscreen keep the viewer out of the way, and Matroska initialization is now reliable.
  - Images and videos live side by side in the same window, each tab adapting to its content.

- ▶️ **Isolated YouTube playback**:
  - Open YouTube videos or full playlists in a dedicated, isolated viewer, separate from local media tabs.
  - Playback runs in its own contained session so the main viewer stays lightweight.

- 🗂️ **Tabs and session restore**:
  - Browse images in tabs with optional session restore, bringing back the previous set of images on the next launch.
  - The sidebar starts closed on manual launches and collapses automatically when an image is opened externally, keeping the focus on the content.

- 💾 **Backups and wallpaper**:
  - Scheduled automatic backups with safety restore are enabled by default, and the tray icon stays resident for quick access.
  - Set the Windows desktop wallpaper directly from pasted or dropped images, even before saving them to disk.

- 🎨 **Polished interface**:
  - The About modal is redesigned on the CyberFeeds pattern, with a diagnostics copy button and suite icons synchronized before release builds.
  - A first-close dialog lets users choose between the tray and quitting, complemented by an elegant titlebar divider and unified hotkey badges across titlebar controls and dialogs.
  - The welcome banner icon is redesigned as a drop-into-tray glyph, with the supported format list grouped by media type, alongside a new brand app icon and branded installer artwork.

- 🔧 **Reliability and platform**:
  - Windows are centered correctly on monitors with a different scale factor, fixing mixed-DPI multi-monitor placement at startup, maximize and restore.
  - Window lifecycle diagnostics with a compositor frame nudge improve visibility after Windows auto-start.
  - The project is licensed under GPL-3.0-only with the canonical license text, and a Spanish README joins the documentation.

<details>
<summary><b>🌐 Ver notas de la versión en Español</b></summary>

### 🚀 Novedades de esta versión

- **Reproducción de video integrada**: reproduce videos locales en pestañas de medios ligeras junto a las imágenes, con soporte para MP4, M4V, WebM, MOV y Matroska (MKV) y sus asociaciones de archivos en Windows. Los controles refinados y la pantalla completa inmersiva mantienen el foco en el contenido, y la inicialización de Matroska ahora es confiable.
- **YouTube aislado**: abre videos o listas completas de YouTube en un visor dedicado y aislado, separado de las pestañas de medios locales, con una sesión propia para mantener ligero el visor principal.
- **Pestañas y restauración de sesión**: navega imágenes en pestañas con restauración opcional de la sesión anterior al iniciar. La barra lateral inicia cerrada en lanzamientos manuales y se contrae al abrir imágenes desde fuera de la app.
- **Respaldos y fondo de pantalla**: los respaldos automáticos programados con restauración de seguridad vienen activados por defecto, y el ícono de bandeja permanece residente. Establece el fondo de escritorio directamente desde imágenes pegadas o soltadas, incluso antes de guardarlas en disco.
- **Interfaz pulida**: modal About rediseñado con botón para copiar diagnósticos, diálogo de primer cierre para elegir entre bandeja o salir, divisor elegante en la barra de título e insignias de atajos unificadas. El ícono de bienvenida es ahora una gota entrando en la bandeja con formatos agrupados por tipo de medio, junto a un nuevo ícono de marca e instalador etiquetado.
- **Fiabilidad y plataforma**: centrado correcto de ventanas en monitores con escalas distintas al iniciar, maximizar y restaurar, diagnósticos del ciclo de vida con impulso del compositor tras el autoinicio de Windows, licencia GPL-3.0-only y README en español.

</details>

---

### 📦 Downloads & Packages

> ⬇️ **Direct download:** click a file name to download it now. Same files as in **Assets** at the bottom of this page.

| File | Description | Platform |
| :--- | :--- | :--- |
| **[`CyberViewer-Setup-{{VERSION_NUM}}.exe`](https://github.com/CyberGems/CyberViewer/releases/download/{{VERSION}}/CyberViewer-Setup-{{VERSION_NUM}}.exe)** | 🚀 **Recommended Installer** (NSIS setup with Start Menu and Desktop shortcuts) | Windows 10 / 11 (x64) |
| **[`CyberViewer-Portable-{{VERSION_NUM}}.exe`](https://github.com/CyberGems/CyberViewer/releases/download/{{VERSION}}/CyberViewer-Portable-{{VERSION_NUM}}.exe)** | 📦 **Portable Build** (no installation required) | Windows 10 / 11 (x64) |

The `latest.yml` and `.blockmap` files support the in-app update workflow and are not intended for direct download.

---

### VirusTotal and SHA256

**Installer**: [View VirusTotal report](https://www.virustotal.com/gui/file/{{INSTALLER_HASH}})

```text
{{INSTALLER_HASH}}
```

**Portable build**: [View VirusTotal report](https://www.virustotal.com/gui/file/{{PORTABLE_HASH}})

```text
{{PORTABLE_HASH}}
```

---

*Crafted with precision by [CyberGems](https://cybergems.org)*
