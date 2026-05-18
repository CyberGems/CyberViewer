# CyberViewer — Installation and Compilation Guide

## Project Structure

```text
CyberViewer/
├── main.js           ← Electron entry point
├── package.json      ← Project config and build parameters
├── CyberViewer.html  ← Full single-page application core
└── assets/
    ├── icon.png      ← Icon asset (256×256 px PNG for dev environment)
    └── icon.ico      ← Windows Icon asset (256×256 px ICO for production builds)
```

---

## Requirements

- **Node.js LTS** → https://nodejs.org (select the "LTS" version)
- Install Node.js and restart your terminal/PowerShell window afterward.

---

## Step 1 — Development Mode (running the app)

```powershell
# Open PowerShell in the CyberViewer directory
cd C:\path\to\CyberViewer

# Install dependencies (only required the first time, takes ~2 mins)
npm install

# Start the application
npm start
```

The application will open as a native, fully GPU-accelerated desktop window. ✓

---

## Step 2 — Compiling to Production .exe

```powershell
# Build both the NSIS setup installer and the portable executable
npm run build
```

Once the compilation finishes, you will find the binaries inside the `dist/` directory:

| Filename | Description |
|---|---|
| `CyberViewer Setup 1.2.0.exe` | NSIS Setup installer with desktop shortcut capabilities |
| `CyberViewer 1.2.0.exe`       | High-speed portable version (no installation required) |

---

## Icons Setup (Important)

Before initiating a production build, place these files inside the `assets/` directory:
- `icon.png` — 256×256 px PNG (for dev environment)
- `icon.ico` — 256×256 px ICO (for the packaged .exe)

*Note: Without these files, electron-builder might fail. If you do not have icons prepared, temporarily comment out the `"icon"` field inside `package.json`.*

---

## Reference Commands

| Command | Action |
|---|---|
| `npm start` | Run in development mode |
| `npm run build` | Pack both setup installer and portable .exe |
| `npm run build:portable` | Compile portable executable target only |

---

**CyberGems © 2026**
