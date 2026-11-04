Plugins.register({
  id: 'convert',
  mount(root, c) {
    const { h } = c;
    root.append(c.head(c.meta.name, 'Convert within a family: image to image, audio to audio, video to video, and documents to PDF.'));
    let files = [], running = false;
    const list = h('div', { class: 'list' });
    const runBtn = h('button', { class: 'btn primary', onclick: runAll }, 'Convert all');
    const clearBtn = h('button', { class: 'btn', onclick: () => { if (!running) { files = []; paint(); } } }, 'Clear list');

    async function add(paths) {
      for (const p of paths) {
        if (files.some((f) => f.path === p)) continue;
        const info = await c.ey.invoke('ey:fileinfo', p), t = await c.ey.invoke('ey:ff:targets', p);
        files.push({ id: c.uid(), path: p, ...info, targets: t.targets, to: t.targets[0], status: t.targets.length ? 'ready' : 'unsupported', percent: 0 });
      }
      paint();
    }

    function paint() {
      list.innerHTML = '';
      if (!files.length) list.append(h('div', { class: 'empty' }, 'Add files to get started.'));
      files.forEach((f) => {
        const sel = h('select', { class: 'input', style: 'width:100px;height:28px', disabled: running || f.status === 'unsupported', onchange: () => { f.to = sel.value; f.status = 'ready'; f.out = null; paint(); } }, f.targets.map((t) => h('option', { value: t }, t.toUpperCase())));
        if (f.to) sel.value = f.to;
        let right;
        if (f.status === 'unsupported') right = h('span', { class: 'bad small' }, 'This file type is not supported');
        else if (f.status === 'running') right = h('div', { style: 'width:150px' }, h('div', { class: 'bar' }, h('i', { style: `width:${f.percent}%` })), h('div', { class: 'small faint mono', style: 'margin-top:3px' }, Math.round(f.percent) + '%'));
        else if (f.status === 'done') right = h('div', { class: 'row small' }, h('span', { class: 'ok' }, f.note || `Done, ${c.fmtBytes(f.after)}`), h('button', { class: 'btn sm', onclick: () => c.ey.invoke('ey:reveal', f.out) }, c.icon('folder'), 'Show'));
        else if (f.status === 'error') right = h('span', { class: 'bad small trunc', title: f.error, style: 'max-width:220px' }, f.error);
        else right = h('span', { class: 'faint small' }, 'Ready');
        list.append(h('div', { class: 'li' },
          h('div', { class: 'grow' }, h('div', { class: 'trunc' }, f.name), h('div', { class: 'small faint' }, `${f.category === 'other' ? 'file' : f.category}, ${c.fmtBytes(f.size)}`)),
          f.targets.length ? h('span', { class: 'muted' }, 'to') : null, f.targets.length ? sel : null, right,
          h('button', { class: 'btn icon sm', disabled: running, title: 'Remove', onclick: () => { files = files.filter((x) => x !== f); paint(); } }, c.icon('close'))));
      });
      runBtn.disabled = running || !files.some((f) => f.status === 'ready');
      clearBtn.disabled = running;
    }

    async function pdfToImages(f) {
      const b64 = await c.ey.invoke('ey:readfile', f.path), doc = await c.loadPdf(b64);
      const type = f.to === 'jpg' ? 'image/jpeg' : 'image/png', base = f.name.replace(/\.[^.]+$/, ''), dir = f.dir + '\\' + base + '-pages';
      let last;
      for (let i = 1; i <= doc.numPages; i++) {
        const { url } = await c.renderPage(doc, i, 2, type, 0.92);
        last = await c.ey.invoke('ey:write-file', { dir, name: `${base}-${String(i).padStart(String(doc.numPages).length, '0')}.${f.to}`, base64: url.split(',')[1] });
        f.percent = (i / doc.numPages) * 100; paint();
      }
      f.out = last; f.after = 0; f.note = `${doc.numPages} page${doc.numPages > 1 ? 's' : ''} saved to ${base}-pages`;
    }

    async function runAll() {
      running = true;
      for (const f of files.filter((x) => x.status === 'ready')) {
        f.status = 'running'; f.percent = 0; paint();
        try {
          if (f.category === 'pdf') await pdfToImages(f);
          else { const r = await c.ey.invoke('ey:convert', { id: f.id, input: f.path, to: f.to }); f.out = r.output; f.after = r.after; f.note = null; }
          f.status = 'done';
        } catch (e) { f.status = 'error'; f.error = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
        paint();
      }
      running = false; paint();
    }

    const off = c.ey.on('ey:progress', ({ id, percent }) => { const f = files.find((x) => x.id === id); if (f && f.status === 'running') { f.percent = percent; paint(); } });
    root.append(
      c.dropZone('Drop files here or click to browse', { onFiles: add }),
      h('div', { class: 'card', style: 'margin-top:12px' }, list, h('div', { class: 'row', style: 'margin-top:14px' }, runBtn, clearBtn)),
      h('p', { class: 'small faint' }, 'Converted files are saved next to the originals. Images: PNG, JPG, WebP, BMP, GIF, TIFF, PDF. Audio: MP3, WAV, FLAC, M4A, OGG. Video: MP4, MKV, WebM, MOV, AVI, GIF or audio only. Text, Markdown and HTML to PDF. PDF to PNG or JPG.'));
    paint();
    return off;
  },
});
