(async () => {
  const params = new URLSearchParams(location.search);
  if (params.get('glass') === '1') document.body.classList.add('acrylic');
  ctx.S = await ey.invoke('settings-get');
  const catalog = await ey.invoke('ey:catalog');
  const menu = document.getElementById('menu'), view = document.getElementById('view');
  let current = null, cleanup = null, coffee = false;

  const groups = [...new Set(catalog.map((c) => c.group))];
  const items = new Map();
  groups.forEach((g) => {
    menu.append(h('div', { class: 'grp-label' }, g));
    catalog.filter((c) => c.group === g).forEach((c) => {
      const b = h('button', { class: 'item', onclick: () => open(c.id) }, ctx.icon(c.id), h('span', { class: 'trunc' }, c.name), h('span', { class: 'k' }, ''));
      items.set(c.id, b); menu.append(b);
    });
  });
  const paintKeys = (list) => list.forEach((c) => { const k = items.get(c.id).querySelector('.k'); k.textContent = c.key ? c.key.replace('Ctrl+Alt+', 'C+A+') : ''; k.title = c.key; });
  paintKeys(catalog);

  async function open(id) {
    if (!Plugins.map.has(id)) id = 'todo';
    if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
    current = id;
    items.forEach((b, k) => b.classList.toggle('on', k === id));
    view.innerHTML = ''; view.scrollTop = 0;
    const meta = catalog.find((c) => c.id === id);
    try { cleanup = await Plugins.map.get(id).mount(view, { ...ctx, meta }); }
    catch (e) { view.append(h('div', { class: 'card' }, 'This plugin failed to load: ' + e.message)); console.error(e); }
  }

  ey.on('hub:open', ({ id }) => open(id));
  ey.on('settings', (s) => { ctx.S = s; });
  ey.on('coffee', (on) => { coffee = on; const b = items.get('coffee'); b.querySelector('.dot')?.remove(); if (on) b.append(h('span', { class: 'dot' })); });
  ctx.refreshCatalog = async () => paintKeys(await ey.invoke('ey:catalog'));
  open(location.hash.slice(1) || 'todo');
})();
