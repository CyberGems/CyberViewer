'use strict';

const path = require('path');
const fs = require('fs');

const IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'
]);

/** Normalize file:// / percent-encoding / win32 leading slash into an absolute FS path. */
function cleanFsPath(p) {
  if (p == null || typeof p !== 'string') {
    throw new TypeError('Path must be a string');
  }
  let cleanPath = p.trim();
  if (cleanPath.startsWith('cvlocal:///')) {
    cleanPath = cleanPath.slice('cvlocal:///'.length);
  } else if (cleanPath.startsWith('cvlocal://')) {
    cleanPath = cleanPath.slice('cvlocal://'.length);
  } else if (cleanPath.startsWith('file:///')) {
    cleanPath = cleanPath.slice(8);
  } else if (cleanPath.startsWith('file://')) {
    cleanPath = cleanPath.slice(7);
  }
  // Strip cache-buster / query
  const q = cleanPath.indexOf('?');
  if (q !== -1) cleanPath = cleanPath.slice(0, q);
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch (_) {
    // keep as-is if malformed encoding
  }
  if (process.platform === 'win32' && cleanPath.startsWith('/') && /^\/[A-Za-z]:/.test(cleanPath)) {
    cleanPath = cleanPath.slice(1);
  }
  return path.resolve(cleanPath);
}

/** Build a cvlocal:// URL for a filesystem path (safe for <img src>). */
function toMediaUrl(fsPath) {
  const abs = path.resolve(fsPath).replace(/\\/g, '/');
  // encodeURI keeps slashes; encode # and ? which break URLs
  const encoded = encodeURI(abs).replace(/#/g, '%23').replace(/\?/g, '%3F');
  return 'cvlocal:///' + encoded;
}

function isImagePath(filePath) {
  try {
    const ext = path.extname(cleanFsPath(filePath)).toLowerCase();
    return IMAGE_EXTS.has(ext);
  } catch (_) {
    return false;
  }
}

/**
 * Path allowlist: only paths under registered roots (or exact files) may be read/written via IPC/protocol.
 */
function createPathAllowlist(extraRoots = []) {
  const roots = new Set();

  function normalizeRoot(p) {
    return path.resolve(p).toLowerCase();
  }

  function allow(fsPath) {
    try {
      const abs = path.resolve(fsPath);
      const stat = fs.existsSync(abs) ? fs.statSync(abs) : null;
      const root = stat && stat.isDirectory() ? abs : path.dirname(abs);
      roots.add(normalizeRoot(root));
      return true;
    } catch (_) {
      return false;
    }
  }

  for (const r of extraRoots) {
    if (r) allow(r);
  }

  function isAllowed(fsPath) {
    let abs;
    try {
      abs = path.resolve(fsPath);
    } catch (_) {
      return false;
    }
    const absLower = abs.toLowerCase();
    for (const root of roots) {
      if (absLower === root || absLower.startsWith(root + path.sep.toLowerCase()) || absLower.startsWith(root + '\\') || absLower.startsWith(root + '/')) {
        return true;
      }
      // Windows: path.sep is \, also accept /
      if (process.platform === 'win32') {
        const rootSlash = root.replace(/\//g, '\\');
        const absSlash = absLower.replace(/\//g, '\\');
        if (absSlash === rootSlash || absSlash.startsWith(rootSlash + '\\')) return true;
      }
    }
    return false;
  }

  function assertAllowed(fsPath) {
    const abs = cleanFsPath(fsPath);
    if (!isAllowed(abs)) {
      const err = new Error('Path not allowed: ' + abs);
      err.code = 'PATH_NOT_ALLOWED';
      throw err;
    }
    return abs;
  }

  return { allow, isAllowed, assertAllowed, cleanFsPath, roots };
}

/** Prefer PNG for formats that keep alpha / lossless after canvas edits; JPEG for photos. */
function canvasMimeForPath(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') {
    return { mime: 'image/jpeg', quality: 0.95, ext: '.jpg' };
  }
  // PNG covers png/webp/gif/bmp/tiff edits (canvas loses animation anyway)
  return { mime: 'image/png', quality: undefined, ext: '.png' };
}

module.exports = {
  IMAGE_EXTS,
  cleanFsPath,
  toMediaUrl,
  isImagePath,
  createPathAllowlist,
  canvasMimeForPath
};
