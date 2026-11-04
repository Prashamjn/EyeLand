Plugins.register({
  id: 'speed',
  mount(root, c) {
    const { h } = c;
    root.append(c.head(c.meta.name, 'Measures latency, download and upload against Cloudflare\'s network. It uses data while it runs.'));
    const tiles = {}, grid = h('div', { class: 'cols c3' });
    [['ping', 'Ping', 'ms'], ['down', 'Download', 'Mbps'], ['up', 'Upload', 'Mbps']].forEach(([k, n, u]) => {
      tiles[k] = h('div', { class: 'big mono' }, '0');
      grid.append(h('div', { class: 'card' }, h('div', { class: 'small muted' }, n), h('div', { class: 'row', style: 'align-items:baseline;gap:6px;margin-top:6px' }, tiles[k], h('span', { class: 'muted' }, u))));
    });
    const jitter = h('span', { class: 'muted small' }), phase = h('div', { class: 'muted' }, 'Ready');
    const cv = h('canvas', { width: 900, height: 120, style: 'width:100%;height:120px;display:block;margin-top:14px;border-radius:8px;background:rgba(0,0,0,.2)' });
    const btn = h('button', { class: 'btn primary', onclick: toggle }, c.icon('speed'), 'Start test');
    const hist = h('div', { class: 'list' });
    let running = false, samples = [], cur = '';

    const fmt = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
    function draw() {
      const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
      if (samples.length < 2) return;
      const max = Math.max(...samples, 1) * 1.15; g.strokeStyle = '#b8ffa3'; g.lineWidth = 2; g.beginPath();
      samples.forEach((v, i) => { const x = (i / (samples.length - 1)) * cv.width, y = cv.height - (v / max) * (cv.height - 8) - 4; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    }
    async function toggle() {
      if (running) return c.ey.invoke('ey:speed:cancel');
      running = true; btn.lastChild.textContent = 'Stop'; Object.values(tiles).forEach((t) => (t.textContent = '0')); jitter.textContent = ''; samples = []; cur = '';
      try { await c.ey.invoke('ey:speed:run'); } catch {}
      running = false; btn.lastChild.textContent = 'Start test';
    }
    const off = c.ey.on('ey:speed', (d) => {
      if (d.phase === 'ping') { phase.textContent = 'Measuring latency'; if (d.ping != null) { tiles.ping.textContent = fmt(d.ping); jitter.textContent = `Jitter ${fmt(d.jitter)} ms`; } }
      else if (d.phase === 'download' || d.phase === 'upload') {
        if (cur !== d.phase) { cur = d.phase; samples = []; }
        phase.textContent = d.phase === 'download' ? 'Testing download' : 'Testing upload'; tiles[d.phase === 'download' ? 'down' : 'up'].textContent = fmt(d.mbps); samples.push(d.mbps); draw();
      } else if (d.phase === 'done') {
        phase.textContent = 'Complete';
        const entry = { t: Date.now(), ping: d.ping, down: d.down, up: d.up };
        c.save({ speedHistory: [entry, ...(c.S.speedHistory || [])].slice(0, 6) }); paintHist();
      } else if (d.phase === 'cancelled') phase.textContent = 'Stopped';
      else if (d.phase === 'error') { phase.className = 'bad'; phase.textContent = 'Test failed. Check your connection.'; setTimeout(() => (phase.className = 'muted'), 4000); }
    });
    function paintHist() {
      hist.innerHTML = ''; const list = c.S.speedHistory || [];
      if (!list.length) hist.append(h('div', { class: 'empty' }, 'No tests yet.'));
      list.forEach((e) => hist.append(h('div', { class: 'li small' }, h('span', { class: 'muted grow' }, new Date(e.t).toLocaleString()), h('span', { class: 'mono' }, `${fmt(e.ping)} ms`), h('span', { class: 'mono' }, `Down ${fmt(e.down)}`), h('span', { class: 'mono' }, `Up ${fmt(e.up)} Mbps`))));
    }
    paintHist();
    root.append(grid, h('div', { class: 'card', style: 'margin-top:12px' }, h('div', { class: 'row sp' }, h('div', {}, phase, jitter), btn), cv), h('div', { class: 'card' }, h('h3', {}, 'Recent results'), hist));
    return () => { off(); if (running) c.ey.invoke('ey:speed:cancel'); };
  },
});
