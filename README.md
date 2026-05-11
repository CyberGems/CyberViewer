# CyberViewer — Guía de instalación y compilación

## Estructura del proyecto

```
CyberViewer/
├── main.js           ← Electron entry point
├── package.json      ← Config del proyecto y build
├── CyberViewer.html  ← La app completa
└── assets/
    ├── icon.png      ← Ícono (256×256 px PNG)
    └── icon.ico      ← Ícono para Windows (256×256 ICO)
```

---

## Requisitos

- **Node.js LTS** → https://nodejs.org (elegir "LTS")
- Instalar y reiniciar la terminal después

---

## Paso 1 — Modo Dev (probar la app)

```powershell
# Abrir PowerShell en la carpeta CyberViewer
cd C:\ruta\a\CyberViewer

# Instalar dependencias (solo la primera vez, tarda ~2 min)
npm install

# Correr la app
npm start
```

La app abre como ventana nativa de Windows. ✓

---

## Paso 2 — Compilar a .exe

```powershell
# Generar instalador + portable
npm run build
```

Cuando termine, en la carpeta `dist/` encontrarás:

| Archivo | Descripción |
|---|---|
| `CyberViewer Setup 1.0.0.exe` | Instalador con acceso directo en escritorio |
| `CyberViewer 1.0.0.exe`       | Versión portable, sin instalar |

---

## Íconos (importante)

Antes de compilar, coloca en la carpeta `assets/`:
- `icon.png` — 256×256 px (para modo dev)
- `icon.ico` — 256×256 ICO (para el .exe)

Sin íconos el build falla. Si no tienes uno aún, comenta la línea `"icon"` en `package.json` temporalmente.

---

## Comandos de referencia

| Comando | Acción |
|---|---|
| `npm start` | Modo dev |
| `npm run build` | Instalador + portable .exe |
| `npm run build:portable` | Solo versión portable |

---

**CiberCR © 2025**
