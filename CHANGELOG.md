# Changelog

Notable user-facing changes per release. Earlier versions are documented in the
[GitHub Releases](https://github.com/CyberGems/CyberViewer/releases) page.

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
