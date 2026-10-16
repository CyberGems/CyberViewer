const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
const uiI18n = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'ui.json'), 'utf8'));

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
    // Glass decor behind the content
    assert.match(tpl, /class="about-glass"/);
    assert.match(tpl, /about-glow-accent/);
    assert.match(tpl, /about-glow-violet/);
    assert.match(tpl, /about-hairline/);
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
  });

  it('styles the modal like CyberFeeds: transparent overlay, gradient card, switch', () => {
    // lighter backdrop so the app shows through (the requested transparency)
    assert.match(css, /#about-overlay\s*\{\s*background: rgba\(0, 0, 0, 0\.55\);\s*backdrop-filter: blur\(4px\);/);
    // 440px gradient card with accent-tinted border
    assert.match(css, /\.about-modal\s*\{\s*max-width: 440px;/);
    assert.match(css, /\.about-modal\s*\{[\s\S]*?background: linear-gradient\(160deg, var\(--cyber-panel\), var\(--cyber-panel-dark\)\);/);
    assert.match(css, /\.about-modal\s*\{[\s\S]*?border: 1px solid rgba\(var\(--cyber-accent-rgb\), 0\.28\);/);
    assert.match(css, /\.about-modal\s*\{[\s\S]*?border-radius: 14px;/);
    // glass decor pieces (blur lives on the shared .about-glow class)
    assert.match(css, /\.about-glow\s*\{\s*position: absolute;\s*border-radius: 50%;\s*filter: blur\(60px\);/);
    assert.match(css, /\.about-hairline\s*\{[\s\S]*?linear-gradient\(90deg, transparent, rgba\(255, 255, 255, 0\.28\), transparent\)/);
    // close-only header
    assert.match(css, /\.about-modal \.modal-header\s*\{\s*flex-shrink: 0;\s*padding: 16px 16px 0;\s*border-bottom: none;\s*justify-content: flex-end;/);
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

  it('uses CyberFeeds sentence-case labels for update actions in both languages', () => {
    assert.equal(uiI18n.en.about_check_updates, 'Check for updates');
    assert.equal(uiI18n.es.about_check_updates, 'Buscar actualizaciones');
    assert.equal(uiI18n.en.about_install_btn, 'Restart and update');
    assert.equal(uiI18n.es.about_install_btn, 'Reiniciar y actualizar');
    assert.equal(uiI18n.en.about_download_btn, 'Download update');
    assert.equal(uiI18n.es.about_download_btn, 'Descargar actualización');
  });
});
