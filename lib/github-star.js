'use strict';
const { execFile } = require('node:child_process');

/** One native action shared by all windows of this app. */
function createGitHubStarAction(openRepository, runCli = execFile) {
  let pending;
  return function starRepository() {
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      runCli('gh', ['api', '--hostname', 'github.com', '--method', 'PUT',
        'user/starred/CyberGems/CyberViewer'], {
        windowsHide: true,
        timeout: 12_000,
        maxBuffer: 64 * 1024,
        env: { ...process.env, GH_PROMPT_DISABLED: '1' },
      }, (error) => {
        if (!error) { resolve('starred'); return; }
        openRepository().then(() => resolve('opened'), reject);
      });
    }).finally(() => { pending = undefined; });
    return pending;
  };
}

module.exports = { createGitHubStarAction };
