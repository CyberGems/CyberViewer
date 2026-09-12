const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const preloadJs = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const uiI18n = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));
const menuI18n = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'menu.json'), 'utf8'));

describe('desktop wallpaper feature', () => {
  it('registers set-wallpaper IPC handler and handles styles in main.js', () => {
    assert.match(mainJs, /ipcMain\.handle\('set-wallpaper'/);
    assert.match(mainJs, /'fill':\s*'10'/);
    assert.match(mainJs, /'fit':\s*'6'/);
    assert.match(mainJs, /'center':\s*'0'/);
    assert.match(mainJs, /'span':\s*'22'/);
    assert.match(mainJs, /SystemParametersInfo\(0x0014/);
  });

  it('exposes setWallpaper in preload.js', () => {
    assert.match(preloadJs, /setWallpaper:\s*\(path,\s*style\)\s*=>\s*ipcRenderer\.invoke\('set-wallpaper',\s*path,\s*style\)/);
  });

  it('contains bilingual translations for wallpaper actions and styles', () => {
    // ui.json (English and Spanish)
    assert.equal(uiI18n.en.menu_set_wallpaper, 'Set as wallpaper');
    assert.equal(uiI18n.es.menu_set_wallpaper, 'Establecer como fondo de pantalla');
    assert.equal(uiI18n.en.wallpaper_style_fill, 'Fill');
    assert.equal(uiI18n.es.wallpaper_style_fill, 'Rellenar');
    assert.equal(uiI18n.en.wallpaper_style_fit, 'Fit');
    assert.equal(uiI18n.es.wallpaper_style_fit, 'Ajustar');
    assert.equal(uiI18n.en.wallpaper_style_center, 'Center');
    assert.equal(uiI18n.es.wallpaper_style_center, 'Centrar');
    assert.equal(uiI18n.en.wallpaper_style_span, 'Span');
    assert.equal(uiI18n.es.wallpaper_style_span, 'Extender');
    assert.ok(uiI18n.en.toast_wallpaper_set);
    assert.ok(uiI18n.es.toast_wallpaper_set);

    // menu.json
    assert.equal(menuI18n.en.set_wallpaper, 'Set as wallpaper');
    assert.equal(menuI18n.es.set_wallpaper, 'Establecer como fondo de pantalla');
  });

  it('includes wallpaper submenu in main menu HTML', () => {
    assert.match(html, /data-i18n="menu_set_wallpaper"/);
    assert.match(html, /data-action="set-wallpaper-fill"/);
    assert.match(html, /data-action="set-wallpaper-fit"/);
    assert.match(html, /data-action="set-wallpaper-center"/);
    assert.match(html, /data-action="set-wallpaper-span"/);
  });

  it('wires wallpaper submenu in app.js context menus and action dispatchers', () => {
    assert.match(appJs, /async function setAsWallpaper/);
    assert.match(appJs, /case 'set-wallpaper-fill':\s*setAsWallpaper\(null,\s*'fill'\);/);
    assert.match(appJs, /case 'set-wallpaper-fit':\s*setAsWallpaper\(null,\s*'fit'\);/);
    assert.match(appJs, /case 'set-wallpaper-center':\s*setAsWallpaper\(null,\s*'center'\);/);
    assert.match(appJs, /case 'set-wallpaper-span':\s*setAsWallpaper\(null,\s*'span'\);/);
    assert.match(appJs, /case 'set-wallpaper':\s*setAsWallpaper/);
    assert.match(appJs, /'monitor':\s*'<rect/);
  });
});
