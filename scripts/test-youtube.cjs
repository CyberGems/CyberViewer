'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberviewer-youtube-test-'));
const env = { ...process.env, CV_YOUTUBE_TEST_DIR: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
for (const phase of ['initial', 'restore']) {
  const result = spawnSync(require('electron'), [path.join(__dirname, '..', 'test', 'youtube-smoke.cjs')], {
    env: { ...env, CV_YOUTUBE_TEST_PHASE: phase }, encoding: 'utf8', windowsHide: true, timeout: 180000
  });
  console.log(result.stdout || '');
  if (result.stderr) console.error(result.stderr);
  if (result.error || result.status !== 0) { console.error(result.error || 'Exit code: ' + result.status); console.error('YouTube test data: ' + dataDir); process.exit(1); }
}
console.log('YouTube test data and screenshots: ' + dataDir);
