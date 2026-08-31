# Frequently Asked Questions

General questions about CyberViewer features, configuration, and troubleshooting.

---

## General

### What is CyberViewer?
CyberViewer is a fast, lightweight image viewer for Windows with a cyberpunk aesthetic. It provides quick image viewing, folder browsing, light editing, and slideshow features.

### Is CyberViewer free?
Yes. CyberViewer is free and open source under the MIT license. You can help keep it free [here](https://github.com/CyberGems/CyberViewer#-donate).

### What image formats are supported?
JPEG, PNG, GIF (animated), WebP, BMP, and TIFF.

### Can I use CyberViewer as my default image viewer?
Yes. During installation or via Windows Settings → Default Apps.

---

## Viewing

### How do I browse a folder of images?
Open any image in a folder, then use arrow keys or the thumbnail sidebar to navigate.

### Can I view animated GIFs?
Yes. GIFs autoplay on open. Toggle playback with Space or the play button.

### How do I zoom?
- **Ctrl+Wheel** — Zoom in/out at cursor
- **+/-** — Zoom in/out
- **Double-click** — Toggle fit/original

### How do I enter fullscreen?
Press `F11` or click the fullscreen button. Press Escape to exit.

---

## Editing

### Can I rotate images?
Yes. Press **Q** to rotate left, **E** to rotate right. Save or discard after.

### Can I crop images?
Yes. Click the Crop tool, adjust the overlay, and confirm.

### Can I resize images?
Yes. Click Resize, enter dimensions or choose a preset, and apply.

### Can I adjust colors?
Yes. Adjust brightness, contrast, saturation, blur, grayscale, and invert with live preview.

### Are edits destructive?
No. Edits are non-destructive until you save. You can always discard changes.

---

## Slideshow

### How do I start a slideshow?
View → Slideshow → Start, or click the slideshow button.

### Can I configure the interval?
Yes. Choose 2s, 3s, 5s, or 10s in Settings → Slideshow.

### Can the slideshow loop?
Yes. Enable loop mode in Settings → Slideshow.

---

## File Operations

### Can I export to PDF?
Yes. File → Export to PDF with page size and orientation options.

### Can I print images?
Yes. File → Print with layout options.

### Can I copy images to clipboard?
Yes. Ctrl+C copies the image for pasting into other apps.

### How do I delete an image?
Press Delete to move the file to the Recycle Bin.

---

## Troubleshooting

### Images open slowly
- Large images may take a moment to stream
- Check if the thumbnail cache is full
- Restart CyberViewer

### Thumbnails not loading
- The folder may have many images
- Thumbnails load in priority queue
- Wait for scan to complete

### The hotkey doesn't work
- Check for conflicts with other apps
- Verify the hotkey in Settings → System
- Try a different key combination

### CyberViewer won't start
- Ensure Node.js dependencies are installed
- Try running as Administrator
- Check Windows Event Viewer for errors

### File associations not working
- Re-run the installer
- Or set manually in Windows Settings → Default Apps

---

## Contributing

### How can I report a bug?
Open an issue on [GitHub Issues](https://github.com/CyberGems/CyberViewer/issues) with:
- CyberViewer version
- Windows version
- Steps to reproduce
- Expected vs actual behavior

### How can I contribute code?
1. Fork the repository
2. Create a feature branch
3. Submit a pull request
4. Describe your changes in the PR description

### How can I help with translations?
UI strings are in `i18n/ui.json`. Submit a PR with your translation.

### How can I donate?
See the [Donate section](https://github.com/CyberGems/CyberViewer#-donate) on the main README.
