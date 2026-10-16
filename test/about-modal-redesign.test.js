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
});
