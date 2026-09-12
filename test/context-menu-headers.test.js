'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const appCss = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
const uiJson = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));
const uiJs = fs.readFileSync(path.join(root, 'i18n', 'ui.js'), 'utf8');

test('context menu headers and canvas close-image', async (t) => {
  await t.test('all context header keys exist in both English and Spanish in ui.json', () => {
    const keys = [
      'ctx_header_image',
      'ctx_header_canvas',
      'ctx_header_canvas_sub',
      'ctx_header_thumb',
      'ctx_header_slideshow',
      'ctx_header_slideshow_sub'
    ];

    for (const lang of ['en', 'es']) {
      for (const key of keys) {
        assert.equal(typeof uiJson[lang][key], 'string', `${lang}.${key} must be a string`);
        assert.ok(uiJson[lang][key].trim().length > 0, `${lang}.${key} must not be empty`);
      }
    }

    assert.equal(uiJson.en.ctx_header_image, 'Image');
    assert.equal(uiJson.es.ctx_header_image, 'Imagen');
    assert.equal(uiJson.en.ctx_header_canvas, 'Canvas');
    assert.equal(uiJson.es.ctx_header_canvas, 'Lienzo');
    assert.equal(uiJson.en.ctx_header_canvas_sub, 'Workspace');
    assert.equal(uiJson.es.ctx_header_canvas_sub, 'Área de trabajo');
    assert.equal(uiJson.en.ctx_header_thumb, 'Thumbnail');
    assert.equal(uiJson.es.ctx_header_thumb, 'Miniatura');
    assert.equal(uiJson.en.ctx_header_slideshow, 'Slideshow');
    assert.equal(uiJson.es.ctx_header_slideshow, 'Presentación');
  });

  await t.test('i18n/ui.js is synchronized with ui.json', () => {
    assert.ok(uiJs.includes('"ctx_header_image":"Image"'), 'ui.js should contain English ctx_header_image');
    assert.ok(uiJs.includes('"ctx_header_image":"Imagen"'), 'ui.js should contain Spanish ctx_header_image');
    assert.ok(uiJs.includes('"ctx_header_canvas":"Canvas"'), 'ui.js should contain English ctx_header_canvas');
    assert.ok(uiJs.includes('"ctx_header_canvas":"Lienzo"'), 'ui.js should contain Spanish ctx_header_canvas');
  });

  await t.test('layout icon is defined in MENU_ICONS', () => {
    assert.ok(appJs.includes("'layout': '<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18M9 21V9\"/>'"), 'layout icon should be defined in MENU_ICONS');
  });

  await t.test('buildMenuTemplate adds discreet header for each context menu type', () => {
    assert.ok(appJs.includes("label: getTxt('ctx_header_thumb')"), 'thumb context menu should have header');
    assert.ok(appJs.includes("label: getTxt('ctx_header_image')"), 'image context menu should have header');
    assert.ok(appJs.includes("label: getTxt('ctx_header_slideshow')"), 'slideshow context menu should have header');
    assert.ok(appJs.includes("label: getTxt('ctx_header_canvas')"), 'canvas context menu should have header');
  });

  await t.test('canvas context menu includes closeImage when hasImages is true', () => {
    assert.ok(appJs.includes("label: getTxt('menu_close_image')"), 'menu_close_image should be referenced');
    assert.ok(appJs.includes("action: () => closeImage()"), 'closeImage action should be hooked up');
    // Verify that hasImages conditionally gates close_image in the canvas menu template:
    const canvasBranchMatch = appJs.match(/variant:\s*'canvas'[\s\S]*?\.\.\.buildOpenFileContextItems[\s\S]*?hasImages\s*\?\s*\[[\s\S]*?menu_close_image[\s\S]*?closeImage\(\)/);
    assert.ok(canvasBranchMatch, 'canvas context menu should conditionally include closeImage when hasImages is true');
  });

  await t.test('renderMenuTemplate handles item.type === "header"', () => {
    assert.ok(appJs.includes("if (item.type === 'header') {"), 'renderMenuTemplate should handle header items');
    assert.ok(appJs.includes("hdr.className = 'menu-header'"), 'renderMenuTemplate should create menu-header class');
    assert.ok(appJs.includes("tag.className = 'menu-header-tag'"), 'renderMenuTemplate should create menu-header-tag');
    assert.ok(appJs.includes("sub.className = 'menu-header-sub'"), 'renderMenuTemplate should create menu-header-sub');
  });

  await t.test('css/app.css contains styling and color accents for menu headers', () => {
    assert.ok(appCss.includes('.menu-header {'), 'CSS should define .menu-header');
    assert.ok(appCss.includes('.menu-header-main {'), 'CSS should define .menu-header-main');
    assert.ok(appCss.includes('.menu-header-icon {'), 'CSS should define .menu-header-icon');
    assert.ok(appCss.includes('.menu-header-tag {'), 'CSS should define .menu-header-tag');
    assert.ok(appCss.includes('.menu-header-sub {'), 'CSS should define .menu-header-sub');
    assert.ok(appCss.includes('.menu-header-image .menu-header-icon'), 'CSS should have .menu-header-image accent');
    assert.ok(appCss.includes('.menu-header-slideshow .menu-header-icon'), 'CSS should have .menu-header-slideshow accent');
    assert.ok(appCss.includes('.menu-header-thumb .menu-header-icon'), 'CSS should have .menu-header-thumb accent');
    assert.ok(appCss.includes('.menu-header-sub-base {'), 'CSS should define .menu-header-sub-base');
    assert.ok(appCss.includes('.menu-header-sub-ext {'), 'CSS should define .menu-header-sub-ext');
  });

  await t.test('preserves filename extension when rendering menu-header-sub', () => {
    assert.ok(appJs.includes('subtitleFilename: imgName'), 'image context menu passes subtitleFilename');
    assert.ok(appJs.includes('splitFilenameExtension(item.subtitleFilename)'), 'renderMenuTemplate uses splitFilenameExtension');
    assert.ok(appJs.includes('menu-header-sub-base'), 'renderMenuTemplate outputs menu-header-sub-base');
    assert.ok(appJs.includes('menu-header-sub-ext'), 'renderMenuTemplate outputs menu-header-sub-ext');
  });
});
