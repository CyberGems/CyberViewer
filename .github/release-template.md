<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberViewer/main/assets/icon.png" width="120" alt="CyberViewer">
</p>

## 🖼️ CyberViewer {{VERSION}}: Release Notes

### 🚀 What's new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! Use 25-45 words for the summary, lead with user-facing changes, and do not repeat the app name or version. -->
<!-- changelog-summary:start -->
A YouTube-style video player arrives: overlay flash, prev/next video, click-to-pause, a persistent speed panel and a seek preview with frame thumbnail. The tab bar gains edge navigation, a context menu and a richer switcher, with video defaults in the installer and per-format association status.
<!-- changelog-summary:end -->

---

### ✨ Key Features & Highlights

- ▶️ **YouTube-style video playback**:
  - An overlay flash on play/pause, previous and next video buttons driven by the folder contents, and click-to-pause on the video with double-click fullscreen.
  - A speed panel with display, slider and presets (0.25×–3×) that persists across sessions, plus > / < shortcuts and a seek-bar hover preview with timestamp and frame thumbnail.

- 🗂️ **Tab bar overhaul**:
  - Double-clicking the empty strip opens files; the strip has its own context menu with reopen closed tab and close all, and a working "+" button with the suite look.
  - Edge navigation buttons appear only while the tabs overflow, and the switcher gains a header, a live count and a close-all footer.

- 🔗 **File associations**:
  - A video default-viewer option joins the installer alongside the image one.
  - The System tab shows the current viewer per supported format, read live from the registry, with a shortcut to the Windows settings.

- 🛠️ **Persistence and reliability**:
  - Video loop, volume and mute now persist across sessions alongside speed and autoplay.
  - Windows no longer reopen wider than the screen after mixed-DPI inflation, tray quits work with dialogs open, ghost tooltips after restore are gone, and the confirm dialog keeps the paused video frame recognizable.

<details>
<summary><b>🌐 Ver notas de la versión en Español</b></summary>

### 🚀 Novedades de esta versión

- **Reproducción estilo YouTube**: destello del overlay en play/pausa, botones de video anterior y siguiente según la carpeta, clic sobre el video para pausar con doble clic a pantalla completa, panel de velocidad persistente (0.25×–3×) con display, slider y presets, atajos > / < y vista previa en la barra de progreso con miniatura del fotograma.
- **Barra de pestañas renovada**: doble clic en la franja vacía abre archivos, menú contextual propio con reabrir cerradas y cerrar todas, botón "+" funcional, navegación en los extremos solo cuando las pestañas desbordan y un switcher con encabezado, contador y cierre total.
- **Asociaciones de archivos**: opción de reproductor de video predeterminado en el instalador y panel de estado por formato en la pestaña Sistema, leído del registro, con acceso directo a los ajustes de Windows.
- **Persistencia y fiabilidad**: repetir, volumen y silencio ahora sobreviven sesiones, las ventanas ya no se abren más anchas que la pantalla por inflado de DPI, salir desde la bandeja funciona con diálogos abiertos, y el diálogo de confirmación mantiene reconocible el fotograma pausado.

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
