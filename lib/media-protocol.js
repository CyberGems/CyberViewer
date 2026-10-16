'use strict';

const fs = require('fs');
const { Readable } = require('stream');
const { cleanFsPath, mimeForPath } = require('./paths');

// A single byte range is sufficient for Chromium's media loader. Reject malformed
// or unsatisfiable ranges explicitly, without reading the whole file into memory.
function parseByteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return false;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return false;
  if (first === null) return last > 0 ? { start: Math.max(0, size - last), end: size - 1 } : false;
  if (first >= size || (last !== null && last < first)) return false;
  return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}

async function createMediaResponse(request, allowlist) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const abs = cleanFsPath(request.url);
  if (!allowlist.isAllowed(abs)) return new Response('Forbidden', { status: 403 });
  let handle;
  try {
    handle = await fs.promises.open(abs, 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) { await handle.close(); return new Response('Not Found', { status: 404 }); }
    const headers = {
      'Content-Type': mimeForPath(abs), 'Accept-Ranges': 'bytes',
      'Cache-Control': /[\\/]thumb_cache[\\/]/i.test(abs) ? 'private, max-age=86400' : 'no-cache, must-revalidate'
    };
    // Only the app's local file renderer may read media into a canvas (video
    // thumbnails). Never grant CORS access to arbitrary web origins.
    const origin = request.headers.get('origin');
    if (origin === 'file://' || origin === 'null') {
      headers['Access-Control-Allow-Origin'] = origin;
      headers.Vary = 'Origin';
    }
    const range = parseByteRange(request.method === 'GET' ? request.headers.get('range') : null, stat.size);
    if (range === false) {
      await handle.close();
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${stat.size}` } });
    }
    const length = range ? range.end - range.start + 1 : stat.size;
    headers['Content-Length'] = String(length);
    if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
    const status = range ? 206 : 200;
    if (request.method === 'HEAD' || length === 0) {
      await handle.close();
      return new Response(null, { status, headers });
    }
    const stream = handle.createReadStream(range || {});
    // Readable.toWeb propagates cancellation to the file stream, closing the
    // descriptor when a tab is switched or Chromium abandons a range request.
    return new Response(Readable.toWeb(stream), { status, headers });
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) return new Response('Not Found', { status: 404 });
    throw error;
  }
}

module.exports = { parseByteRange, createMediaResponse };
