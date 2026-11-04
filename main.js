const { app, BrowserWindow, ipcMain, screen, clipboard, Tray, Menu, nativeImage, globalShortcut, powerSaveBlocker, dialog, shell, session } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

const CATALOG = require('./shared/catalog.js');
const media = require('./src/media');
const pdf = require('./src/pdf');
const net = require('./src/net');
const yt = require('./src/youtube');
const cleaner = require('./src/cleaner');
const sysinfo = require('./src/sysinfo');
const speed = require('./src/speedtest');
const voice = require('./src/voice');
const { createShare } = require('./src/share');
const { uniquePath } = require('./src/util');

if (!app.requestSingleInstanceLock()) app.quit();

const W = 560, H = 300;
const nativeDir = path.join(__dirname, 'native').replace('app.asar', 'app.asar.unpacked');
const PS = (file, args) => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(nativeDir, file), ...args];

const defaultShortcuts = Object.fromEntries(CATALOG.map((p) => [p.id, p.key]));
const defaults = {
  position: 'top', offsetY: 0, eyeColor: '#b8ffa3', animSpeed: 1, theme: 'black',
  hoverDelay: 120, overlayMs: 1800, autostart: false, clipboardHistory: false,
  focusMin: 25, breakMin: 5, notes: '', showBattery: true,
  hideInFullscreen: true, shortcuts: defaultShortcuts, coffeeMinutes: 0,
  todos: [], events: {}, colorFormat: 'hex', colorHistory: [], ocrLang: 'eng', translateTo: 'en',
  lensEngine: 'google', lensConsent: false, weatherPlace: null, tempUnit: 'c',
};
let settings = { ...defaults }, win, hub, tray, clips = [], lastClip = '';
let hubReady = false, pendingHub = null;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { settings = { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { settings = { ...defaults }; }
  settings.shortcuts = { ...defaultShortcuts, ...(settings.shortcuts || {}) };
}
const saveFile = () => { try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch {} };
const S = () => settings;

/* ---------- messaging ---------- */
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
const sendHub = (ch, data) => { if (hub && !hub.isDestroyed()) hub.webContents.send(ch, data); };
const broadcast = (ch, data, except) => {
  for (const w of [win, hub]) if (w && !w.isDestroyed() && w.webContents !== except) w.webContents.send(ch, data);
};
const toast = (t) => send('toast', t);
function saveSettings(partial, except) {
  settings = { ...settings, ...partial };
  saveFile();
  broadcast('settings', settings, except);
}

/* ---------- island window ---------- */
function place() {
  const b = screen.getPrimaryDisplay().bounds;
  const x = Math.round(b.x + (b.width - W) / 2);
  const y = settings.position === 'bottom' ? b.y + b.height - H : b.y;
  win.setBounds({ x, y, width: W, height: H });
}

function createWindow() {
  win = new BrowserWindow({
    width: W, height: H, frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false, show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true);
  place();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => updateIsland());
  screen.on('display-metrics-changed', place);
  screen.on('display-added', place);
  screen.on('display-removed', place);
}

/* ---------- show/hide: full-screen apps and screen capture ---------- */
let fullscreen = false, capturing = false, hubWasVisible = false, ignoreFsUntil = 0;
function updateIsland() {
  if (!win || win.isDestroyed()) return;
  const fs_ = fullscreen && Date.now() > ignoreFsUntil;
  const show = !capturing && !(settings.hideInFullscreen && fs_);
  if (show && !win.isVisible()) win.showInactive();
  if (!show && win.isVisible()) win.hide();
}
function hideForCapture(on, alsoHub = true) {
  capturing = on;
  if (on) {
    if (alsoHub && hub && !hub.isDestroyed() && hub.isVisible()) { hubWasVisible = true; hub.hide(); }
  } else {
    ignoreFsUntil = Date.now() + 900;
    setTimeout(updateIsland, 950);
    if (hubWasVisible && hub && !hub.isDestroyed()) { hub.show(); }
    hubWasVisible = false;
  }
  updateIsland();
}

/* ---------- hub window (plugins) ---------- */
function createHub() {
  const build = parseInt((os.release().split('.')[2] || '0'), 10);
  const glass = process.platform === 'win32' && build >= 22621;
  hub = new BrowserWindow({
    width: 1000, height: 680, minWidth: 780, minHeight: 540, show: false, autoHideMenuBar: true, title: 'Eyeland',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: '#e6e8ea', height: 40 },
    backgroundColor: glass ? '#00000000' : '#17181b',
    ...(glass ? { backgroundMaterial: 'acrylic' } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  hubReady = false;
  hub.loadFile(path.join(__dirname, 'hub', 'index.html'), { query: { glass: glass ? '1' : '0' } });
  hub.webContents.on('did-finish-load', () => {
    hubReady = true;
    if (pendingHub) { sendHub('hub:open', { id: pendingHub }); pendingHub = null; }
  });
  hub.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); hub.hide(); } });
}
function openHub(id) {
  if (!hub || hub.isDestroyed()) createHub();
  if (hubReady) sendHub('hub:open', { id }); else pendingHub = id;
  hub.show(); hub.focus();
}
const showHub = openHub;

