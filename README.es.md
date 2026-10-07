<p align="center">
  <a href="./README.md">English</a> · Español
</p>

<p align="center">
  <a href="https://cybergems.org/apps/cyberviewer/">
    <img src="https://cybergems.org/banners/es/cyberviewer.png" alt="CyberViewer: visor de imágenes rápido con herramientas de edición esenciales" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/CyberGems/CyberViewer/releases/latest"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FCyberGems%2FCyberViewer%2Fmain%2Fpackage.json&query=%24.version&prefix=%20Descargar%20CyberViewer%20v&suffix=%20&style=for-the-badge&label=&labelColor=0891B2&color=0891B2" alt="Descargar la última versión" /><img src="https://img.shields.io/badge/Windows_10%2F11_(64--bit)-2563EB?style=for-the-badge" alt="Windows 10/11 (64 bits)" /></a>
  &nbsp;<a href="https://github.com/CyberGems/CyberViewer/releases"><img src="https://img.shields.io/badge/Todas_las_versiones-30363D?style=for-the-badge&logo=github&logoColor=white" alt="Todas las versiones" /><img src="https://img.shields.io/badge/Notas_de_la_versi%C3%B3n-475569?style=for-the-badge" alt="Notas de la versión" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Licencia-GPL--3.0-1F2428.svg?style=flat-square&color=334155" alt="Licencia" />&nbsp;
  <img src="https://img.shields.io/badge/Plataforma-Windows_10%2F11-1F2428.svg?style=flat-square&color=334155" alt="Plataforma" />&nbsp;
  <img src="https://img.shields.io/badge/Electron-35-1F2428.svg?style=flat-square&logo=electron&logoColor=white&color=334155" alt="Electron" />&nbsp;
  <a href="https://github.com/CyberGems/CyberViewer/wiki"><img src="https://img.shields.io/badge/Wiki-Documentaci%C3%B3n-1F2428?style=flat-square&logo=gitbook&logoColor=white&color=334155" alt="Wiki" /></a>
</p>

---

## ¿Qué es CyberViewer?

CyberViewer es un visor de imágenes rápido y ligero para Windows que cubre la visualización y edición del día a día sin el peso de una suite gráfica completa. Abre imágenes grandes rápidamente, recorre carpetas completas mediante una barra lateral de miniaturas, haz zoom y desplázate con fluidez, ejecuta presentaciones y gestiona archivos recientes. Las herramientas esenciales de rotación, recorte, redimensionado, volteo y ajuste de color están integradas, junto con controles de fondo de escritorio e integración con el Explorador de Windows. La interfaz se mantiene enfocada, oscura y altamente personalizable. Construido con **Electron 35** y **JavaScript vanilla**.

*Gratuito y de código abierto (GPLv3): sin anuncios, sin rastreo y sin recogida de datos. Solo disfrútalo.*

---

## 🎯 ¿Por qué CyberViewer?

La mayoría de los visores de imágenes o están plagados de funciones que nunca usas, o son tan básicos que parecen una idea de paso. CyberViewer encuentra el equilibrio perfecto: **carga instantánea, navegación fluida y herramientas de edición esenciales**, todo envuelto en una interfaz elegante y sin distracciones.

| Necesidad | Solución |
|---|---|
| Abre imágenes al instante | Protocolo de streaming `cvlocal://` sin carga completa en RAM, incluso para archivos grandes |
| Recorre una carpeta completa | Barra lateral de miniaturas con carga diferida y progreso de escaneo con radar |
| Ediciones rápidas sin Photoshop | Rotar, recortar, redimensionar, voltear, ajustar brillo/contraste/saturación/desenfoque |
| Visualización inmersiva | Modo de pantalla completa con interfaz que se oculta sola, presentación con bucle |
| Establecer el fondo de escritorio | Rellenar, Ajustar, Centrar o Extender la imagen actual en Windows |
| Mantén tu flujo de trabajo | Bandeja del sistema, imágenes recientes, inicio automático, atajo global, menú contextual del Explorador |
| Bilingüe (EN / ES) | Localización completa de la interfaz con cambio de idioma instantáneo |

