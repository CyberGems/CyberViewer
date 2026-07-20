'use strict';

const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'js', 'app.js');
let src = fs.readFileSync(appJsPath, 'utf8');

const helpers = `
// ── Media / format helpers (cvlocal protocol) ──
function mediaUrl(fsPath, bust) {
  if (!fsPath) return '';
  const s = String(fsPath);
  if (s.startsWith('cvlocal://') || s.startsWith('blob:') || s.startsWith('data:')) {
    return bust ? (s.split('?')[0] + '?t=' + bust) : s;
  }
  const abs = s.replace(/\\\\/g, '/');
  const encoded = encodeURI(abs).replace(/#/g, '%23');
  const url = 'cvlocal:///' + encoded;
  return bust ? url + '?t=' + bust : url;
}

function canvasExport(canvas, filePath) {
  const ext = (String(filePath || '').split('.').pop() || '').toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') {
    return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
  }
  return canvas.toDataURL('image/png').split(',')[1];
}

function syncCurrentIndex(idx) {
  state.currentIdx = idx;
  state.current = idx;
}

`;

if (!src.includes('function mediaUrl(')) {
  src = helpers + src;
}

src = src.replace(
  "showToast(lang === 'es' ? 'GUARDANDO COPIA...' : 'SAVING COPIA...', 'info');",
  "showToast(lang === 'es' ? 'GUARDANDO COPIA...' : 'SAVING COPY...', 'info');"
);

src = src.replace(
  "im.url = 'file:///' + safePath + '?t=' + Date.now();",
  "im.url = mediaUrl(im.file.path, Date.now());"
);

src = src.replace(
  'mainImg.src = `file://${fpath}?t=${Date.now()}`;',
  'mainImg.src = mediaUrl(fpath, Date.now());'
);

src = src.replace(
  "mainImg.src = 'file:///' + safePath + '?t=' + Date.now();",
  "mainImg.src = mediaUrl(im.file.path, Date.now());"
);

// Crop: move fpath before buffer and use canvasExport
src = src.replace(
  `  cctx.drawImage(fullCanvas, relX, relY, finalW, finalH, 0, 0, finalW, finalH);
  
  const buffer = cropCanvas.toDataURL('image/jpeg', 0.95).split(',')[1];
  const im = state.images[state.current];
  const fpath = im.path || (im.file ? im.file.path : null);`,
  `  cctx.drawImage(fullCanvas, relX, relY, finalW, finalH, 0, 0, finalW, finalH);
  
  const im = state.images[state.current];
  const fpath = im.path || (im.file ? im.file.path : null);
  const buffer = canvasExport(cropCanvas, fpath);`
);

src = src.replace(
  `    // Dibujar la imagen en las nuevas dimensiones
    ctx.drawImage(mainImg, 0, 0, targetW, targetH);
    
    const buffer = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];`,
  `    // Dibujar la imagen en las nuevas dimensiones
    ctx.drawImage(mainImg, 0, 0, targetW, targetH);
    
    const buffer = canvasExport(canvas, fpath);`
);

src = src.replace(/v1\.2\.0 — Pro Viewer/g, 'v1.6.2 — Pro Viewer');
src = src.replace(/v1\.2\.0 — Visor Pro/g, 'v1.6.2 — Visor Pro');
src = src.replace(/\(e\.message \|\| 'Desconocido'\)/g, "(e.message || 'Unknown')");

// Keep current/currentIdx in sync on key writes
src = src.replace(
  `  state.currentIdx = -1;
  state.current = -1;`,
  '  syncCurrentIndex(-1);'
);
src = src.replace(
  '  state.currentIdx = initialIdx;',
  '  syncCurrentIndex(initialIdx);'
);
src = src.replace(
  `    state.current = idx;
    state.currentRotation = 0;`,
  `    syncCurrentIndex(idx);
    state.currentRotation = 0;`
);
src = src.replace(
  '    state.currentIdx = idx;',
  '    syncCurrentIndex(idx);'
);
src = src.replace(
  `    state.current = -1;`,
  '    syncCurrentIndex(-1);'
);
src = src.replace(
  '    state.current = nextIdx;',
  '    syncCurrentIndex(nextIdx);'
);
src = src.replace(
  '      state.current = -1;',
  '      syncCurrentIndex(-1);'
);

fs.writeFileSync(appJsPath, src);
console.log('Patched app.js');
console.log('Remaining file://:', (src.match(/file:\/\//g) || []).length);
console.log('Remaining jpeg toDataURL:', (src.match(/toDataURL\('image\/jpeg'/g) || []).length);
console.log('mediaUrl helpers:', src.includes('function mediaUrl('));
