'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberviewer-workspace-test-'));
const electron = require('electron');
const runner = path.join(__dirname, '..', 'test', 'workspace-smoke.cjs');
for (const phase of ['initial', 'restore']) {
  if (phase === 'restore') fs.renameSync(path.join(dataDir, 'three #ñ %.png'), path.join(dataDir, 'three-moved.png'));
  const environment = { ...process.env, CV_WORKSPACE_TEST_DIR: dataDir, CV_WORKSPACE_TEST_PHASE: phase };
  delete environment.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(electron, [runner], { env: environment, windowsHide: true, encoding: 'utf8', timeout: 90000 });
  const output = (result.stdout || '') + (result.stderr || '');
  console.log(output);
  if (result.error || result.status !== 0) {
    console.error(result.error || 'Electron smoke test exited with ' + result.status);
    console.error('Isolated test data: ' + dataDir);
    process.exit(1);
  }
}
console.log('Isolated test data and screenshots: ' + dataDir);
