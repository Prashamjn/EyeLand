Plugins.register({
  id: 'todo',
  mount(root, c) {
    const { h } = c;
    let todos = [...(c.S.todos || [])];
    root.append(c.head(c.meta.name, 'Things to do. Saved automatically and shared with the island.'));
    const input = h('input', { class: 'input', placeholder: 'Add a task and press Enter', maxlength: 200 });
    const list = h('div', { class: 'list' });
    const meta = h('span', { class: 'muted small' });
    const clear = h('button', { class: 'btn sm', onclick: () => { todos = todos.filter((t) => !t.done); commit(); } }, 'Clear completed');
    const commit = () => { c.save({ todos }); render(); };
    function add() {
      const text = input.value.trim(); if (!text) return;
      todos.unshift({ id: c.uid(), text, done: false, created: Date.now() }); input.value = ''; commit();
    }
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    function render() {
      list.innerHTML = '';
      const sorted = [...todos].sort((a, b) => a.done - b.done);
      if (!sorted.length) list.append(h('div', { class: 'empty' }, 'No tasks yet.'));
      sorted.forEach((t) => {
        const cb = h('input', { type: 'checkbox', checked: t.done, onchange: () => { t.done = cb.checked; commit(); } });
        const label = h('span', { class: 'grow trunc', style: t.done ? 'text-decoration:line-through;color:var(--faint)' : '', title: 'Double click to edit', ondblclick: () => {
          const ed = h('input', { class: 'input', value: t.text, style: 'height:28px' });
          const done = () => { const v = ed.value.trim(); if (v) t.text = v; commit(); };
          ed.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') render(); });
          ed.addEventListener('blur', done);
          label.replaceWith(ed); ed.focus(); ed.select();
        } }, t.text);
        list.append(h('div', { class: 'li' }, cb, label, h('button', { class: 'btn icon sm', title: 'Delete', onclick: () => { todos = todos.filter((x) => x.id !== t.id); commit(); } }, c.icon('trash'))));
      });
      const open = todos.filter((t) => !t.done).length;
      meta.textContent = `${open} open, ${todos.length - open} completed`;
      clear.hidden = todos.length === open;
    }
    root.append(h('div', { class: 'card' }, h('div', { class: 'row' }, input, h('button', { class: 'btn primary', onclick: add }, 'Add')), h('div', { class: 'row sp', style: 'margin:12px 0 10px' }, meta, clear), list));
    render(); input.focus();
    return c.ey.on('settings', (s) => { todos = [...(s.todos || [])]; if (!list.querySelector('input.input')) render(); });
  },
});
