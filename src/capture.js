// Screen plugins: text extractor, lens search, color picker, draw on screen.
const { BrowserWindow, desktopCapturer, screen, clipboard, globalShortcut, shell, dialog, app } = require('electron');
const path = require('path');
const { sleep, unpacked } = require('./util');

module.exports = function createCapture(ctx) {
  let session = null;          // { mode, opts, display, img, win }
  let worker = null, workerLang = null;

  /* ---------- OCR (tesseract.js, runs in the main process) ---------- */
  async function ocr(png, lang) {
    const Tesseract = require('tesseract.js');
    if (!worker || workerLang !== lang) {
      if (worker) { try { await worker.terminate(); } catch {} }
      const opts = { cachePath: path.join(app.getPath('userData'), 'tessdata') };
      try {
        const wp = require.resolve('tesseract.js/src/worker-script/node/index.js');
        if (wp.includes('app.asar')) opts.workerPath = unpacked(wp);
      } catch {}
      worker = await Tesseract.createWorker(lang, 1, opts);
      workerLang = lang;
    }
    const { data } = await worker.recognize(png);
    return (data.text || '').replace(/[ \t]+\n/g, '\n').trim();
  }

  function prepare(img) {
    const { width, height } = img.getSize();
    const k = height < 120 ? 3 : height < 360 ? 2 : 1;      // small text reads better when enlarged
    return (k > 1 ? img.resize({ width: width * k, quality: 'best' }) : img).toPNG();
  }

  async function extractText(img) {
    const text = await ocr(prepare(img), ctx.settings().ocrLang || 'eng');
    return text;
  }

  /* ---------- lens ---------- */
  async function uploadTemp(png) {
    const fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('time', '1h');
    fd.append('fileToUpload', new Blob([png], { type: 'image/png' }), 'eyeland.png');
    const r = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: fd });
    const t = (await r.text()).trim();
    if (!/^https?:\/\//.test(t)) throw new Error(t || 'Upload failed');
    return t;
  }
  function lensUrl(engine, u) {
    const e = encodeURIComponent(u);
    if (engine === 'bing') return `https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIVSP&sbisrc=UrlPaste&q=imgurl:${e}`;
    if (engine === 'yandex') return `https://yandex.com/images/search?rpt=imageview&url=${e}`;
    return `https://lens.google.com/uploadbyurl?url=${e}`;
  }
  async function lens(img) {
    const S = ctx.settings();
    if (!S.lensConsent) {
      const r = await dialog.showMessageBox({
        type: 'question', buttons: ['Continue', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Lens search',
        message: 'Upload the selected area for searching?',
        detail: 'Search engines need a web address for the image. Eyeland uploads only the area you selected to a temporary host (catbox.moe, deleted after 1 hour) and opens the search in your browser.',
      });
      if (r.response !== 0) return;
      ctx.saveSettings({ lensConsent: true });
    }
    ctx.toast({ icon: 'search', text: 'Uploading selection' });
    try {
      const url = await uploadTemp(img.toPNG());
      shell.openExternal(lensUrl(S.lensEngine || 'google', url));
      ctx.toast({ icon: 'check', text: 'Opened in your browser' });
    } catch (e) { ctx.toast({ icon: 'warn', text: 'Lens upload failed' }); }
  }

  /* ---------- color ---------- */
  function formatColor(r, g, b, f) {
    if (f === 'rgb') return `rgb(${r}, ${g}, ${b})`;
    if (f === 'hsl') {
      const R = r / 255, G = g / 255, B = b / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
      let hh = 0; const l = (mx + mn) / 2, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      if (d) hh = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
      return `hsl(${Math.round((hh * 60 + 360) % 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
    }
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function colorPicked({ r, g, b }) {
    const S = ctx.settings();
    const text = formatColor(r, g, b, S.colorFormat || 'hex');
    clipboard.writeText(text);
    const hex = formatColor(r, g, b, 'hex');
    ctx.saveSettings({ colorHistory: [hex, ...(S.colorHistory || []).filter((c) => c !== hex)].slice(0, 16) });
    ctx.toast({ icon: 'color', color: hex, text: 'Copied ' + text });
  }

  /* ---------- overlay window ---------- */
  function cleanup() {
    if (!session) return;
    const s = session; session = null;
    if (s.mode === 'draw') { try { globalShortcut.unregister('Escape'); } catch {} }
    ctx.hideForCapture(false);
  }

  async function start(mode, opts = {}) {
    if (session) return;
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    session = { mode, opts, display: d };
    ctx.hideForCapture(true, mode !== 'draw');
    await sleep(170);
    if (mode !== 'draw') {
      try {
        const w = Math.round(d.bounds.width * d.scaleFactor), h = Math.round(d.bounds.height * d.scaleFactor);
        const srcs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: w, height: h } });
        const src = srcs.find((s) => String(s.display_id) === String(d.id)) || srcs[0];
        session.img = src.thumbnail;
      } catch (e) { cleanup(); ctx.toast({ icon: 'warn', text: 'Could not capture the screen' }); return; }
    }
    const draw = mode === 'draw';
    const win = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
      frame: false, transparent: draw, backgroundColor: draw ? '#00000000' : '#000000', alwaysOnTop: true,
      skipTaskbar: true, resizable: false, movable: false, hasShadow: false, show: false, fullscreenable: false,
      enableLargerThanScreen: true,
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false },
    });
    session.win = win;
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setBounds(d.bounds);
    win.loadFile(path.join(__dirname, '..', 'overlay', 'overlay.html'));
    win.once('ready-to-show', () => { win.show(); win.focus(); });
    win.on('closed', cleanup);
    if (draw) globalShortcut.register('Escape', () => { if (session && session.win) session.win.close(); });
  }

  function ready() {
    if (!session) return null;
    const { mode, display, img } = session;
    const out = { mode, w: display.bounds.width, h: display.bounds.height, colorFormat: ctx.settings().colorFormat };
    if (img) {
      const size = img.getSize();
      out.imgW = size.width; out.imgH = size.height;
      out.image = mode === 'color' ? 'data:image/png;base64,' + img.toPNG().toString('base64') : 'data:image/jpeg;base64,' + img.toJPEG(88).toString('base64');
    }
    return out;
  }

  async function crop(r) {
    if (!session || !session.img) return;
    const { mode, opts, img } = session;
    const size = img.getSize();
    const x = Math.max(0, Math.min(size.width - 2, Math.round(r.x))), y = Math.max(0, Math.min(size.height - 2, Math.round(r.y)));
    const rect = { x, y, width: Math.max(2, Math.min(size.width - x, Math.round(r.w))), height: Math.max(2, Math.min(size.height - y, Math.round(r.h))) };
    const piece = img.crop(rect);
    session.win.close();                       // the screen is back immediately; work continues in the background
    if (mode === 'lens') return lens(piece);
    ctx.toast({ icon: 'search', text: 'Reading text' });
    try {
      const text = await extractText(piece);
      if (!text) return ctx.toast({ icon: 'warn', text: 'No text found' });
      if (mode === 'translate' || opts.returnTo === 'translate') {
        ctx.showHub('translate'); ctx.sendHub('translate:text', { text });
        return ctx.toast({ icon: 'check', text: 'Text ready to translate' });
      }
      clipboard.writeText(text);
      ctx.toast({ icon: 'copy', text: `Copied ${text.length} characters` });
    } catch (e) {
      ctx.toast({ icon: 'warn', text: 'Text extraction failed' });
      console.error('[ocr]', e && e.message);
    }
  }

  function register(ipc) {
    ipc.handle('ov:ready', () => ready());
    ipc.on('ov:crop', (_e, r) => crop(r));
    ipc.on('ov:color', (_e, c) => { colorPicked(c); if (session && session.win) session.win.close(); });
    ipc.on('ov:close', () => { if (session && session.win) session.win.close(); });
    ipc.handle('ey:capture', (_e, mode, opts) => start(mode, opts || {}));
  }

  return { start, register };
};
