<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberViewer/main/assets/icon.png" width="120" alt="CyberViewer">
</p>

## 🖼️ CyberViewer {{VERSION}}: Release Notes

### 🚀 What's new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! Use 25-45 words for the summary, lead with user-facing changes, and do not repeat the app name or version. Keep the Spanish mirror inside the details block in sync: translate the summary and rewrite the highlights. -->
<!-- COVERAGE: list every commit since the previous tag before drafting. Give every user-facing change at least one highlight and group related commits into one. Skip internal refactors, CI, tests and dependency bumps with no visible effect; keep small visible fixes such as copy, tooltips, shortcuts, themes, icons, spacing, stability and perceptible performance. Review the draft if 15+ user-facing commits produce fewer than 6 highlights, or 40+ total commits fewer than 8. Patch releases may have 1-3 highlights or a plain maintenance-only note. -->
<!-- changelog-summary:start -->
Audio gains a full-track waveform, reactive visualizations, embedded cover art and richer metadata. The sidebar adds filenames, compact cards and per-tab state, while context menus, tooltips, playback and confirmation dialogs receive focused fixes.
<!-- changelog-summary:end -->

> **New to CyberViewer?** A fast Windows media viewer for images, video and audio, with on-the-spot edits, tabs, favorites, slideshows, and a session that reopens where you left it.

---

### ✨ Key Features & Highlights

- **Whole-track audio waveform**: The seek bar shows a cached waveform with played progress and a playhead. Tracks over 160 MB keep the plain bar, and seek previews no longer show an empty video frame.
- **More audio visualizations**: A scrolling Waveform style joins the reactive visualizers, which now use the full viewer width and a neutral dark stage. The themed picker, arrow buttons and `V` / `Shift+V` shortcuts cycle styles with clear hints and a brief style-name confirmation.
- **Audio transport and metadata**: Windowed audio keeps its controls visible, while only fullscreen auto-hides them. Tagged titles, artist and album appear in the caption, and embedded cover art appears beside it and on sidebar cards, including background-scan results, without delaying playback.
- **Sidebar names and compact cards**: Every thumbnail shows its file name. Long names scroll on hover and respect reduced motion; Compact Sidebar Cards shrinks cards to 56 px with 6 px gaps and reveals names on hover, configurable from Settings or the thumbnail menu.
- **Sidebar state per tab**: Each tab remembers whether its sidebar is open, enabled by default to avoid unnecessary folder scans. The panel slides open and closed, and tabs with a collapsed sidebar show a discreet marker with a localized tooltip.
- **Copy actions and menu polish**: Context menus add Copy File Name and use Copy File Path for media, with clearer clipboard and new-tab icons. Unchecked rows keep a dimmed check, and dismissing a menu no longer pauses playback.
- **Persistent path tooltips**: Hovering the title-bar filename shows the full path even when the window is unfocused, and tooltip suppression expires after the window is restored.
- **Clearer confirmations**: Confirmation dialogs use a clean 40 px status icon. Cancel stays neutral while Confirm carries the danger accent.
- **Documentation and release checks**: Both READMEs describe the current update flow and match the website taglines. A deterministic smoke check and explicit release-note coverage rules keep future releases consistent.

<details>
<summary><b>🇪🇸 Ver notas de la versión en Español</b></summary>

### 🚀 Novedades de esta versión

El audio añade forma de onda de toda la pista, visualizaciones reactivas, carátulas integradas y metadatos más completos. La barra lateral estrena nombres, tarjetas compactas y estado por pestaña, mientras los menús contextuales, tooltips, reproducción y diálogos de confirmación reciben correcciones concretas.

> **¿Nuevo en CyberViewer?** Un visor de medios rápido para Windows (imágenes, vídeo y audio), con edición al instante, pestañas, favoritos, pases de diapositivas y una sesión que reabre donde la dejaste.

---

### ✨ Novedades destacadas