/* ---------- cursor tracking ---------- */
let lastPt = { x: -1, y: -1 };
setInterval(() => {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const p = screen.getCursorScreenPoint();
  if (p.x === lastPt.x && p.y === lastPt.y) return;
  lastPt = p;
  const b = win.getBounds();
  send('cursor', { x: p.x - b.x, y: p.y - b.y });
}, 16);

/* ---------- native helpers ---------- */
function lineReader(proc, onLine) {
  let buf = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) onLine(l); } });
}
let procs = [];
function keepAlive(file, args, onLine) {
  const start = () => {
    const p = spawn('powershell.exe', PS(file, args), { windowsHide: true });
    procs.push(p);
    lineReader(p, onLine);
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (d) => console.error(`[${file}]`, String(d).trim()));
    p.on('error', (e) => console.error(`[${file}] could not start:`, e.message));
    p.on('exit', () => { procs = procs.filter((x) => x !== p); if (!app.isQuitting) setTimeout(start, 3000); });
  };
  start();
}
function startWatchers() {
  keepAlive('sys.ps1', ['-Mode', 'watch'], (l) => {
    const [kind, a, b] = l.split('|');
    if (kind === 'vol') send('system', { kind: 'vol', value: +a, muted: b === '1' });
    if (kind === 'bri') send('system', { kind: 'bri', value: a === 'na' ? null : +a });
    if (kind === 'fs') { fullscreen = a === '1'; updateIsland(); }
  });
  keepAlive('media.ps1', [], (l) => { try { send('media', JSON.parse(l)); } catch {} });
}
ipcMain.on('system-set', (_e, { target, value }) => execFile('powershell.exe', PS('sys.ps1', ['-Mode', 'set', '-Target', String(target), '-Value', String(Math.round(value))]), { windowsHide: true }, () => {}));
ipcMain.on('media-key', (_e, cmd) => execFile('powershell.exe', PS('sys.ps1', ['-Mode', 'key', '-Target', String(cmd)]), { windowsHide: true }, () => {}));

/* ---------- island window interaction ---------- */
ipcMain.on('interactive', (_e, on) => win && win.setIgnoreMouseEvents(!on));
ipcMain.on('focusable', (_e, on) => { if (!win) return; win.setFocusable(!!on); if (on) win.focus(); });
ipcMain.on('quit', () => app.quit());

/* ---------- clipboard history (opt-in) ---------- */
setInterval(() => {
  if (!settings.clipboardHistory) return;
  let t; try { t = clipboard.readText(); } catch { return; }
  if (!t || t === lastClip) return;
  lastClip = t;
  clips = [t, ...clips.filter((c) => c !== t)].slice(0, 15);
  send('clips', clips);
}, 900);
ipcMain.on('clip-copy', (_e, t) => { lastClip = t; clipboard.writeText(t); });
ipcMain.on('clip-clear', () => { clips = []; send('clips', clips); });

