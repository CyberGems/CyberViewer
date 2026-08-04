'use strict';

const ICONS = {
  window: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="10" y1="4" x2="10" y2="8"/><line x1="2" y1="8" x2="22" y2="8"/><line x1="6" y1="4" x2="6" y2="8"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  quit: '<svg viewBox="0 0 24 24"><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><path d="M12 3v9"/></svg>'
};

const api = window.trayMenu;
const root = document.getElementById('root');
const headEl = document.getElementById('head');
const groupEl = document.getElementById('group');
const exitGroupEl = document.getElementById('exitGroup');

function makeItem(def) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'item' + (def.danger ? ' danger' : '');
  btn.setAttribute('role', 'menuitem');

  const iconSpan = document.createElement('span');
  iconSpan.className = 'icon';
  iconSpan.innerHTML = ICONS[def.icon] || '';

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = def.label;

  btn.appendChild(iconSpan);
  btn.appendChild(label);

  if (def.shortcut) {
    const sc = document.createElement('span');
    sc.className = 'shortcut';
    sc.textContent = def.shortcut;
    btn.appendChild(sc);
  }

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    api.action(def.action);
  });
  return btn;
}

function applyState(state) {
  headEl.textContent = state.head || ('CyberViewer v' + (state.version || ''));
  groupEl.replaceChildren(
    makeItem({ action: 'toggle', icon: 'window', label: state.showLabel, shortcut: state.shortcut || '' }),
    makeItem({ action: 'settings', icon: 'settings', label: state.settingsLabel }),
    makeItem({ action: 'about', icon: 'info', label: state.aboutLabel })
  );
  exitGroupEl.replaceChildren(
    makeItem({ action: 'quit', icon: 'quit', label: state.exitLabel, danger: true })
  );
}

function reportReady() {
  const r = root.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return;
  api.ready({ width: r.width, height: r.height });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); api.hide(); }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

if (api) {
  api.onState(applyState);
  api.onShow(() => {
    requestAnimationFrame(() => requestAnimationFrame(reportReady));
  });
}
