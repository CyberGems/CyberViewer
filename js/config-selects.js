'use strict';

// Theme-aware menus for Configuration and the player. The original selects stay
// the source of truth for values, translations and dynamically discovered
// monitors; this replaces only their popup with a styled menu.
window.CVConfigSelects = (() => {
  const modal = document.getElementById('modal-config');
  let opened = null;

  const rowLabel = select => select.closest('.config-row')?.querySelector('.config-name')?.textContent?.trim()
    || select.getAttribute('aria-label') || '';

  function scrollOpened(direction) {
    if (!opened) return;
    const distance = Math.max(48, opened.viewport.clientHeight * .8);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    opened.viewport.scrollBy({ top: direction * distance, behavior: reduced ? 'auto' : 'smooth' });
  }

  function scrollButton(direction) {
    const key = direction < 0 ? 'cfg_select_scroll_up' : 'cfg_select_scroll_down';
    const tables = window.CV_I18N || {};
    const language = document.documentElement.lang || (navigator.language.startsWith('es') ? 'es' : 'en');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cfg-select-scroll';
    button.dataset.i18nAria = key;
    button.setAttribute('aria-label', (tables[language] || tables.en || {})[key] || key);
    button.hidden = true;
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'
      + (direction < 0 ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6') + '"/></svg>';
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('click', () => scrollOpened(direction));
    return button;
  }

  function updateScrollButtons() {
    if (!opened) return;
    const { viewport, scrollUp, scrollDown } = opened;
    const overflow = viewport.scrollHeight > viewport.clientHeight + 1;
    scrollUp.hidden = !overflow;
    scrollDown.hidden = !overflow;
    scrollUp.disabled = viewport.scrollTop <= 1;
    scrollDown.disabled = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1;
  }

  function close(restoreFocus = false) {
    if (!opened) return;
    const { trigger, menu } = opened;
    opened = null;
    menu.remove();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-controls');
    trigger.removeAttribute('aria-activedescendant');
    if (restoreFocus) trigger.focus();
  }

  function sync(select) {
    const trigger = select.parentElement?.querySelector('.cfg-select-trigger');
    if (!trigger) return;
    const value = select.selectedOptions[0]?.textContent?.trim() || '';
    const label = rowLabel(select);
    trigger.querySelector('.cfg-select-value').textContent = value;
    trigger.setAttribute('aria-label', label ? `${label}: ${value}` : value);
    trigger.disabled = select.disabled;
  }

  function syncAll() {
    document.querySelectorAll('select.cfg-select').forEach(sync);
    if (opened) open(opened.select, opened.trigger);
  }

  function position(trigger, menu) {
    const rect = trigger.getBoundingClientRect();
    menu.style.minWidth = `${rect.width}px`;
    const width = menu.getBoundingClientRect().width;
    const height = menu.getBoundingClientRect().height;
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const top = below >= height || below >= above ? rect.bottom + 5 : rect.top - height - 5;
    menu.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, top))}px`;
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width))}px`;
  }

  function open(select, trigger) {
    close();
    sync(select);
    const options = [...select.options].filter(option => !option.hidden);
    const menu = document.createElement('div');
    menu.className = 'cfg-select-menu';
    menu.id = 'cfg-select-listbox';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', rowLabel(select));
    const viewport = document.createElement('div');
    viewport.className = 'cfg-select-options';
    const scrollUp = scrollButton(-1), scrollDown = scrollButton(1);
    menu.append(scrollUp, viewport, scrollDown);
    const items = options.map((option, index) => {
      const item = document.createElement('div');
      item.className = 'cfg-select-option';
      item.id = `cfg-select-option-${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.selected));
      item.textContent = option.textContent;
      if (option.disabled) item.setAttribute('aria-disabled', 'true');
      item.addEventListener('pointerdown', event => event.preventDefault());
      item.addEventListener('click', () => {
        if (option.disabled) return;
        const changed = select.value !== option.value;
        select.value = option.value;
        sync(select);
        close(true);
        if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      viewport.appendChild(item);
      return item;
    });
    opened = { select, trigger, menu, viewport, scrollUp, scrollDown, items, options,
      activeIndex: Math.max(0, options.findIndex(option => option.selected)) };
    viewport.addEventListener('scroll', updateScrollButtons, { passive: true });
    // Anchored to the body so the menu escapes overflow-clipped containers
    // such as the player menu panel.
    document.body.appendChild(menu);
    trigger.setAttribute('aria-controls', menu.id);
    trigger.setAttribute('aria-expanded', 'true');
    position(trigger, menu);
    highlight(opened.activeIndex);
    updateScrollButtons();
    position(trigger, menu);
  }

  function highlight(index) {
    if (!opened) return;
    const { items, trigger } = opened;
    const next = Math.max(0, Math.min(items.length - 1, index));
    opened.activeIndex = next;
    items.forEach((item, i) => item.classList.toggle('is-active', i === next));
    trigger.setAttribute('aria-activedescendant', items[next].id);
    items[next].scrollIntoView({ block: 'nearest' });
    updateScrollButtons();
  }

  function onKeydown(event, select, trigger) {
    if (!opened || opened.trigger !== trigger) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        open(select, trigger);
      }
      return;
    }
    if (event.key !== 'Tab') event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      highlight(opened.activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      highlight(event.key === 'Home' ? 0 : opened.items.length - 1);
    } else if (event.key === 'PageDown' || event.key === 'PageUp') {
      event.preventDefault();
      scrollOpened(event.key === 'PageDown' ? 1 : -1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      opened.items[opened.activeIndex].click();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const start = opened.activeIndex + 1;
      const match = [...opened.options.slice(start), ...opened.options.slice(0, start)]
        .find(option => option.textContent.trim().toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
      if (match) { event.preventDefault(); highlight(opened.options.indexOf(match)); }
    }
  }

  // Give one select the styled trigger and popup. Safe to call more than once.
  function enhance(select) {
    if (!select || select.dataset.cfgEnhanced === 'true') return;
    select.dataset.cfgEnhanced = 'true';
    const shell = document.createElement('span');
    shell.className = 'cfg-select-shell';
    select.before(shell);
    shell.appendChild(select);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cfg-select-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<span class="cfg-select-value"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    shell.appendChild(trigger);
    select.classList.add('is-enhanced');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select.addEventListener('change', () => sync(select));
    trigger.addEventListener('click', () => opened?.trigger === trigger ? close(true) : open(select, trigger));
    trigger.addEventListener('keydown', event => onKeydown(event, select, trigger));
    sync(select);
  }

  document.querySelectorAll('select.cfg-select').forEach(enhance);

  document.addEventListener('pointerdown', event => {
    if (opened && !opened.menu.contains(event.target) && !opened.trigger.contains(event.target)) close();
  });
  modal?.querySelector('.config-content')?.addEventListener('scroll', () => {
    if (opened) { updateScrollButtons(); position(opened.trigger, opened.menu); }
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (opened) { updateScrollButtons(); position(opened.trigger, opened.menu); }
  });
  return { close, sync: syncAll, enhance };
})();
