# Eyeland

A Dynamic Island for Windows. Two glowing eyes follow your cursor. Hover to open a dashboard.
Press a volume or brightness key and the eyes swap for a live bar. Twenty plugins live behind it.

## Run
1. Install Node.js 18 or newer
2. In this folder: `npm install`, then `npm start`
3. Installer: `npm run dist` (output in `dist/`). Turn on "Start with Windows" inside the installed app.

## The island
- Idle: eyes that blink and track the cursor. A small cup appears and the eyes stay wide open in Coffee mode.
- Hover: opens the dashboard (Home, Music, Timer, Clipboard, Tasks, Plugins, Settings).
- Volume and brightness keys: the island shows the icon, a bar and the percentage, then returns to the eyes.
- Plugin results (copied text, copied color, and so on) appear as a short message in the island.
- Hides automatically while a full screen app (game, F11 browser, video, slideshow) is in front. Toggle in Settings.

## Plugins
Open any of them from the Plugins tab or its shortcut. Change shortcuts in the Shortcuts page (Settings tab, "Plugin shortcuts").

| Plugin | Default | What it does |
|---|---|---|
| Text extractor | Ctrl+Alt+T | Drag over any text on screen, it is copied to the clipboard (OCR, works on images and video) |
| Lens search | Ctrl+Alt+L | Select part of the screen, search for it with Google Lens, Bing or Yandex |
| Color picker | Ctrl+Alt+C | Magnifier plus click to copy a pixel color as HEX, RGB or HSL |
| Draw on screen | Ctrl+Alt+D | Pen sizes, colors, marker, eraser, undo. Esc clears everything and closes |
| Translate | Ctrl+Alt+R | Scan text on screen or type it, read the translation |
| Tasks | Ctrl+Alt+N | To-do list (also in the island) |
| Calendar | Ctrl+Alt+E | Month view with events |
| Calculator | Ctrl+Alt+U | Expression calculator and unit converter |
| Weather | Ctrl+Alt+W | Current weather and 5 day forecast for your area |
| Voice memos | Ctrl+Alt+M | Record, play, rename, export MP3, WAV or M4A |
| QR code | Ctrl+Alt+Q | Live preview, 5 dot styles, 4 corner styles, colors, logo and label, copy or save PNG |
| Coffee mode | Ctrl+Alt+K | Keeps the screen awake, optional timer |
| File converter | Ctrl+Alt+F | Image to image or PDF, audio to audio, video to video, GIF or audio, text/Markdown/HTML to PDF, PDF to images |
| File size reducer | Ctrl+Alt+Z | Images, video, audio, PDF and any other file (zip) |
| Print | Ctrl+Alt+P | Preview, printer, paper, orientation, margins, color, sides, copies, page range, Save as PDF |
| Temp cleaner | Ctrl+Alt+X | Temp folders, caches, crash dumps, Recycle Bin |
| YouTube downloader | Ctrl+Alt+Y | Fetch info, trim a segment, MP3 or MP4 in best quality, live progress |
| Speed test | Ctrl+Alt+S | Ping, jitter, download, upload |
| QuickShare | Ctrl+Alt+H | Send files to a phone or receive from it over Wi-Fi with a QR code |
| System monitor | Ctrl+Alt+I | CPU per core, memory, disks, device details |

## Notes and limits
- Windows 11 gets a real acrylic glass window for the plugin hub. Windows 10 gets a solid dark window with the same layout.
- Text extractor downloads each OCR language once (10 to 20 MB). Pick languages on the Text extractor or Translate page.
- Lens search needs a web address for the image, so the selected area is uploaded to catbox.moe for 1 hour. You are asked once before the first upload.
- Translation uses Google's public translate endpoint with MyMemory as a fallback. Both are online and unofficial, so they can change.
- YouTube downloader fetches yt-dlp from its GitHub releases on first use. If YouTube changes something, use "update the engine". Recent yt-dlp versions may ask for a JavaScript runtime: `winget install DenoLand.Deno`. Only download what you have the right to save.
- PDF size reduction uses Ghostscript when installed. Without it, pages are re-rendered as pictures (smaller, but the text is no longer selectable).
- Brightness works on laptop and built-in displays (WMI). External monitors are not supported.
- QuickShare listens only on your local network, requires a random link, and stops when you press Stop. Allow Eyeland on private networks when Windows asks. 5 GHz Wi-Fi is fastest.
- Printing Office files (Word, Excel, PowerPoint) hands them to Windows, so there is no preview for those.
- Exclusive full screen games can hide any window, including screen overlays. Borderless mode works.
- On keyboards with AltGr, Ctrl+Alt shortcuts can type characters. Rebind them in the Shortcuts page.

## Folder map
`main.js` main process and wiring. `src/` plugin back ends. `renderer/` the island. `hub/` plugin window and pages. `overlay/` screen capture, color picker and drawing. `native/` PowerShell helpers (volume, brightness, fullscreen, media). `shared/` plugin list and icons.
