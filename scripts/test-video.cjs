'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberviewer-video-test-'));
const run = (program, args, options = {}) => {
  const result = spawnSync(program, args, { windowsHide: true, encoding: 'utf8', timeout: 90000, ...options });
  if (result.error || result.status !== 0) {
    console.error(result.stdout, result.stderr, result.error || 'Exit code: ' + result.status);
    console.error('Isolated test data: ' + dataDir);
    process.exit(1);
  }
  return result;
};
// FFmpeg is a development-only fixture generator, not an application dependency.
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
run(ffmpeg, ['-version']);
const sample = (name, args) => run(ffmpeg, ['-v', 'error', '-nostdin', '-y', ...args, path.join(dataDir, name)]);
const base = path.join(dataDir, 'clip #ñ %.mp4');
sample(path.basename(base), ['-f','lavfi','-i','testsrc2=size=320x180:rate=24','-f','lavfi','-i','sine=frequency=600:sample_rate=48000','-t','12','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-g','24','-c:a','aac','-movflags','+faststart']);
for (const ext of ['mov', 'mkv', 'm4v']) sample('compatible.' + ext, ['-i',base,'-c','copy']);
sample('compatible.webm', ['-i',base,'-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8','-c:a','libopus']);
sample('unsupported-audio.mp4', ['-i',base,'-c:v','copy','-c:a','ac3']);
sample('long.mp4', ['-stream_loop','-1','-i',base,'-t','600','-c','copy','-movflags','+faststart']);
sample('1080p.mp4', ['-f','lavfi','-i','testsrc2=size=1920x1080:rate=24','-t','3','-an','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart']);
fs.writeFileSync(path.join(dataDir, 'damaged.mp4'), 'Not a video');
const environment = { ...process.env, CV_VIDEO_TEST_DIR: dataDir };
delete environment.ELECTRON_RUN_AS_NODE;
for (const phase of ['initial', 'restore']) {
  const result = run(require('electron'), [path.join(__dirname,'..','test','video-smoke.cjs')], {
    env: { ...environment, CV_VIDEO_TEST_PHASE: phase }
  });
  console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
}
console.log('Video test data and screenshots: ' + dataDir);
