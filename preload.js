const { contextBridge, ipcRenderer, webUtils } = require('electron');
const on = (ch, cb) => {
  const f = (_e, data) => cb(data);
  ipcRenderer.on(ch, f);
  return () => ipcRenderer.removeListener(ch, f);   // every subscription can be undone
};

// Island API: a small, explicit surface. No generic channel access.
contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings-get'),
  saveSettings: (s) => ipcRenderer.send('settings-save', s),
  setInteractive: (v) => ipcRenderer.send('interactive', !!v),
  setFocusable: (v) => ipcRenderer.send('focusable', !!v),
  setIslandSize: (mode) => ipcRenderer.send('island-size', mode === 'large' ? 'large' : 'compact'),
  pluginMounted: () => ipcRenderer.send('ey:plugin-mounted'),
  onOpenPlugin: (cb) => on('open-plugin', cb),
  setSystem: (target, value) => ipcRenderer.send('system-set', { target, value }),
  media: (cmd) => ipcRenderer.send('media-key', cmd),
  copyClip: (text) => ipcRenderer.send('clip-copy', text),
  clearClips: () => ipcRenderer.send('clip-clear'),
  quit: () => ipcRenderer.send('quit'),
  onCursor: (cb) => on('cursor', cb),
  onSystem: (cb) => on('system', cb),
  onMedia: (cb) => on('media', cb),
  onClips: (cb) => on('clips', cb),
  onSettings: (cb) => on('settings', cb),
  onOpenPanel: (cb) => on('open-panel', cb),
  onToast: (cb) => on('toast', cb),
  onCoffee: (cb) => on('coffee', cb),
  onWeather: (cb) => on('ey:weather', cb),
  catalog: () => ipcRenderer.invoke('ey:catalog'),
  run: (id) => ipcRenderer.invoke('ey:run', id),
  openHub: (id) => ipcRenderer.invoke('ey:open-hub', id),
  coffeeState: () => ipcRenderer.invoke('ey:coffee'),
  // header: weather, time zone/locale, location
  env: () => ipcRenderer.invoke('ey:env'),
  displays: () => ipcRenderer.invoke('ey:displays'),
  weather: () => ipcRenderer.invoke('ey:weather:get'),
  refreshWeather: () => ipcRenderer.invoke('ey:weather:refresh'),
  searchPlaces: (q) => ipcRenderer.invoke('ey:place:search', String(q || '').slice(0, 80)),
  setPlace: (place) => ipcRenderer.invoke('ey:place:set', place),
  useDeviceLocation: () => ipcRenderer.invoke('ey:location:device'),
  openLocationPrivacy: () => ipcRenderer.invoke('ey:location:open-privacy'),
});

// Generic bridge used by the hub window and the screen overlays. Limited to the
// channel families those windows really use, so a page cannot reach arbitrary IPC.
const ALLOWED = /^(ey:|ov:|hub:|translate:|settings(-get|-save)?$|coffee$)/;
const check = (ch) => { if (typeof ch !== 'string' || !ALLOWED.test(ch)) throw new Error('Blocked IPC channel: ' + String(ch).slice(0, 40)); return ch; };
contextBridge.exposeInMainWorld('eyeland', {
  pathFor: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
  invoke: (ch, ...a) => ipcRenderer.invoke(check(ch), ...a),
  send: (ch, ...a) => ipcRenderer.send(check(ch), ...a),
  on: (ch, cb) => on(check(ch), cb),
});
