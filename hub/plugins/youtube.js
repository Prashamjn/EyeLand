Plugins.register({
  id: 'youtube',
  async mount(root, c) {
    const { h } = c;
    root.append(c.head(c.meta.name, 'Paste a link, check the video, optionally pick a segment, then download in the best quality.'));
    const body = h('div', {});
    root.append(body);
    let info = null, format = 'mp4', job = null;
    const offs = [];

    const status = await c.ey.invoke('ey:yt:status');
    if (!status.installed) return installer();
    main();

    function installer() {
      const bar = h('div', { class: 'bar', hidden: true }, h('i')), txt = h('div', { class: 'small muted', style: 'margin-top:8px' });
      const btn = h('button', { class: 'btn primary', onclick: async () => {
        btn.disabled = true; bar.hidden = false; txt.textContent = 'Downloading the download engine (yt-dlp, about 18 MB)';
        offs.push(c.ey.on('ey:yt:install', (d) => (bar.firstChild.style.width = d.percent + '%')));
        try { await c.ey.invoke('ey:yt:install'); body.innerHTML = ''; main(); } catch (e) { btn.disabled = false; txt.className = 'small bad'; txt.textContent = 'Install failed: ' + e.message; }
      } }, 'Install download engine');
      body.append(h('div', { class: 'card' }, h('p', { style: 'margin-top:0' }, 'This plugin uses yt-dlp, a free open source downloader. It is downloaded once from its official GitHub releases and kept inside Eyeland\'s data folder.'), btn, h('div', { style: 'margin-top:12px' }, bar), txt));
    }

    function main() {
      const url = h('input', { class: 'input', placeholder: 'https://www.youtube.com/watch?v=...' });
      const bFetch = h('button', { class: 'btn primary', onclick: fetchInfo }, 'Fetch info');
      const infoBox = h('div', {}), progBox = h('div', {});
      url.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchInfo(); });
      body.append(h('div', { class: 'card' }, h('span', { class: 'label' }, 'Video link'), h('div', { class: 'row' }, url, bFetch)), infoBox, progBox,
        h('p', { class: 'small faint' }, 'Only download content you have the right to save. Files go to Downloads, in an Eyeland folder. If a video fails, ', h('a', { href: '#', style: 'color:var(--accent)', onclick: async (e) => { e.preventDefault(); c.toast('Updating the engine'); try { const r = await c.ey.invoke('ey:yt:update'); c.toast(r.split('\n').pop() || 'Updated'); } catch (er) { c.toast('Update failed', true); } } }, 'update the engine'), '.'));

      async function fetchInfo() {
        const u = url.value.trim(); if (!u) return;
        bFetch.disabled = true; infoBox.innerHTML = ''; progBox.innerHTML = ''; infoBox.append(h('div', { class: 'card empty' }, 'Reading video details'));
        try { info = await c.ey.invoke('ey:yt:info', u); showInfo(); }
        catch (e) { infoBox.innerHTML = ''; infoBox.append(h('div', { class: 'card bad' }, String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))); }
        bFetch.disabled = false;
      }

      function showInfo() {
        infoBox.innerHTML = '';
        const start = h('input', { class: 'input', placeholder: '0:00', style: 'width:100px' }), end = h('input', { class: 'input', placeholder: c.fmtTime(info.duration), style: 'width:100px' });
        const seg = h('div', { class: 'seg' });
        [['mp4', 'MP4 video'], ['mp3', 'MP3 audio']].forEach(([k, n]) => { const b = h('button', { class: k === format ? 'on' : '', onclick: () => { format = k; [...seg.children].forEach((x) => x.classList.toggle('on', x === b)); } }, n); seg.append(b); });
        const err = h('div', { class: 'small bad', style: 'min-height:18px;margin-top:8px' });
        const go = h('button', { class: 'btn primary', onclick: () => begin() }, c.icon('youtube'), 'Download');
        function secs(t) { if (!t.trim()) return null; if (/^\d+(\.\d+)?$/.test(t.trim())) return +t; const p = t.trim().split(':').map(Number); return p.some(isNaN) ? NaN : p.reduce((a, b) => a * 60 + b, 0); }
        function begin() {
          const a = secs(start.value), b = secs(end.value);
          if (Number.isNaN(a) || Number.isNaN(b)) { err.textContent = 'Use times like 1:30 or 0:01:30.'; return; }
          if ((a != null && info.duration && a >= info.duration) || (b != null && a != null && b <= a) || (b != null && info.duration && b > info.duration + 1)) { err.textContent = 'The end must be after the start and within the video length.'; return; }
          err.textContent = ''; download(a, b);
        }
        infoBox.append(h('div', { class: 'card' }, h('div', { class: 'cols', style: 'grid-template-columns:240px 1fr;align-items:start;gap:16px' },
          info.thumbnail ? h('img', { class: 'thumb', src: info.thumbnail }) : h('div', { class: 'thumb' }),
          h('div', { class: 'stack' }, h('div', { style: 'font-size:15px;font-weight:600' }, info.title), h('div', { class: 'muted small' }, `${info.uploader}${info.uploader ? ', ' : ''}${c.fmtTime(info.duration)}`),
            h('div', {}, h('span', { class: 'label' }, 'Trim (optional)'), h('div', { class: 'row' }, start, h('span', { class: 'muted' }, 'to'), end, h('span', { class: 'small faint' }, 'leave empty for the full video'))),
            h('div', {}, h('span', { class: 'label' }, 'Format, best quality'), seg), go, err))));
      }

      function download(a, b) {
        const id = c.uid(); job = { id };
        progBox.innerHTML = '';
        const state = h('div', { style: 'font-weight:600' }, 'Preparing'), bar = h('div', { class: 'bar' }, h('i')), pct = h('span', { class: 'mono' }, '0%');
        const cells = {}; const stats = h('div', { class: 'row wrap', style: 'gap:24px;margin-top:10px' });
        [['speed', 'Speed'], ['size', 'File size'], ['eta', 'Time left']].forEach(([k, n]) => { cells[k] = h('b', { class: 'mono' }, '...'); stats.append(h('div', {}, h('div', { class: 'small faint' }, n), cells[k])); });
        const done = h('div', {}), cancel = h('button', { class: 'btn', onclick: () => c.ey.invoke('ey:yt:cancel', id) }, 'Cancel');
        progBox.append(h('div', { class: 'card' }, h('div', { class: 'row sp', style: 'margin-bottom:8px' }, state, pct), bar, stats, h('div', { class: 'row', style: 'margin-top:12px' }, cancel), done));
        const off = c.ey.on('ey:yt:progress', (d) => {
          if (d.id !== id) return;
          state.textContent = d.label || ({ preparing: 'Preparing', downloading: 'Downloading', processing: 'Processing' }[d.state] || 'Working');
          bar.firstChild.style.width = d.percent + '%'; pct.textContent = Math.round(d.percent) + '%';
          cells.speed.textContent = d.speed || '...'; cells.size.textContent = d.size || '...'; cells.eta.textContent = d.eta || '...';
        });
        offs.push(off);
        c.ey.invoke('ey:yt:download', { id, url: info.url, format, start: a, end: b, duration: info.duration }).then((r) => {
          off(); cancel.hidden = true; stats.hidden = false;
          if (r.cancelled) { state.textContent = 'Cancelled'; return; }
          state.textContent = 'Completed'; state.className = 'ok'; bar.firstChild.style.width = '100%'; pct.textContent = '100%'; cells.size.textContent = r.sizeText || cells.size.textContent; cells.eta.textContent = 'Done';
          done.append(h('div', { class: 'row', style: 'margin-top:4px' }, h('button', { class: 'btn', onclick: () => c.ey.invoke('ey:reveal', r.file) }, c.icon('folder'), 'Show in folder'), h('button', { class: 'btn', onclick: () => c.ey.invoke('ey:open-path', r.file) }, 'Open')));
        }).catch((e) => { off(); cancel.hidden = true; state.textContent = 'Failed'; state.className = 'bad'; done.append(h('div', { class: 'small bad' }, String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))); });
      }
    }
    return () => { offs.forEach((o) => o()); };
  },
});
