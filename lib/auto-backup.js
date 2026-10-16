'use strict';

const path = require('path');

const BACKUP_PREFIX = 'cyberviewer_backup_';
const FILENAME_RE = /^cyberviewer_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/;
const FREQUENCIES = ['onStartup', 'hourly', 'daily', 'weekly', 'monthly'];
const DEFAULT_FREQUENCY = 'daily';
const DEFAULT_MAX_BACKUPS = 5;
const MIN_MAX_BACKUPS = 1;
const MAX_MAX_BACKUPS = 50;
const MAX_CUSTOM_PATH_LEN = 260;
const STARTUP_GRACE_MS = 5 * 60 * 1000;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Interval between scheduled runs, in ms. */
function getFrequencyMs(frequency) {
  switch (frequency) {
    case 'onStartup':
      // Grace window: avoid duplicate backups if restarted within 5 minutes
      return STARTUP_GRACE_MS;
    case 'hourly':
      return 60 * 60 * 1000;
    case 'daily':
      return 24 * 60 * 60 * 1000;
    case 'weekly':
      return 7 * 24 * 60 * 60 * 1000;
    case 'monthly':
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}

function normalizeFrequency(value) {
  return FREQUENCIES.includes(value) ? value : DEFAULT_FREQUENCY;
}

function clampMaxBackups(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_MAX_BACKUPS;
  return Math.min(MAX_MAX_BACKUPS, Math.max(MIN_MAX_BACKUPS, n));
}

/** Sanitize the autoBackup block coming from untrusted settings/backup files. */
function pickAutoBackupSettings(src) {
  const out = {
    enabled: false,
    frequency: DEFAULT_FREQUENCY,
    maxBackups: DEFAULT_MAX_BACKUPS,
    customPath: '',
    lastBackupTime: 0
  };
  if (!src || typeof src !== 'object' || Array.isArray(src)) return out;

  out.enabled = src.enabled === true;
  out.frequency = normalizeFrequency(src.frequency);
  out.maxBackups = clampMaxBackups(src.maxBackups);
  if (typeof src.customPath === 'string') {
    const p = src.customPath.trim();
    if (p && p.length <= MAX_CUSTOM_PATH_LEN && !p.includes('\0')) out.customPath = p;
  }
  const last = Number(src.lastBackupTime);
  if (Number.isFinite(last) && last > 0) out.lastBackupTime = Math.floor(last);
  return out;
}

/** cyberviewer_backup_YYYY-MM-DD_HH-mm-ss.json */
function formatBackupFilename(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) d = new Date();
  const stamp = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
  return `${BACKUP_PREFIX}${stamp}.json`;
}

function isBackupFilename(name) {
  return typeof name === 'string' && FILENAME_RE.test(name);
}

/** True when filePath resolves inside dir (guards restore/delete IPC). */
function isPathInside(dir, filePath) {
  if (!dir || !filePath || typeof dir !== 'string' || typeof filePath !== 'string') return false;
  const rel = path.relative(dir, filePath);
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function makeBackupInfo(dir, filename, stats) {
  return {
    filename,
    filePath: path.join(dir, filename),
    timestamp: Math.round(stats && stats.mtimeMs ? stats.mtimeMs : 0),
    sizeBytes: stats && Number.isFinite(stats.size) ? stats.size : 0
  };
}

function sortBackupsNewestFirst(list) {
  return (list || []).slice().sort((a, b) => b.timestamp - a.timestamp);
}

/** Entries beyond maxBackups (input must be newest-first). */
function selectBackupsToPrune(sortedList, maxBackups) {
  const max = clampMaxBackups(maxBackups);
  if (!Array.isArray(sortedList) || sortedList.length <= max) return [];
  return sortedList.slice(max);
}

function summarizeBackups(list) {
  const items = Array.isArray(list) ? list : [];
  return {
    count: items.length,
    totalBytes: items.reduce((acc, item) => acc + (Number(item && item.sizeBytes) || 0), 0)
  };
}

/**
 * Decide whether a scheduled backup should run now.
 * @param {{enabled?: boolean, frequency?: string, lastBackupTime?: number}} settings
 * @param {number} now epoch ms
 * @param {boolean} [isStartup] startup checks may catch up on a missed interval
 */
function shouldRunBackup(settings, now, isStartup = false) {
  const s = pickAutoBackupSettings(settings);
  if (!s.enabled) return false;
  const last = s.lastBackupTime || 0;
  const intervalMs = getFrequencyMs(s.frequency);
  if (isStartup && s.frequency === 'onStartup') {
    return now - last >= STARTUP_GRACE_MS;
  }
  return now - last >= intervalMs;
}

module.exports = {
  BACKUP_PREFIX,
  FILENAME_RE,
  FREQUENCIES,
  DEFAULT_FREQUENCY,
  DEFAULT_MAX_BACKUPS,
  MIN_MAX_BACKUPS,
  MAX_MAX_BACKUPS,
  STARTUP_GRACE_MS,
  getFrequencyMs,
  normalizeFrequency,
  clampMaxBackups,
  pickAutoBackupSettings,
  formatBackupFilename,
  isBackupFilename,
  isPathInside,
  makeBackupInfo,
  sortBackupsNewestFirst,
  selectBackupsToPrune,
  summarizeBackups,
  shouldRunBackup
};
