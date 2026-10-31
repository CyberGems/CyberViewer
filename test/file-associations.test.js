'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const nsh = read('build/installer.nsh');
const mainJs = read('main.js');
const preload = read('preload.js');
const html = read('CyberViewer.html');
const appJs = read('js/app.js');
const updater = read('lib/updater.js');
const css = read('css/app.css');

describe('file association management', () => {
  it('registers video formats from the installer with a dedicated checkbox', () => {
    assert.match(nsh, /LangString CV_VideoViewerCheckbox 1033 "Set CyberViewer as the default video player"/);
    assert.match(nsh, /LangString CV_VideoViewerCheckbox 3082 "Establecer CyberViewer como el reproductor de video predeterminado"/);
    assert.match(nsh, /insertmacro CV_WriteFileAssoc "\.mp4"\s+"CyberViewer\.video"/);
    assert.match(nsh, /insertmacro CV_WriteFileAssoc "\.mkv"\s+"CyberViewer\.video"/);
    // Both groups can be chosen independently
    assert.match(nsh, /StrCpy \$R9 1/);
    assert.match(nsh, /StrCpy \$R7 1/);
    assert.match(nsh, /insertmacro CV_WriteFileAssoc "\.jpg"\s+"CyberViewer\.jpg"/);
  });

  it('cleans up video and image registrations without touching third-party defaults', () => {
    assert.match(nsh, /DeleteRegKey HKCU "Software\\Classes\\CyberViewer\.video"/);
    // Extension defaults are cleared only when they still point at us
    assert.match(nsh, /ReadRegStr \$R8 HKCU "Software\\Classes\\\.mp4" ""/);
    assert.match(nsh, /\${If} \$R8 == "CyberViewer\.video"\s*DeleteRegValue HKCU "Software\\Classes\\\.mp4" ""/);
  });

  it('reports the current viewer per extension from the registry', () => {
    assert.match(mainJs, /FILE_ASSOCIATION_TYPES = \[/);
    assert.match(mainJs, /progid: 'CyberViewer\.video', group: 'video'/);
    assert.match(mainJs, /ipcMain\.handle\('get-file-associations', async \(\) => \{/);
    assert.match(mainJs, /Explorer\\\\FileExts\\\\\$\{ext\}`, 'ProgId'/);
    assert.match(mainJs, /status: current === progid \? 'default' : \(current \? 'other' : 'unset'\)/);
  });

  it('exposes the status and the Windows settings shortcut to the renderer', () => {
    assert.match(preload, /getFileAssociations: \(\) => ipcRenderer\.invoke\('get-file-associations'\)/);
    assert.match(preload, /openDefaultAppsSettings: \(\) => ipcRenderer\.invoke\('open-default-apps-settings'\)/);
    assert.match(updater, /ipcMain\.handle\('open-default-apps-settings', async \(\) => \{\s*await shell\.openExternal\('ms-settings:defaultapps'\);/);
    assert.match(appJs, /async function refreshFileAssociations\(\)/);
    assert.match(appJs, /window\.electronAPI\.openDefaultAppsSettings\(\)/);
  });

  it('renders the granular status group in the System tab', () => {
    assert.match(html, /id="cfg-file-assoc"/);
    assert.match(html, /id="cfg-file-assoc-refresh"/);
    assert.match(html, /id="cfg-file-assoc-settings"/);
    assert.match(html, /data-i18n="cfg_file_assoc"/);
    assert.match(css, /\.cfg-file-assoc-chip\.is-default/);
  });
});
