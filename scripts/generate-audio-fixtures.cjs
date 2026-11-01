'use strict';

// Development only. Checked-in, synthetic test media lets npm run test:audio
// run offline without FFmpeg. None of these files or tools are packaged.
// Regenerate with: FFMPEG_PATH=<path to ffmpeg> node scripts/generate-audio-fixtures.cjs
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const dir = path.join(__dirname, '..', 'test', 'fixtures', 'audio');
fs.mkdirSync(dir, { recursive: true });
const fixtures = [
  ['tone.flac', ['-c:a', 'flac', '-compression_level', '8']],
  ['tone.ogg', ['-c:a', 'libvorbis', '-q:a', '2']],
  ['tone.oga', ['-c:a', 'libvorbis', '-q:a', '2', '-f', 'ogg']],
  ['voice.ogg', ['-c:a', 'libopus', '-b:a', '24k', '-application', 'voip', '-f', 'ogg']],
  ['voice.opus', ['-c:a', 'libopus', '-b:a', '24k', '-application', 'voip', '-f', 'ogg']],
  ['tone.aac', ['-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '32k', '-f', 'adts']],
  ['tone.m4a', ['-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '32k', '-movflags', '+faststart']]
];
for (const [name, args] of fixtures) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-hide_banner', '-v', 'error', '-nostdin', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000:duration=12',
    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact',
    ...args, path.join(dir, name)
  ], { windowsHide: true, stdio: 'inherit' });
  console.log(name + ': ' + fs.statSync(path.join(dir, name)).size + ' bytes');
}
