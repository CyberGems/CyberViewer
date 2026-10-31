<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberViewer/main/assets/icon.png" width="120" alt="CyberViewer">
</p>

## 🖼️ CyberViewer {{VERSION}}: Release Notes

### 🚀 What's new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! Use 25-45 words for the summary, lead with user-facing changes, and do not repeat the app name or version. -->
<!-- changelog-summary:start -->
Two new appearance themes join a tuned Light mode with per-accent text tones, suite-style switches and frost menus, a dismissible in-app update popup with language-aware release notes, mixed-DPI window centering fixes, and a cleaner About with video format badges.
<!-- changelog-summary:end -->

---

### ✨ Key Features & Highlights

- 🎨 **Two new appearance themes**:
  - A sober Gray theme that neutralises every chromatic accent, and a full Light theme that keeps the user accent with hand-picked text tones per swatch.
  - Every surface is driven by a shared token layer, so chrome, menus, modals and the canvas repaint consistently in the three themes.

- 🧊 **Suite-style polish**:
  - Menus, the video player menu and the shortcuts popover get a white frost on light surfaces, and every switch follows the suite toggle pattern with per-theme thumb variants.
  - The welcome drop frame is square so its corner brackets align, the titlebar divider reads as a crisp line, and the transparency background follows the theme automatically.

- 🔔 **Dismissible update popup**:
  - A bottom-right card announces new versions with a language-aware changelog peek, download progress and a restart action, and skipping a version is remembered in settings.
  - The About modal closes the loop: a green status pill and version chips announce the update, check feedback surfaces at the top without scrolling, and format badges now include video support.

- 🪟 **Reliability fixes**:
  - Windows center correctly on mixed-DPI multi-monitor setups at startup and restore, and the maximize nudge can no longer exceed the target work area.
  - Quitting from the tray lands on the first click even when the window is hidden or a dialog is open.

<details>
<summary><b>🌐 Ver notas de la versión en Español</b></summary>

### 🚀 Novedades de esta versión

- **Dos nuevos temas de apariencia**: un tema Gris sobrio que neutraliza los acentos cromáticos y un tema Claro completo que mantiene el acento con tonos de texto ajustados a mano por color. Toda la superficie usa una capa de tokens compartida, así chrome, menús, modales y lienzo se repinten de forma consistente en los tres temas.
- **Pulido estilo suite**: los menús, el menú del reproductor de video y el popover de atajos usan escarcha blanca sobre superficies claras, todos los interruptores siguen el patrón toggle de la suite con variantes por tema, el marco de bienvenida es cuadrado con brackets alineados, el divisor del titlebar es una línea nítida y el fondo de transparencia sigue al tema automáticamente.
- **Popup de actualización descartable**: una tarjeta en la esquina inferior derecha anuncia nuevas versiones con un vistazo al changelog según el idioma, progreso de descarga y acción de reinicio; omitir una versión se recuerda en los ajustes. El Acerca de cierra el círculo con una pastilla verde de estado, chips de versión con flecha, feedback de búsqueda arriba sin hacer scroll y badges de formatos que ahora incluyen video.
- **Correcciones de fiabilidad**: las ventanas se centran correctamente en configuraciones mixtas de DPI al iniciar y restaurar, el empujón de maximizado ya no excede el área de trabajo, y salir desde la bandeja funciona al primer clic aunque la ventana esté oculta o haya un diálogo abierto.

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