/* ---------- coffee mode ---------- */
let coffeeId = null, coffeeTimer = null;
function setCoffee(on) {
  if (on && coffeeId === null) {
    coffeeId = powerSaveBlocker.start('prevent-display-sleep');
    if (settings.coffeeMinutes > 0) coffeeTimer = setTimeout(() => setCoffee(false), settings.coffeeMinutes * 60000);
  }
  if (!on && coffeeId !== null) { powerSaveBlocker.stop(coffeeId); coffeeId = null; clearTimeout(coffeeTimer); }
  broadcast('coffee', coffeeId !== null);
  toast({ icon: 'coffee', text: coffeeId !== null ? 'Coffee mode on, screen stays awake' : 'Coffee mode off' });
}

/* ---------- screen plugins ---------- */
const capture = require('./src/capture')({ settings: S, saveSettings: (p) => saveSettings(p), toast, hideForCapture, showHub, sendHub });
capture.register(ipcMain);

function runPlugin(id) {
  switch (id) {
    case 'textExtract': return capture.start('text');
    case 'lens': return capture.start('lens');
    case 'colorPicker': return capture.start('color');
    case 'draw': return capture.start('draw');
    case 'coffee': return setCoffee(coffeeId === null);
    default: return openHub(id);
  }
}
const shortcutRun = (id) => (id === 'translate' ? capture.start('translate') : runPlugin(id));

/* ---------- keyboard shortcuts ---------- */
const registered = new Map();
function applyShortcut(id) {
  const old = registered.get(id);
  if (old) { try { globalShortcut.unregister(old); } catch {} registered.delete(id); }
  const key = settings.shortcuts[id];
  if (!key) return { ok: true };
  try {
    const ok = globalShortcut.register(key, () => shortcutRun(id));
    if (!ok) return { ok: false, error: 'Already used by another app' };
    registered.set(id, key);
    return { ok: true };
  } catch (e) { return { ok: false, error: 'Not a valid shortcut' }; }
}
function registerAll() { const errors = {}; for (const p of CATALOG) { const r = applyShortcut(p.id); if (!r.ok) errors[p.id] = r.error; } return errors; }
ipcMain.handle('ey:shortcut-set', (_e, id, key) => {
  if (key) for (const [other, k] of Object.entries(settings.shortcuts)) if (other !== id && k && k.toLowerCase() === key.toLowerCase()) return { ok: false, error: 'Already used by ' + (CATALOG.find((c) => c.id === other) || {}).name };
  const prev = settings.shortcuts[id];
  settings.shortcuts = { ...settings.shortcuts, [id]: key };
  const r = applyShortcut(id);
  if (!r.ok) { settings.shortcuts[id] = prev; applyShortcut(id); return r; }
  saveSettings({ shortcuts: settings.shortcuts });
  return { ok: true };
});
ipcMain.handle('ey:shortcut-errors', () => registerAll());

/* ---------- generic IPC ---------- */
ipcMain.handle('settings-get', () => settings);
ipcMain.on('settings-save', (e, s) => {
  const old = settings;
  saveSettings(s, e.sender);
  place();
  app.setLoginItemSettings({ openAtLogin: !!settings.autostart });
  if (!settings.clipboardHistory) { clips = []; send('clips', clips); }
  if (old.hideInFullscreen !== settings.hideInFullscreen) updateIsland();
});
ipcMain.handle('ey:catalog', () => CATALOG.map((p) => ({ ...p, key: settings.shortcuts[p.id] || '' })));
ipcMain.handle('ey:run', (_e, id) => runPlugin(id));
ipcMain.handle('ey:open-hub', (_e, id) => openHub(id || 'todo'));
ipcMain.handle('ey:coffee', () => coffeeId !== null);
ipcMain.handle('ey:fetch-json', (_e, url) => net.fetchJSON(url));
ipcMain.handle('ey:ip-location', () => net.ipLocation());
ipcMain.handle('ey:translate', (_e, text, to, from) => net.translate(text, to, from));

