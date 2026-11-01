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
  it('offers independent image, video and audio checkboxes in both languages', () => {
    assert.match(nsh, /LangString CV_VideoViewerCheckbox 1033 "Set CyberViewer as the default video player"/);
    assert.match(nsh, /LangString CV_VideoViewerCheckbox 3082 "Establecer CyberViewer como el reproductor de video predeterminado"/);
    assert.match(nsh, /LangString CV_AudioViewerCheckbox 1033 "Set CyberViewer as the default audio player"/);
    assert.match(nsh, /LangString CV_AudioViewerCheckbox 3082 "Establecer CyberViewer como el reproductor de audio predeterminado"/);
    assert.match(nsh, /NSD_CreateCheckbox[^\n]+CV_AudioViewerCheckbox[^\n]*\r?\n\s*Pop \$R6/);
    assert.match(nsh, /NSD_GetState\} \$R6 \$R6/);
    assert.match(nsh, /insertmacro CV_WriteFileAssoc "\.mp4"\s+"CyberViewer\.video"/);
    assert.match(nsh, /insertmacro CV_WriteFileAssoc "\.mkv"\s+"CyberViewer\.video"/);
    assert.match(nsh, /insertmacro CV_WriteFileAssoc "\.mp3"\s+"CyberViewer\.audio"/);
    assert.match(nsh, /insertmacro CV_WriteFileAssoc "\.wav"\s+"CyberViewer\.audio"/);
    // Each group has its own saved choice, including silent-install defaults.
    assert.match(nsh, /StrCpy \$R9 1/);
    assert.match(nsh, /StrCpy \$R7 1/);
    assert.match(nsh, /StrCpy \$R6 1/);
    assert.match(nsh, /insertmacro CV_WriteFileAssoc "\.jpg"\s+"CyberViewer\.jpg"/);
  });

  it('keeps audio registration independent of the video checkbox', () => {
    const install = nsh.split('!macro customInstall')[1].split('!macroend')[0];
    const audioBlocks = [...install.matchAll(/\$\{If\} \$R6 == 1([\s\S]*?)\$\{EndIf\}/g)];
    assert.equal(audioBlocks.length, 2, 'Separate audio ProgID and capabilities blocks');
    assert.match(audioBlocks[0][1], /CV_WriteFileAssoc "\.mp3"/);
    assert.match(audioBlocks[0][1], /CV_WriteFileAssoc "\.wav"/);
    assert.match(audioBlocks[1][1], /FileAssociations" "\.mp3"/);
    assert.match(audioBlocks[1][1], /FileAssociations" "\.wav"/);
    const audioExts = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'aac', 'm4a'];
    const pkg = JSON.parse(read('package.json'));
    assert.deepEqual(pkg.build.win.fileAssociations.find(group => group.name === 'Audio').ext, audioExts);
    for (const ext of audioExts) {
      assert.match(audioBlocks[0][1], new RegExp(`CV_WriteFileAssoc "\\.${ext}"\\s+"CyberViewer\\.audio"`));
      assert.ok(audioBlocks[1][1].includes(`FileAssociations" ".${ext}" "CyberViewer.audio"`));
      assert.match(nsh, new RegExp(`\\$\\{If\\} \\$R8 == "CyberViewer\\.audio"\\s*DeleteRegValue HKCU "Software\\\\Classes\\\\\\.${ext}" ""`));
      assert.ok(mainJs.includes(`{ ext: '.${ext}', progid: 'CyberViewer.audio', group: 'audio' }`));
      assert.ok(html.match(/id="file-input" accept="([^"]+)"/)[1].split(',').includes('.' + ext));
    }
    assert.match(install, /\$\{OrIf\} \$R6 == 1\s*WriteRegStr HKCU "Software\\RegisteredApplications"/);
  });

  it('cleans up video and image registrations without touching third-party defaults', () => {
    assert.match(nsh, /DeleteRegKey HKCU "Software\\Classes\\CyberViewer\.video"/);
    assert.match(nsh, /DeleteRegKey HKCU "Software\\Classes\\CyberViewer\.audio"/);
    // Extension defaults are cleared only when they still point at us
    assert.match(nsh, /ReadRegStr \$R8 HKCU "Software\\Classes\\\.mp4" ""/);
    assert.match(nsh, /\${If} \$R8 == "CyberViewer\.video"\s*DeleteRegValue HKCU "Software\\Classes\\\.mp4" ""/);
    assert.match(nsh, /\${If} \$R8 == "CyberViewer\.audio"\s*DeleteRegValue HKCU "Software\\Classes\\\.mp3" ""/);
    assert.match(nsh, /\${If} \$R8 == "CyberViewer\.audio"\s*DeleteRegValue HKCU "Software\\Classes\\\.wav" ""/);
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
