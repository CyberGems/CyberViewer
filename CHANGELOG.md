# Changelog

Notable user-facing changes per release. Earlier versions are documented in the
[GitHub Releases](https://github.com/CyberGems/CyberViewer/releases) page.

## [1.19.1] - 2026-10-30

### Fixed

- In-app update installs could fail with the NSIS error "Fallo al desinstalar archivos antiguos de la aplicación" when closing to the tray was enabled: the updater's quit was intercepted and hidden to the tray instead of exiting, leaving the old executable locked while the new installer ran. Every quit now lands on the first attempt, so updating from the About dialog completes cleanly.

### Changed

- Release builds now submit the installer and portable binaries to VirusTotal automatically, so the SHA256 report links in the release body resolve as soon as a release is published.

## [1.19.0] - 2026-10-30

### Added

- Appearance themes: CyberViewer (default dark with the chosen accent), Gray (a sober grayscale palette that neutralises every chromatic accent), and Light (light surfaces that keep the accent, with darkened accent text for contrast). Pick one on the Appearance tab; the choice is saved, included in backups, and applied before the first frame so the window does not flash.
- A dismissible update popup in the main window on the CyberFeeds pattern: a language-aware changelog peek when a new version is available, download progress and restart actions, and a per-version skip that is remembered in settings. A console command previews every update state for testing.
- A theme-following automatic transparency background: light theme users get the light checkerboard by default (existing dark defaults migrate once), explicit choices are respected, and the View menu toggle still overrides it.
- Update check feedback now mirrors in the About formats box, so checking, up-to-date and error states are visible at the top of the modal without scrolling.

### Changed

- Interface colours come from a shared token layer, so every theme repaints the chrome, menus, modals and canvas consistently instead of relying on hardcoded dark values.
- The Light theme is tuned per accent: text uses hand-picked ink tones per swatch, menus, the video player menu and the shortcuts popover get a white frost instead of the dark glass, and the titlebar branding keeps its contrast.
- Every switch follows the suite toggle pattern: a dark thumb at rest and an accent track with a white check when on, with graphite and light variants per theme.
- The About modal was refined: language-aware format badges now include video support, the tagline mentions videos, the updates section opens with a green status pill and version chips joined by a transition arrow, the release link reads as a secondary button, the auto-check toggle closes the section, and scrolling fades at the edges.
- The default CyberViewer theme keeps the previous palette and accent behaviour unchanged.

### Fixed

- Quitting from the tray menu while the window was hidden only restored the window on the first attempt. The renderer's beforeunload prevents the first close attempt, and its late prevention notice could abort the acknowledged quit in flight. Explicit quits are no longer cancelled, the acknowledged close retries the quit until it lands, a watchdog restores normal close semantics if the renderer's close chain never completes, and chrome-only dialogs such as the configuration panel no longer count as work in progress.
- Windows center correctly on mixed-DPI multi-monitor setups: startup bounds are re-asserted after the window is shown, and the maximize nudge can no longer exceed the target work area.
- The welcome drop frame is square so its corner brackets align, the titlebar divider reads as a crisp 1px line without glow, and the grab cursor no longer appears over the empty canvas.

### Changed

- Interface colours now come from a shared token layer, so every theme repaints the chrome, menus, modals and canvas consistently instead of relying on hardcoded dark values.
- The default CyberViewer theme keeps the previous palette and accent behaviour unchanged.

## [1.18.0] - 2026-10-29

### Added

- Integrated video playback in lightweight media tabs with MP4, M4V, WebM, MOV and Matroska (MKV) support, matching Windows file associations, refined controls, immersive fullscreen, and reliable Matroska initialization.
- Isolated YouTube video and playlist playback in a dedicated viewer.
- Image tabs with optional session restore across launches.
- Scheduled automatic backups with safety restore, enabled by default, plus a resident tray icon.
- Set the Windows desktop wallpaper directly from pasted or dropped in-memory images.
- First-close dialog to choose between the tray and quitting, with a softer titlebar divider.
- Hotkey badges on every titlebar control, unified and enlarged across all dialogs.
- Window lifecycle diagnostics and a compositor frame nudge for Windows auto-start.

### Changed

- Redesigned the About modal on the CyberFeeds pattern, with a diagnostics copy button.
- Redesigned the welcome banner icon as a drop-into-tray glyph, grouped the supported format list by media type, and made the icon open the file dialog.
- Replaced the app icon with new brand artwork and branded the NSIS installer with strict warnings restored.
- Sidebar starts closed on manual launches and collapses when images are opened externally.
- Reduced tray branding logo desaturation to 50% while idle and polished the tray visibility reminder.
- Synchronized About icons from official suite repositories before release builds.
- Normalized the license to GPL-3.0-only with the canonical GPL-3.0 text and added a Spanish README.

### Fixed

- Window centering on monitors with a different scale factor: bounds are re-applied until they match at startup, before maximizing onto the target display, and after unmaximize, fixing mixed-DPI multi-monitor placement.
