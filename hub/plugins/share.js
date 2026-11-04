Plugins.register({
  id: 'share',
  async mount(root, c) {
    const { h } = c;
    root.append(c.head(c.meta.name, 'Send files to your phone or receive files from it. Both devices must be on the same Wi-Fi.'));
    let mode = 'send', files = [], snap = await c.ey.invoke('ey:share:snapshot');
    if (snap) mode = snap.mode;
    const body = h('div', {});
    const seg = h('div', { class: 'seg', style: 'margin-bottom:14px' });
    [['send', 'Send to phone'], ['receive', 'Receive from phone']].forEach(([k, n]) => {
      const b = h('button', { class: k === mode ? 'on' : '', onclick: async () => { if (snap && snap.mode !== k) await c.ey.invoke('ey:share:stop'); mode = k; [...seg.children].forEach((x) => x.classList.toggle('on', x === b)); snap = await c.ey.invoke('ey:share:snapshot'); render(); } }, n);
      seg.append(b);
    });
    root.append(seg, body);

    const fmtSpeed = (v) => c.fmtBytes(v) + '/s';
    const live = h('div', { class: 'list' });
    function paintTransfers(list) {
      live.innerHTML = '';
      if (!list.length) live.append(h('div', { class: 'empty' }, mode === 'send' ? 'Waiting for your phone to download.' : 'Waiting for files from your phone.'));
      list.slice().reverse().forEach((t) => {
        const pct = t.total ? Math.min(100, (t.bytes / t.total) * 100) : 0;
        const label = { active: t.dir === 'down' ? 'Sending' : 'Receiving', done: 'Completed', interrupted: 'Interrupted', failed: 'Failed' }[t.status];
        live.append(h('div', { class: 'li', style: 'flex-direction:column;align-items:stretch;gap:6px' },
          h('div', { class: 'row sp' }, h('span', { class: 'trunc' }, t.name), h('span', { class: t.status === 'done' ? 'ok small' : t.status === 'active' ? 'small' : 'bad small' }, label)),
          h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })),
          h('div', { class: 'row sp small faint mono' }, h('span', {}, `${c.fmtBytes(t.bytes)} of ${c.fmtBytes(t.total)}`), h('span', {}, t.status === 'active' ? fmtSpeed(t.speed) : t.device))));
      });
    }

    async function render() {
      body.innerHTML = '';
      if (snap && snap.mode === mode) return running();
      const ips = await c.ey.invoke('ey:share:ips');
      const ipSel = h('select', { class: 'input', style: 'max-width:300px' }, ips.map((i) => h('option', { value: i.ip }, `${i.ip}  (${i.name})`)));
      const fileList = h('div', { class: 'list', style: 'margin-top:12px' });
      const startBtn = h('button', { class: 'btn primary', onclick: start }, c.icon('share'), mode === 'send' ? 'Start sharing' : 'Start receiving');
      function paintFiles() {
        fileList.innerHTML = '';
        files.forEach((f) => fileList.append(h('div', { class: 'li' }, c.icon('folder'), h('span', { class: 'grow trunc' }, f.split('\\').pop()), h('button', { class: 'btn icon sm', onclick: () => { files = files.filter((x) => x !== f); paintFiles(); } }, c.icon('close')))));
        startBtn.disabled = mode === 'send' && !files.length;
      }
      async function start() {
        startBtn.disabled = true;
        try { snap = await c.ey.invoke('ey:share:start', { mode, files: mode === 'send' ? files : [], ip: ipSel.value || undefined }); render(); }
        catch (e) { c.toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); startBtn.disabled = false; }
      }
      if (mode === 'send') body.append(h('div', { class: 'card' }, c.dropZone('Drop files to send, or click to choose', { onFiles: (p) => { p.forEach((x) => !files.includes(x) && files.push(x)); paintFiles(); } }), fileList));
      else body.append(h('div', { class: 'card' }, h('p', { style: 'margin:0' }, 'Start receiving, scan the code with your phone camera, then pick the files to send. Files are saved to the Eyeland Received folder inside Downloads.')));
      body.append(h('div', { class: 'card' }, ips.length > 1 ? h('div', { style: 'margin-bottom:12px' }, h('span', { class: 'label' }, 'Network'), ipSel) : null, startBtn,
        h('p', { class: 'small faint' }, 'The first time, Windows may ask to allow Eyeland on private networks. Choose allow so your phone can connect. Use a 5 GHz Wi-Fi network for the highest speed.')));
      paintFiles();
    }

    function running() {
      body.innerHTML = '';
      const cv = h('canvas', { style: 'width:220px;height:220px;border-radius:10px;background:#fff;display:block' });
      try { drawQR(cv, snap.url, 520); } catch {}
      const stop = h('button', { class: 'btn danger', onclick: async () => { await c.ey.invoke('ey:share:stop'); snap = null; files = []; render(); } }, 'Stop sharing');
      body.append(h('div', { class: 'card' }, h('div', { class: 'row', style: 'gap:22px;align-items:flex-start' }, cv,
        h('div', { class: 'stack grow' },
          h('div', { class: 'ok', style: 'font-weight:600' }, mode === 'send' ? `Sharing ${snap.files.length} file${snap.files.length > 1 ? 's' : ''}` : 'Ready to receive'),
          h('div', { class: 'muted' }, 'Scan this code with your phone camera, or open the address below in its browser.'),
          h('div', { class: 'row' }, h('code', { style: 'background:rgba(0,0,0,.3);padding:6px 10px;border-radius:6px;user-select:text;word-break:break-all' }, snap.url), h('button', { class: 'btn sm', onclick: () => { c.ey.invoke('ey:copy', snap.url); c.toast('Address copied'); } }, c.icon('copy'))),
          mode === 'receive' ? h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Saving to ' + snap.dir), h('button', { class: 'btn sm', onclick: () => c.ey.invoke('ey:open-path', snap.dir) }, 'Open folder')) : null,
          h('div', {}, stop)))),
        h('div', { class: 'card' }, h('h3', {}, 'Transfers'), live));
      paintTransfers(snap.transfers || []);
    }

    const off = c.ey.on('ey:share:update', (s) => { if (!s) return; snap = s; if (s.mode === mode) paintTransfers(s.transfers); });
    render();
    return off;
  },
});
