'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'CyberViewer.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const styleStart = html.indexOf('<style>');
const styleEnd = html.indexOf('</style>');
if (styleStart < 0 || styleEnd < 0) throw new Error('style not found');
const css = html.slice(styleStart + '<style>'.length, styleEnd).replace(/^\r?\n/, '');

const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
if (scriptStart < 0 || scriptEnd < 0) throw new Error('script not found');
const js = html.slice(scriptStart + '<script>'.length, scriptEnd).replace(/^\r?\n/, '');

const bodyStart = html.indexOf('<body>');
const bodyEnd = html.indexOf('<script>');
const bodyInner = html.slice(bodyStart + '<body>'.length, bodyEnd);

fs.mkdirSync(path.join(root, 'css'), { recursive: true });
fs.mkdirSync(path.join(root, 'js'), { recursive: true });
fs.mkdirSync(path.join(root, 'assets', 'fonts'), { recursive: true });

fs.writeFileSync(path.join(root, 'css', 'app.css'), css);
fs.writeFileSync(path.join(root, 'js', 'app.js'), js);

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' blob: data: cvlocal:",
  "connect-src 'self' blob: cvlocal:"
].join('; ');

const newHtml = [
  '<!DOCTYPE html>',
  '<html lang="es">',
  '<head>',
  '<meta charset="UTF-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
  '<meta http-equiv="Content-Security-Policy" content="' + csp + '">',
  '<title>CyberViewer</title>',
  '<link rel="stylesheet" href="css/app.css">',
  '</head>',
  '<body>' + bodyInner + '<script src="js/app.js"></script>',
  '</body>',
  '</html>',
  ''
].join('\n');

fs.writeFileSync(htmlPath, newHtml);
console.log('OK css=', css.length, 'js=', js.length, 'html=', newHtml.length);
