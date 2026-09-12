'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const ui = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));

function getMenuCategory(i18nKey) {
  const marker = `data-i18n="${i18nKey}"`;
  const start = html.indexOf(marker);
  assert.ok(start >= 0, `Category ${i18nKey} should exist in HTML`);
  const catStart = html.lastIndexOf('<div class="menu-cat"', start);
  assert.ok(catStart >= 0, `Cat start for ${i18nKey} should exist`);
  const match = html.slice(catStart).match(/<\/div>\s*<\/div>/);
  assert.ok(match, `Cat end for ${i18nKey} should exist`);
  return html.slice(catStart, catStart + match.index + match[0].length);
}

test('menu favorites separation', async (t) => {
  await t.test('removes favorites actions from Navegar menu', () => {
    const goMenu = getMenuCategory('menu_go');
    assert.ok(!goMenu.includes('data-action="favorite"'), 'Navegar should not have favorite action');
    assert.ok(!goMenu.includes('data-action="favorite-add"'), 'Navegar should not have favorite-add action');
    assert.ok(!goMenu.includes('data-action="favorite-remove"'), 'Navegar should not have favorite-remove action');
    assert.ok(!goMenu.includes('data-action="favorites-view"'), 'Navegar should not have favorites-view action');
    assert.ok(goMenu.includes('data-action="next"'), 'Navegar should still have next');
    assert.ok(goMenu.includes('data-action="prev"'), 'Navegar should still have prev');
  });

  await t.test('creates dedicated Favoritos menu with Add, Remove, and View Favorites', () => {
    const favMenu = getMenuCategory('menu_favorites');
    assert.ok(favMenu.includes('data-action="favorite-add"'), 'Favoritos menu should contain favorite-add');
    assert.ok(favMenu.includes('data-i18n="menu_favorite_add"'), 'favorite-add should have i18n key');
    assert.ok(favMenu.includes('Ctrl+D'), 'favorite-add should display Ctrl+D shortcut');
    assert.ok(favMenu.includes('data-action="favorite-remove"'), 'Favoritos menu should contain favorite-remove');
    assert.ok(favMenu.includes('data-i18n="menu_favorite_remove"'), 'favorite-remove should have i18n key');
    assert.ok(favMenu.includes('data-action="favorites-view"'), 'Favoritos menu should contain favorites-view');
    assert.ok(favMenu.includes('data-i18n="menu_favs_view"'), 'favorites-view should have i18n key');
  });

  await t.test('keeps bilingual translations for all favorites keys in English and Spanish', () => {
    const keys = ['menu_favorites', 'menu_favorite_add', 'menu_favorite_remove', 'menu_favs_view', 'menu_favs_close'];
    for (const lang of ['en', 'es']) {
      for (const key of keys) {
        assert.equal(typeof ui[lang][key], 'string', `${lang}.${key} should be a string`);
        assert.ok(ui[lang][key].trim().length > 0, `${lang}.${key} should not be empty`);
      }
    }
    assert.equal(ui.en.menu_favorites, 'Favorites');
    assert.equal(ui.es.menu_favorites, 'Favoritos');
    assert.equal(ui.en.menu_favorite_add, 'Add');
    assert.equal(ui.es.menu_favorite_add, 'Agregar');
    assert.equal(ui.en.menu_favorite_remove, 'Remove');
    assert.equal(ui.es.menu_favorite_remove, 'Eliminar');
    assert.equal(ui.en.menu_favs_view, 'Favorites View');
    assert.equal(ui.es.menu_favs_view, 'Ver favoritos');
    assert.equal(ui.en.menu_favs_close, 'Close Favorites');
    assert.equal(ui.es.menu_favs_close, 'Cerrar favoritos');
  });

  await t.test('maps star icon for favorites menu items in app.js', () => {
    assert.match(appJs, /menu_favorites:\s*'star'/);
    assert.match(appJs, /menu_favorite_add:\s*'star'/);
    assert.match(appJs, /menu_favorite_remove:\s*'star'/);
    assert.match(appJs, /menu_favs_close:\s*'star'/);
  });

  await t.test('wires addFavorite and removeFavorite helpers and refresh state', () => {
    assert.match(appJs, /function addFavorite\(\)/);
    assert.match(appJs, /function removeFavorite\(\)/);
    assert.match(appJs, /case 'favorite-add':\s*addFavorite\(\);/);
    assert.match(appJs, /case 'favorite-remove':\s*removeFavorite\(\);/);
    assert.match(appJs, /data-action="favorite-add"/);
    assert.match(appJs, /data-action="favorite-remove"/);
    assert.match(appJs, /state\.showingFavs\s*\?\s*'menu_favs_close'\s*:\s*'menu_favs_view'/);
  });
});
