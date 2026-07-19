'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

let css = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
css = css.replace(/@font-face\s*\{[^}]*\}/g, '');
css = css.replace(/\n{3,}/g, '\n\n');

if (!css.includes('--font-ui:')) {
  css = css.replace(':root {', `:root {\n    --font-ui: ${FONT};`);
}

const replacements = [
  [/font-family:\s*'Exo 2',\s*'Segoe UI',\s*'Helvetica Neue',\s*sans-serif/g, 'font-family: var(--font-ui)'],
  [/font-family:\s*'Exo 2',\s*sans-serif/g, 'font-family: var(--font-ui)'],
  [/font-family:\s*'Share Tech Mono',\s*monospace/g, 'font-family: var(--font-ui)'],
  [/font-family:\s*'Orbitron',\s*sans-serif\s*!important/g, 'font-family: var(--font-ui) !important'],
  [/font-family:\s*'Orbitron',\s*sans-serif/g, 'font-family: var(--font-ui)'],
  [/font-family:\s*'JetBrains Mono',\s*'Roboto Mono',\s*monospace\s*!important/g, 'font-family: var(--font-ui) !important'],
  [/font-family:\s*monospace(?!\s*,)/g, 'font-family: var(--font-ui)']
];

for (const [re, to] of replacements) {
  css = css.replace(re, to);
}

fs.writeFileSync(path.join(root, 'css', 'app.css'), css);

let html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
html = html.replace(/font-family:\s*'Orbitron',\s*sans-serif/g, 'font-family: var(--font-ui)');
html = html.replace(/font-family:\s*'Share Tech Mono',\s*monospace/g, 'font-family: var(--font-ui)');
html = html.replace(/font-family:\s*monospace/g, 'font-family: var(--font-ui)');
fs.writeFileSync(path.join(root, 'CyberViewer.html'), html);

let js = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
js = js.replace(/font-family:'Share Tech Mono',monospace/g, 'font-family:var(--font-ui)');
js = js.replace(/font-family:'Share Tech Mono', monospace/g, 'font-family:var(--font-ui)');
fs.writeFileSync(path.join(root, 'js', 'app.js'), js);

const combined = css + html + js;
const leftover = combined.match(/Exo 2|Orbitron|Share Tech|JetBrains|Roboto Mono/g) || [];
console.log('leftover exotic refs:', leftover);
console.log('has --font-ui:', css.includes('--font-ui:'));
