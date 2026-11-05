// TEST-ONLY preload for the UI smoke test. It stands in for the real preload so the renderer can run in a plain
// Electron window on any OS. It does NOT replace any product code: Windows features (media, brightness,
// native overlays, printers, ...) are simply not available here and are reported as unverified.
const { contextBridge } = require('electron');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CATALOG = require(path.join(ROOT, 'shared', 'catalog.js'));
const { migrateSettings } = require(path.join(ROOT, 'shared', 'registry.js'));

const settings = migrateSettings({
  theme: 'black', position: 'top', animSpeed: 1, hoverDelay: 120, overlayMs: 1800, focusMin: 25, breakMin: 5, showBattery: false,
  todos: [{ id: 'a1', text: 'Buy milk', done: false, created: 1 }, { id: 'a2', text: 'Call the bank', done: true, created: 2 }],
  events: {}, shortcuts: Object.fromEntries(CATALOG.map((p) => [p.id, p.key])), tempUnit: 'c',
  weatherPlace: { name: 'Kota, Rajasthan', lat: 25.18, lon: 75.83 }, showHeader: true,   // legacy key must be harmless
});
const log = { saved: [], calls: [] };
const subs = {};
const on = (ch, cb) => { (subs[ch] = subs[ch] || []).push(cb); return () => { subs[ch] = (subs[ch] || []).filter((x) => x !== cb); }; };
const weather = { ok: true, data: { icon: 'sun', temp: 31, place: 'Kota, Rajasthan', text: 'Clear', fetchedAt: Date.now() } };
const call = (n, ...a) => log.calls.push([n, ...a]);

contextBridge.exposeInMainWorld('api', {
  getSettings: async () => settings,
  saveSettings: (s) => { Object.assign(settings, s); log.saved.push(Object.keys(s)); },
  setInteractive: (v) => call('interactive', v), setFocusable: (v) => call('focusable', v), setIslandSize: (m) => call('size', m),
  pluginMounted: () => call('mounted'), setSystem: () => {}, media: () => {}, copyClip: () => {}, clearClips: () => {}, quit: () => {},
  onCursor: (cb) => on('cursor', cb), onSystem: (cb) => on('system', cb), onMedia: (cb) => on('media', cb), onClips: (cb) => on('clips', cb),
  onSettings: (cb) => on('settings', cb), onOpenPanel: (cb) => on('open-panel', cb), onToast: (cb) => on('toast', cb), onCoffee: (cb) => on('coffee', cb),
  onWeather: (cb) => on('ey:weather', cb), onOpenPlugin: (cb) => on('open-plugin', cb),
  catalog: async () => CATALOG.map((p) => ({ ...p, key: settings.shortcuts[p.id] || '' })),
  run: async (id) => call('run', id), openHub: async () => {}, coffeeState: async () => false,
  env: async () => ({ locale: 'en-IN' }), displays: async () => [], weather: async () => weather, refreshWeather: async () => weather,
  searchPlaces: async () => ({ ok: true, results: [] }), setPlace: async () => ({ ok: true }), useDeviceLocation: async () => ({ ok: false, error: 'unavailable' }), openLocationPrivacy: async () => {},
});
const INVOKE = {
  'settings-get': () => settings, 'ey:catalog': () => CATALOG.map((p) => ({ ...p, key: settings.shortcuts[p.id] || '' })),
  'ey:ip-location': () => ({ name: 'Kota', lat: 25.18, lon: 75.83 }), 'ey:coffee': () => false, 'ey:sys:stats': () => ({ cpu: { total: 12, cores: [10, 14, 8, 20] }, mem: { used: 8e9, total: 16e9 }, uptime: 7200 }),
  'ey:sys:details': () => ({ host: 'TEST-PC', user: 'tester', os: 'Windows 11', arch: 'x64', cpu: 'Test CPU', cores: 4, mem: 16e9, gpu: '', disks: [], nets: [] }), 'ey:sys:disks': () => [], 'ey:voice:list': () => [], 'ey:yt:status': () => ({ installed: false }), 'ey:print:printers': () => [],
  'ey:clean:scan': () => [], 'ey:share:ips': () => ['192.168.1.20'], 'ey:share:snapshot': () => null, 'ey:shortcut-errors': () => ({}),
};
contextBridge.exposeInMainWorld('eyeland', {
  pathFor: () => '',
  invoke: async (ch, ...a) => { call('invoke', ch); return INVOKE[ch] ? INVOKE[ch](...a) : null; },
  send: (ch, ...a) => { call('send', ch); if (ch === 'settings-save') { Object.assign(settings, a[0]); log.saved.push(Object.keys(a[0])); } },
  on: (ch, cb) => on(ch, cb),
});
contextBridge.exposeInMainWorld('__test', { log: () => JSON.parse(JSON.stringify(log)), emit: (ch, d) => (subs[ch] || []).forEach((cb) => cb(d)), settings: () => JSON.parse(JSON.stringify(settings)) });
