import assert from 'node:assert/strict';

let cliError = null;
let browserError = null;
let cliCalls = 0;
let browserCalls = 0;
const runCli = (command, args, options, callback) => {
    cliCalls++;
    assert.equal(command, 'gh');
    assert.deepEqual(args, ['api', '--hostname', 'github.com', '--method', 'PUT', 'user/starred/CyberGems/CyberViewer']);
    assert.equal(options.windowsHide, true);
    assert.equal(options.timeout, 12000);
    assert.equal(options.env.GH_PROMPT_DISABLED, '1');
    queueMicrotask(() => callback(cliError));
};
const openRepository = async () => {
    browserCalls++;
    if (browserError) throw browserError;
};
const { createGitHubStarAction } = await import('../lib/github-star.js');
const starRepository = createGitHubStarAction(openRepository, runCli);
const first = starRepository();
assert.equal(starRepository(), first, 'Concurrent surfaces must share one request');
assert.equal(await first, 'starred');
assert.equal(cliCalls, 1);
assert.equal(browserCalls, 0);
for (const code of ['ENOENT', 'ETIMEDOUT', 'AUTHENTICATION_FAILED']) {
  cliError = Object.assign(new Error(code), { code });
  assert.equal(await starRepository(), 'opened');
}
assert.equal(browserCalls, 3);
browserError = new Error('Browser unavailable');
await assert.rejects(starRepository(), /Browser unavailable/);
cliError = null;
browserError = null;
assert.equal(await starRepository(), 'starred', 'A failed attempt must allow retry');
console.log('GitHub star smoke passed: success, shared request, browser fallback and retry');
