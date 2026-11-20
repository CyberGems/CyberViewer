# Privacy — CyberViewer

CyberViewer runs on your PC and keeps your data on your PC. It has **no account, no telemetry, no analytics SDK and no ads**. It never sends your session data, images or settings to its author or to anyone else.

Everything it knows (session data, images or settings) stays in `%APPDATA%\CyberViewer\` (settings, session images, backups, thumbnail cache and logs). The installer cleans file associations but does not remove app data.

## When CyberViewer goes online

These are all the connections CyberViewer makes by itself. None of them sends your session data, images or settings. Like any request on the internet, the server sees your IP address.

| When | Where | What for | How to turn it off |
|---|---|---|---|
| 8 seconds after launch | GitHub Releases, with release notes from `api.github.com` | Check for a newer version | `checkUpdatesOnStartup` in Settings |

YouTube playback loads `www.youtube.com` and Google video hosts only when you start a video.

## What CyberViewer reads on your PC

CyberViewer reads only the files you open and the local session data. That information stays on your screen. Anything that changes the system asks for confirmation first and, where possible, is backed up so it can be undone.

## Questions

Open an issue: https://github.com/CyberGems/CyberViewer/issues

For a privacy-specific question, use the [contact page](https://cybergems.org/contact). The suite-wide statement is at [cybergems.org/privacy](https://cybergems.org/privacy).
