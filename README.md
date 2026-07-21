# CyberViewer

Ultralight Windows image viewer by CyberGems — open, browse a folder, zoom/pan, and light edit (rotate, crop, resize).

**Version:** 1.7.0 · **Stack:** Electron 35 · Vanilla JS

## Project structure

```text
CyberViewer/
├── main.js              Electron main process (IPC, tray, protocol)
├── preload.js           contextBridge → window.electronAPI
├── CyberViewer.html     Shell markup
├── css/app.css          Styles
├── js/
│   ├── app.js           Renderer UI logic
│   └── media-helpers.js Pure helpers (mediaUrl, canvasExport, …)
├── lib/                 Shared Node helpers (paths, thumb cache, updater, bounds)
├── i18n/
│   ├── menu.json        Menu/tray/dialog strings (EN/ES)
│   ├── ui.json          Renderer UI strings (source of truth)
│   └── ui.js            Generated loader for the renderer (`npm run i18n:sync`)
├── assets/              Icons
├── package.json
└── test/                Node unit tests
```

## Requirements

- **Node.js LTS** → https://nodejs.org
- Windows x64 (primary target)

## Development

```powershell
cd C:\path\to\CyberViewer
npm install
npm start
```

## Test / lint

```powershell
npm test
npm run lint
```

## Build

```powershell
npm run build            # NSIS installer + portable
npm run build:portable   # portable only
```

Outputs land in `dist/`:

| Artifact | Description |
|---|---|
| `CyberViewer Setup 1.7.0.exe` | NSIS installer |
| `CyberViewer Portable 1.7.0.exe` | Portable build |

## Icons

Place these under `assets/` before a production build:

- `icon.png` — PNG for window/tray/UI (dev)
- `icon.ico` — multi-size ICO (packaged exe / Windows)

## Updates

Installed (NSIS) builds use **electron-updater** against GitHub Releases:

1. About → **Check for Updates** (or menu Help)
2. **Download update** when a newer version is available
3. **Install & restart** to run the NSIS installer

Download/install is always user-requested. With “Check for updates on startup” on (default), the app may notify on startup that an update exists (toast + About banner), but will not download until you ask.

Portable builds cannot self-update in-app — use **Open releases page**.

Release tags (`v*`) must publish `latest.yml`, `.blockmap`, and the Setup `.exe` (see `.github/workflows/release.yml`).

## Security notes

- `webSecurity` is enabled; HTML ships a Content-Security-Policy.
- Local images are served through the `cvlocal://` protocol (streamed) with a path allowlist.
- Allowlist expansion from the renderer only accepts **existing image files** (`register-paths`); `validate-paths` checks existence without widening access.
- Folder scans only run for neighbors of an existing image file.
- Renderer has `nodeIntegration: false` and `contextIsolation: true`.
- DevTools IPC is disabled in packaged builds.

## Supported formats

JPG · JPEG · PNG · GIF · WEBP · BMP · TIFF

---

**CyberGems © 2026**
