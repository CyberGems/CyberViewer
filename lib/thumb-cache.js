'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_BYTES = 200 * 1024 * 1024; // 200 MB
const DEFAULT_MAX_FILES = 2000;

/**
 * Evict oldest thumb cache files when over size or count limits.
 * @returns {{ removed: number, freedBytes: number }}
 */
function evictThumbCache(cacheDir, opts = {}) {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;

  if (!fs.existsSync(cacheDir)) {
    return { removed: 0, freedBytes: 0 };
  }

  let entries;
  try {
    entries = fs.readdirSync(cacheDir)
      .filter((name) => name.endsWith('.jpg'))
      .map((name) => {
        const full = path.join(cacheDir, name);
        try {
          const st = fs.statSync(full);
          return { full, mtime: st.mtimeMs, size: st.size };
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (_) {
    return { removed: 0, freedBytes: 0 };
  }

  entries.sort((a, b) => a.mtime - b.mtime); // oldest first

  let totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
  let removed = 0;
  let freedBytes = 0;

  while (entries.length && (entries.length > maxFiles || totalBytes > maxBytes)) {
    const oldest = entries.shift();
    try {
      fs.unlinkSync(oldest.full);
      removed++;
      freedBytes += oldest.size;
      totalBytes -= oldest.size;
    } catch (_) {
      // skip locked files
    }
  }

  return { removed, freedBytes };
}

module.exports = { evictThumbCache, DEFAULT_MAX_BYTES, DEFAULT_MAX_FILES };
