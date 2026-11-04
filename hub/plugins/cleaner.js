Plugins.register({
  id: 'cleaner',
  mount(root, c) {
    const { h } = c;
    root.append(c.head(c.meta.name, 'Remove temporary files and caches. Only a fixed list of temp locations is ever touched.'));
    let items = [], checked = new Set(), scanning = false, cleaning = false, recent = false;
    const list = h('div', { class: 'list' }), summary = h('div', { class: 'muted' }), result = h('div', { class: 'small', style: 'margin-top:12px;min-height:20px' });
    const bScan = h('button', { class: 'btn', onclick: scan }, 'Scan again');
    const bClean = h('button', { class: 'btn primary', onclick: clean }, c.icon('cleaner'), 'Clean selected');
    const recentCb = h('input', { type: 'checkbox', onchange: () => { recent = recentCb.checked; scan(); } });

    async function scan() {
      scanning = true; result.textContent = ''; paint();
      try { items = await c.ey.invoke('ey:clean:scan', { minAgeHours: recent ? 0 : 1 }); checked = new Set(items.filter((i) => i.bytes > 0).map((i) => i.id)); }
      catch (e) { result.className = 'small bad'; result.textContent = 'Scan failed: ' + e.message; }
      scanning = false; paint();
    }
    function paint() {
      list.innerHTML = '';
      if (scanning) list.append(h('div', { class: 'empty' }, 'Scanning'));
      items.forEach((i) => {
        const cb = h('input', { type: 'checkbox', checked: checked.has(i.id), disabled: cleaning || i.bytes === 0, onchange: () => { cb.checked ? checked.add(i.id) : checked.delete(i.id); paint(); } });
        list.append(h('label', { class: 'li', style: 'cursor:pointer' }, cb, h('div', { class: 'grow' }, h('div', {}, i.name), h('div', { class: 'small faint trunc' }, i.note)), h('b', { class: 'mono' }, i.bytes ? c.fmtBytes(i.bytes) : 'Empty')));
      });
      const total = items.filter((i) => checked.has(i.id)).reduce((a, i) => a + i.bytes, 0);
      summary.textContent = scanning ? '' : `${c.fmtBytes(total)} selected`;
      bClean.disabled = scanning || cleaning || total === 0; bScan.disabled = scanning || cleaning;
    }
    let armed = false;
    async function clean() {
      const total = items.filter((i) => checked.has(i.id)).reduce((a, i) => a + i.bytes, 0);
      if (!armed) { armed = true; bClean.lastChild.textContent = `Delete ${c.fmtBytes(total)}?`; setTimeout(() => { armed = false; bClean.lastChild.textContent = 'Clean selected'; }, 4000); return; }
      armed = false; bClean.lastChild.textContent = 'Clean selected'; cleaning = true; paint(); result.className = 'small muted'; result.textContent = 'Cleaning';
      try {
        const r = await c.ey.invoke('ey:clean:run', { ids: [...checked], minAgeHours: recent ? 0 : 1 });
        result.className = 'small ok'; result.textContent = `Freed ${c.fmtBytes(r.freed)} by removing ${r.removed} files. ${r.skipped} files were in use or protected and were skipped.`;
      } catch (e) { result.className = 'small bad'; result.textContent = 'Cleaning failed: ' + e.message; }
      cleaning = false; await scan();
    }
    const off = c.ey.on('ey:clean:progress', (d) => { if (cleaning) result.textContent = `Cleaning ${d.name}`; });
    root.append(h('div', { class: 'card' }, h('div', { class: 'row sp', style: 'margin-bottom:12px' }, summary, bScan), list,
      h('label', { class: 'row small', style: 'margin-top:12px;gap:8px' }, recentCb, 'Include files changed in the last hour (default skips them because apps may be using them)'),
      h('div', { class: 'row', style: 'margin-top:14px' }, bClean), result),
      h('p', { class: 'small faint' }, 'Windows temp and Windows Update folders need Eyeland to run as administrator for everything to be removed. Files that are in use are skipped safely.'));
    scan();
    return off;
  },
});
