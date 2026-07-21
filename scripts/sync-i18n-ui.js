'use strict';

/**
 * Regenerate i18n/ui.js from i18n/ui.json (source of truth for renderer strings).
 * Usage: npm run i18n:sync
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const jsonPath = path.join(root, 'i18n', 'ui.json');
const jsPath = path.join(root, 'i18n', 'ui.js');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const out =
  '/* Auto-generated from i18n/ui.json — run: npm run i18n:sync */\n' +
  'window.CV_I18N = ' +
  JSON.stringify(data) +
  ';\n';

fs.writeFileSync(jsPath, out, 'utf8');
console.log('Synced', path.relative(root, jsPath), `(${Object.keys(data.en || {}).length} keys)`);
