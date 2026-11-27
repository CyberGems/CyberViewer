/* global state */
'use strict';

window.CVAudioEqualizer = (() => {
  const panel = document.getElementById('audio-equalizer-panel');
  const toggle = document.getElementById('audio-equalizer-toggle');
  const power = document.getElementById('audio-equalizer-power');
  const powerLabel = document.getElementById('audio-equalizer-power-label');
  const preset = document.getElementById('audio-equalizer-preset');
  const savePreset = document.getElementById('audio-equalizer-save-preset');
  const renamePreset = document.getElementById('audio-equalizer-rename-preset');
  const deletePreset = document.getElementById('audio-equalizer-delete-preset');
  const presetEditor = document.getElementById('audio-equalizer-preset-editor');
  const presetEditorLabel = document.getElementById('audio-equalizer-preset-editor-label');
  const presetName = document.getElementById('audio-equalizer-preset-name');
  const presetError = document.getElementById('audio-equalizer-preset-error');
  const presetConfirm = document.getElementById('audio-equalizer-preset-confirm');
  const presetConfirmLabel = document.getElementById('audio-equalizer-preset-confirm-label');
  const presetCancel = document.getElementById('audio-equalizer-preset-cancel');
  const preamp = document.getElementById('audio-equalizer-preamp');
  const preampValue = document.getElementById('audio-equalizer-preamp-value');
  const reset = document.getElementById('audio-equalizer-reset');
  const close = document.getElementById('audio-equalizer-close');
  const bandsHost = document.getElementById('audio-equalizer-bands');
  const line = document.getElementById('audio-equalizer-line');
  const area = document.getElementById('audio-equalizer-area');
  const nodesHost = document.getElementById('audio-equalizer-nodes');
  const status = document.getElementById('audio-equalizer-status');
  const svgNs = 'http://www.w3.org/2000/svg';
  const controls = [];
  let initialized = false, opened = false, saveTimer = 0, presetSignature = '';
  let editing = null;

  const language = () => document.documentElement.lang || state?.settings?.app?.language || 'en';
  const text = (key, values = {}) => {
    const table = window.CV_I18N?.[language()] || window.CV_I18N?.en || {};
    return String(table[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
  };
  const frequencyLabel = frequency => frequency < 1000 ? `${frequency} Hz`
    : `${Number((frequency / 1000).toFixed(2))} kHz`;
  const gainLabel = gain => gain > 0 ? `+${gain}` : String(gain).replace('-', '−');

  function buildBands() {
    window.CVAudioEngine.bands.forEach((frequency, index) => {
      const band = document.createElement('div');
      band.className = 'audio-equalizer-band';
      const value = document.createElement('output');
      value.className = 'audio-equalizer-band-value';
      const fader = document.createElement('div');
      fader.className = 'audio-equalizer-fader';
      const input = document.createElement('input');
      input.className = 'audio-equalizer-band-input';
      input.type = 'range';
      input.min = '-12'; input.max = '12'; input.step = '1'; input.value = '0';
      const label = frequencyLabel(frequency);
      input.setAttribute('aria-label', text('audio_equalizer_band', { frequency: label }));
      const frequencyText = document.createElement('span');
      frequencyText.className = 'audio-equalizer-frequency';
      frequencyText.textContent = label;
      fader.appendChild(input);
      band.append(value, fader, frequencyText);
      bandsHost.appendChild(band);
      const node = document.createElementNS(svgNs, 'circle');
      node.setAttribute('r', '5.5');
      nodesHost.appendChild(node);
      controls.push({ input, value, node, label });
      input.addEventListener('input', () => {
        window.CVAudioEngine.setBand(index, Number(input.value));
        render(); scheduleSave();
      });
    });
  }

  function curvePath(points) {
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const previous = points[Math.max(0, i - 1)];
      const current = points[i];
      const next = points[i + 1];
      const after = points[Math.min(points.length - 1, i + 2)];
      const controlOneX = current.x + (next.x - previous.x) / 6;
      const controlOneY = current.y + (next.y - previous.y) / 6;
      const controlTwoX = next.x - (after.x - current.x) / 6;
      const controlTwoY = next.y - (after.y - current.y) / 6;
      path += ` C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${next.x} ${next.y}`;
    }
    return path;
  }

  function syncPresetOptions(customPresets) {
    const signature = JSON.stringify(customPresets.map(item => [item.id, item.name]));
    if (signature === presetSignature) return;
    preset.querySelectorAll('option[data-custom-preset]').forEach(option => option.remove());
    const anchor = preset.querySelector('option[value="custom"]');
    customPresets.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      option.dataset.customPreset = 'true';
      preset.insertBefore(option, anchor);
    });
    presetSignature = signature;
    window.CVConfigSelects.sync();
  }

  function presetLabel(settings) {
    if (settings.preset === 'custom') return text('audio_equalizer_custom');
    if (window.CVAudioEngine.presets[settings.preset]) return text(`audio_equalizer_${settings.preset}`);
    return settings.customPresets.find(item => item.id === settings.preset)?.name || text('audio_equalizer_custom');
  }

  function selectedCustomPreset(settings) {
    return settings.customPresets.find(item => item.id === settings.preset);
  }

  function renderPresetEditor() {
    if (!editing) {
      presetEditor.hidden = true;
      return;
    }
    const settings = window.CVAudioEngine.snapshot();
    const selected = selectedCustomPreset(settings);
    presetEditor.hidden = false;
    presetName.hidden = editing.mode === 'delete';
    presetEditorLabel.textContent = editing.mode === 'delete'
      ? text('audio_equalizer_delete_confirm', { name: selected?.name || '' })
      : text('audio_equalizer_preset_name');
    presetEditorLabel.dataset.i18n = editing.mode === 'delete' ? '' : 'audio_equalizer_preset_name';
    presetConfirmLabel.textContent = text(`audio_equalizer_${editing.mode}_preset`);
    presetConfirmLabel.dataset.i18n = `audio_equalizer_${editing.mode}_preset`;
  }

  function beginPresetEdit(mode) {
    const settings = window.CVAudioEngine.snapshot();
    const selected = selectedCustomPreset(settings);
    if (mode !== 'save' && !selected) return;
    editing = { mode, id: selected?.id || null };
    presetError.hidden = true;
    presetError.removeAttribute('data-i18n');
    if (mode === 'save') {
      let number = settings.customPresets.length + 1;
      let name = text('audio_equalizer_new_preset', { number });
      while (settings.customPresets.some(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        name = text('audio_equalizer_new_preset', { number: ++number });
      }
      presetName.value = name;
    } else presetName.value = selected.name;
    renderPresetEditor();
    if (mode !== 'delete') requestAnimationFrame(() => { presetName.focus(); presetName.select(); });
  }

  function cancelPresetEdit(restoreFocus = false) {
    editing = null;
    presetEditor.hidden = true;
    presetName.value = '';
    presetError.hidden = true;
    presetError.removeAttribute('data-i18n');
    if (restoreFocus) savePreset.focus();
  }

  function showPresetError(key) {
    presetError.textContent = text(key);
    presetError.dataset.i18n = key;
    presetError.hidden = false;
  }

  function finishPresetEdit() {
    if (!editing) return;
    const mode = editing.mode;
    if (mode === 'delete') {
      window.CVAudioEngine.deleteCustomPreset(editing.id);
      cancelPresetEdit();
      render();
      scheduleSave();
      return;
    }
    const name = presetName.value.trim().replace(/\s+/g, ' ');
    if (!name) {
      showPresetError('audio_equalizer_name_required');
      presetName.focus();
      return;
    }
    const duplicate = window.CVAudioEngine.getCustomPresets().some(item =>
      (mode !== 'rename' || item.id !== editing.id) && item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (duplicate) {
      showPresetError('audio_equalizer_name_exists');
      presetName.focus();
      return;
    }
    const saved = mode === 'save'
      ? window.CVAudioEngine.saveCustomPreset(name)
      : window.CVAudioEngine.renameCustomPreset(editing.id, name);
    if (!saved) {
      showPresetError(mode === 'save' ? 'audio_equalizer_preset_limit' : 'audio_equalizer_name_exists');
      return;
    }
    cancelPresetEdit();
    render();
    scheduleSave();
  }

  function render() {
    const settings = window.CVAudioEngine.snapshot();
    syncPresetOptions(settings.customPresets);
    const customSelected = selectedCustomPreset(settings);
    savePreset.disabled = settings.customPresets.length >= 50;
    renamePreset.disabled = !customSelected;
    deletePreset.disabled = !customSelected;
    panel.dataset.enabled = String(settings.enabled);
    toggle.classList.toggle('is-processing', settings.enabled);
    power.setAttribute('aria-checked', String(settings.enabled));
    powerLabel.textContent = text(settings.enabled ? 'audio_equalizer_on' : 'audio_equalizer_off');
    const nextPreset = settings.preset;
    if (preset.value !== nextPreset) {
      preset.value = nextPreset;
      window.CVConfigSelects.sync();
    }
    preamp.value = String(settings.preamp);
    preamp.style.setProperty('--video-progress', `${(settings.preamp + 12) / 24 * 100}%`);
    preampValue.textContent = `${gainLabel(settings.preamp)} dB`;
    const points = controls.map((control, index) => {
      const gain = settings.gains[index];
      control.input.value = String(gain);
      control.input.style.setProperty('--eq-progress', `${(gain + 12) / 24 * 100}%`);
      control.input.setAttribute('aria-valuetext', `${gainLabel(gain)} dB`);
      control.value.textContent = gainLabel(gain);
      const point = { x: 50 + index * 100, y: 86 - gain / 12 * 70 };
      control.node.setAttribute('cx', String(point.x));
      control.node.setAttribute('cy', String(point.y));
      return point;
    });
    const path = curvePath(points);
    line.setAttribute('d', path);
    area.setAttribute('d', `${path} L 950 164 L 50 164 Z`);
    status.textContent = `${text(settings.enabled ? 'audio_equalizer_on' : 'audio_equalizer_off')} · ${presetLabel(settings)}`;
    renderPresetEditor();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = 0;
      if (!state?.settings?.app) return;
      state.settings.app.audioEqualizer = window.CVAudioEngine.snapshot();
      window.electronAPI?.saveSettings(state.settings.app);
    }, 120);
  }

  function setOpen(value, restoreFocus = false) {
    opened = value === true;
    panel.hidden = !opened;
    toggle.setAttribute('aria-expanded', String(opened));
    if (opened) {
      window.CVVideo.closeMenu();
      render();
    } else {
      cancelPresetEdit();
      window.CVConfigSelects.close();
    }
    window.CVVideo.reveal();
    if (restoreFocus) (opened ? power : toggle).focus();
  }

  function setAvailable(value) {
    toggle.disabled = value !== true;
    if (toggle.disabled) setOpen(false);
  }

  function initialize() {
    if (initialized) return;
    buildBands();
    window.setCyberTooltip(renamePreset, text('audio_equalizer_rename_preset'));
    window.setCyberTooltip(deletePreset, text('audio_equalizer_delete_preset'));
    window.ttBind(renamePreset);
    window.ttBind(deletePreset);
    toggle.addEventListener('click', () => setOpen(!opened, true));
    close.addEventListener('click', () => setOpen(false, true));
    savePreset.addEventListener('click', () => beginPresetEdit('save'));
    renamePreset.addEventListener('click', () => beginPresetEdit('rename'));
    deletePreset.addEventListener('click', () => beginPresetEdit('delete'));
    presetConfirm.addEventListener('click', finishPresetEdit);
    presetCancel.addEventListener('click', () => cancelPresetEdit(true));
    presetName.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finishPresetEdit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancelPresetEdit(true);
      }
    });
    reset.addEventListener('click', () => {
      cancelPresetEdit();
      window.CVAudioEngine.reset(); render(); scheduleSave();
    });
    power.addEventListener('click', () => {
      window.CVAudioEngine.setEnabled(!window.CVAudioEngine.isEnabled());
      render(); scheduleSave();
      if (window.CVAudioEngine.isEnabled()) void window.CVAudioEngine.prepare().then(render);
    });
    preset.addEventListener('change', () => {
      cancelPresetEdit();
      window.CVAudioEngine.applyPreset(preset.value); render(); scheduleSave();
    });
    preamp.addEventListener('input', () => {
      window.CVAudioEngine.setPreamp(Number(preamp.value)); render(); scheduleSave();
    });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      if (editing) cancelPresetEdit(true);
      else setOpen(false, true);
    });
    initialized = true;
    render();
  }

  function applySettings(value) {
    const settings = window.CVAudioEngine.load(value);
    if (initialized) render();
    if (settings.enabled && window.CVVideo.active() && !window.CVVideo.element.paused) {
      void window.CVAudioEngine.prepare().then(render);
    }
    return settings;
  }

  function localize() {
    controls.forEach(control => control.input.setAttribute('aria-label',
      text('audio_equalizer_band', { frequency: control.label })));
    window.setCyberTooltip(renamePreset, text('audio_equalizer_rename_preset'));
    window.setCyberTooltip(deletePreset, text('audio_equalizer_delete_preset'));
    if (presetError.dataset.i18n) presetError.textContent = text(presetError.dataset.i18n);
    presetSignature = '';
    if (initialized) render();
    else powerLabel.textContent = text(window.CVAudioEngine.isEnabled() ? 'audio_equalizer_on' : 'audio_equalizer_off');
  }

  return { initialize, applySettings, localize, setOpen, setAvailable, isOpen: () => opened };
})();
