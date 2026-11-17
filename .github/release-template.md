<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberViewer/main/assets/icon.png" width="120" alt="CyberViewer">
</p>

## 🖼️ CyberViewer {{VERSION}}: Release Notes

### 🚀 What's new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! Use 25-45 words for the summary, lead with user-facing changes, and do not repeat the app name or version. Keep the Spanish mirror inside the details block in sync: translate the summary and rewrite the highlights. -->
<!-- changelog-summary:start -->
Video playback survives panning and pausing with clear state badges, seek previews generate less often and settle only for QHD and 4K, videos without audio show a calm icon-only volume control, and About clears its duplicated up-to-date note. Releases now ship winget manifests.
<!-- changelog-summary:end -->

> **New to CyberViewer?** A fast Windows media viewer for images, video and audio, with on-the-spot edits, tabs, favorites, slideshows, and a session that reopens where you left it.

---

### ✨ Key Features & Highlights

- ▶️ **Steadier video playback**: Playback keeps running when a pan drag is released, the pause badge holds while the player idles, and the play confirmation stays visible twice as long.

- 🖼️ **Calmer seek previews**: Thumbnails generate less often, settle only for QHD and 4K videos, and stale thumbnails hide while a high-quality sweep moves.

- 🔈 **Honest audio state**: Videos without audio show an icon-only volume control, and the hint reads clearly as a video without audio.

- 🧹 **About and maintenance**: The duplicated up-to-date note under the About check button is gone, its hover uses the standard accent, and every release now ships winget manifests for the Windows Package Manager.

<details>
<summary><b>🇪🇸 Ver notas de la versión en Español</b></summary>

### 🚀 Novedades de esta versión

La reproducción de vídeo sobrevive a paneos y pausas con insignias de estado claras, las miniaturas de avance se generan menos a menudo y solo se estabilizan en QHD y 4K, los vídeos sin audio muestran un control de volumen discreto de solo icono y Acerca de elimina su nota duplicada. Los releases publican ahora manifiestos winget.

> **¿Nuevo en CyberViewer?** Un visor de medios rápido para Windows (imágenes, vídeo y audio), con edición al instante, pestañas, favoritos, pases de diapositivas y una sesión que reabre donde la dejaste.

---

### ✨ Novedades destacadas

- **Reproducción más estable**: la reproducción continúa al soltar un arrastre de paneo, la insignia de pausa se sostiene mientras el reproductor está inactivo y la confirmación de reproducción se ve el doble de tiempo.

- **Miniaturas de avance más calmadas**: se generan con menos frecuencia, se estabilizan solo en vídeos QHD y 4K y las miniaturas obsoletas se ocultan mientras avanza un barrido de alta calidad.

- **Estado de audio honesto**: los vídeos sin audio muestran un control de volumen de solo icono, y el aviso se lee claramente como un vídeo sin audio.

- **Acerca de y mantenimiento**: la nota duplicada bajo el botón de comprobación de Acerca de desaparece, su hover usa el acento estándar y cada release publica manifiestos winget para el Windows Package Manager.

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
