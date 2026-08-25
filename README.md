# CyberViewer

Fast Windows image viewer by CyberGems — open, browse a folder, zoom/pan, and light edit (rotate, crop, resize, adjust). Built with Electron and vanilla JS (small app layer; Chromium runtime included).

*Free and open source (GPLv3) — no ads, no tracking, and no data collection. Just enjoy it.*

**Version:** 1.12.1 · **Stack:** Electron 35 · Vanilla JS

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
| `CyberViewer-Setup-1.12.1.exe` | NSIS installer |
| `CyberViewer-Portable-1.12.1.exe` | Portable build |

## Icons

Place these under `assets/` before a production build:

- `icon.ico` — multi-size ICO for the executable, window, tray, and UI
- `icon.png` — legacy raster asset

## Updates

Installed (NSIS) builds use **electron-updater** against GitHub Releases:

1. About → **Check for Updates** (or menu Help)
2. **Download update** when a newer version is available
3. **Install & restart** to apply the update silently (no Next/Next wizard) and relaunch

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

## Default image viewer (installer)

The NSIS setup includes a page with a checkbox (**checked by default**):

> **Set CyberViewer as the default image viewer**

When enabled, the installer writes per-user (HKCU) associations for common image extensions so double-click opens CyberViewer. Windows 10/11 may still ask you to confirm defaults under **Settings → Apps → Default apps**.

The portable build does not register system associations; use the in-app **Context Menu** option or Windows defaults UI.

---

## Donate

**CyberViewer** is a personal open-source project within the **CyberGems** suite. I've spent thousands of hours building and refining it — both for my own use and to share premium-quality software with the world for free.

If you'd like to support this work, a donation would mean a lot. Thank you! 🙏

[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-0070BA?style=for-the-badge&logo=paypal)](https://paypal.me/CyberGems) [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/cybergems)

<details>
<summary>Crypto donations — choose the correct network</summary>

| Asset | Network | Address | QR |
|---|---|---|---|
| BTC | Bitcoin | `bc1q5mxzz05nmvsheqzx7970euswta3fksxzcfzag4` | ![BTC QR](docs/donate/qr-btc.png) |
| ETH | Ethereum (ERC20) | `0x79b703Ec0f77493679Fcd280aF3b983E20c580B8` | ![ETH QR](docs/donate/qr-eth.png) |
| USDT | Ethereum (ERC20) | `0x79b703Ec0f77493679Fcd280aF3b983E20c580B8` | ![USDT ERC20 QR](docs/donate/qr-eth.png) |
| USDT | BNB Smart Chain (BEP20) | `0x79b703Ec0f77493679Fcd280aF3b983E20c580B8` | ![USDT BEP20 QR](docs/donate/qr-eth.png) |
| USDT | Tron (TRC20) | `TSVbSk1HSyZ1NprCnAYiw56ECwXgH887mD` | ![USDT TRC20 QR](docs/donate/qr-usdt-tron.png) |

> ⚠️ Send only the selected asset on the indicated network. Using the wrong network will result in permanent loss of funds.

</details>

---

**CyberGems © 2026**
