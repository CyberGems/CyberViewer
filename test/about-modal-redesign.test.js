const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
const uiI18n = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const preloadJs = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');

const SUITE_SLUGS = [
  'cyberclock', 'cyberlauncher', 'cybermanager', 'cybernotes',
  'cyberpaste', 'cybersnap', 'cybertray', 'cyberwall'
];

describe('About modal redesign (CyberFeeds pattern)', () => {
  it('renders the close-only header with glass decor (no title bar)', () => {
    const start = appJs.indexOf('overlay.innerHTML = `');
    const end = appJs.indexOf('overlay.querySelector(\'#about-close-btn\')', start);
    assert.ok(start >= 0 && end > start);
    const tpl = appJs.slice(start, end);
    // CyberFeeds header: spacer + close button only, no modal-title
    assert.match(tpl, /class="about-header-spacer"/);
    assert.match(tpl, /id="about-close-btn"/);
    assert.doesNotMatch(tpl, /modal-title/);
    // Glass decor behind the content: hairline only (corner glows removed —
    // their brightest core sat on the top edge and read as a hard cut)
    assert.match(tpl, /class="about-glass"/);
    assert.match(tpl, /about-hairline/);
    assert.doesNotMatch(tpl, /about-glow-accent/);
    assert.doesNotMatch(tpl, /about-glow-violet/);
    // close button carries a courtesy tooltip
    assert.match(tpl, /id="about-close-btn" data-tooltip="\$\{t\.close \|\| 'Close'\}"/);
    assert.match(tpl, /class="win-btn modal-close-btn cyber-tooltip"/);
  });

  it('shows the brand, uppercase version label and tagline', () => {
    const start = appJs.indexOf('overlay.innerHTML = `');
    const end = appJs.indexOf('overlay.querySelector(\'#about-close-btn\')', start);
    const tpl = appJs.slice(start, end);
    assert.match(tpl, /class="about-brand"/);
    assert.match(tpl, /about-brand-viewer">Viewer</);
    assert.match(tpl, /class="about-version-label">\$\{versionLabel\}/);
    assert.match(tpl, /\$\{t\.about_tagline \|\| ''\}/);
    // version label comes from i18n with {version} substitution
    assert.match(appJs, /const versionLabel = \(t\.about_version_label \|\| 'VERSION \{version\}'\)/);
    assert.match(appJs, /\.replace\('\{version\}', version \|\|/);
  });

  it('sections updates and the suite with divider-lined titles', () => {
    const start = appJs.indexOf('overlay.innerHTML = `');
    const end = appJs.indexOf('overlay.querySelector(\'#about-close-btn\')', start);
    const tpl = appJs.slice(start, end);
    assert.match(tpl, /class="about-section-title">\s*<span class="about-section-rule"><\/span>/);
    assert.match(tpl, /about_updates_heading \|\| t\.menu_updates \|\| 'Updates'/);
    assert.match(tpl, /about_suite_title \|\| 'More from CyberGems'/);
    assert.match(tpl, /class="about-maintenance"/);
  });

  it('uses the CyberFeeds switch for the startup auto-check toggle', () => {
    const start = appJs.indexOf('overlay.innerHTML = `');
    const end = appJs.indexOf('overlay.querySelector(\'#about-close-btn\')', start);
    const tpl = appJs.slice(start, end);
    assert.match(tpl, /id="about-auto-update-toggle" role="switch"/);
    assert.match(tpl, /class="custom-switch \$\{state\.settings\.app\.checkUpdatesOnStartup !== false \? 'active' : ''\}"/);
    // toggle is a button driven by click, syncing aria-checked + the switch class
    assert.match(appJs, /autoToggle\.addEventListener\('click', \(\) => \{[\s\S]*?checkUpdatesOnStartup[\s\S]*?syncAutoToggle\(\);/);
    assert.match(appJs, /autoToggle\.setAttribute\('aria-checked', on \? 'true' : 'false'\)/);
    // old checkbox wiring is gone
    assert.doesNotMatch(appJs, /about-startup-update-toggle/);
  });

  it('picks 4 random sibling apps from local suite icons (offline-safe)', () => {
    // pool lists every sibling app but never CyberViewer itself
    const suiteStart = appJs.indexOf('const suitePool');
    const suiteEnd = appJs.indexOf('overlay.innerHTML', suiteStart);
    assert.ok(suiteStart >= 0 && suiteEnd > suiteStart);
    const suiteCode = appJs.slice(suiteStart, suiteEnd);
    for (const slug of SUITE_SLUGS) {
      assert.match(suiteCode, new RegExp(`slug: '${slug}', key: 'about_suite_`));
    }
    assert.doesNotMatch(suiteCode, /slug: 'cyberviewer'/);
    assert.match(appJs, /while \(suitePicks\.length < 4 && pool\.length > 0\)/);
    // each strip item links to the app page with a localized pitch tooltip
    assert.match(suiteCode, /assets\/suite\/\$\{app\.slug\}\.png/);
    assert.match(suiteCode, /cybergems\.org\/apps\/\$\{app\.slug\}\//);
    assert.match(suiteCode, /data-tooltip="\$\{pitch\}"/);
    const start = appJs.indexOf('overlay.innerHTML = `');
    const end = appJs.indexOf('overlay.querySelector(\'#about-close-btn\')', start);
    const tpl = appJs.slice(start, end);
    assert.match(tpl, /\$\{suiteHtml\}/);
    assert.match(tpl, /about_suite_more \|\| 'View all →'/);
    assert.match(tpl, /cybergems\.org\/#apps/);
  });

  it('ships the suite icon assets', () => {
    for (const slug of SUITE_SLUGS) {
      const p = path.join(root, 'assets', 'suite', `${slug}.png`);
      assert.ok(fs.existsSync(p), `missing asset: ${p}`);
      assert.ok(fs.statSync(p).size > 0);
    }
  });

  it('footer keeps the CyberGems brand and the link row', () => {
    const start = appJs.indexOf('overlay.innerHTML = `');
    const end = appJs.indexOf('overlay.querySelector(\'#about-close-btn\')', start);
    const tpl = appJs.slice(start, end);
    assert.match(tpl, /class="about-footer-brand"[\s\S]*?>&#169; CyberGems &#8226; 2026</);
    assert.match(tpl, /class="about-footer-links"/);
    // CyberFeeds icon set: gem (website), book-open (docs), github, bug (issues), tag, heart
    assert.match(tpl, /\$\{iconHtml\('gem'\)\}/);
    assert.match(tpl, /\$\{iconHtml\('book-open'\)\}/);
    assert.match(tpl, /\$\{iconHtml\('github'\)\}/);
    assert.match(tpl, /\$\{iconHtml\('bug'\)\}/);
    assert.match(tpl, /\$\{iconHtml\('tag'\)\}/);
    assert.match(tpl, /\$\{iconHtml\('heart'\)\}/);
    // old off-pattern footer icons are gone
    assert.doesNotMatch(tpl, /\$\{iconHtml\('globe'\)\}/);
    assert.doesNotMatch(tpl, /\$\{iconHtml\('circle-dot'\)\}/);
    // gem + bug exist in the icon catalog (exact lucide paths, same as CyberFeeds)
    assert.match(appJs, /'gem': '<path d="M6 3h12l4 6-10 13L2 9Z"\/><path d="M11 3 8 9l4 13 4-13-3-6"\/><path d="M2 9h20"\/>'/);
    assert.match(appJs, /'bug': '<path d="m8 2 1\.88 1\.88"\/>/);
    // github uses the lucide path too (was a hand-made approximation)
    assert.match(appJs, /'github': '<path d="M15 22v-4a4\.8 4\.8 0 0 0-1-3\.5c3 0 6-2 6-5\.5/);
    assert.doesNotMatch(appJs, /'github': '<path d="M15 22v-4a4\.8 4\.8 0 0 0-1-3\.5c3 0 6-1\.5 6-6/);
  });

  it('styles the modal like CyberFeeds: transparent overlay, gradient card, switch', () => {
    // lighter backdrop so the app shows through (the requested transparency)
    assert.match(css, /#about-overlay\s*\{\s*background: rgba\(0, 0, 0, 0\.55\);\s*backdrop-filter: blur\(4px\);/);
    // 440px gradient card with accent-tinted border
    assert.match(css, /\.about-modal\s*\{\s*max-width: 440px;/);
    assert.match(css, /\.about-modal\s*\{[\s\S]*?background: linear-gradient\(160deg, var\(--cyber-panel\), var\(--cyber-panel-dark\)\);/);
    assert.match(css, /\.about-modal\s*\{[\s\S]*?border: 1px solid rgba\(var\(--cyber-accent-rgb\), 0\.28\);/);
    assert.match(css, /\.about-modal\s*\{[\s\S]*?border-radius: 14px;/);
    // glass decor pieces (hairline only; corner glows removed by request)
    assert.match(css, /\.about-hairline\s*\{[\s\S]*?linear-gradient\(90deg, transparent, rgba\(255, 255, 255, 0\.28\), transparent\)/);
    assert.doesNotMatch(css, /\.about-glow/);
    // close-only header: transparent so the gradient flows (no tonal seam)
    assert.match(css, /\.about-modal \.modal-header\s*\{[\s\S]*?background: transparent;/);
    // close hover: subtle ghost background, no clipped pink glow
    assert.match(css, /\.about-modal \.modal-close-btn:hover\s*\{\s*color: var\(--cyber-text\) !important;\s*background: rgba\(255, 255, 255, 0\.07\) !important;\s*box-shadow: none !important;/);
    // close tooltip renders below + right-aligned (inside the modal)
    assert.match(css, /\.about-modal \.modal-close-btn\.cyber-tooltip::after\s*\{\s*bottom: auto !important;\s*top: calc\(100% \+ 8px\) !important;/);
    // slim visible scrollbar so overflow is discoverable
    assert.match(css, /\.about-modal \.modal-body::-webkit-scrollbar\s*\{\s*width: 6px;\s*display: block;/);
    assert.doesNotMatch(css, /scrollbar-width: none/);
    // tight gap between tagline and formats box (flex margins don't collapse)
    assert.match(css, /\.about-desc\s*\{[\s\S]*?margin: 0 0 8px;/);
    assert.match(css, /\.about-formats\s*\{\s*margin: 8px 0 0;/);
    // uppercase version label
    assert.match(css, /\.about-version-label\s*\{[\s\S]*?text-transform: uppercase;\s*letter-spacing: 0\.1em;/);
    // section rules + bordered maintenance box + full-width buttons
    assert.match(css, /\.about-section-rule\s*\{\s*height: 1px;\s*flex: 1;/);
    assert.match(css, /\.about-maintenance\s*\{[\s\S]*?border: 1px solid var\(--cyber-border\);\s*border-radius: 10px;/);
    assert.match(css, /\.about-action-btn\s*\{[\s\S]*?min-height: 38px;/);
    // custom switch (44x24, accent when active)
    assert.match(css, /\.custom-switch\s*\{[\s\S]*?width: 44px;[\s\S]*?height: 24px;/);
    assert.match(css, /\.custom-switch\.active\s*\{\s*background: var\(--cyber-accent\);/);
    // suite strip items
    assert.match(css, /\.about-suite-app\s*\{[\s\S]*?width: 40px;\s*height: 40px;\s*border-radius: 10px;/);
  });

  it('localizes the version label and suite strings in English and Spanish', () => {
    assert.equal(uiI18n.en.about_version_label, 'VERSION {version}');
    assert.equal(uiI18n.es.about_version_label, 'VERSIÓN {version}');
    assert.equal(uiI18n.en.about_suite_title, 'More from CyberGems');
    assert.equal(uiI18n.es.about_suite_title, 'Más de CyberGems');
    assert.equal(uiI18n.en.about_suite_more, 'View all →');
    assert.equal(uiI18n.es.about_suite_more, 'Ver todas →');
    for (const key of ['clock', 'launcher', 'manager', 'notes', 'paste', 'snap', 'tray', 'wall']) {
      assert.ok(uiI18n.en[`about_suite_${key}`], `missing EN about_suite_${key}`);
      assert.ok(uiI18n.es[`about_suite_${key}`], `missing ES about_suite_${key}`);
    }
  });

  it('update actions use CyberFeeds ghost/primary buttons with icons', () => {
    const start = appJs.indexOf('overlay.innerHTML = `');
    const end = appJs.indexOf('overlay.querySelector(\'#about-close-btn\')', start);
    const tpl = appJs.slice(start, end);
    // idle check button: ghost class + refresh icon + sentence-case label
    assert.match(tpl, /id="about-btn-update" class="top-btn about-action-btn about-action-ghost">\s*\$\{iconHtml\('rotate-cw'\)\}\s*<span>\$\{t\.about_check_updates\}<\/span>/);
    // download: primary + download icon
    assert.match(tpl, /id="about-btn-download" class="top-btn about-action-btn about-action-primary"[\s\S]*?\$\{iconHtml\('download'\)\}/);
    // install: primary + check icon
    assert.match(tpl, /id="about-btn-install" class="top-btn about-action-btn about-action-primary"[\s\S]*?\$\{iconHtml\('check-circle'\)\}/);
    // release page link stays ghost
    assert.match(tpl, /id="about-btn-release" class="top-btn about-action-btn about-action-ghost about-release-btn"/);
    // old all-caps outline variants are gone
    assert.doesNotMatch(tpl, /about-action-accent/);
    assert.doesNotMatch(tpl, /id="about-btn-(download|install)" class="top-btn active/);
    // check-circle icon exists in the catalog
    assert.match(appJs, /'check-circle': '<circle cx="12" cy="12" r="9"\/><path d="M8\.5 12\.5l2\.5 2\.5 4\.5-5\.5"\/>'/);
  });

  it('spins the refresh icon while the update check runs', () => {
    assert.match(appJs, /spinIco\.classList\.toggle\('spin-icon', s === 'checking'\)/);
    assert.match(css, /\.about-action-btn \.spin-icon\s*\{\s*animation: about-spin 0\.8s linear infinite;/);
    assert.match(css, /@keyframes about-spin\s*\{/);
  });

  it('shows the auto-update hint under the toggle (CyberFeeds pattern)', () => {
    const start = appJs.indexOf('overlay.innerHTML = `');
    const end = appJs.indexOf('overlay.querySelector(\'#about-close-btn\')', start);
    const tpl = appJs.slice(start, end);
    // hint renders right after the toggle row, guarded by the i18n key
    assert.match(tpl, /<\/div>\s*\$\{t\.about_auto_updates_hint \? `<div class="about-update-hint">\$\{t\.about_auto_updates_hint\}<\/div>` : ''\}/);
    assert.match(css, /\.about-update-hint\s*\{[\s\S]*?font-size: 10px;/);
    assert.ok(uiI18n.en.about_auto_updates_hint, 'missing EN about_auto_updates_hint');
    assert.ok(uiI18n.es.about_auto_updates_hint, 'missing ES about_auto_updates_hint');
  });

  it('keeps About action buttons sentence-case with ghost/primary styling', () => {
    // .top-btn is uppercase app-wide; About must override it (CyberFeeds look)
    assert.match(css, /\.about-action-btn\s*\{[\s\S]*?text-transform: none;/);
    assert.match(css, /\.about-action-btn\s*\{[\s\S]*?font-weight: 500;/);
    // ghost: transparent, no border, muted
    assert.match(css, /\.about-action-ghost,\s*\.about-action-ghost:hover\s*\{\s*border-color: transparent;\s*background: transparent;\s*color: var\(--cyber-muted\);/);
    // primary: solid accent fill with dark label
    assert.match(css, /\.about-action-primary,\s*\.about-action-primary:hover\s*\{\s*border-color: var\(--cyber-accent\);\s*background: var\(--cyber-accent\);\s*color: #08111c;/);
  });

  it('renders the logo plain: no halo, no pulsing glow (CyberFeeds style)', () => {
    // halo ::before + pulse animations were removed: the glow read as a hard
    // cut against the card top. CyberFeeds shows a plain <img>.
    assert.doesNotMatch(css, /\.about-logo-wrap::before/);
    assert.doesNotMatch(css, /about-logo-halo/);
    assert.doesNotMatch(css, /about-logo-glow/);
    assert.doesNotMatch(css, /\.about-logo\s*\{[\s\S]*?filter: drop-shadow/);
    assert.match(css, /\.about-logo\s*\{[\s\S]*?width: 76px;\s*height: 76px;/);
  });

  it('uses CyberFeeds sentence-case labels for update actions in both languages', () => {
    assert.equal(uiI18n.en.about_check_updates, 'Check for updates');
    assert.equal(uiI18n.es.about_check_updates, 'Buscar actualizaciones');
    assert.equal(uiI18n.en.about_install_btn, 'Restart and update');
    assert.equal(uiI18n.es.about_install_btn, 'Reiniciar y actualizar');
    assert.equal(uiI18n.en.about_download_btn, 'Download update');
    assert.equal(uiI18n.es.about_download_btn, 'Descargar actualización');
  });

  it('offers the diagnostics copy button between issues and releases', () => {
    const start = appJs.indexOf('overlay.innerHTML = `');
    const end = appJs.indexOf('overlay.querySelector(\'#about-close-btn\')', start);
    const tpl = appJs.slice(start, end);
    // button right of the bug icon, electron-only (browser preview omits it)
    assert.match(tpl, /\$\{iconHtml\('bug'\)\}<\/a>\s*\$\{isElectron \? `<button\s*type="button"\s*class="about-footer-icon about-diagnostics-btn cyber-tooltip"\s*id="about-btn-diagnostics"/);
    assert.match(tpl, /data-tooltip="\$\{t\.about_copy_diagnostics\}"/);
    assert.match(tpl, /\$\{iconHtml\('clipboard-copy'\)\}<\/button>` : ''\}/);
    // click handler builds the diagnostic snapshot and flashes a check
    assert.match(appJs, /const diagBtn = overlay\.querySelector\('#about-btn-diagnostics'\);/);
    assert.match(appJs, /`CyberViewer \$\{d\.app\}\$\{d\.portable \? ' \(Portable\)' : ''\}`/);
    assert.match(appJs, /navigator\.clipboard\.writeText\(lines\.join\('\\n'\)\)/);
    assert.match(appJs, /diagBtn\.innerHTML = iconHtml\('check'\);/);
    assert.match(appJs, /1800\);/);
    // icons + i18n keys
    assert.match(appJs, /'clipboard-copy': '<path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"\/>/);
    assert.match(appJs, /'check': '<path d="M20 6 9 17l-5-5"\/>'/);
    assert.equal(uiI18n.en.about_copy_diagnostics, 'Copy diagnostic info');
    assert.equal(uiI18n.es.about_copy_diagnostics, 'Copiar info de diagnóstico');
    assert.equal(uiI18n.en.about_diagnostics_copied, 'Diagnostic info copied');
    assert.equal(uiI18n.es.about_diagnostics_copied, 'Info de diagnóstico copiada');
    // main-process handler + preload bridge
    assert.match(mainJs, /ipcMain\.handle\('get-diagnostics', \(\) => \(\{\s*app: app\.getVersion\(\),/);
    assert.match(mainJs, /electron: process\.versions\.electron,/);
    assert.match(mainJs, /osRelease: os\.release\(\),/);
    assert.match(mainJs, /portable: isPortableBuild\(\)/);
    assert.match(mainJs, /const os = require\('os'\);/);
    assert.match(preloadJs, /getDiagnostics: \(\) => ipcRenderer\.invoke\('get-diagnostics'\),/);
    // green flash while copied
    assert.match(css, /\.about-diagnostics-btn\.about-diagnostics-copied\s*\{\s*color: var\(--cyber-accent3\);/);
  });
});
