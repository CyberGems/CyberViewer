# CyberViewer

Ultralight Windows image viewer by CyberGems — open, browse a folder, zoom/pan, and light edit (rotate, crop, resize).

**Version:** 1.6.1 · **Stack:** Electron 30 · Vanilla JS

## Project structure

```text
CyberViewer/
├── main.js              Electron main process (IPC, tray, protocol)
├── preload.js           contextBridge → window.electronAPI
├── CyberViewer.html     Shell markup
├── css/app.css          Styles
├── js/app.js            Renderer logic
├── lib/                 Shared Node helpers (paths, thumb cache)
├── i18n/menu.json       Menu/tray strings (EN/ES)
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
| `CyberViewer Setup 1.6.1.exe` | NSIS installer |
| `CyberViewer Portable 1.6.1.exe` | Portable build |

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

- `webSecurity` is enabled.
- Local images are served through the `cvlocal://` protocol with a path allowlist (folders you open / register).
- Renderer has `nodeIntegration: false` and `contextIsolation: true`.

## Supported formats

JPG · JPEG · PNG · GIF · WEBP · BMP · TIFF

---

**CyberGems © 2026**
