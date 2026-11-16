<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberViewer/main/assets/icon.png" width="120" alt="CyberViewer">
</p>

## 🖼️ CyberViewer {{VERSION}}: Release Notes

### 🚀 What's new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! Use 25-45 words for the summary, lead with user-facing changes, and do not repeat the app name or version. Keep the Spanish mirror inside the details block in sync: translate the summary and rewrite the highlights. -->
<!-- changelog-summary:start -->
The update prompt no longer flickers while downloading, and starting the install now asks about unsaved images first, so the warning cannot race the installer and fail with a locked-file error. Progress ticks patch the popup in place instead of rebuilding it.
<!-- changelog-summary:end -->

> **New to CyberViewer?** A fast Windows media viewer for images, video and audio, with on-the-spot edits, tabs, favorites, slideshows, and a session that reopens where you left it.

---

### ✨ Key Features & Highlights

- 🛠️ **Safer update installs**: "Restart and update" now surfaces the unsaved-changes warning before the installer spawns. Cancelling keeps everything untouched; discarding flushes the session and quits into a clean install, so the locked-file NSIS error cannot appear while rotations or pasted images are pending.

- ✨ **Steady download popup**: the popup patches its percentage and progress bar in place instead of rebuilding on every tick, so the Dismiss button no longer flickers under the cursor and the bar animates smoothly again.

- 🔇 **Quieter progress feed**: download progress reaches the renderer only on whole-percent changes plus a 500ms keepalive, cutting per-chunk IPC traffic.

<details>
<summary><b>🇪🇸 Ver notas de la versión en Español</b></summary>

### 🚀 Novedades de esta versión

El aviso de actualización ya no parpadea durante la descarga, y al iniciar la instalación se pregunta primero por las imágenes sin guardar, así el aviso ya no compite con el instalador ni falla con un error de archivo bloqueado. Los ticks de progreso actualizan el popup en sitio en lugar de reconstruirlo.

> **¿Nuevo en CyberViewer?** Un visor de medios rápido para Windows (imágenes, vídeo y audio), con edición al instante, pestañas, favoritos, pases de diapositivas y una sesión que reabre donde la dejaste.

---

### ✨ Novedades destacadas

- **Instalaciones más seguras**: "Reiniciar y actualizar" muestra ahora el aviso de cambios sin guardar antes de lanzar el instalador. Cancelar lo deja todo intacto; descartar vuelca la sesión y sale para instalar limpiamente, así el error NSIS de archivo bloqueado ya no puede aparecer con rotaciones o imágenes pegadas pendientes.
- **Popup de descarga estable**: el popup actualiza su porcentaje y barra de progreso en sitio en lugar de reconstruirse en cada tick, así el botón Descartar ya no parpadea bajo el cursor y la barra vuelve a animarse con fluidez.
- **Flujo de progreso más silencioso**: el progreso de descarga llega al renderer solo en cambios de porcentaje entero más un keepalive de 500ms, reduciendo el tráfico de IPC por chunk.

### ⚠️ Antes de instalar

- **Windows:** esta versión aún no está firmada digitalmente. SmartScreen puede avisar antes de ejecutarla: **Más información › Ejecutar de todas formas**. Cuando Smart App Control está activado, Windows rechaza programas sin firmar; consulta la [política de firma de código](https://github.com/CyberGems/.github/blob/main/CODE_SIGNING.md). Verifica la descarga con los checksums SHA256 que aparecen más abajo.

</details>

---

### ⚠️ Before you install

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
