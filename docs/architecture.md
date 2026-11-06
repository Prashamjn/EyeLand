# EyeLand architecture (Phase 2, Batch A)

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

## Phase 3: dynamic feedback

### Charger connect sound (`shared/power-events.js`, `shared/chime.js`)
- **Detection (main process).** `powerMonitor` `on-ac` / `on-battery` (native Windows events, no polling) feed a small tracker. The initial state is read once from `isOnBatteryPower()` and only recorded, so launching with the charger already plugged in is silent. The tracker reports a connection only for a real battery to AC transition, and swallows duplicate `on-ac` events, a connect within 1.2 s of the previous one (bouncing contact), and anything within 4 s after a `resume` from sleep (state is still tracked and re-read).
- **Bridge.** One event, `ey:power` `{ onAc, connected }`, and one query, `ey:power:get`, exposed as `api.onPower` / `api.powerState`. `connected` is true only for the transition above; a disconnect sends `{ onAc: false, connected: false }` and is state only. No generic channel access was added.
- **Sound (renderer).** Original Web Audio synthesis, no file and no network: two soft sine notes (G5, D6) with a quiet octave partial, ~550 ms. Envelope peaks are fixed, so the level only depends on the volume setting. The player never throws, ignores a second request inside 700 ms, creates the `AudioContext` lazily, and suspends it shortly after the sound so the audio device is released. The island window sets `autoplayPolicy: 'no-user-gesture-required'` (it is click-through and never gets a gesture); `contextIsolation` and `nodeIntegration` are unchanged.
- **Visual.** On connect the existing charging activity is posted with a `pulse` stamp and the charging icon plays a one-shot green ring (`chg-ring`, 1.1 s). Disconnecting does not play it. Phase 2's "Charger disconnected" notice (Battery API) is unchanged.
- **Settings.** `chargingSound` (default `true`) and `chargingSoundVolume` (0 to 100, default `60`) are in `defaults` in `main.js` and in the settings form. They are read at event time, so a change applies immediately. `settings-save` clamps the volume and normalises the toggle. No migration: stored files are merged over the defaults and every existing key is kept.

### Three-line music indicator (`shared/eq-state.js`, `renderer/js/eq.js`)
- `#eq` (three `<i>` bars) sits in the idle layer of the collapsed island. It replaces the small 4-bar chip that used to show in the idle pill while music played; the 4-bar `.wave` in the media peek and the expanded media card is untouched.
- State comes from the same media feed as Phase 2 (`feeds.js`): the one session Windows reports as current. Playing starts the animation at once; a pause is settled for 250 ms so a track change or two apps trading the active session cannot flicker it; "no media session" rests immediately.
- Only `transform` is animated, with a different keyframe set, length and start delay per bar, all beginning and ending on the resting pose. There is no JS animation loop. The animation is paused while the pill is hidden (expanded or showing an activity). On pause the current pose is read once and eased to the resting pose with a CSS transition. With reduced motion (`prefers-reduced-motion`) nothing animates; the lines just switch between the resting and a taller "playing" pose.

### Tests
`tests/power-events.test.js`, `tests/chime.test.js`, `tests/eq-state.test.js` are pure unit tests. `tests/ui/phase3-checks.js` holds the UI checks (run by `tests/ui/smoke.js` in Electron). Real Windows power events and Windows media sessions are not covered by any automated test.
