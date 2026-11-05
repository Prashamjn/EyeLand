# EyeLand

A Liquid Island for Windows: a floating black pill at the top of your screen that morphs to show what is happening, with twenty plugins behind it. Inspired by Apple's Dynamic Island and macOS Liquid Glass.

## Run
1. Install Node.js 18 or newer
2. In this folder: `npm install`, then `npm start`
3. Tests: `npm test` (unit tests). UI smoke test (needs a display; on Linux use `xvfb-run`): `npx electron tests/ui/smoke.js`
4. Installer: `npm run dist` (output in `dist/`). Turn on "Start with Windows" inside the installed app.

## The island
- **Header** (inside the expanded island, never a separate bar): weather icon, temperature and city on the left, the time in the centre, the date and a short condition on the right. Time and date use your Windows regional format. It stays visible while a plugin is open. The collapsed island is only the black pill. (The old "Weather and clock bar" setting is gone; your saved value is kept but ignored.)
- **Idle**: a small black pill. Quiet indicators appear inside it while something runs in the background: a waveform while music plays, a cup in Coffee mode, a countdown while the focus timer runs.
- **Activities**: the pill springs open for a moment, then contracts.
  - Charger connected or disconnected: battery icon, status and percentage (green while charging). A low-battery warning (15%) takes priority over everything else.
  - Volume and brightness changes: icon, live bar and percentage.
  - Media started or track changed: artwork (when the player provides it), title, artist and a waveform. It settles to the small waveform after a few seconds.
  - Plugin results (copied text, picked colour...) and timer completion.
- **Priority**: critical warnings beat volume, brightness and charger feedback, which beat plugin notices, which beat media, which beat background tasks. A short event interrupts the display and the island returns to what it was doing.
- **Expanded**: hover or click. The header sits on top, then the current activity (for media: artwork and controls), then the workspace: Home (search, favourites, volume, brightness, battery), Plugins, Focus timer, Tasks, Clipboard and Settings. Search covers plugin names, descriptions, categories and keywords (arrow keys, Enter, Esc). Plugins open inside the island with Back and Home buttons; the island grows into a larger workspace for plugins that need room and stays open until you press Esc, Back or the collapse button.

### Weather and location
- Weather comes from Open-Meteo, which needs no account or API key, so nothing secret is stored in the source. Readings are cached on disk, refreshed every 15 minutes, and the last reading is kept (shown dimmed) while you are offline.
- Nothing is located automatically. Open the island's Settings (or click the weather on the header bar) and either press **Use my location**, which asks the Windows location service once, or search for a city. The choice is remembered. If Windows location access is off, the app says so and offers a shortcut to the Windows privacy settings.
- The Weather plugin and the header share the same saved place and unit.

## Settings worth knowing
Position (top or bottom), edge gap, animation speed, open delay, feedback time, temperature unit, display (shown when more than one monitor is connected), and "Hide in full screen". Windows' "Show animations" switch turns the springs into short fades.

## Plugins
Open any of them from the Plugins tab, the search box or its shortcut. They open inside the island (no separate window). Instant screen tools (text extractor, lens, colour picker, draw) still use the full-screen native overlay for selecting and drawing. Right-click a plugin tile, or tap the star in a plugin, to add it to Favourites. Change shortcuts in the Shortcuts page (Settings tab, "Plugin shortcuts").

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
- Album artwork depends on the player publishing a thumbnail to Windows media controls. Without one, a music icon is shown.
- Charger events use the browser Battery API inside Electron. Desktop PCs without a battery never show charger activity.
- The island hides over full screen apps using the existing detection. Exclusive full screen games can hide any overlay, including this one.
- Plugin pages keep their previous layout inside the island for now (restyled to match the island's surfaces). The old plugin window still exists as a fallback, used only when the island is hidden (for example over a full screen app) and from the tray's "Plugin window (legacy)" item.
- Settings are migrated to schema 2 on first launch. The original file is copied to `settings.v1.backup.json` first and nothing is removed.
- QuickShare listens only on your local network, requires a random link, and stops when you press Stop. Allow Eyeland on private networks when Windows asks. 5 GHz Wi-Fi is fastest.
- Printing Office files (Word, Excel, PowerPoint) hands them to Windows, so there is no preview for those.
- Exclusive full screen games can hide any window, including screen overlays. Borderless mode works.
- On keyboards with AltGr, Ctrl+Alt shortcuts can type characters. Rebind them in the Shortcuts page.

## Folder map
`main.js` main process and wiring. `src/` plugin back ends plus weather and location. `renderer/` the island (`renderer/js/`: core, views, engine, header, feeds, workspace). `hub/` plugin window and pages. `overlay/` screen capture, color picker and drawing. `native/` PowerShell helpers (volume, brightness, fullscreen, media, location). `shared/` activity manager, motion system, icons, plugin list. `tests/` unit tests (`npm test`).
