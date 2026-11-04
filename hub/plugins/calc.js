Plugins.register({
  id: 'calc',
  mount(root, c) {
    const { h } = c, E = CalcEngine;
    root.append(c.head(c.meta.name, 'Type an expression or use the keys. Unit converter on the second tab.'));
    let tab = 'calc', deg = true, history = [];
    const body = h('div', {});
    const seg = h('div', { class: 'seg', style: 'margin-bottom:14px' });
    [['calc', 'Calculator'], ['units', 'Units']].forEach(([k, n]) => { const b = h('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; [...seg.children].forEach((x) => x.classList.toggle('on', x === b)); render(); } }, n); seg.append(b); });
    root.append(seg, body);

    function render() { body.innerHTML = ''; tab === 'calc' ? calc() : units(); }

    function calc() {
      const input = h('input', { class: 'input', placeholder: '2 * (3 + 4) ^ 2', style: 'height:46px;font-size:20px', spellcheck: false });
      const out = h('div', { class: 'big mono', style: 'min-height:34px;margin:8px 2px 14px;text-align:right' });
      const hist = h('div', { class: 'list' });
      const live = () => { try { out.textContent = input.value.trim() ? E.format(E.evaluate(input.value, deg)) : ''; out.classList.remove('bad'); } catch { out.textContent = ''; } };
      const commit = () => {
        const src = input.value.trim(); if (!src) return;
        try { const r = E.format(E.evaluate(src, deg)); history.unshift({ src, r }); history = history.slice(0, 12); input.value = r; out.textContent = ''; paintHist(); }
        catch (e) { out.textContent = e.message; out.classList.add('bad'); }
      };
      input.addEventListener('input', live);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
      const keys = [['(', ')', '^', '%', 'C'], ['7', '8', '9', '÷', '⌫'], ['4', '5', '6', '×', 'sqrt('], ['1', '2', '3', '−', 'sin('], ['0', '.', '=', '+', 'cos(']];
      const pad = h('div', { style: 'display:grid;grid-template-columns:repeat(5,1fr);gap:6px' });
      keys.flat().forEach((k) => pad.append(h('button', { class: 'btn' + (k === '=' ? ' primary' : ''), style: 'height:44px', onclick: () => {
        if (k === 'C') input.value = ''; else if (k === '⌫') input.value = input.value.slice(0, -1); else if (k === '=') return commit(); else input.value += k;
        input.focus(); live();
      } }, k)));
      const modeBtn = h('button', { class: 'btn sm', onclick: () => { deg = !deg; modeBtn.textContent = deg ? 'Degrees' : 'Radians'; live(); } }, deg ? 'Degrees' : 'Radians');
      function paintHist() {
        hist.innerHTML = '';
        if (!history.length) hist.append(h('div', { class: 'empty' }, 'Your calculations appear here.'));
        history.forEach((x) => hist.append(h('button', { class: 'li btn', style: 'justify-content:space-between;height:auto;font-weight:500', onclick: () => { input.value = x.r; input.focus(); live(); } }, h('span', { class: 'muted trunc' }, x.src), h('b', { class: 'mono' }, x.r))));
      }
      paintHist();
      body.append(h('div', { class: 'cols c2', style: 'align-items:start' },
        h('div', { class: 'card' }, input, out, pad, h('div', { class: 'row sp', style: 'margin-top:12px' }, modeBtn, h('span', { class: 'faint small' }, 'Supports + - * / ^ % ! sqrt sin cos tan ln log pi e'))),
        h('div', { class: 'card' }, h('h3', {}, 'History'), hist)));
      input.focus();
    }

    function units() {
      let cat = 'Length';
      const catSel = h('select', { class: 'input', onchange: () => { cat = catSel.value; fill(); } }, Object.keys(E.UNITS).map((k) => h('option', {}, k)));
      const a = h('input', { class: 'input', type: 'number', value: '1', style: 'height:44px;font-size:18px' });
      const b = h('input', { class: 'input', type: 'text', readonly: true, style: 'height:44px;font-size:18px' });
      const ua = h('select', { class: 'input' }), ub = h('select', { class: 'input' });
      function fill() {
        [ua, ub].forEach((s) => (s.innerHTML = ''));
        Object.keys(E.UNITS[cat].u).forEach((u) => { ua.append(h('option', {}, u)); ub.append(h('option', {}, u)); });
        ua.selectedIndex = 0; ub.selectedIndex = Math.min(2, ub.options.length - 1); calcU();
      }
      function calcU() { const v = parseFloat(a.value); b.value = isNaN(v) ? '' : E.format(E.convertUnit(cat, v, ua.value, ub.value)); }
      [a, ua, ub].forEach((x) => x.addEventListener('input', calcU));
      const swap = h('button', { class: 'btn icon', title: 'Swap', onclick: () => { const i = ua.selectedIndex; ua.selectedIndex = ub.selectedIndex; ub.selectedIndex = i; calcU(); } }, c.icon('convert'));
      body.append(h('div', { class: 'card', style: 'max-width:560px' }, h('span', { class: 'label' }, 'Category'), catSel,
        h('div', { style: 'display:grid;grid-template-columns:1fr auto 1fr;gap:10px;margin-top:16px;align-items:start' },
          h('div', { class: 'stack' }, a, ua), swap, h('div', { class: 'stack' }, b, ub))));
      fill();
    }
    render();
  },
});
