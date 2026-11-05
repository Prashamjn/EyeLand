# EyeLand architecture (Phase 2 complete)

## Windows
- **Island window** (`renderer/`): one transparent, click-through, always-on-top window. Everything the user sees, including the weather/time/date header and every plugin page, is drawn inside it. It has two host sizes: `compact` (640x470) and `large` (860x700). The renderer asks for `large` (IPC `island-size`, validated in main) *before* the island grows and releases it ~700 ms after the island contracts.
- **Overlay windows** (`overlay/`): native full-screen overlays for screen selection and drawing. Unchanged.
- **Hub window** (`hub/`): legacy plugin window. Kept only as a fallback (island hidden, tray "Plugin window (legacy)"). Not removed yet because the fallback path still depends on it.

## Plugin registry (`shared/registry.js`, pure, unit tested)
- `Registry.fromCatalog(catalog, { state, onChange })` builds entries from `shared/catalog.js` plus `META` (keywords, permissions, size, version).
- Entry: `id, name, desc, category, kind (action|toggle|window), icon, version, key, size (compact|large), keywords, permissions, hidden, settings`.
- API: `register, unregister, get, has, list, categories, isEnabled/setEnabled, favourites/toggleFavourite, recents/markUsed, getSettings/setSettings (declared keys and types only), open/back/home/current (navigation stack), reportError/lastError, search, setState, on`.
- Persisted state lives in `settings.plugins` (`favourites, recents, enabled, settings`) and is written through the normal settings store.
- `migrateSettings()` runs in the main process on load: adds `schemaVersion: 2` and `plugins`, keeps every other key, is idempotent and never downgrades. A pre-v2 file is copied to `settings.v1.backup.json` once; an unreadable file is kept as `settings.corrupt.json`.
- `searchPlugins()` ranks name > id > keyword > category > description; every word must match.

## Plugin hosting (`renderer/js/plugin-host.js`)
Existing plugin pages (`hub/plugins/*.js`, `Plugins.register({ id, mount })`) are reused unchanged. They load lazily on first open (plus only the libraries that plugin needs) and mount into a **Shadow DOM** root so `hub/hub.css` and the island CSS cannot collide. `renderer/plugin-skin.css` maps the legacy plugin styles onto the island's surfaces. Loading, error (with Retry) and unknown-plugin states are handled by the host, and the plugin's cleanup function always runs on unmount. Plugin IPC (`window.eyeland`) and all backends in `src/` are untouched. The island CSP was widened for plugins (`blob:` media/images/workers, `https:` images, `connect-src blob: data:`).

## Navigation
`Workspace.openPlugin(id)` → `registry.open` → resize workspace → pin island open → mount. Back pops the registry stack (or returns to the tab the plugin was opened from); Home clears it. Esc blurs a focused field first, then goes back; Alt+Left = back; Alt+Home = home. While a plugin is open the island does not auto-collapse; the window is focusable only while it is expanded and pinned.

Main-process messages meant for a plugin that is still loading (for example the Translate hand-off after a screen scan) are queued until the island reports `ey:plugin-mounted`.

## Tests
`npm test` runs unit tests (registry, migration, search and the existing suites). `tests/ui/smoke.js` loads the real renderer in Electron with a stubbed preload and checks layout, search, navigation, window-size requests and that every plugin page mounts inside the island. It does not exercise Windows-only features or real backends.
