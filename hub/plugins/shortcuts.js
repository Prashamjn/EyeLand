Plugins.register({
  id: 'shortcuts',
  async mount(root, c) {
    const { h } = c;
    root.append(c.head(c.meta.name, 'Every plugin can have its own global shortcut. Use Ctrl, Alt, Shift or Win with a key.'));
    const defaults = Object.fromEntries(CATALOG.map((p) => [p.id, p.key]));
    const list = h('div', { class: 'list' });
    let cat = await c.ey.invoke('ey:catalog'), capturing = null;
    const msgs = {};

    function toAccel(e) {
      if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) return null;
      const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
      let k = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : e.code.startsWith('Numpad') ? 'num' + e.code.slice(6).replace('Add', 'add').replace('Subtract', 'sub').replace('Multiply', 'mult').replace('Divide', 'div').replace('Decimal', 'dec') : e.key;
      k = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc', Enter: 'Return', Backquote: '`' }[k] || { Space: 'Space' }[k] || (k.length === 1 ? k.toUpperCase() : k);
      if (e.code === 'Backquote') k = '`';
      const isF = /^F\d{1,2}$/.test(k);
      if (!mods.length && !isF) return { error: 'Add Ctrl, Alt, Shift or Win' };
      return { accel: [...mods, k].join('+') };
    }
    async function set(id, key) {
      const r = await c.ey.invoke('ey:shortcut-set', id, key);
      msgs[id] = r.ok ? '' : r.error; cat = await c.ey.invoke('ey:catalog'); c.refreshCatalog(); paint();
      if (!r.ok) c.toast(r.error, true);
    }
    window.addEventListener('keydown', onKey, true);
    function onKey(e) {
      if (!capturing) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { capturing = null; return paint(); }
      if (e.key === 'Backspace' || e.key === 'Delete') { const id = capturing; capturing = null; return set(id, ''); }
      const r = toAccel(e); if (!r) return;
      const id = capturing; capturing = null;
      if (r.error) { msgs[id] = r.error; return paint(); }
      set(id, r.accel);
    }

    function paint() {
      list.innerHTML = '';
      let group = '';
      cat.forEach((p) => {
        if (p.group !== group) { group = p.group; list.append(h('div', { class: 'grp-label', style: 'padding-left:2px' }, group)); }
        const isCap = capturing === p.id;
        const btn = h('button', { class: 'btn', style: `min-width:150px;${isCap ? 'border-color:var(--accent)' : ''}`, onclick: () => { capturing = isCap ? null : p.id; msgs[p.id] = ''; paint(); } }, isCap ? 'Press keys' : p.key || 'Not set');
        list.append(h('div', { class: 'li' }, c.icon(p.id), h('div', { class: 'grow' }, h('div', {}, p.name), msgs[p.id] ? h('div', { class: 'small bad' }, msgs[p.id]) : h('div', { class: 'small faint trunc' }, p.desc)), btn,
          h('button', { class: 'btn sm', title: 'Restore default', disabled: (p.key || '') === (defaults[p.id] || ''), onclick: () => set(p.id, defaults[p.id] || '') }, 'Reset'),
          h('button', { class: 'btn sm', title: 'Remove shortcut', disabled: !p.key, onclick: () => set(p.id, '') }, 'Clear')));
      });
    }
    const fsCb = h('input', { type: 'checkbox', checked: c.S.hideInFullscreen !== false, onchange: () => c.save({ hideInFullscreen: fsCb.checked }) });
    root.append(h('div', { class: 'card' }, h('label', { class: 'row', style: 'gap:10px;cursor:pointer' }, fsCb, h('div', {}, h('div', {}, 'Hide the island in full screen apps'), h('div', { class: 'small faint' }, 'Games, videos and presentations in full screen hide it automatically and bring it back afterwards.')))),
      h('div', { style: 'height:12px' }), list,
      h('p', { class: 'small faint' }, 'Click a shortcut, then press the new keys. Backspace clears it, Esc cancels. On keyboards that use AltGr, Ctrl+Alt combinations can type special characters, so pick another combination if needed.'));
    paint();
    return () => window.removeEventListener('keydown', onKey, true);
  },
});