- **Forma de onda de toda la pista**: La barra de progreso muestra una forma de onda memorizada con el progreso reproducido y un cursor. Las pistas de más de 160 MB conservan la barra simple y las vistas previas de búsqueda ya no muestran un fotograma de video vacío.
- **Más visualizaciones de audio**: Un estilo Forma de onda desplazable se suma a los visualizadores reactivos, que ahora usan todo el ancho del visor y un escenario oscuro neutro. El selector temático, las flechas y los atajos `V` / `Shift+V` recorren los estilos con pistas claras y una breve confirmación del nombre.
- **Controles y metadatos de audio**: El audio en ventana mantiene visibles sus controles, mientras solo la pantalla completa los oculta automáticamente. El rótulo muestra título etiquetado, artista y álbum, y la carátula integrada aparece junto a él y en las tarjetas de la barra lateral, incluidas las del escaneo en segundo plano, sin retrasar la reproducción.
- **Nombres y tarjetas compactas**: Cada miniatura muestra el nombre del archivo. Los nombres largos se desplazan al pasar el cursor y respetan el movimiento reducido; Tarjetas compactas reduce las tarjetas a 56 px con 6 px de separación y muestra el nombre al pasar el cursor, configurable desde Configuración o el menú de miniaturas.
- **Estado de la barra lateral por pestaña**: Cada pestaña recuerda si su barra lateral está abierta, activado por defecto para evitar escaneos innecesarios. El panel se abre y se cierra con una animación, y las pestañas con el panel contraído muestran un indicador discreto con un tooltip traducido.
- **Acciones de copia y pulido de menús**: Los menús contextuales añaden Copiar nombre de archivo y usan Copiar ruta de archivo para medios, con iconos más claros para el portapapeles y las pestañas nuevas. Las filas desmarcadas conservan una marca tenue y cerrar un menú ya no pausa la reproducción.
- **Tooltips de ruta persistentes**: Al pasar el cursor sobre el nombre de la barra de título se muestra la ruta completa incluso si la ventana no está enfocada, y la supresión de tooltips caduca al restaurar la ventana.
- **Confirmaciones más claras**: Los diálogos de confirmación usan un icono de estado limpio de 40 px. Cancelar permanece neutral mientras Confirmar conserva el acento de peligro.
- **Documentación y comprobaciones de release**: Ambos README describen el flujo de actualización actual y coinciden con los lemas del sitio web. Un smoke determinista y reglas explícitas de cobertura mantienen consistentes los próximos releases.

### ℹ️ Antes de instalar

- **Windows:** esta versión aún no está firmada digitalmente. SmartScreen puede avisar antes de ejecutarla: **Más información › Ejecutar de todas formas**. Cuando Smart App Control está activado, Windows rechaza programas sin firmar; consulta la [política de firma de código](https://github.com/CyberGems/.github/blob/main/CODE_SIGNING.md). Verifica la descarga con los checksums SHA256 que aparecen más abajo.

</details>

---

### ℹ️ Before you install

- **Windows:** this release is not code-signed yet. SmartScreen may ask before it runs: **More info › Run anyway**. Where Smart App Control is on, Windows refuses unsigned programs; see the [code signing policy](https://github.com/CyberGems/.github/blob/main/CODE_SIGNING.md). Verify the download with the SHA256 checksums below.

---

### 📦 Downloads & Packages

> ⬇️ **Direct download:** click a file name to download it now. Same files as in **Assets** at the bottom of this page.

| File | Description | Platform |
| :--- | :--- | :--- |
| **[`CyberViewer-Setup-{{VERSION_NUM}}.exe`](https://github.com/CyberGems/CyberViewer/releases/download/{{VERSION}}/CyberViewer-Setup-{{VERSION_NUM}}.exe)** | 🚀 **Recommended Installer** (NSIS setup with Start Menu and Desktop shortcuts) | Windows 10 / 11 (x64) |
| **[`CyberViewer-Portable-{{VERSION_NUM}}.exe`](https://github.com/CyberGems/CyberViewer/releases/download/{{VERSION}}/CyberViewer-Portable-{{VERSION_NUM}}.exe)** | 📦 **Portable Build** (no installation required) | Windows 10 / 11 (x64) |

The `latest.yml` and `.blockmap` files support the in-app update workflow and are not intended for direct download.

---

### 🔐 VirusTotal and SHA256

> 🛡️ The report opens on VirusTotal and does not download anything. Sometimes one or two antivirus providers flag a safe file while the rest clear it; that is usually a false alarm. Our software is threat-free and the source code is public, so anyone can check it. Compare the SHA-256 below with your download and use only the links on this page.
> 🛡️ El informe se abre en VirusTotal y no descarga nada. A veces uno o dos proveedores de antivirus marcan un archivo seguro mientras los demás lo dan por limpio; suele ser una falsa alarma. Nuestro software está libre de amenazas y el código es público, cualquiera puede comprobarlo. Compara el SHA-256 de abajo con tu descarga y usa solo los enlaces de esta página.

**Installer**: [View VirusTotal report](https://www.virustotal.com/gui/file/{{INSTALLER_HASH}})

```text
{{INSTALLER_HASH}}
```

**Portable**: [View VirusTotal report](https://www.virustotal.com/gui/file/{{PORTABLE_HASH}})

```text
{{PORTABLE_HASH}}
```

The checksums are also available as a downloadable [SHA256SUMS.txt](https://github.com/CyberGems/CyberViewer/releases/download/{{VERSION}}/SHA256SUMS.txt).

---

📜 **Full changelog:** browse every version in [CHANGELOG.md](https://github.com/CyberGems/CyberViewer/blob/main/CHANGELOG.md).

*Crafted with precision by [CyberGems](https://cybergems.org)*
