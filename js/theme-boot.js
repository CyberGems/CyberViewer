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
  // light theme draws accent *text* with a darkened ink. Fills and borders keep
  // the vivid accent.
  function darken(hex, factor) {
    const c = hexToRgb(hex);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
    return '#' + [ch(c.r), ch(c.g), ch(c.b)]
      .map((v) => ('0' + v.toString(16)).slice(-2))
      .join('');
  }

  const root = document.documentElement;
  root.setAttribute('data-theme', theme);

  root.style.setProperty('--cyber-accent', theme === 'gray' ? GRAY_ACCENT : accent);
  root.style.setProperty('--cyber-accent-rgb', theme === 'gray' ? GRAY_ACCENT_RGB : rgbString(accent));
  root.style.setProperty('--cyber-accent-ink', theme === 'gray'
    ? GRAY_ACCENT_INK
    : (theme === 'light' ? darken(accent, 0.62) : accent));

  // Paint the frame in the theme's base colour before the stylesheets land.
  root.style.setProperty('--cyber-black', BASE[theme] || BASE.cyberviewer);
  root.style.setProperty('--cyber-color-scheme', theme === 'light' ? 'light' : 'dark');

  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? 'light' : 'dark');
})();
