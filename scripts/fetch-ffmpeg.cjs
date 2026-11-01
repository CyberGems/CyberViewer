'use strict';
// Fetch the pinned ffmpeg build used for WMV/AVI/FLV transcoding.
// Used by the release workflow before packaging and by developers building
// locally (`npm run fetch:ffmpeg`). The binary is never committed.

const { createHash } = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FFMPEG_URL = 'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip';
const FFMPEG_SHA256 = '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba';
const TARGET = path.join(__dirname, '..', 'electron', 'ffmpeg.exe');

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function main() {
  if (fs.existsSync(TARGET) && process.argv[2] !== '--force') {
    console.log('ffmpeg already present:', TARGET);
    return;
  }
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberviewer-ffmpeg-'));
  const zipPath = path.join(workDir, 'ffmpeg.zip');
  try {
    console.log('Downloading', FFMPEG_URL);
    execFileSync('curl', ['-sS', '-L', '--fail', '-o', zipPath, FFMPEG_URL], { stdio: 'inherit' });
    const hash = sha256(zipPath);
    if (hash !== FFMPEG_SHA256) {
      throw new Error(`Checksum mismatch: expected ${FFMPEG_SHA256}, got ${hash}`);
    }
    console.log('Checksum OK');
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${workDir}\\zip' -Force`], { stdio: 'inherit' });
    const exe = findFfmpeg(path.join(workDir, 'zip'));
    fs.copyFileSync(exe, TARGET);
    console.log('ffmpeg installed to', TARGET, `(${(fs.statSync(TARGET).size / 1048576).toFixed(1)} MB)`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function findFfmpeg(root) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === 'ffmpeg.exe') return full;
    }
  }
  throw new Error('ffmpeg.exe not found inside the downloaded archive');
}

main();
