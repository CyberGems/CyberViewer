const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const autoBackup = require(path.join(root, 'lib', 'auto-backup'));
const { buildBackup, parseBackup } = require(path.join(root, 'lib', 'settings-backup'));

const preloadJs = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const uiI18n = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));
const menuI18n = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'menu.json'), 'utf8'));

/** Extract a top-level function body by name (up to the next `function `). */
function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found`);
  const end = src.indexOf('\nfunction ', start + 1);
  return end === -1 ? src.slice(start) : src.slice(start, end);
}

describe('auto-backup pure logic', () => {
  it('maps every frequency to its interval', () => {
    assert.equal(autoBackup.getFrequencyMs('onStartup'), 5 * 60 * 1000);
    assert.equal(autoBackup.getFrequencyMs('hourly'), 60 * 60 * 1000);
    assert.equal(autoBackup.getFrequencyMs('daily'), 24 * 60 * 60 * 1000);
    assert.equal(autoBackup.getFrequencyMs('weekly'), 7 * 24 * 60 * 60 * 1000);
    assert.equal(autoBackup.getFrequencyMs('monthly'), 30 * 24 * 60 * 60 * 1000);
    assert.equal(autoBackup.getFrequencyMs('nonsense'), 24 * 60 * 60 * 1000);
  });

  it('sanitizes autoBackup settings', () => {
    const clean = autoBackup.pickAutoBackupSettings({
      enabled: true,
      frequency: 'weekly',
      maxBackups: 7,
      customPath: '  D:\\backups  ',
      lastBackupTime: 1730000000000.7
    });
    assert.deepEqual(clean, {
      enabled: true,
      frequency: 'weekly',
      maxBackups: 7,
      customPath: 'D:\\backups',
      lastBackupTime: 1730000000000
    });

    const dirty = autoBackup.pickAutoBackupSettings({
      enabled: 'yes',
      frequency: 'yearly',
      maxBackups: 999,
      customPath: 'bad\0path',
      lastBackupTime: -5
    });
    assert.deepEqual(dirty, {
      enabled: false,
      frequency: 'daily',
      maxBackups: 50,
      customPath: '',
      lastBackupTime: 0
    });

    // On by default when the block is missing (fresh install), like the sibling apps
    assert.deepEqual(autoBackup.pickAutoBackupSettings(null), {
      enabled: true,
      frequency: 'daily',
      maxBackups: 5,
      customPath: '',
      lastBackupTime: 0
    });
  });

  it('formats backup filenames', () => {
    const d = new Date(2026, 9, 15, 19, 4, 7);
    assert.equal(autoBackup.formatBackupFilename(d), 'cyberviewer_backup_2026-10-15_19-04-07.json');
    assert.ok(autoBackup.isBackupFilename('cyberviewer_backup_2026-10-15_19-04-07.json'));
    assert.ok(!autoBackup.isBackupFilename('cyberviewer_backup_2026-10-15_19-04-07.json.tmp'));
    assert.ok(!autoBackup.isBackupFilename('settings.json'));
    assert.ok(!autoBackup.isBackupFilename('cyberfeeds_backup_2026-10-15_19-04-07.json'));
  });

  it('guards restore/delete paths to the backups directory', () => {
    const dir = 'C:\\Users\\me\\AppData\\Roaming\\CyberViewer\\backups';
    assert.ok(autoBackup.isPathInside(dir, path.join(dir, 'cyberviewer_backup_2026-01-01_00-00-00.json')));
    assert.ok(!autoBackup.isPathInside(dir, 'C:\\Users\\me\\AppData\\Roaming\\CyberViewer\\settings.json'));
    assert.ok(!autoBackup.isPathInside(dir, path.join(dir, '..\\..\\Windows\\system32')));
    assert.ok(!autoBackup.isPathInside(dir, ''));
    assert.ok(!autoBackup.isPathInside('', path.join(dir, 'x.json')));
  });

  it('sorts, prunes and summarizes backup lists', () => {
    const list = [
      { filename: 'a.json', filePath: '/b/a.json', timestamp: 300, sizeBytes: 10 },
      { filename: 'b.json', filePath: '/b/b.json', timestamp: 100, sizeBytes: 20 },
      { filename: 'c.json', filePath: '/b/c.json', timestamp: 200, sizeBytes: 30 }
    ];
    const sorted = autoBackup.sortBackupsNewestFirst(list);
    assert.deepEqual(sorted.map(i => i.filename), ['a.json', 'c.json', 'b.json']);

    const prune = autoBackup.selectBackupsToPrune(sorted, 2);
    assert.deepEqual(prune.map(i => i.filename), ['b.json']);
    assert.deepEqual(autoBackup.selectBackupsToPrune(sorted, 3), []);
    assert.deepEqual(autoBackup.selectBackupsToPrune(sorted, 10), []);

    assert.deepEqual(autoBackup.summarizeBackups(list), { count: 3, totalBytes: 60 });
    assert.deepEqual(autoBackup.summarizeBackups(null), { count: 0, totalBytes: 0 });
  });

  it('decides when a scheduled backup should run', () => {
    const now = 1_000_000_000_000;
    assert.equal(autoBackup.shouldRunBackup({ enabled: false }, now), false);

    // onStartup honors the grace window only on real startups
    const freshOnStartup = { enabled: true, frequency: 'onStartup', lastBackupTime: now - 60_000 };
    assert.equal(autoBackup.shouldRunBackup(freshOnStartup, now, true), false);
    const staleOnStartup = { enabled: true, frequency: 'onStartup', lastBackupTime: now - 10 * 60_000 };
    assert.equal(autoBackup.shouldRunBackup(staleOnStartup, now, true), true);
    // hourly checks treat onStartup as a plain interval
    assert.equal(autoBackup.shouldRunBackup(staleOnStartup, now, false), true);
    assert.equal(autoBackup.shouldRunBackup(freshOnStartup, now, false), false);

    // never backed up
    assert.equal(autoBackup.shouldRunBackup({ enabled: true, frequency: 'daily', lastBackupTime: 0 }, now), true);

    // interval not elapsed
    const daily = { enabled: true, frequency: 'daily', lastBackupTime: now - 60 * 60_000 };
    assert.equal(autoBackup.shouldRunBackup(daily, now), false);
    const staleDaily = { enabled: true, frequency: 'daily', lastBackupTime: now - 25 * 60 * 60_000 };
    assert.equal(autoBackup.shouldRunBackup(staleDaily, now), true);

    // startup catch-up after a missed daily window
    assert.equal(autoBackup.shouldRunBackup(staleDaily, now, true), true);
  });

  it('round-trips autoBackup settings through the shared backup format', () => {
    const backup = buildBackup({
      sidebarOpen: true,
      autoBackup: { enabled: true, frequency: 'hourly', maxBackups: 9, customPath: 'D:\\bk', lastBackupTime: 42 }
    });
    const parsed = parseBackup(backup);
    assert.ok(parsed.ok);
    assert.equal(parsed.settings.autoBackup.frequency, 'hourly');
    assert.equal(parsed.settings.autoBackup.maxBackups, 9);
    assert.equal(parsed.settings.autoBackup.customPath, 'D:\\bk');
    assert.equal(parsed.settings.autoBackup.enabled, true);

    // sanitization still applies on parse
    const parsedDirty = parseBackup({ format: 'cyberviewer-settings', version: 1, settings: { autoBackup: { frequency: 'yearly' } } });
    assert.ok(parsedDirty.ok);
    assert.equal(parsedDirty.settings.autoBackup.frequency, 'daily');
  });
});

describe('auto-backup wiring', () => {
  it('exposes the full auto-backup API in preload.js', () => {
    for (const method of [
      'autoBackupDir', 'autoBackupList', 'autoBackupRun',
      'autoBackupPickFolder', 'autoBackupOpenFolder', 'autoBackupRestore', 'autoBackupDelete'
    ]) {
      assert.ok(preloadJs.includes(`${method}:`), `preload missing ${method}`);
    }
  });

  it('registers every auto-backup IPC handler in main.js', () => {
    for (const channel of [
      "'auto-backup:dir'", "'auto-backup:list'", "'auto-backup:run'",
      "'auto-backup:pick-folder'", "'auto-backup:open-folder'", "'auto-backup:restore'", "'auto-backup:delete'"
    ]) {
      assert.ok(mainJs.includes(`ipcMain.handle(${channel}`), `main.js missing handler for ${channel}`);
    }
  });

  it('initializes the scheduler at startup and on settings changes', () => {
    assert.match(mainJs, /applyToggleHotkey\(settings\.app && settings\.app\.toggleHotkey\);\s*\n\s*initAutoBackup\(\);/);
    const saveStart = mainJs.indexOf("ipcMain.on('save-settings'");
    const saveEnd = mainJs.indexOf("if (newSettings.checkUpdatesOnStartup", saveStart);
    assert.ok(saveStart >= 0 && saveEnd > saveStart);
    const saveCode = mainJs.slice(saveStart, saveEnd);
    assert.match(saveCode, /rescheduleAutoBackup\(\)/);
    assert.match(saveCode, /prevAuto\.enabled !== nextAuto\.enabled/);
  });

  it('writes backups atomically and prunes by retention', () => {
    const perform = extractFunction(mainJs, 'performAutoBackup');
    assert.match(perform, /\.tmp`/);
    assert.match(perform, /fs\.renameSync\(tmpPath, finalPath\)/);
    assert.match(perform, /buildBackup\(settings\.app/);
    assert.match(perform, /lastBackupTime: Date\.now\(\)/);
    assert.match(perform, /pruneOldBackups\(targetDir, ab\.maxBackups, protectedPaths\)/);
    // second-resolution filenames must not collide with an existing backup
    assert.match(perform, /FILENAME_COLLISION/);
    assert.match(perform, /attempt < 5 && fs\.existsSync\(finalPath\)/);
  });

  it('restores only after a safety snapshot and inside the backups dir', () => {
    const restore = extractFunction(mainJs, 'restoreAutoBackup');
    assert.match(restore, /isPathInside\(dir, filePath\)/);
    assert.match(restore, /performAutoBackup\('pre-restore', \{ keepPaths: \[filePath\] \}\)/);
    assert.match(restore, /SAFETY_BACKUP_FAILED/);
    const del = extractFunction(mainJs, 'deleteAutoBackup');
    assert.match(del, /isPathInside\(dir, filePath\)/);
  });

  it('prune never deletes a protected (restore source) file', () => {
    const prune = extractFunction(mainJs, 'pruneOldBackups');
    assert.match(prune, /protectedPaths = new Set\(/);
    assert.match(prune, /\.filter\(\(item\) => !protectedPaths\.has\(item\.filePath\)\)/);
  });

  it('lists backups with corruption flags', () => {
    const list = extractFunction(mainJs, 'listAutoBackups');
    assert.match(list, /readBackupEntry\(dir, file\)/);
    const read = extractFunction(mainJs, 'readBackupEntry');
    assert.match(read, /info\.valid = false/);
    assert.match(read, /parseBackup\(/);
  });

  it('ships the auto-backup config UI with all controls', () => {
    for (const id of [
      'cfg-autobackup-enabled', 'cfg-autobackup-body', 'cfg-autobackup-frequency',
      'cfg-autobackup-max', 'cfg-autobackup-path', 'cfg-autobackup-browse',
      'cfg-autobackup-open', 'cfg-autobackup-reset', 'cfg-autobackup-status',
      'cfg-autobackup-run', 'cfg-autobackup-list', 'cfg-autobackup-empty'
    ]) {
      assert.ok(html.includes(`id="${id}"`), `HTML missing #${id}`);
    }
    const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    assert.match(appJs, /autoBackup: collectAutoBackupSettings\(\)/);
    assert.match(appJs, /if \(id === 'backup'\) refreshAutoBackupControls\(\);/);
  });

  it('has bilingual i18n for every auto-backup string', () => {
    const keys = Object.keys(uiI18n.en).filter(k => k.startsWith('cfg_autobackup_') || k.startsWith('toast_autobackup_'));
    assert.ok(keys.length >= 30, `expected a full set of auto-backup keys, got ${keys.length}`);
    for (const key of keys) {
      assert.ok(uiI18n.es[key], `missing ES translation for ${key}`);
    }
    assert.ok(menuI18n.en.dialog_backup_pick_folder_title);
    assert.ok(menuI18n.es.dialog_backup_pick_folder_title);
  });
});