---

## ✨ Funciones principales

### 🖼️ Visualización
- **Apertura ultrarrápida:** protocolo de streaming propio que carga imágenes sin agotar la RAM
- **Formatos admitidos:** JPG, JPEG, PNG, GIF, WebP, BMP, TIFF, TIF, ICO y AVIF
- **Navegación de carpetas:** barra lateral de miniaturas con carga diferida, cola de prioridad e indicador de progreso de escaneo
- **Zoom y desplazamiento:** del 5 % al 2000 %, ajuste a la ventana, tamaño original (1:1), rueda del ratón y arrastre
- **Soporte de GIF animado:** activa o desactiva la reproducción
- **Modo de pantalla completa inmersivo:** la interfaz fantasma se oculta sola para una visualización sin distracciones
- **Arrastrar y soltar:** suelta imágenes o carpetas directamente sobre la ventana
- **Pegado del portapapeles:** pega imágenes desde el portapapeles (`Ctrl+V`)

### ✏️ Edición
- **Rotar:** 90° a la izquierda (`Q`) o a la derecha (`E`) con flujo de guardar/descartar
- **Recortar:** superposición interactiva con tiradores y modo opcional de creación de copia
- **Redimensionar:** controles de ancho y alto con bloqueo de proporción, preajustes (720p, 1080p, 25 %, 50 %, 200 %) y remuestreo de calidad
- **Ajustar:** brillo, contraste, saturación, desenfoque, escala de grises e invertir con vista previa A/B en vivo
- **Voltear:** horizontal (`H`) o vertical (`Mayús+H`)

### 🎬 Presentación
- Controles de iniciar, pausar y detener con un HUD dedicado
- Intervalo configurable: 2 s, 3 s, 5 s o 10 s
- Modo de bucle para la carpeta actual
- Opción de entrar en pantalla completa al iniciar

### 📁 Operaciones de archivos
- **Guardar** (sobrescribir) o **Guardar como**
- **Copiar** la imagen al portapapeles (`Ctrl+C`) o copiar su ruta de archivo
- **Mover a la papelera** (`Supr`)
- **Mostrar en la carpeta** o abrir la carpeta que la contiene
- **Exportar a PDF** e **Imprimir** con controles de tamaño de página, orientación y márgenes
- **Establecer como fondo de escritorio** con estilos Rellenar, Ajustar, Centrar o Extender
- **Favoritos** con acciones dedicadas de añadir, quitar y ver
- **Historial reciente** con hasta 10 archivos y 10 carpetas

### ⚙️ Integración con el sistema
- **Bandeja del sistema:** menú emergente HTML personalizado con imágenes recientes, más comportamiento de minimizar o cerrar a la bandeja
- **Inicio automático con Windows:** inicia minimizado al iniciar sesión
- **Atajo global:** atajo configurable para mostrar u ocultar, predeterminado `Alt+Shift+V`
- **Menú contextual del Explorador:** haz clic derecho en imágenes admitidas para abrirlas en CyberViewer
- **Asociaciones de archivo:** establece CyberViewer como visor predeterminado de JPG, PNG, GIF, WebP, BMP, TIFF, ICO o AVIF
- **Múltiples instancias:** modo opcional para usuarios avanzados
- **Actualización automática:** actualizador integrado de GitHub Releases con instalación silenciosa
- **Copia de seguridad de la configuración:** exporta o importa la configuración y los favoritos como JSON

### 🎨 Personalización
- **Colores de acento:** Cian, Rosa, Verde, Naranja, Violeta, Azul, Rojo y Menta
- **Estilos de fondo:** Cuadriculado oscuro, Cuadriculado claro o Sin cuadriculado
- **Ajustes de interfaz:** barra lateral, barra de herramientas, barra de estado, tooltips, guía de atajos, retrasos de ocultación automática y comportamiento del doble clic
- **Configuración con pestañas:** General, Apariencia, Interfaz, Presentación, Sistema y Respaldo y datos
---

## 🚀 Primeros pasos

