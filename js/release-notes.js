'use strict';

/**
 * Localized GitHub release-notes selector (CyberPaste/CyberClock pattern).
 *
 * Release bodies ship English first plus a Spanish <details> block
 * (<summary>...Español...</summary>). extractLocalizedReleaseNotes picks the
 * section matching the user's language: Spanish users see only the Spanish
 * notes, everyone else sees the English notes with the Spanish block removed.
 * Downloads tables, checksums and footers never reach the in-app preview.
 * UMD: browser → window.CVReleaseNotes; Node → module.exports
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CVReleaseNotes = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  function sanitizeReleaseNotes(text) {
    return (
      String(text || '')
        // Strip HTML comments
        .replace(/<!--[\s\S]*?-->/g, '')
        // Strip header logo paragraphs
        .replace(/<p\s+align=["']center["']>[\s\S]*?<\/p>/gi, '')
        // Normalize structural HTML (atom-style bodies) to markdown-ish lines
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<h[1-6][^>]*>/gi, '### ')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^>]+>/g, '')
        // Decode entities left by HTML bodies
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        // Strip release title if duplicate (e.g. ## 🖼️ CyberViewer v1.18.0: Release Notes)
        .replace(/^#{1,6}\s*.*?CyberViewer\s+v?[\d.]+:?\s*Release Notes\s*$/gim, '')
        // Strip download / asset tables and checksum sections from the preview
        .replace(/#{2,4}\s*(?:📦\s*)?(?:Downloads|Descargas)[\s\S]*/i, '')
        .replace(/#{2,4}\s*(?:🔐\s*)?(?:Checksums|Sumas de verificación|VirusTotal)[\s\S]*/i, '')
        // Strip footer
        .replace(/\*Crafted with precision[\s\S]*/i, '')
        // Strip introductory blockquotes
        .replace(/^>\s*\*\*.*?(?:New to CyberViewer|Nuevo en CyberViewer).*?(?:\r?\n|$)/gim, '')
        // Normalize excessive newlines
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  }

  function normalizeReleaseLang(lang) {
    const raw = String(lang || '').toLowerCase().split('-')[0];
    if (!raw || raw === 'auto') {
      if (typeof navigator !== 'undefined' && navigator.language) {
        return navigator.language.toLowerCase().split('-')[0] || 'en';
      }
      return 'en';
    }
    return raw;
  }

  const SPANISH_DETAILS_REGEX =
    /<details>[\s\S]*?<summary>[\s\S]*?(?:español|spanish)[\s\S]*?<\/summary>([\s\S]*?)<\/details>/i;
  const SPANISH_HEADING_REGEX =
    /#{2,4}\s*(?:.*?(?:español|novedades|cambios).*?)\r?\n([\s\S]*?)(?=(?:#{2,4}\s)|<\/details>|$)/i;
  const SPANISH_MARKER_REGEX = /Ver notas de la versi[oó]n en Espa[nñ]ol[\s\S]*$/i;

  function extractLocalizedReleaseNotes(body, lang) {
    if (!body) return '';
    const code = normalizeReleaseLang(lang);

    // 0. Keep only this language's explicit <!-- lang:xx --> blocks; the
    //    others must not leak into the fallback paths below.
    const scoped = body.replace(
      /<!--\s*lang:([a-z-]+)\s*-->([\s\S]*?)<!--\s*\/lang:\1\s*-->/gi,
      (block, blockLang) => (String(blockLang).toLowerCase() === code ? block : '')
    );

    // 1. Explicit comment tags: <!-- lang:es --> ... <!-- /lang:es -->
    const commentRegex = new RegExp(
      `<!--\\s*lang:${code}\\s*-->([\\s\\S]*?)<!--\\s*/lang:${code}\\s*-->`,
      'i'
    );
    const commentMatch = scoped.match(commentRegex);
    if (commentMatch && commentMatch[1] && commentMatch[1].trim()) {
      return sanitizeReleaseNotes(commentMatch[1].trim());
    }

    // 2. Spanish section: <details> block, flattened marker section, or a
    //    Spanish header section (in that order).
    if (code === 'es') {
      const detailsMatch = scoped.match(SPANISH_DETAILS_REGEX);
      if (detailsMatch && detailsMatch[1] && detailsMatch[1].trim()) {
        return sanitizeReleaseNotes(detailsMatch[1].trim());
      }
      // Flattened fallback (no <details> structure): the Spanish section runs
      // from the line after the "Ver notas ... Español" marker to the end.
      const markerMatch = scoped.match(SPANISH_MARKER_REGEX);
      if (markerMatch) {
        const after = markerMatch[0].split('\n').slice(1).join('\n');
        if (after.trim()) return sanitizeReleaseNotes(after);
      }
      const headingMatch = scoped.match(SPANISH_HEADING_REGEX);
      if (headingMatch && headingMatch[1] && headingMatch[1].trim()) {
        return sanitizeReleaseNotes(headingMatch[1].trim());
      }
    }

    // 3. Fallback: strip Spanish details blocks and flattened Spanish sections
    // so other languages stay clean.
    const cleaned = scoped
      .replace(SPANISH_DETAILS_REGEX, '')
      .replace(/🌐\s*Ver notas de la versi[oó]n en Espa[nñ]ol[\s\S]*$/i, '');
    return sanitizeReleaseNotes(cleaned);
  }

  return {
    sanitizeReleaseNotes,
    normalizeReleaseLang,
    extractLocalizedReleaseNotes
  };
}));
