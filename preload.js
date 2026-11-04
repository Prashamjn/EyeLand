const { contextBridge, ipcRenderer, webUtils } = require('electron');
const on = (ch, cb) => ipcRenderer.on(ch, (_e, data) => cb(data));

// Island API (kept from the first version)
contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings-get'),
  saveSettings: (s) => ipcRenderer.send('settings-save', s),
  setInteractive: (v) => ipcRenderer.send('interactive', v),
  setFocusable: (v) => ipcRenderer.send('focusable', v),
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
  catalog: () => ipcRenderer.invoke('ey:catalog'),
  run: (id) => ipcRenderer.invoke('ey:run', id),
  openHub: (id) => ipcRenderer.invoke('ey:open-hub', id),
});

// Generic bridge used by the hub window and the screen overlays
contextBridge.exposeInMainWorld('eyeland', {
  pathFor: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
  invoke: (ch, ...a) => ipcRenderer.invoke(ch, ...a),
  send: (ch, ...a) => ipcRenderer.send(ch, ...a),
  on: (ch, cb) => { const f = (_e, d) => cb(d); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); },
});
