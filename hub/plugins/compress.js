Plugins.register({
  id: 'compress',
  mount(root, c) {
    const { h } = c;
    root.append(c.head(c.meta.name, 'Make files smaller. The original is never changed, a new file is saved next to it.'));
    let files = [], running = false, level = 'balanced';
    const list = h('div', { class: 'list' });
    const seg = h('div', { class: 'seg' });
    [['light', 'Light'], ['balanced', 'Balanced'], ['strong', 'Strong']].forEach(([k, n]) => { const b = h('button', { class: k === level ? 'on' : '', onclick: () => { level = k; [...seg.children].forEach((x) => x.classList.toggle('on', x === b)); } }, n); seg.append(b); });
    const runBtn = h('button', { class: 'btn primary', onclick: runAll }, 'Reduce size');

    async function add(paths) {
      for (const p of paths) { if (files.some((f) => f.path === p)) continue; files.push({ id: c.uid(), path: p, ...(await c.ey.invoke('ey:fileinfo', p)), status: 'ready', percent: 0 }); }
      paint();
    }
    function paint() {
      list.innerHTML = '';
      if (!files.length) list.append(h('div', { class: 'empty' }, 'Add PDFs, videos, audio, images or any other files.'));
      files.forEach((f) => {
        let right;
        if (f.status === 'running') right = h('div', { style: 'width:150px' }, h('div', { class: 'bar' }, h('i', { style: `width:${f.percent}%` })), h('div', { class: 'small faint mono', style: 'margin-top:3px' }, f.percent ? Math.round(f.percent) + '%' : 'Working'));
        else if (f.status === 'done') {
          const saved = Math.round((1 - f.after / f.before) * 100);
          right = h('div', { class: 'row small' }, h('span', { class: saved > 0 ? 'ok' : 'muted' }, `${c.fmtBytes(f.before)} to ${c.fmtBytes(f.after)}${saved > 0 ? `, ${saved}% smaller` : ', no gain'}`), h('button', { class: 'btn sm', onclick: () => c.ey.invoke('ey:reveal', f.out) }, c.icon('folder'), 'Show'));
          if (f.note) right = h('div', {}, right, h('div', { class: 'small faint' }, f.note));
        } else if (f.status === 'error') right = h('span', { class: 'bad small trunc', style: 'max-width:240px', title: f.error }, f.error);
        else right = h('span', { class: 'faint small' }, 'Ready');
        list.append(h('div', { class: 'li' }, h('div', { class: 'grow' }, h('div', { class: 'trunc' }, f.name), h('div', { class: 'small faint' }, `${f.category === 'other' ? 'will be zipped' : f.category}, ${c.fmtBytes(f.size)}`)), right,
          h('button', { class: 'btn icon sm', disabled: running, title: 'Remove', onclick: () => { files = files.filter((x) => x !== f); paint(); } }, c.icon('close'))));
      });
      runBtn.disabled = running || !files.some((f) => f.status === 'ready' || f.status === 'error');
    }

    // PDFs without Ghostscript: re-render each page as a compressed picture
    async function rasterPdf(f) {
      const L = { light: [1.6, 0.8], balanced: [1.25, 0.65], strong: [0.95, 0.5] }[level];
      const doc = await c.loadPdf(await c.ey.invoke('ey:readfile', f.path)), pages = []; let landscape = false;
      for (let i = 1; i <= doc.numPages; i++) {
        const r = await c.renderPage(doc, i, L[0], 'image/jpeg', L[1]);
        if (i === 1) landscape = r.w > r.h;
        pages.push(r.url); f.percent = (i / doc.numPages) * 90; paint();
      }
      const b64 = await c.ey.invoke('ey:pages-to-pdf', { pages, opts: { paper: 'A4', landscape, margin: 0 } });
      const out = await c.ey.invoke('ey:write-file', { dir: f.dir, name: f.name.replace(/\.pdf$/i, '') + '-small.pdf', base64: b64 });
      const info = await c.ey.invoke('ey:fileinfo', out);
      return { output: out, before: f.size, after: info.size };
    }

    async function runAll() {
      running = true;
      for (const f of files.filter((x) => x.status === 'ready' || x.status === 'error')) {
        f.status = 'running'; f.percent = 0; f.note = ''; paint();
        try {
          let r = await c.ey.invoke('ey:compress', { id: f.id, input: f.path, level });
          if (r.needsRaster) { r = await rasterPdf(f); f.note = 'Ghostscript was not found, so pages were compressed as pictures and the text is no longer selectable. Install Ghostscript to keep text.'; }
          f.out = r.output; f.before = r.before; f.after = r.after; f.status = 'done';
        } catch (e) { f.status = 'error'; f.error = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
        paint();
      }
      running = false; paint();
    }
    const off = c.ey.on('ey:progress', ({ id, percent }) => { const f = files.find((x) => x.id === id); if (f && f.status === 'running') { f.percent = percent; paint(); } });
    root.append(c.dropZone('Drop files here or click to browse', { onFiles: add }),
      h('div', { class: 'card', style: 'margin-top:12px' }, h('div', { class: 'row sp', style: 'margin-bottom:12px' }, h('div', {}, h('span', { class: 'label' }, 'Compression'), seg), runBtn), list),
      h('p', { class: 'small faint' }, 'Images are re-encoded and resized if very large. Video is re-encoded to MP4 (H.264). Audio becomes MP3. PDFs use Ghostscript when it is installed. Any other file type is zipped.'));
    paint();
    return off;
  },
});
