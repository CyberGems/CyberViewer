<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberViewer/main/assets/icon.png" width="120" alt="CyberViewer">
</p>

## 🖼️ CyberViewer {{VERSION}}: Release Notes

### 🚀 What's new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! Use 25-45 words for the summary, lead with user-facing changes, and do not repeat the app name or version. Keep the Spanish mirror inside the details block in sync: translate the summary and rewrite the highlights. -->
<!-- changelog-summary:start -->
The update flow now lives in one floating card with localized release notes, live download progress, background download, cancel and restart to update. Settings exposes update notices, Remember state moves into the video and YouTube players, and Windows gestures are advertised rather than duplicated.
<!-- changelog-summary:end -->

> **New to CyberViewer?** A fast Windows media viewer for images, video and audio, with on-the-spot edits, tabs, favorites, slideshows, and a session that reopens where you left it.

---

### ✨ Key Features & Highlights

- 🔄 **One update card for the whole flow**: The floating notice shows the release notes in your language, download progress with transferred and total size, background download, cancel, and restart to update. The title bar button opens it and the duplicate banner, badge and toasts are gone.
- 🔔 **Update notices in Settings**: A new switch controls automatic update notices, so a background check no longer interrupts you when it is off. A manual check from About always reports its result and keeps "up to date" visible.
- 🎛️ **Remember state in the players**: A switch in the video More menu next to Autoplay on open and a matching chip in the YouTube footer flip playback retention without opening Settings, and both mirror the live setting.
- ⏸️ **Paused tabs stay paused**: With playback retention off, returning to a media tab keeps it paused instead of falling back to autoplay, which now governs only genuinely new opens.
- 🪟 **Window title and gestures**: The title shows the active file with an asterisk for unsaved changes. Win+Up and Win+Down are advertised as the maximize and minimize gestures, Alt+F4 always quits even when the X hides to the tray, and a stale Alt after Alt+Tab no longer turns an X click into a quit.
- ⚡ **Faster local video opening**: Container audio probing waits for the first frame, and an open-timing diagnostic records metadata, first frame, position restore and ready milestones.
- 🛠️ **Fixes and polish**: A tooltip card no longer wraps mid-word or spills past the window edge, the tray tooltip is capped at 63 characters, tab and title bar buttons share the flat whitish hover of the default theme, and settings blocks without `enabled` keep scheduled backups on.
- 📄 **Privacy and AI disclosure**: Bilingual documents list every online connection and state that the app ships no AI features and makes no model calls at runtime.

<details>
<summary><b>🇪🇸 Ver notas de la versión en Español</b></summary>

### 🚀 Novedades de esta versión

El flujo de actualización vive ahora en una sola tarjeta flotante con notas de la versión en tu idioma, progreso de descarga en vivo, descarga en segundo plano, cancelación y reinicio para actualizar. Ajustes expone los avisos de actualización, Recordar estado pasa a los reproductores de video y YouTube, y los gestos de Windows se anuncian en lugar de duplicarse.

> **¿Nuevo en CyberViewer?** Un visor de medios rápido para Windows (imágenes, vídeo y audio), con edición al instante, pestañas, favoritos, pases de diapositivas y una sesión que reabre donde la dejaste.

---

### ✨ Novedades destacadas

- **Una tarjeta de actualización para todo el flujo**: El aviso flotante muestra las notas de la versión en tu idioma, el progreso de descarga con tamaño transferido y total, descarga en segundo plano, cancelación y reinicio para actualizar. El botón de la barra de título la abre y desaparecen el banner, la insignia y los toasts duplicados.
- **Avisos de actualización en Ajustes**: Un nuevo interruptor controla los avisos automáticos, así una comprobación en segundo plano ya no te interrumpe cuando está desactivado. Una comprobación manual desde Acerca de siempre informa su resultado y mantiene visible "actualizado".
- **Recordar estado en los reproductores**: Un interruptor en el menú Más del video junto a Reproducir al abrir y un chip equivalente en el pie de YouTube cambian la retención de reproducción sin abrir Ajustes, y ambos reflejan el ajuste en vivo.
- **Las pestañas en pausa siguen en pausa**: Con la retención de reproducción desactivada, volver a una pestaña de medios la mantiene en pausa en lugar de recurrir a la reproducción automática, que ahora rige solo aperturas nuevas.
- **Título de ventana y gestos**: El título muestra el archivo activo con un asterisco cuando hay cambios sin guardar. Win+Arriba y Win+Abajo se anuncian como gestos de maximizar y minimizar, Alt+F4 siempre sale incluso con la X configurada para ocultar a la bandeja, y un Alt obsoleto tras Alt+Tab ya no convierte un clic en la X en una salida.
- **Apertura de video local más rápida**: La detección de audio del contenedor espera al primer fotograma, y un diagnóstico de tiempos de apertura registra los hitos de metadatos, primer fotograma, restauración de posición y listo.
- **Correcciones y pulido**: Una tarjeta de tooltip ya no parte palabras ni se sale del borde de la ventana, el tooltip de la bandeja se limita a 63 caracteres, los botones de pestañas y barra de título comparten el hover plano blanquecino del tema por defecto, y los bloques de ajustes sin `enabled` mantienen activos los respaldos programados.
- **Privacidad y divulgación de IA**: Documentos bilingües enumeran cada conexión en línea y declaran que la app no incluye funciones de IA ni hace llamadas a modelos en ejecución.

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

> 🛡️ The report opens on VirusTotal and does not download anything.

**Installer**: [View VirusTotal report](https://www.virustotal.com/gui/file/{{INSTALLER_HASH}})

```text
{{INSTALLER_HASH}}
```

**Portable**: [View VirusTotal report](https://www.virustotal.com/gui/file/{{PORTABLE_HASH}})

```text
{{PORTABLE_HASH}}
```

---

📜 **Full changelog:** browse every version in [CHANGELOG.md](https://github.com/CyberGems/CyberViewer/blob/main/CHANGELOG.md).

*Crafted with precision by [CyberGems](https://cybergems.org)*
