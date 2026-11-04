Plugins.register({
  id: 'sysinfo',
  async mount(root, c) {
    const { h } = c;
    root.append(c.head(c.meta.name, 'Live CPU and memory use, storage and device details.'));
    const cpuBig = h('div', { class: 'big mono' }, '0%'), cpuCv = h('canvas', { width: 600, height: 90, style: 'width:100%;height:90px;display:block;margin-top:10px;border-radius:8px;background:rgba(0,0,0,.2)' });
    const cores = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(38px,1fr));gap:6px;margin-top:12px' });
    const memBig = h('div', { class: 'big mono' }, '0%'), memBar = h('div', { class: 'bar' }, h('i')), memTxt = h('div', { class: 'small muted', style: 'margin-top:8px' });
    const up = h('div', { class: 'small muted' }), disks = h('div', { class: 'stack' }), dev = h('div', { class: 'stack small' }), bat = h('div', { class: 'small muted' });
    root.append(
      h('div', { class: 'cols c2' }, h('div', { class: 'card' }, h('h3', {}, 'Processor'), cpuBig, cpuCv, cores), h('div', { class: 'card' }, h('h3', {}, 'Memory'), memBig, h('div', { style: 'margin-top:10px' }, memBar), memTxt, h('div', { style: 'margin-top:14px' }, up), h('div', { style: 'margin-top:4px' }, bat))),
      h('div', { class: 'cols c2', style: 'margin-top:12px' }, h('div', { class: 'card' }, h('h3', {}, 'Storage'), disks), h('div', { class: 'card' }, h('h3', {}, 'Device'), dev)));

    const hist = Array(60).fill(0);
    const row = (k, v) => h('div', { class: 'row sp' }, h('span', { class: 'muted' }, k), h('span', { style: 'text-align:right;user-select:text;max-width:65%' }, v));
    function drawCpu() {
      const g = cpuCv.getContext('2d'); g.clearRect(0, 0, cpuCv.width, cpuCv.height); g.strokeStyle = '#b8ffa3'; g.lineWidth = 2; g.beginPath();
      hist.forEach((v, i) => { const x = (i / (hist.length - 1)) * cpuCv.width, y = cpuCv.height - (v / 100) * (cpuCv.height - 6) - 3; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    }
    async function tick() {
      const s = await c.ey.invoke('ey:sys:stats');
      cpuBig.textContent = Math.round(s.cpu.total) + '%'; hist.push(s.cpu.total); hist.shift(); drawCpu();
      if (cores.children.length !== s.cpu.cores.length) { cores.innerHTML = ''; s.cpu.cores.forEach(() => cores.append(h('div', { style: 'height:34px;border-radius:6px;background:rgba(255,255,255,.07);position:relative;overflow:hidden' }, h('i', { style: 'position:absolute;left:0;right:0;bottom:0;background:var(--accent);opacity:.7;height:0' })))); }
      s.cpu.cores.forEach((v, i) => (cores.children[i].firstChild.style.height = v + '%'));
      const pct = (s.mem.used / s.mem.total) * 100;
      memBig.textContent = Math.round(pct) + '%'; memBar.firstChild.style.width = pct + '%'; memTxt.textContent = `${c.fmtBytes(s.mem.used)} used of ${c.fmtBytes(s.mem.total)}`;
      const d = Math.floor(s.uptime / 86400), hh = Math.floor((s.uptime % 86400) / 3600), m = Math.floor((s.uptime % 3600) / 60);
      up.textContent = `Up for ${d ? d + ' d ' : ''}${hh} h ${m} min`;
    }
    const paintDisks = async () => {
      const l = await c.ey.invoke('ey:sys:disks'); disks.innerHTML = '';
      l.forEach((d) => { const used = d.total - d.free, p = (used / d.total) * 100; disks.append(h('div', {}, h('div', { class: 'row sp small' }, h('b', {}, d.drive), h('span', { class: 'muted' }, `${c.fmtBytes(d.free)} free of ${c.fmtBytes(d.total)}`)), h('div', { class: 'bar', style: 'margin-top:5px' }, h('i', { style: `width:${p}%;${p > 90 ? 'background:var(--danger)' : ''}` })))); });
    };
    c.ey.invoke('ey:sys:details').then((d) => {
      dev.append(row('Computer', d.host), row('User', d.user), row('Windows', d.os), row('Processor', `${d.cpu} (${d.cores} threads)`), row('Memory', c.fmtBytes(d.mem)));
      if (d.gpu) dev.append(row('Graphics', d.gpu));
      d.nets.forEach((n) => dev.append(row(n.name, n.ip)));
    });
    if (navigator.getBattery) navigator.getBattery().then((b) => { const p = () => (bat.textContent = `Battery ${Math.round(b.level * 100)}%${b.charging ? ', charging' : ''}`); p(); b.addEventListener('levelchange', p); b.addEventListener('chargingchange', p); });
    await tick(); paintDisks();
    const t1 = setInterval(tick, 1000), t2 = setInterval(paintDisks, 30000);
    return () => { clearInterval(t1); clearInterval(t2); };
  },
});
