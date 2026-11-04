Plugins.register({
  id: 'print',
  mount(root, c) {
    const { h } = c;
    root.append(c.head(c.meta.name, 'Choose a file, check the preview, set the options and print.'));
    const PAPER = { A4: [210, 297], A3: [297, 420], Letter: [215.9, 279.4] };
    const st = { file: null, kind: null, pages: [], cur: 0, printer: '', paper: 'A4', landscape: false, margin: 10, color: true, duplex: 'none', copies: 1, range: '', busy: false };
    const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
    const DOCS = ['txt', 'md', 'html', 'htm'], OFFICE = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf', 'odt'];

    const fileInfo = h('div', {}), sheetBox = h('div', { class: 'row', style: 'justify-content:center;padding:10px 0' }), pageInfo = h('div', { class: 'small muted', style: 'text-align:center;margin-top:8px' });
    const printers = h('select', { class: 'input', onchange: () => (st.printer = printers.value) });
    const status = h('div', { class: 'small', style: 'min-height:20px;margin-top:10px' });
    const bPrint = h('button', { class: 'btn primary', onclick: () => doPrint('print') }, c.icon('print'), 'Print');
    const bPdf = h('button', { class: 'btn', onclick: () => doPrint('pdf') }, 'Save as PDF');
    const bCancel = h('button', { class: 'btn', onclick: reset }, 'Cancel');

    c.ey.invoke('ey:print:printers').then((l) => {
      printers.innerHTML = '';
      if (!l.length) printers.append(h('option', { value: '' }, 'No printers installed'));
      l.forEach((p) => printers.append(h('option', { value: p.name }, p.display + (p.isDefault ? ' (default)' : ''))));
      const d = l.find((p) => p.isDefault) || l[0]; if (d) { printers.value = d.name; st.printer = d.name; }
    }).catch(() => {});

    function parseRange(str, n) {
      if (!str.trim()) return [...Array(n).keys()];
      const set = new Set();
      str.split(',').forEach((tok) => {
        const m = /^\s*(\d*)\s*(-)?\s*(\d*)\s*$/.exec(tok); if (!m || (!m[1] && !m[3])) return;
        const a = m[1] ? +m[1] : 1, b = m[2] ? (m[3] ? +m[3] : n) : a;
        for (let i = Math.max(1, Math.min(a, b)); i <= Math.min(n, Math.max(a, b)); i++) set.add(i - 1);
      });
      return [...set].sort((x, y) => x - y);
    }
    const selected = () => parseRange(st.range, st.pages.length);

    async function load(path) {
      const info = await c.ey.invoke('ey:fileinfo', path), ext = info.ext;
      st.file = info; st.pages = []; st.cur = 0; status.textContent = ''; st.busy = true; paintFile(); paintPreview();
      try {
        if (ext === 'pdf' || DOCS.includes(ext)) {
          st.kind = 'pdf';
          const b64 = ext === 'pdf' ? await c.ey.invoke('ey:readfile', path) : await c.ey.invoke('ey:doc:topdf', path);
          const doc = await c.loadPdf(b64), n = Math.min(doc.numPages, 200);
          for (let i = 1; i <= n; i++) { st.pages.push((await c.renderPage(doc, i, 150 / 72, 'image/jpeg', 0.88)).url); if (i === 1 || i % 5 === 0) { fileInfo.dataset.p = `Preparing page ${i} of ${n}`; paintFile(); } }
          if (doc.numPages > n) status.textContent = `Only the first ${n} pages were loaded.`;
          // landscape documents print better in landscape
          const first = await doc.getPage(1), vp = first.getViewport({ scale: 1 }); st.landscape = vp.width > vp.height;
        } else if (MIME[ext]) {
          st.kind = 'image';
          const url = `data:${MIME[ext]};base64,${await c.ey.invoke('ey:readfile', path)}`;
          const img = new Image(); await new Promise((r) => { img.onload = r; img.src = url; }); st.landscape = img.naturalWidth > img.naturalHeight; st.pages = [url];
        } else if (OFFICE.includes(ext)) st.kind = 'office';
        else { st.file = null; c.toast('This file type cannot be printed here', true); }
      } catch (e) { st.file = null; c.toast('Could not open the file: ' + e.message, true); }
      st.busy = false; delete fileInfo.dataset.p; paintAll();
    }

    function reset() { st.file = null; st.pages = []; st.kind = null; st.range = ''; status.textContent = ''; paintAll(); }

    function paintFile() {
      fileInfo.innerHTML = '';
      if (!st.file) { fileInfo.append(c.dropZone('Drop a PDF, image or document, or click to browse', { multi: false, filters: [{ name: 'Printable files', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'txt', 'md', 'html', 'htm', ...OFFICE] }], onFiles: (f) => load(f[0]) })); return; }
      fileInfo.append(h('div', { class: 'li' }, c.icon('print'), h('div', { class: 'grow' }, h('div', { class: 'trunc' }, st.file.name), h('div', { class: 'small faint' }, fileInfo.dataset.p || `${c.fmtBytes(st.file.size)}${st.pages.length ? ', ' + st.pages.length + ' page' + (st.pages.length > 1 ? 's' : '') : ''}`)),
        h('button', { class: 'btn sm', onclick: async () => { const f = await c.pick([{ name: 'Printable files', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'txt', 'md', 'html', 'htm', ...OFFICE] }], false); if (f[0]) load(f[0]); } }, 'Change')));
    }

    function paintPreview() {
      sheetBox.innerHTML = ''; pageInfo.textContent = '';
      let [w, hh] = PAPER[st.paper]; if (st.landscape) [w, hh] = [hh, w];
      const W = 260, k = W / w, pad = st.margin * k;
      const sheet = h('div', { style: `width:${W}px;height:${Math.round(hh * k)}px;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.45);padding:${pad}px;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#888` });
      const idx = selected();
      if (st.busy) sheet.append('Preparing preview');
      else if (st.kind === 'office') sheet.append(h('div', { style: 'text-align:center;padding:12px;font-size:12px' }, 'No preview for Office files. They are sent to Windows to print.'));
      else if (!st.pages.length) sheet.append('No file selected');
      else if (!idx.length) sheet.append('No pages in range');
      else { const i = idx[Math.min(st.cur, idx.length - 1)]; sheet.append(h('img', { src: st.pages[i], style: `max-width:100%;max-height:100%;object-fit:contain;${st.color ? '' : 'filter:grayscale(1)'}` })); }
      sheetBox.append(sheet);
      if (st.pages.length && idx.length) {
        const cur = Math.min(st.cur, idx.length - 1);
        pageInfo.replaceChildren(h('div', { class: 'row', style: 'justify-content:center' },
          h('button', { class: 'btn icon sm', disabled: cur === 0, onclick: () => { st.cur = cur - 1; paintPreview(); } }, c.icon('left')),
          h('span', {}, `Page ${idx[cur] + 1}, ${idx.length} of ${st.pages.length} will print`),
          h('button', { class: 'btn icon sm', disabled: cur >= idx.length - 1, onclick: () => { st.cur = cur + 1; paintPreview(); } }, c.icon('right'))));
      }
      const ready = st.kind === 'office' ? true : st.pages.length && idx.length;
      bPrint.disabled = !ready || st.busy; bPdf.disabled = !st.pages.length || !idx.length || st.busy || st.kind === 'office'; bCancel.disabled = !st.file;
    }
    function paintAll() { paintFile(); paintPreview(); if (typeof orient !== 'undefined') [...orient.children].forEach((b, i) => b.classList.toggle('on', (i === 1) === st.landscape)); }

    const field = (label, el) => h('div', {}, h('span', { class: 'label' }, label), el);
    const sel = (opts, val, on) => { const s = h('select', { class: 'input', onchange: () => on(s.value) }, opts.map(([v, n]) => h('option', { value: v }, n))); s.value = val; return s; };
    const seg = (opts, val, on) => { const s = h('div', { class: 'seg' }); opts.forEach(([v, n]) => { const b = h('button', { class: v === val ? 'on' : '', onclick: () => { [...s.children].forEach((x) => x.classList.toggle('on', x === b)); on(v); } }, n); s.append(b); }); return s; };

    const margin = h('input', { type: 'range', min: 0, max: 30, value: st.margin }), marginVal = h('span', { class: 'small muted mono' }, '10 mm');
    margin.addEventListener('input', () => { st.margin = +margin.value; marginVal.textContent = st.margin + ' mm'; paintPreview(); });
    const range = h('input', { class: 'input', placeholder: 'All pages, or e.g. 1-3, 5, 8-', oninput: () => { st.range = range.value; st.cur = 0; paintPreview(); } });
    const copies = h('input', { class: 'input', type: 'number', min: 1, max: 99, value: 1, oninput: () => (st.copies = Math.max(1, Math.min(99, +copies.value || 1))) });

    async function doPrint(mode) {
      if (st.busy) return; st.busy = true; paintPreview(); status.className = 'small muted'; status.textContent = mode === 'pdf' ? 'Creating PDF' : 'Sending to printer';
      try {
        if (st.kind === 'office') { await c.ey.invoke('ey:print:office', { file: st.file.dir + '\\' + st.file.name, printer: st.printer }); status.className = 'small ok'; status.textContent = 'Sent to Windows to print.'; }
        else {
          const pages = selected().map((i) => st.pages[i]);
          const r = await c.ey.invoke('ey:print:run', { mode, pages, opts: { printer: st.printer, paper: st.paper, landscape: st.landscape, margin: st.margin, color: st.color, duplex: st.duplex, copies: st.copies } });
          if (r.cancelled) status.textContent = '';
          else { status.className = 'small ok'; status.textContent = mode === 'pdf' ? 'Saved ' + r.path : `Sent ${pages.length} page${pages.length > 1 ? 's' : ''} to the printer.`; if (r.path) c.ey.invoke('ey:reveal', r.path); }
        }
      } catch (e) { status.className = 'small bad'; status.textContent = 'Failed: ' + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
      st.busy = false; paintPreview();
    }

    const orient = seg([['p', 'Portrait'], ['l', 'Landscape']], 'p', (v) => { st.landscape = v === 'l'; paintPreview(); });
    const settings = h('div', { class: 'card' }, h('div', { class: 'stack' },
      field('Printer', printers),
      h('div', { class: 'cols c2' }, field('Paper size', sel([['A4', 'A4'], ['A3', 'A3'], ['Letter', 'Letter']], st.paper, (v) => { st.paper = v; paintPreview(); })),
        field('Orientation', orient)),
      field('Margins', h('div', { class: 'row' }, margin, marginVal)),
      h('div', { class: 'cols c2' }, field('Color', seg([['c', 'Color'], ['b', 'Black and white']], 'c', (v) => { st.color = v === 'c'; paintPreview(); })),
        field('Sides', sel([['none', 'One-sided'], ['long', 'Two-sided, long edge'], ['short', 'Two-sided, short edge']], st.duplex, (v) => (st.duplex = v)))),
      h('div', { class: 'cols c2' }, field('Copies', copies), field('Page range', range))));
    root.append(h('div', { class: 'cols side' }, h('div', {}, h('div', { class: 'card' }, fileInfo), h('div', { style: 'height:12px' }), settings, h('div', { class: 'row', style: 'margin-top:14px' }, bPrint, bPdf, bCancel), status),
      h('div', { class: 'card', style: 'position:sticky;top:0' }, sheetBox, pageInfo)));
    paintAll();
    return () => {};
  },
});
