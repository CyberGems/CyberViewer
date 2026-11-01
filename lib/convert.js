'use strict';

// On-demand transcode of legacy containers (WMV, AVI, FLV) that Chromium
// cannot decode. Files are converted to MP4 (H.264 + AAC) with the bundled
// ffmpeg into a per-user cache, keyed by path + mtime + size so the second
// open of the same file is instant. Conversions run one at a time; repeated
// requests for the same file share the in-flight promise.

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRUNE_MAX_AGE_DAYS = 30;
const PRUNE_MAX_BYTES = 4 * 1024 * 1024 * 1024;

function cacheKeyFor(abs, stats) {
  return crypto.createHash('md5')
    .update(`${pathKey(abs)}|${stats.mtimeMs}|${stats.size}|convert-v1`)
    .digest('hex');
}

function pathKey(p) {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

/**
 * Parse "Duration: HH:MM:SS.cc" from ffmpeg's banner into seconds.
 * @returns {number} 0 when the banner is missing or unreadable.
 */
function parseDurationSeconds(banner) {
  const match = /Duration:\s*(\d+):(\d{2}):(\d{2})\.(\d+)/.exec(banner || '');
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${match[4]}`);
}

function createConverter({ getFfmpegPath, cacheDir }) {
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const cacheKeyByPath = new Map(); // pathKey -> Promise<string key>
  const inflight = new Map(); // pathKey -> Promise<result>
  let queueTail = Promise.resolve();
  let currentChild = null;
  let disposed = false;

  const convertedPathForKey = key => path.join(cacheDir, `${key}.mp4`);

  async function keyFor(abs) {
    const key = pathKey(abs);
    if (!cacheKeyByPath.has(key)) {
      cacheKeyByPath.set(key, fs.promises.stat(abs).then(stats => cacheKeyFor(abs, stats)));
    }
    return cacheKeyByPath.get(key);
  }

  /** Synchronous cache lookup used by the thumbnailer; null when not converted. */
  function peekConverted(abs) {
    // No async stat here: thumbnails may only use conversions that already
    // finished, and a stale key simply misses (mtime changes re-key anyway).
    let stats;
    try { stats = fs.statSync(abs); } catch (_) { return null; }
    const cached = convertedPathForKey(cacheKeyFor(abs, stats));
    try { return fs.existsSync(cached) ? cached : null; } catch (_) { return null; }
  }

  /**
   * Convert one file, serialized behind any pending conversion.
   * @param {string} abs Absolute path of the original media file.
   * @param {{ onProgress?: (percent: number) => void }} [opts]
   * @returns {Promise<{ok: true, path: string, cached: boolean} | {ok: false, error: string}>}
   */
  function convert(abs, opts = {}) {
    if (disposed) return Promise.resolve({ ok: false, error: 'App is shutting down' });
    const key = pathKey(abs);
    if (inflight.has(key)) {
      // Share the running conversion; progress listeners replace each other.
      const pending = inflight.get(key);
      pending.then(result => {
        if (result.ok && opts.onProgress) opts.onProgress(100);
      }).catch(() => {});
      return pending;
    }
    const run = queueTail.then(() => runConversion(abs, opts)).finally(() => inflight.delete(key));
    inflight.set(key, run);
    queueTail = run.catch(() => {});
    return run;
  }

  async function runConversion(abs, opts) {
    const ffmpeg = getFfmpegPath();
    if (!ffmpeg) return { ok: false, error: 'ffmpeg not available' };
    const key = await keyFor(abs);
    const finalPath = convertedPathForKey(key);
    try {
      if (fs.existsSync(finalPath)) {
        if (opts.onProgress) opts.onProgress(100);
        return { ok: true, path: finalPath, cached: true };
      }
      const partPath = `${finalPath}.part`;
      try { fs.rmSync(partPath, { force: true }); } catch (_) { /* stale part file */ }
      await transcode(ffmpeg, abs, partPath, opts.onProgress || (() => {}));
      fs.renameSync(partPath, finalPath);
      if (opts.onProgress) opts.onProgress(100);
      return { ok: true, path: finalPath, cached: false };
    } catch (error) {
      try { fs.rmSync(`${finalPath}.part`, { force: true }); } catch (_) { /* already gone */ }
      return { ok: false, error: error && error.message ? error.message : String(error) };
    }
  }

  function transcode(ffmpeg, input, output, onProgress) {
    return new Promise((resolve, reject) => {
      // yuv420p keeps the output playable on every GPU; +faststart moves the
      // moov atom up so the converted file can start playing while large.
      const child = spawn(ffmpeg, [
        '-hide_banner', '-nostdin', '-y',
        '-i', input,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k',
        '-movflags', '+faststart',
        // The .part temp name gives ffmpeg no extension to pick a muxer from.
        '-f', 'mp4',
        '-progress', 'pipe:1', '-nostats',
        output
      ], { windowsHide: true });
      currentChild = child;
      let banner = '';
      let stderrTail = '';
      let duration = 0;
      let stdoutBuffer = '';
      child.stdout.on('data', chunk => {
        stdoutBuffer += chunk.toString();
        let index;
        while ((index = stdoutBuffer.indexOf('\n')) >= 0) {
          const line = stdoutBuffer.slice(0, index).trim();
          stdoutBuffer = stdoutBuffer.slice(index + 1);
          const match = /^(out_time_us|out_time_ms|out_time|progress)=(.*)$/.exec(line);
          if (!match || !duration) continue;
          if (match[1] === 'progress') {
            if (match[2] === 'end') onProgress(99);
            continue;
          }
          const seconds = match[1] === 'out_time_us' ? Number(match[2]) / 1e6
            : match[1] === 'out_time_ms' ? Number(match[2]) / 1e3
            : parseMicro(match[2]);
          if (Number.isFinite(seconds)) onProgress(Math.max(0, Math.min(99, seconds / duration * 100)));
        }
      });
      child.stderr.on('data', chunk => {
        const text = chunk.toString();
        if (!banner) banner += text;
        if (!duration) duration = parseDurationSeconds(banner);
        stderrTail = (stderrTail + text).slice(-4000);
      });
      child.on('error', error => {
        currentChild = null;
        reject(new Error(`ffmpeg could not be started: ${error.message}`));
      });
      child.on('close', code => {
        currentChild = null;
        if (code === 0) return resolve();
        const detail = stderrTail.split('\n').filter(Boolean).pop() || 'unknown ffmpeg error';
        reject(new Error(`ffmpeg exited with code ${code}: ${detail}`));
      });
    });
  }

  function parseMicro(text) {
    // out_time is HH:MM:SS.micros
    const match = /^(\d+):(\d{2}):(\d{2})\.(\d+)$/.exec(text || '');
    if (!match) return NaN;
    return (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1e6 + Number(match[4]);
  }

  /** Delete stale/oversized conversions; oldest first. */
  async function prune({ now = Date.now() } = {}) {
    let entries = [];
    try { entries = await fs.promises.readdir(cacheDir); } catch (_) { return; }
    const stats = [];
    for (const name of entries) {
      if (!name.endsWith('.mp4')) continue;
      const full = path.join(cacheDir, name);
      try {
        const st = await fs.promises.stat(full);
        if (now - st.mtimeMs > PRUNE_MAX_AGE_DAYS * 864e5) {
          await fs.promises.rm(full, { force: true });
          continue;
        }
        stats.push({ full, size: st.size, mtimeMs: st.mtimeMs });
      } catch (_) { /* concurrent removal */ }
    }
    let total = stats.reduce((sum, item) => sum + item.size, 0);
    stats.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const item of stats) {
      if (total <= PRUNE_MAX_BYTES) break;
      try { await fs.promises.rm(item.full, { force: true }); } catch (_) { /* ignore */ }
      total -= item.size;
    }
  }

  /** Kill any running conversion; the app is quitting. */
  function dispose() {
    disposed = true;
    if (currentChild) {
      try { currentChild.kill(); } catch (_) { /* already dead */ }
      currentChild = null;
    }
  }

  return { convert, peekConverted, prune, dispose };
}

module.exports = { createConverter, parseDurationSeconds };
