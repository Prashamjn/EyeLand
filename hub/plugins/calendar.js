Plugins.register({
  id: 'calendar',
  mount(root, c) {
    const { h } = c;
    const first = (() => { try { const l = new Intl.Locale(navigator.language); const w = (l.getWeekInfo ? l.getWeekInfo() : l.weekInfo) || {}; return (w.firstDay || 1) % 7; } catch { return 1; } })();
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth(), sel = key(now);
    function key(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    const events = () => c.S.events || {};
    const setEvents = (e) => c.save({ events: e });

    root.append(c.head(c.meta.name, 'Click a day to see or add events.'));
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(7,1fr);gap:4px' });
    const title = h('div', { class: 'big', style: 'font-size:18px' });
    const side = h('div', {});
    const go = (dm) => { m += dm; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } draw(); };
    const cal = h('div', { class: 'card' },
      h('div', { class: 'row sp', style: 'margin-bottom:12px' }, title,
        h('div', { class: 'row' }, h('button', { class: 'btn icon', onclick: () => go(-1), title: 'Previous month' }, c.icon('left')),
          h('button', { class: 'btn', onclick: () => { y = now.getFullYear(); m = now.getMonth(); sel = key(now); draw(); } }, 'Today'),
          h('button', { class: 'btn icon', onclick: () => go(1), title: 'Next month' }, c.icon('right')))),
      grid);
    root.append(h('div', { class: 'cols side' }, cal, side));

    function draw() {
      title.textContent = new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      grid.innerHTML = '';
      for (let i = 0; i < 7; i++) grid.append(h('div', { class: 'faint small', style: 'text-align:center;padding:4px' }, new Date(2023, 0, 1 + ((first + i) % 7)).toLocaleDateString(undefined, { weekday: 'short' })));
      const start = new Date(y, m, 1), offset = (start.getDay() - first + 7) % 7, days = new Date(y, m + 1, 0).getDate();
      for (let i = 0; i < offset; i++) grid.append(h('div'));
      for (let d = 1; d <= days; d++) {
        const k = key(new Date(y, m, d)), n = (events()[k] || []).length, today = k === key(now), on = k === sel;
        grid.append(h('button', { class: 'btn', style: `height:44px;flex-direction:column;gap:2px;font-weight:${today ? 700 : 500};${on ? 'background:rgba(255,255,255,.2);' : ''}${today ? 'border-color:var(--accent);' : ''}`, onclick: () => { sel = k; draw(); } },
          String(d), h('span', { style: `width:5px;height:5px;border-radius:50%;background:${n ? 'var(--accent)' : 'transparent'}` })));
      }
      drawSide();
    }

    function drawSide() {
      side.innerHTML = '';
      const [yy, mm, dd] = sel.split('-').map(Number);
      const list = (events()[sel] || []).slice().sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
      const text = h('input', { class: 'input', placeholder: 'New event', maxlength: 120 });
      const time = h('input', { class: 'input', type: 'time', style: 'width:110px' });
      const add = () => {
        const t = text.value.trim(); if (!t) return;
        const e = { ...events() }; e[sel] = [...(e[sel] || []), { id: c.uid(), text: t, time: time.value }];
        setEvents(e); drawSide(); grid.querySelectorAll('button').length && draw();
      };
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      const items = h('div', { class: 'list', style: 'margin-top:12px' });
      if (!list.length) items.append(h('div', { class: 'empty' }, 'No events on this day.'));
      list.forEach((ev) => items.append(h('div', { class: 'li' }, ev.time ? h('span', { class: 'tag mono' }, ev.time) : null, h('span', { class: 'grow trunc' }, ev.text),
        h('button', { class: 'btn icon sm', title: 'Delete', onclick: () => { const e = { ...events() }; e[sel] = e[sel].filter((x) => x.id !== ev.id); if (!e[sel].length) delete e[sel]; setEvents(e); draw(); } }, c.icon('trash')))));
      // upcoming
      const upcoming = Object.entries(events()).filter(([k]) => k >= key(now)).sort().slice(0, 5);
      const up = h('div', { class: 'list' });
      upcoming.forEach(([k, arr]) => arr.forEach((ev) => up.append(h('div', { class: 'li small' }, h('span', { class: 'tag mono' }, k.slice(5)), h('span', { class: 'grow trunc' }, ev.text)))));
      side.append(h('div', { class: 'card' }, h('h3', {}, new Date(yy, mm - 1, dd).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })),
        h('div', { class: 'row' }, text, time, h('button', { class: 'btn primary', onclick: add }, 'Add')), items),
        h('div', { class: 'card' }, h('h3', {}, 'Coming up'), up.children.length ? up : h('div', { class: 'empty' }, 'Nothing scheduled.')));
    }
    draw();
    return c.ey.on('settings', () => draw());
  },
});