ipcMain.handle('ey:copy', (_e, text) => { clipboard.writeText(String(text)); return true; });
ipcMain.handle('ey:copy-image', (_e, dataUrl) => { clipboard.writeImage(nativeImage.createFromDataURL(dataUrl)); return true; });
ipcMain.handle('ey:save-dialog', async (e, { defaultName, filters, base64, text }) => {
  const parent = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(parent, { defaultPath: path.join(app.getPath('downloads'), defaultName || 'file'), filters });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, base64 != null ? Buffer.from(base64, 'base64') : String(text || ''));
  return r.filePath;
});
ipcMain.handle('ey:write-file', (_e, { dir, name, base64 }) => {
  fs.mkdirSync(dir, { recursive: true });
  const p = uniquePath(path.join(dir, name));
  fs.writeFileSync(p, Buffer.from(base64, 'base64'));
  return p;
});
ipcMain.handle('ey:pick', async (e, { filters, multi }) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openFile', ...(multi ? ['multiSelections'] : [])], filters });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('ey:readfile', (_e, p) => {
  const st = fs.statSync(p);
  if (st.size > 400 * 1024 * 1024) throw new Error('File is too large');
  return fs.readFileSync(p).toString('base64');
});
ipcMain.handle('ey:fileinfo', (_e, p) => { const st = fs.statSync(p); return { size: st.size, name: path.basename(p), dir: path.dirname(p), ext: media.extOf(p), category: media.category(media.extOf(p)) }; });
ipcMain.handle('ey:reveal', (_e, p) => { shell.showItemInFolder(p); });
ipcMain.handle('ey:open-path', (_e, p) => shell.openPath(p));
ipcMain.handle('ey:open-external', (_e, u) => { if (/^https?:\/\//i.test(u)) shell.openExternal(u); });

/* ---------- files: convert, compress, print ---------- */
ipcMain.handle('ey:ff:targets', (_e, p) => { const c = media.category(media.extOf(p)); return { category: c, targets: media.TARGETS[c] || [] }; });
ipcMain.handle('ey:convert', async (e, { id, input, to }) => {
  const cat = media.category(media.extOf(input));
  const emit = (d) => e.sender.send('ey:progress', d);
  if (to === 'pdf') {
    const { dir, name } = path.parse(input);
    const out = uniquePath(path.join(dir, name + '.pdf'));
    let buf;
    if (cat === 'doc') buf = await pdf.docToPdf(input);
    else {
      const ext = media.extOf(input), mime = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp', bmp: 'bmp', tif: 'tiff', tiff: 'tiff' }[ext] || 'png';
      const img = nativeImage.createFromPath(input);
      const src = ['jpeg', 'png'].includes(mime) ? `data:image/${mime};base64,${fs.readFileSync(input).toString('base64')}` : 'data:image/png;base64,' + img.toPNG().toString('base64');
      const { width, height } = img.getSize();
      buf = await pdf.pagesToPdf([src], { paper: 'A4', landscape: width > height, margin: 8 });
    }
    fs.writeFileSync(out, buf);
    emit({ id, percent: 100 });
    return { output: out, before: fs.statSync(input).size, after: buf.length };
  }
  return media.convert({ id, input, to }, emit);
});
ipcMain.handle('ey:compress', (e, a) => media.compress(a, (d) => e.sender.send('ey:progress', d)));
ipcMain.handle('ey:ff:cancel', (_e, id) => media.cancel(id));
ipcMain.handle('ey:pages-to-pdf', async (_e, { pages, opts }) => (await pdf.pagesToPdf(pages, opts || {})).toString('base64'));
ipcMain.handle('ey:doc:topdf', async (_e, p) => (await pdf.docToPdf(p)).toString('base64'));
ipcMain.handle('ey:print:printers', async () => { const l = await win.webContents.getPrintersAsync(); return l.map((p) => ({ name: p.name, display: p.displayName || p.name, isDefault: !!p.isDefault })); });
ipcMain.handle('ey:print:run', async (e, { mode, pages, opts }) => {
  if (mode === 'pdf') {
    const buf = await pdf.pagesToPdf(pages, { paper: opts.paper, landscape: opts.landscape, margin: opts.margin, gray: opts.color === false });
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: path.join(app.getPath('documents'), 'Print.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return { cancelled: true };
    fs.writeFileSync(r.filePath, buf);
    return { path: r.filePath };
  }
  await pdf.printPages(pages, opts);
  return { ok: true };
});
ipcMain.handle('ey:print:office', (_e, { file, printer }) => new Promise((resolve, reject) => {
  const q = (s) => String(s).replace(/'/g, "''");
  const cmd = printer ? `Start-Process -FilePath '${q(file)}' -Verb PrintTo -ArgumentList '"${q(printer)}"'` : `Start-Process -FilePath '${q(file)}' -Verb Print`;
  execFile('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true }, (err) => (err ? reject(err) : resolve(true)));
}));

/* ---------- voice, youtube, cleaner, system, speed, share ---------- */
ipcMain.handle('ey:voice:list', () => voice.list());
ipcMain.handle('ey:voice:save', (_e, a) => voice.save(a));
ipcMain.handle('ey:voice:read', (_e, id) => voice.read(id));
ipcMain.handle('ey:voice:delete', (_e, id) => voice.remove(id));
ipcMain.handle('ey:voice:rename', (_e, id, name) => voice.rename(id, name));
ipcMain.handle('ey:voice:export', async (e, id, format, name) => {
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: path.join(app.getPath('music'), `${(name || 'memo').replace(/[<>:"/\\|?*]/g, '_')}.${format}`), filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  if (r.canceled || !r.filePath) return null;
  return voice.exportAs(id, format, r.filePath);
});

ipcMain.handle('ey:yt:status', () => yt.status());
ipcMain.handle('ey:yt:install', (e) => yt.install((d) => e.sender.send('ey:yt:install', d)));
ipcMain.handle('ey:yt:update', () => yt.update());
ipcMain.handle('ey:yt:info', (_e, url) => yt.info(url));
ipcMain.handle('ey:yt:download', (e, a) => yt.download(a, (d) => e.sender.send('ey:yt:progress', d)));
ipcMain.handle('ey:yt:cancel', (_e, id) => yt.cancel(id));

ipcMain.handle('ey:clean:scan', (_e, o) => cleaner.scan(o));
ipcMain.handle('ey:clean:run', (e, o) => cleaner.clean(o, (d) => e.sender.send('ey:clean:progress', d)));

ipcMain.handle('ey:sys:stats', () => sysinfo.stats());
ipcMain.handle('ey:sys:details', () => sysinfo.details());
ipcMain.handle('ey:sys:disks', () => sysinfo.disks());

ipcMain.handle('ey:speed:run', (e) => speed.run((d) => e.sender.send('ey:speed', d)));
ipcMain.handle('ey:speed:cancel', () => speed.cancel());

const share = createShare((snap) => sendHub('ey:share:update', snap));
ipcMain.handle('ey:share:ips', () => share.lanIps());
ipcMain.handle('ey:share:start', (_e, { mode, files, ip }) => share.start({ mode, files, ip, dir: path.join(app.getPath('downloads'), 'Eyeland Received') }));
ipcMain.handle('ey:share:stop', () => share.stop());
ipcMain.handle('ey:share:snapshot', () => share.snapshot());

/* ---------- tray ---------- */
function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
  tray.setToolTip('Eyeland');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open panel', click: () => send('open-panel', {}) },
    { label: 'Open plugins', click: () => openHub('todo') },
    { label: 'Quit Eyeland', click: () => app.quit() },
  ]));
  tray.on('click', () => send('open-panel', {}));
}

app.whenReady().then(() => {
  loadSettings();
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'media');
  app.setLoginItemSettings({ openAtLogin: !!settings.autostart });
  createWindow(); createTray(); startWatchers();
  const errs = registerAll();
  if (Object.keys(errs).length) console.warn('[shortcuts] could not register:', errs);
});
app.on('second-instance', () => send('open-panel', {}));
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => { app.isQuitting = true; share.stop(); procs.forEach((p) => { try { p.kill(); } catch {} }); });
app.on('window-all-closed', () => app.quit());
