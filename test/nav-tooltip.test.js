const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'CyberViewer.html'), 'utf8');
const videoJs = fs.readFileSync(path.join(root, 'js', 'video-player.js'), 'utf8');
const videoCss = fs.readFileSync(path.join(root, 'css', 'video.css'), 'utf8');

function tagById(id) {
  const match = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`));
  assert.ok(match, `${id} should exist in the HTML`);
  return match[0];
}

describe('nav arrow badge tooltips', () => {
  it('binds the nav arrows to the badge card instead of the CSS bubble', () => {
    // The card is the only system that renders kbd badges; the CSS bubble
    // paints data-tooltip as plain text, so the arrows must never go back to it.
    const bindList = appJs.match(/\[[^\]]*'btn-prev'[\s\S]*?\]\.forEach\(id => ttBind/);
    assert.ok(bindList, 'ttBind list should include the nav arrows');
    assert.match(bindList[0], /'btn-next'/);
    for (const id of ['btn-prev', 'btn-next']) {
      const tag = tagById(id);
      assert.ok(!tag.includes('cyber-tooltip'), `${id} must not draw the CSS bubble`);
      assert.match(tag, /data-tooltip-kbd="[^"]+"/, `${id} should carry kbd badges`);
      assert.match(tag, /data-i18n-aria=/, `${id} should expose a localized accessible name`);
    }
  });

  it('renders one kbd chip per key and keeps combos unsplit', () => {
    assert.match(appJs, /function ttRenderKbd\(kbdText\)/);
    // Tokens split on whitespace or slashes; "Ctrl+Shift+O" has no spaces, so
    // it stays a single chip.
    assert.match(appJs, /split\(\/\\s\*\\\/\\s\*\|\\s\+\/\)\.filter\(Boolean\)/);
    assert.match(appJs, /className = 'tooltip-shortcut-key'/);
  });

  it('gives video transport buttons card tooltips backed by static kbd badges', () => {
    const badges = [
      ['video-play', 'Space'],
      ['video-mute', 'M'],
      ['video-back', '&#8592;'],
      ['video-forward', '&#8594;'],
      ['video-speed', '&gt; &lt;'],
      ['video-fit', 'B'],
      ['video-fullscreen', 'Ctrl\\+F']
    ];
    for (const [id, kbd] of badges) {
      assert.match(tagById(id), new RegExp(`data-tooltip-kbd="${kbd}"`), `${id} badge`);
    }
    // Sync/localize feed the card labels through dataset, not the CSS bubble.
    assert.match(videoJs, /\$\('video-play'\)\.dataset\.tooltip = text\(/);
    // back/forward/speed/more labels are assigned through the shared id/key loop.
    assert.match(videoJs, /\[\['video-back', 'video_back'\][\s\S]*?\$\(id\)\.dataset\.tooltip = text\(key\);/);
    assert.match(videoJs, /\$\('video-fit'\)\.dataset\.tooltip = text\('menu_fit'\)/);
    // The fullscreen label swaps with the ghost state inside reveal().
    assert.match(videoJs, /\$\('video-fullscreen'\)\.dataset\.tooltip = text\(fsKey\)/);
    // B is the fit key since the rework; the stale F hint must stay out.
    assert.doesNotMatch(tagById('video-fit'), /aria-keyshortcuts="F"/);
  });

  it('keeps the no-audio notice on the card instead of a CSS bubble', () => {
    // The old bubble on the sound group overlapped the mute badge card; the
    // notice now replaces the mute hint and marks the group's own card.
    assert.doesNotMatch(videoJs, /setCyberTooltip\(sound/);
    assert.match(videoJs, /sound\.dataset\.tooltip = text\('video_audio_unavailable'\)/);
    assert.match(videoJs, /\$\('video-mute'\)\.dataset\.tooltip = text\('video_audio_unavailable'\)/);
    assert.match(videoJs, /delete \$\('video-mute'\)\.dataset\.tooltipKbd/);
    assert.match(videoJs, /\$\('video-mute'\)\.dataset\.tooltip = text\('video_mute_shortcut'\)/);
    assert.match(appJs, /'video-speed', 'video-more', 'video-fit', 'video-fullscreen', 'video-sound'/);
  });

  it('opens the speed panel as a standalone popover above its own button', () => {
    // The panel left the More menu, so toggling it must not mark the More
    // button expanded; closeMenu tears both popups down and Escape still
    // consumes when either was open.
    assert.doesNotMatch(videoJs, /\$\('video-menu-main'\)\.hidden = on/);
    assert.doesNotMatch(videoJs, /\$\('video-speed-back'\)/);
    assert.match(videoJs, /function positionSpeedPanel\(\)/);
    assert.match(videoJs, /\$\('video-speed'\)\.addEventListener\('click', \(\) => \{\s*setSpeedPanel\(\$\('video-speed-panel'\)\.hidden\);/);
    assert.match(videoJs, /setSpeedPanel\(false\);\s*if \(hadMenu\) setMenu\(false\);/);
  });

  it('settles audio availability from container metadata, without playback', () => {
    // music-metadata reads the container's tracks (verified against generated
    // silent/voiced fixtures), so volume shows its real state right at open
    // and no decode probe ever plays the video.
    assert.doesNotMatch(videoJs, /probeAudioAvailability/);
    assert.match(videoJs, /getVideoAudioCodec\(probePath\)/);
    assert.match(videoJs, /image\.audioProbe = result\.codec \? 'available' : 'unavailable';/);
    assert.match(videoJs, /audioStatus = image\.audioProbe \|\| 'pending';/);
    assert.doesNotMatch(videoJs, /video-audio-note/);
    assert.doesNotMatch(videoJs, /video-audio-info/);
  });

  it('keeps the sibling arrows visible, disabled with their own hint', () => {
    // Without a sibling video the arrow stays in the bar, dimmed via
    // aria-disabled (the tooltip must keep working on it). Hints ride the
    // badge card so they clamp to the viewport instead of clipping.
    assert.match(videoJs, /classList\.toggle\('is-disabled', !hasPrev\)/);
    assert.match(videoJs, /prev\.dataset\.tooltip = hasPrev \? text\(audio \? 'audio_prev' : 'video_prev'\) : text\('video_no_prev'\)/);
    assert.match(appJs, /'video-prev', 'video-next'/);
    assert.doesNotMatch(html, /id="video-prev" hidden/);
    assert.doesNotMatch(html, /id="video-next" hidden/);
    assert.match(videoCss, /#video-prev\.is-disabled, #video-next\.is-disabled \{ opacity: \.38;/);
  });

  it('shows a persistent speed chip that fades with the controls', () => {
    // Top-left, mirrored from the fullscreen close button (top-right): below
    // the chrome in windowed mode, up next to the close X in true fullscreen,
    // and only meaningful while the rate differs from 1×.
    assert.match(html, /id="speed-indicator" role="status" hidden/);
    assert.match(videoJs, /indicator\.hidden = rate === 1;/);
    assert.match(videoCss, /top: 92px;\s*\n\s*left: 20px;/);
    assert.match(videoCss, /body\.ghost-mode #speed-indicator \{ top: 16px; \}/);
    assert.match(videoCss, /body\.video-active #speed-indicator:not\(\[hidden\]\) \{ display: block; \}/);
    // The fullscreen video title is centered so it never competes with the
    // chip (left) or the close button (right).
    assert.match(videoCss, /#video-heading \{[\s\S]*?text-align: center;/);
    // The seek preview hides with visibility, not display: cycling the box's
    // display mounts and unmounts a second hardware decoder on every hover,
    // which subtly churns the main video's rendered size on GPU decode.
    assert.match(videoCss, /#video-seek-preview\[hidden\] \{ visibility: hidden; \}/);
    assert.doesNotMatch(videoCss, /#video-seek-preview\[hidden\] \{ display: none; \}/);
  });

  it('swaps the nav badges contextually while video or audio is active', () => {
    // In video/audio the left/right arrows seek 5 seconds and Space pauses, so
    // the badges may only list the keys that still jump between files.
    assert.match(videoJs, /navPrev\.dataset\.tooltipKbd = video \? '↑ Backspace' : '← ↑ Backspace'/);
    assert.match(videoJs, /navNext\.dataset\.tooltipKbd = video \? '↓' : '→ ↓ Space'/);
  });
});
