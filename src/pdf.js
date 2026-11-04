// Builds PDFs and prints, using a hidden Chromium window.
const { BrowserWindow, app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PAPER = { A4: [210, 297], A3: [297, 420], Letter: [215.9, 279.4] };

async function withWindow(html, fn) {
  const file = path.join(os.tmpdir(), `eyeland-print-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(file, html);
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: true } });
  try {
    await win.loadFile(file);
    await win.webContents.executeJavaScript('Promise.all([...document.images].map(i => i.decode().catch(() => {})))');
    return await fn(win);
  } finally { try { win.destroy(); } catch {} try { fs.unlinkSync(file); } catch {} }
}

function pagesHtml(pages, { paper = 'A4', landscape = false, margin = 10, gray = false } = {}) {
  let [w, h] = PAPER[paper] || PAPER.A4;
  if (landscape) [w, h] = [h, w];
  return `<!doctype html><meta charset="utf-8"><style>
    @page{size:${w}mm ${h}mm;margin:0} html,body{margin:0;background:#fff}
    .p{width:${w}mm;height:${h}mm;padding:${margin}mm;box-sizing:border-box;page-break-after:always;display:flex;align-items:center;justify-content:center;overflow:hidden}
    .p:last-child{page-break-after:auto} img{max-width:100%;max-height:100%;object-fit:contain;${gray ? 'filter:grayscale(1);' : ''}}
  </style>${pages.map((s) => `<div class="p"><img src="${s}"></div>`).join('')}`;
}

async function pagesToPdf(pages, opts = {}) {
  return withWindow(pagesHtml(pages, opts), (win) => win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } }));
}

async function printPages(pages, o) {
  const html = pagesHtml(pages, { paper: o.paper, landscape: o.landscape, margin: o.margin, gray: o.color === false });
  return withWindow(html, (win) => new Promise((resolve, reject) => {
    win.webContents.print({
      silent: true, printBackground: true, deviceName: o.printer || undefined, color: o.color !== false,
      landscape: !!o.landscape, copies: Math.max(1, o.copies | 0 || 1), pageSize: o.paper || 'A4',
      duplexMode: o.duplex === 'long' ? 'longEdge' : o.duplex === 'short' ? 'shortEdge' : 'simplex',
      margins: { marginType: 'none' },
    }, (ok, why) => (ok ? resolve() : reject(new Error(why || 'Print failed'))));
  }));
}

/* ---------- documents (txt, md, html) to PDF ---------- */
function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  let out = '', code = false, list = null, para = [];
  const flush = () => { if (para.length) { out += `<p>${para.join(' ')}</p>`; para = []; } };
  const endList = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const line of md.split(/\r?\n/)) {
    if (/^```/.test(line)) { flush(); endList(); out += code ? '</pre>' : '<pre>'; code = !code; continue; }
    if (code) { out += esc(line) + '\n'; continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { flush(); endList(); out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
    else if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) { flush(); if (list !== 'ul') { endList(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = /^\s*\d+\.\s+(.*)$/.exec(line))) { flush(); if (list !== 'ol') { endList(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; }
    else if (!line.trim()) { flush(); endList(); }
    else para.push(inline(line));
  }
  flush(); endList();
  return out;
}

async function docToPdf(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const txt = fs.readFileSync(file, 'utf8');
  const style = '<style>body{font:12pt/1.5 "Segoe UI",Arial,sans-serif;margin:0;color:#111}pre{white-space:pre-wrap;font:11pt Consolas,monospace}code{font-family:Consolas,monospace;background:#f2f2f2;padding:0 3px}h1,h2,h3{line-height:1.25}</style>';
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html;
  if (ext === 'html' || ext === 'htm') html = txt;
  else if (ext === 'md') html = `<!doctype html><meta charset="utf-8">${style}${mdToHtml(txt)}`;
  else html = `<!doctype html><meta charset="utf-8">${style}<pre>${esc(txt)}</pre>`;
  const dirHtml = html.includes('<base') ? html : html.replace(/<head[^>]*>/i, (m) => `${m}<base href="${require('url').pathToFileURL(path.dirname(file) + path.sep).href}">`);
  return withWindow(dirHtml, (win) => win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } }));
}

module.exports = { pagesToPdf, printPages, docToPdf, PAPER };
