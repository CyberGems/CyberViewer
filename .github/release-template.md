<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberViewer/main/assets/icon.png" width="120" alt="CyberViewer">
</p>

## 🖼️ CyberViewer {{VERSION}}: Release Notes

### 🚀 What's new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! Use 25-45 words for the summary, lead with user-facing changes, and do not repeat the app name or version. -->
<!-- changelog-summary:start -->
Quitting to the tray no longer hijacks in-app update installs, so updating from the About dialog lands on the first attempt, and the VirusTotal links on the release page now resolve as soon as a release goes out.
<!-- changelog-summary:end -->

---

### ✨ Key Features & Highlights

- 🛠️ **In-app updates fixed**:
  - Closing to the tray no longer intercepts the updater's restart, which previously left the old executable locked and made the NSIS installer fail with "Fallo al desinstalar archivos antiguos de la aplicación".
  - "Restart and update" from the About dialog now quits cleanly and completes on the first attempt.

- 🛡️ **VirusTotal links that resolve**:
  - Release builds submit the installer and portable binaries to VirusTotal automatically, so the SHA256 report links in the release body work from day one.

<details>
<summary><b>🌐 Ver notas de la versión en Español</b></summary>

### 🚀 Novedades de esta versión

- **Actualizaciones integradas corregidas**: cerrar a la bandeja ya no intercepta el reinicio del actualizador, que antes dejaba el ejecutable antiguo bloqueado y hacía fallar al instalador NSIS con "Fallo al desinstalar archivos antiguos de la aplicación". "Reiniciar y actualizar" desde el Acerca de ahora sale limpio y completa al primer intento.
- **Enlaces de VirusTotal que resuelven**: las builds suben el instalador y el portable a VirusTotal automáticamente, así que los enlaces SHA256 del cuerpo del release funcionan desde el primer día.

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
