'use strict';

/**
 * Theme bootstrap.
 *
 * Runs in <head>, before the stylesheets and the app bundle, so the very first
 * paint already uses the saved theme instead of flashing the dark default and
 * then repainting. main.js passes the saved theme and accent on the load URL;
 * the localStorage mirror covers reloads where the query is absent.
 *
 * Only the tokens that JS owns inline (the accent family) and the early
 * background are set here. Everything else comes from the theme blocks in
 * app.css, keyed off the data-theme attribute set below.
 */
(function () {
  const THEMES = ['cyberviewer', 'gray', 'light'];
  const BASE = { cyberviewer: '#080a0e', gray: '#0d0d0d', light: '#eef1f6' };
  const GRAY_ACCENT = '#c9c9c9';
  const GRAY_ACCENT_RGB = '201, 201, 201';
  const GRAY_ACCENT_INK = '#dcdcdc';

  function readParam(name) {
    try {
      const match = new RegExp('[?&]' + name + '=([^&]+)').exec(window.location.search);
      return match ? decodeURIComponent(match[1]) : '';
    } catch (_) { return ''; }
  }

  function readStored(key) {
    try { return window.localStorage.getItem(key) || ''; } catch (_) { return ''; }
  }

  let theme = readParam('theme') || readStored('cv_theme');
  if (THEMES.indexOf(theme) === -1) theme = 'cyberviewer';

  let accent = readParam('accent') || readStored('cv_accent');
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) accent = '#00d4ff';

  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function rgbString(hex) {
    const c = hexToRgb(hex);
    return c.r + ', ' + c.g + ', ' + c.b;
  }

  // The neon accents have almost no contrast as text on a light surface, so the
  // light theme draws accent *text* with a per-accent ink tuned for pale
  // surfaces, and hover fills with a slightly darker bright. Fills, borders and
  // the swatch chip keep the vivid accent. Unknown accents fall back to the old
  // uniform darken.
  function darken(hex, factor) {
    const c = hexToRgb(hex);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
    return '#' + [ch(c.r), ch(c.g), ch(c.b)]
      .map((v) => ('0' + v.toString(16)).slice(-2))
      .join('');
  }

  // Light-theme tones per accent swatch (the data-color values in
  // CyberViewer.html). Hues reuse the semantic colours already tuned in the
  // light theme block of app.css (accent2/3, danger, star, brand-accent).
  const LIGHT_ACCENT_INK = {
    '#00d4ff': '#0284c7',
    '#ff2d78': '#c01a58',
    '#a8ff3e': '#467f00',
    '#ffae00': '#b45309',
    '#b967ff': '#7c3aed',
    '#4d8dff': '#1d4ed8',
    '#ff5c6c': '#c81e1e',
    '#45e0c0': '#0f766e'
  };
  const LIGHT_ACCENT_BRIGHT = {
    '#00d4ff': '#0596c4',
    '#ff2d78': '#d6336c',
    '#a8ff3e': '#4f8f00',
    '#ffae00': '#d97706',
    '#b967ff': '#8b5cf6',
    '#4d8dff': '#2563eb',
    '#ff5c6c': '#dc2626',
    '#45e0c0': '#0d9488'
  };

  const root = document.documentElement;
  root.setAttribute('data-theme', theme);

  root.style.setProperty('--cyber-accent', theme === 'gray' ? GRAY_ACCENT : accent);
  root.style.setProperty('--cyber-accent-rgb', theme === 'gray' ? GRAY_ACCENT_RGB : rgbString(accent));
  if (theme === 'light') {
    const key = accent.toLowerCase();
    root.style.setProperty('--cyber-accent-ink', LIGHT_ACCENT_INK[key] || darken(accent, 0.62));
    root.style.setProperty('--cyber-accent-bright', LIGHT_ACCENT_BRIGHT[key] || darken(accent, 0.62));
  } else {
    root.style.setProperty('--cyber-accent-ink', theme === 'gray' ? GRAY_ACCENT_INK : accent);
  }

  // Paint the frame in the theme's base colour before the stylesheets land.
  root.style.setProperty('--cyber-black', BASE[theme] || BASE.cyberviewer);
  root.style.setProperty('--cyber-color-scheme', theme === 'light' ? 'light' : 'dark');

  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? 'light' : 'dark');
})();
