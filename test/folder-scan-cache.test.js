const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

describe('folder scan cache and sidebar pause/resume', () => {
  it('contains the folderScanCache structure and signature generator', () => {
    assert.match(appJs, /const folderScanCache = new Map\(\);/);
    assert.match(appJs, /function computeFolderSignature\(files\)/);
    assert.match(appJs, /function recordCachedThumb\(filePath, thumbUrl\)/);
    assert.match(appJs, /function getFolderThumbStats\(\)/);
  });

  it('computes signature taking into account count, byte sizes, and boundary files', () => {
    // Extract and execute computeFolderSignature in isolation
    const match = appJs.match(/function computeFolderSignature\(files\) \{[\s\S]*?return `\$\{files\.length\}:\$\{totalBytes\}:\$\{first\}:\$\{last\}`;[\s\S]*?\}/);
    assert.ok(match, 'computeFolderSignature should match expected signature pattern');

    const fn = new Function('files', `${match[0]}; return computeFolderSignature(files);`);

    const folder1 = [
      { name: 'a.jpg', path: 'C:/photos/a.jpg', size: 1000 },
      { name: 'b.jpg', path: 'C:/photos/b.jpg', size: 2000 },
      { name: 'c.jpg', path: 'C:/photos/c.jpg', size: 3000 }
    ];

    const sig1 = fn(folder1);
    assert.equal(sig1, '3:6000:C:/photos/a.jpg:C:/photos/c.jpg');

    // Same folder -> identical signature
    const sig1Copy = fn([...folder1]);
    assert.equal(sig1Copy, sig1);

    // Added file -> different signature
    const folder2 = [...folder1, { name: 'd.jpg', path: 'C:/photos/d.jpg', size: 4000 }];
    const sig2 = fn(folder2);
    assert.notEqual(sig2, sig1);

    // Modified size -> different signature
    const folder3 = [
      { name: 'a.jpg', path: 'C:/photos/a.jpg', size: 1500 },
      { name: 'b.jpg', path: 'C:/photos/b.jpg', size: 2000 },
      { name: 'c.jpg', path: 'C:/photos/c.jpg', size: 3000 }
    ];
    const sig3 = fn(folder3);
    assert.notEqual(sig3, sig1);

    // Replaced file -> different signature
    const folder4 = [
      { name: 'z.jpg', path: 'C:/photos/z.jpg', size: 1000 },
      { name: 'b.jpg', path: 'C:/photos/b.jpg', size: 2000 },
      { name: 'c.jpg', path: 'C:/photos/c.jpg', size: 3000 }
    ];
    const sig4 = fn(folder4);
    assert.notEqual(sig4, sig1);
  });

  it('correctly evaluates getFolderThumbStats with thumbUrl, thumbFailed, or no path', () => {
    const match = appJs.match(/function getFolderThumbStats\(\) \{[\s\S]*?return \{ done, total \};[\s\S]*?\}/);
    assert.ok(match, 'getFolderThumbStats should match pattern');

    const fn = new Function('state', `${match[0]}; return getFolderThumbStats();`);

    const state1 = {
      images: [
        { thumbUrl: 'blob:1', file: { path: 'C:/a.jpg' } },
        { thumbUrl: null, thumbFailed: true, file: { path: 'C:/b.jpg' } },
        { thumbUrl: 'blob:3', file: null }, // e.g. pasted
        { thumbUrl: null, file: { path: 'C:/d.jpg' } }
      ]
    };

    const stats1 = fn(state1);
    assert.equal(stats1.total, 4);
    assert.equal(stats1.done, 3); // 3 completed (1 url, 1 failed, 1 no path)
  });

  it('preserves thumb progress on sidebar close instead of resetting to 0', () => {
    assert.doesNotMatch(appJs, /updateThumbProgress\(0,\s*0,\s*true\)/, 'should not reset progress to 0 on sidebar close');
    assert.match(appJs, /const \{ done, total \} = getFolderThumbStats\(\);\s*updateThumbProgress\(done, total, true\);/);
  });

  it('avoids triggering startBackgroundScan when opening sidebar if all thumbnails are already done', () => {
    assert.match(appJs, /if \(total > 0 && done >= total\) \{\s*state\.scanInProgress = false;\s*updateThumbProgress\(total, total\);\s*\} else \{\s*startBackgroundScan\(\);\s*\}/);
  });

  it('skips already cached thumbnails in startBackgroundScan without stalling progress', () => {
    assert.match(appJs, /if \(im\.thumbUrl\) \{[\s\S]*?continue;\s*\}/);
    assert.match(appJs, /if \(done >= total\) \{\s*state\.scanInProgress = false;\s*updateThumbProgress\(total, total\);/);
  });

  it('hydrates state.images with cached thumbnails on mergeNeighbors', () => {
    assert.match(appJs, /const cachedThumb = cachedFolder\.thumbs\.get\(pLower\) \|\| null;/);
    assert.match(appJs, /if \(doneCount < totalCount\) \{\s*startBackgroundScan\(\);\s*\} else \{\s*cachedFolder\.completed = true;\s*updateThumbProgress\(totalCount, totalCount\);\s*\}/);
  });

  it('resets scanner progress and increments sequence on clipboard paste', () => {
    assert.match(appJs, /function insertPastedImage\(blob, mime = 'image\/png'\) \{[\s\S]*?state\.openSeq\+\+;[\s\S]*?state\.scanInProgress = false;[\s\S]*?updateThumbProgress\(1, 1\);/);
  });
});