### Instalación (recomendada)

1. Descarga el instalador más reciente o la build portable desde [Releases](https://github.com/CyberGems/CyberViewer/releases/latest)
2. Ejecuta el instalador `CyberViewer-Setup` o el ejecutable portable
3. Inicia CyberViewer y pulsa `Alt+Shift+V` para mostrar u ocultar desde cualquier lugar. No necesitas ningún otro requisito: **no** necesitas Node.js

### 🛡️ Windows SmartScreen

Windows puede mostrar un aviso de SmartScreen la primera vez que ejecutas el instalador de CyberViewer: esta es una app de hobby sin firmar, así que Windows aún no ha construido reputación para el archivo. Esto es esperado; el código fuente es público para que puedas inspeccionar exactamente qué hace. Lo mismo puede ocurrir al lanzar la versión portable.

Para continuar:

<details>
<summary><strong>Cómo ejecutar el instalador (paso a paso)</strong></summary>

Windows muestra este aviso para cualquier instalador sin un certificado de firma de código de pago; no significa que el archivo sea inseguro. No hagas clic en "No ejecutar":

1. Ejecuta el instalador. Windows puede mostrar el diálogo azul "Windows protegió tu PC".

![Aviso de Windows SmartScreen](https://cybergems.org/branding/smartscreen-warning.svg)

2. Haz clic en el pequeño enlace **Más información**.

![Diálogo de SmartScreen tras Más información](https://cybergems.org/branding/smartscreen-runanyway.svg)

3. Haz clic en **Ejecutar de todos modos**. El instalador arranca con normalidad.

Puedes verificar el archivo de forma independiente: compara el SHA con el release de GitHub, escanéalo en VirusTotal o compila desde el código fuente. Más detalles: [guía de SmartScreen en el sitio web](https://cybergems.org/download#smartscreen).

</details>
---

## 🛠️ Stack tecnológico y arquitectura

- **Plataforma:** Windows 10 / 11 (x64)
- **Framework:** Electron 35.5.1 + JavaScript vanilla
- **Seguridad:** `contextIsolation: true`, `nodeIntegration: false`, protocolo propio `cvlocal://` con lista de permitidos de rutas, cabeceras CSP
- **UI:** ventana propia sin marco, esquinas redondeadas de DWM, consciente de DPI en múltiples monitores

```
CyberViewer/
├── main.js              Proceso principal de Electron: IPC, bandeja, protocolo y gestión de ventanas
├── preload.js           contextBridge → window.electronAPI (IPC seguro)
├── tray-preload.js      Preload del menú de bandeja
├── CyberViewer.html     Marcado base (todos los modales/menús de UI)
├── tray-menu.html       Emergente personalizado de la bandeja
├── css/app.css          Estilos
├── js/
│   ├── app.js           Lógica de UI del renderer
│   └── media-helpers.js Funciones puras (mediaUrl, canvasExport, filtros)
├── lib/                 Ayudantes de Node compartidos
│   ├── paths.js         Normalización de rutas, lista de permitidos, tipos MIME
│   ├── thumb-cache.js   Caché y expulsión de miniaturas
│   ├── window-bounds.js Límites de ventana y conciencia de DPI
│   ├── updater.js       Integración con electron-updater
│   └── settings-backup.js Importación/exportación de configuración
├── i18n/
│   ├── menu.json        Cadenas de menú, bandeja y diálogos (EN/ES)
│   ├── ui.json          Cadenas de la UI del renderer (fuente de verdad)
│   └── ui.js            Cargador generado (npm run i18n:sync)
├── assets/              Iconos
└── test/                Tests unitarios de Node
```

### Compilar desde el código fuente (desarrolladores)

Solo necesario si quieres modificar CyberViewer o compilarlo tú mismo; los usuarios normales pueden omitir esta sección.

#### Requisitos previos

- **Node.js LTS** → https://nodejs.org
- Windows 10/11 (x64)

#### Desarrollo

```powershell
cd C:\path\to\CyberViewer
npm install
npm start
```

#### Comprobaciones y localización

```powershell
npm test
npm run lint
npm run i18n:sync       # regenera i18n/ui.js desde i18n/ui.json
```

#### Compilación (producción)

```powershell
npm run build            # Instalador NSIS + portable
npm run build:portable   # solo portable
```

#### Artefactos (en `dist/`)

| Artefacto | Descripción |
|---|---|
| `CyberViewer-Setup-<version>.exe` | Instalador NSIS |
| `CyberViewer-Portable-<version>.exe` | Build portable |

#### Funciones del instalador NSIS
- Opción «Establecer CyberViewer como visor de imágenes predeterminado» (activada de forma predeterminada)
- Asociaciones de archivo por usuario (HKCU)
- Accesos directos de Escritorio y Menú Inicio
- Instalador bilingüe (en_US, es_ES)
---

## ⌨️ Atajos de teclado

| Tecla | Acción |
|---|---|
| `Ctrl+O` | Abrir imagen |
| `Ctrl+Mayús+O` | Abrir la carpeta que la contiene |
| `Ctrl+Mayús+F` | Abrir carpeta |
| `Ctrl+S` | Guardar como |
| `Ctrl+P` | Imprimir / Exportar a PDF |
| `Ctrl+C` | Copiar imagen al portapapeles |
| `Ctrl+V` | Pegar imagen desde el portapapeles |
| `Ctrl+D` | Alternar favorito |
| `Ctrl+,` | Abrir la configuración |
| `Ctrl+I` | Propiedades |
| `← → ↑ ↓` / `A` `D` | Navegar por las imágenes |
| `Espacio` | Siguiente imagen (o iniciar/pausar presentación) |
| `Q` / `E` | Rotar 90° a la izquierda / derecha |
| `C` | Recortar |
| `R` | Redimensionar |
| `J` | Ajustar (color/tono) |
| `H` / `Mayús+H` | Voltear horizontal / vertical |
| `F` | Ajustar a la ventana |
| `1` | Tamaño original (1:1) |
| `Intro` / `G` | Alternar pantalla completa |
| `S` | Iniciar/pausar presentación |
| `Supr` | Mover a la papelera |
| `+` / `-` | Acercar / alejar |
| `0` | Ajustar a la ventana |
| `Escape` | Cerrar superposiciones/modales, cancelar recorte |

---

## 🔒 Seguridad

- `webSecurity` activado con Content-Security-Policy
- Imágenes locales servidas mediante el protocolo `cvlocal://` (en streaming) con lista de permitidos de rutas
- La expansión de la lista de permitidos solo acepta **archivos de imagen existentes**
- Los escaneos de carpeta solo se ejecutan sobre vecinos de un archivo de imagen existente
- El renderer se ejecuta con `nodeIntegration: false` y `contextIsolation: true`
- DevTools IPC desactivado en las builds empaquetadas

---

## 🔄 Actualizaciones

Las builds instaladas (NSIS) usan **electron-updater** contra GitHub Releases:

1. **Acerca de → Buscar actualizaciones** (o menú Ayuda)
2. **Descargar actualización** cuando haya una versión más reciente
3. **Instalar y reiniciar:** instalación silenciosa, sin asistente y relanzamiento automático

La descarga y la instalación siempre las solicita el usuario. Con «Buscar actualizaciones al iniciar» activado (predeterminado), la app te avisa al arrancar que existe una actualización (toast + banner de Acerca de), pero no descargará hasta que se lo pidas.

Las builds portables no pueden actualizarse dentro de la app; usa **Abrir página de releases**.

---

## ❤️ Donar

Tras incontables horas construyendo y perfeccionando **CyberViewer** para mi propio uso, decidí recientemente compartirlo con el mundo junto a mis otras herramientas de código abierto en [CyberGems](https://github.com/CyberGems#-all-apps--repositories).

Si te gustaría apoyar las futuras actualizaciones, te lo agradecería de verdad. Tu donación ayuda a mantener el desarrollo, lanzar nuevas funciones, acelerar la resolución de actualizaciones y errores, y mejorar la calidad de la documentación. También puedes mostrar tu apoyo [poniendo una estrella al repo en GitHub](https://github.com/CyberGems/CyberViewer). ¡Gracias! 🙏

<p align="center">
  <a href="https://www.paypal.com/donate/?hosted_button_id=M4PY3UPJA5Y6Q"><img src="https://img.shields.io/badge/Donar-PayPal-0070BA?style=for-the-badge&logo=paypal" alt="Donar con PayPal" /></a>
</p>

<p align="center">
  <a href="https://ko-fi.com/cybergems"><img src="https://img.shields.io/badge/Apóyame_en_Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Apóyame en Ko-fi" /></a>
</p>

<p align="center">
  <a href="https://buymeacoffee.com/cybergems"><img src="https://img.shields.io/badge/Invítame_a_un_café-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Invítame a un café" /></a>
</p>

<div align="center">

<details>
<summary><b>Donaciones cripto (BTC, ETH, USDT, LTC): haz clic para ver las direcciones</b></summary>

| Activo | Dirección | QR |
|---|---|---|
| **BTC** | <pre><code>bc1q5mxzz05nmvsheqzx7970euswta3fksxzcfzag4</code></pre> | <img src="docs/donate/qr-btc.png" width="90" height="90" alt="QR de BTC" /> |
| **ETH** | <pre><code>0x79b703Ec0f77493679Fcd280aF3b983E20c580B8</code></pre> | <img src="docs/donate/qr-eth.png" width="90" height="90" alt="QR de ETH" /> |
| **USDT (ERC20 / BEP20)** | <pre><code>0x79b703Ec0f77493679Fcd280aF3b983E20c580B8</code></pre> | <img src="docs/donate/qr-eth.png" width="90" height="90" alt="QR de USDT" /> |
| **USDT (TRC20)** | <pre><code>TSVbSk1HSyZ1NprCnAYiw56ECwXgH887mD</code></pre> | <img src="docs/donate/qr-usdt-tron.png" width="90" height="90" alt="QR de USDT TRC20" /> |
| **LTC** | <pre><code>LWGnEHgcFCE2BRkzLnsdPDD8Y8ZeDK577X</code></pre> | <img src="docs/donate/qr-ltc.png" width="90" height="90" alt="QR de LTC" /> |

> ⚠️ Envía solo el activo seleccionado en la red indicada. Usar la red incorrecta provocará la pérdida permanente de fondos.

</details>

</div>
---

## 📄 Licencia

CyberViewer se distribuye bajo los términos de la Licencia Pública General GNU v3.0. Consulta [LICENSE](./LICENSE) para el texto completo de la licencia.

Copyright (C) 2026 CyberGems

---

## ❓ Preguntas frecuentes

Para preguntas frecuentes, guías de solución de problemas e instrucciones detalladas de configuración, visita las [Preguntas frecuentes](https://github.com/CyberGems/CyberViewer/wiki/FAQ) o la [documentación en línea](https://cybergems.org/docs/cyberviewer/FAQ).

---

<div align="center" style="background:#0D0F17; border:1px solid rgba(0,255,255,0.12); border-radius:12px; padding:28px 20px; margin-top:32px;">

### ¡Gracias por usar CyberViewer! 🎉

Creado por [**CyberGems**](https://cybergems.org)

</div>
<p align="center">
  <a href="https://www.reddit.com/submit?url=https%3A%2F%2Fcybergems.org%2Fapps%2Fcyberviewer%2F&title=CyberViewer%3A%20herramienta%20de%20escritorio%20gratuita%20y%20de%20c%C3%B3digo%20abierto%20para%20Windows"><img src="https://img.shields.io/badge/Compartir_en_Reddit-FF4500?style=for-the-badge&logo=reddit&logoColor=white" alt="Compartir en Reddit" /></a>
  &nbsp;<a href="https://twitter.com/intent/tweet?text=CyberViewer%3A%20herramienta%20de%20escritorio%20gratuita%20y%20de%20c%C3%B3digo%20abierto%20para%20Windows&url=https%3A%2F%2Fcybergems.org%2Fapps%2Fcyberviewer%2F"><img src="https://img.shields.io/badge/Compartir_en_X-1DA1F2?style=for-the-badge&logo=x&logoColor=white" alt="Compartir en X" /></a>
  &nbsp;<a href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fcybergems.org%2Fapps%2Fcyberviewer%2F"><img src="https://img.shields.io/badge/Compartir_en_Facebook-1877F2?style=for-the-badge&logo=facebook&logoColor=white" alt="Compartir en Facebook" /></a>
  &nbsp;<a href="mailto:?subject=CyberViewer%3A%20herramienta%20de%20escritorio%20gratuita%20y%20de%20c%C3%B3digo%20abierto%20para%20Windows&body=CyberViewer%3A%20herramienta%20de%20escritorio%20gratuita%20y%20de%20c%C3%B3digo%20abierto%20para%20Windows%20https%3A%2F%2Fcybergems.org%2Fapps%2Fcyberviewer%2F"><img src="https://img.shields.io/badge/Compartir_por_Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white" alt="Compartir por correo" /></a>
  &nbsp;<a href="https://t.me/share/url?url=https%3A%2F%2Fcybergems.org%2Fapps%2Fcyberviewer%2F&text=CyberViewer%3A%20herramienta%20de%20escritorio%20gratuita%20y%20de%20c%C3%B3digo%20abierto%20para%20Windows"><img src="https://img.shields.io/badge/Compartir_en_Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Compartir en Telegram" /></a>
  &nbsp;<a href="https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fcybergems.org%2Fapps%2Fcyberviewer%2F"><img src="https://img.shields.io/badge/Compartir_en_LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="Compartir en LinkedIn" /></a>
</p>

---

## 🔗 Ver también

Más aplicaciones gratuitas, de código abierto y con la privacidad primero de [**CyberGems**](https://github.com/CyberGems):

| App | Descripción |
|:---:|---|
| 🕐&nbsp;[**CyberClock**](https://github.com/CyberGems/CyberClock#readme) | Reloj de escritorio con analógico y digital, calendario, temporizador, cronómetro y módulo de relajación. |
| 📢&nbsp;[**CyberFeeds**](https://github.com/CyberGems/CyberFeeds#readme) | Lector RSS y Atom de alto rendimiento y local-first, creado para la velocidad, la privacidad y la lectura limpia. |
| 🚀&nbsp;[**CyberLauncher**](https://github.com/CyberGems/CyberLauncher#readme) | Lanzador de aplicaciones de Windows con esquinas calientes, programador, monitor de sistema y terminal integrada. |
| 💻&nbsp;[**CyberManager**](https://github.com/CyberGems/CyberManager#readme) | Gestor de tareas ligero y de alto rendimiento, virtualizado y nativo de NT, una potente alternativa al Administrador de Tareas. |
| 📝&nbsp;[**CyberNotes**](https://github.com/CyberGems/CyberNotes#readme) | App de notas centrada en la privacidad con texto enriquecido, carpetas, pestañas y almacenamiento local protegido con bcrypt. |
| ⚡&nbsp;[**CyberPaste**](https://github.com/CyberGems/CyberPaste#readme) | Gestor de portapapeles con la privacidad primero para texto, código, imágenes, HTML y archivos. |
| 📸&nbsp;[**CyberSnap**](https://github.com/CyberGems/CyberSnap#readme) | Suite de captura y anotación de pantalla con herramientas vectoriales, OCR de alta velocidad, grabación de pantalla y selector de color. |
| ⭐&nbsp;[**CyberTray**](https://github.com/CyberGems/CyberTray#readme) | Lanzador de bandeja de alto rendimiento con hotspots, monitoreo de sistema, gestor de procesos y bóveda de archivos protegida con PIN. |
| 🛡️&nbsp;[**CyberWall**](https://github.com/CyberGems/CyberWall#readme) | Cortafuegos de Windows fácil de usar con reglas por aplicación en tiempo real gracias al motor kernel WFP. |

➡️ **[Todas las aplicaciones en cybergems.org](https://cybergems.org)**