// Pages for the instant plugins: text extractor, lens, color picker, draw, coffee mode.
(() => {
  const { h } = ctx;
  const OCR_LANGS = [['eng', 'English'], ['hin', 'Hindi'], ['spa', 'Spanish'], ['fra', 'French'], ['deu', 'German'], ['ita', 'Italian'], ['por', 'Portuguese'], ['rus', 'Russian'], ['jpn', 'Japanese'], ['kor', 'Korean'], ['chi_sim', 'Chinese (Simplified)'], ['ara', 'Arabic']];
  ctx.ocrPicker = (c) => {
    const sel = new Set((c.S.ocrLang || 'eng').split('+'));
    const box = h('div', { class: 'row wrap' });
    OCR_LANGS.forEach(([code, name]) => {
      const cb = h('input', { type: 'checkbox', checked: sel.has(code), onchange: () => {
        cb.checked ? sel.add(code) : sel.delete(code);
        if (!sel.size) { sel.add('eng'); cb.checked = code === 'eng'; }
        c.save({ ocrLang: [...sel].join('+') });
      } });
      box.append(h('label', { class: 'row small', style: 'gap:6px;width:170px' }, cb, name));
    });
    return h('div', {}, h('span', { class: 'label' }, 'Text recognition languages'), box, h('p', { class: 'small faint' }, 'Each language downloads once (about 10 to 20 MB) the first time you use it, then works offline.'));
  };

  const shell = (id, build) => Plugins.register({
    id,
    mount(root, c) {
      root.append(c.head(c.meta.name, c.meta.desc));
      const start = h('button', { class: 'btn primary', onclick: () => c.ey.invoke('ey:run', id) }, c.icon(id), id === 'coffee' ? 'Toggle' : 'Start');
      const top = h('div', { class: 'card' }, h('div', { class: 'row sp' }, h('div', {}, h('div', { class: 'label' }, 'Shortcut'), c.meta.key ? h('span', { class: 'kbd' }, c.meta.key) : h('span', { class: 'muted' }, 'None set')), id === 'coffee' ? null : start));
      root.append(top);
      return build(root, c, top, start);
    },
  });

  shell('textExtract', (root, c) => {
    root.append(h('div', { class: 'card' }, h('p', { class: 'muted', style: 'margin-top:0' }, 'The screen freezes and you drag a box over the text. The recognized text is copied to the clipboard and the island confirms it. Text inside images and videos works too.'), c.ocrPicker(c)));
  });

  shell('lens', (root, c) => {
    const seg = h('div', { class: 'seg' });
    [['google', 'Google Lens'], ['bing', 'Bing Visual'], ['yandex', 'Yandex']].forEach(([k, n]) => {
      const b = h('button', { class: (c.S.lensEngine || 'google') === k ? 'on' : '', onclick: () => { c.save({ lensEngine: k }); [...seg.children].forEach((x) => x.classList.toggle('on', x === b)); } }, n);
      seg.append(b);
    });
    root.append(h('div', { class: 'card' },
      h('p', { class: 'muted', style: 'margin-top:0' }, 'Drag around a product, logo, plant or anything else on screen. The selected area opens as a visual search in your browser, so you can find the item or similar images.'),
      h('span', { class: 'label' }, 'Search engine'), seg,
      h('p', { class: 'small faint' }, 'Search engines need a web address for the picture, so Eyeland uploads only the selected area to a temporary host (catbox.moe) that deletes it after 1 hour. You are asked once before the first upload.'),
      h('button', { class: 'btn sm', onclick: () => { c.save({ lensConsent: false }); c.toast('You will be asked again before the next upload'); } }, 'Ask me again next time')));
  });

  shell('colorPicker', (root, c) => {
    const seg = h('div', { class: 'seg' });
    ['hex', 'rgb', 'hsl'].forEach((k) => {
      const b = h('button', { class: (c.S.colorFormat || 'hex') === k ? 'on' : '', onclick: () => { c.save({ colorFormat: k }); [...seg.children].forEach((x) => x.classList.toggle('on', x === b)); } }, k.toUpperCase());
      seg.append(b);
    });
    const hist = h('div', { class: 'row wrap' });
    const paint = () => {
      hist.innerHTML = '';
      const list = c.S.colorHistory || [];
      if (!list.length) hist.append(h('span', { class: 'faint' }, 'Colors you pick will appear here.'));
      list.forEach((hex) => hist.append(h('button', { class: 'btn', title: 'Copy ' + hex, style: 'height:auto;padding:6px 10px;gap:8px', onclick: () => { c.ey.invoke('ey:copy', hex); c.toast('Copied ' + hex); } }, h('span', { style: `width:16px;height:16px;border-radius:4px;background:${hex};border:1px solid rgba(255,255,255,.3);display:inline-block` }), hex)));
    };
    paint();
    const off = c.ey.on('settings', () => paint());
    root.append(h('div', { class: 'card' }, h('p', { class: 'muted', style: 'margin-top:0' }, 'A magnifier follows your cursor. Click to copy the color of the pixel under it.'), h('span', { class: 'label' }, 'Copy format'), seg),
      h('div', { class: 'card' }, h('h3', {}, 'Recent colors'), hist));
    return off;
  });

  shell('draw', (root) => {
    root.append(h('div', { class: 'card' }, h('p', { class: 'muted', style: 'margin-top:0' }, 'Draw straight on top of whatever is on your screen. A small toolbar offers three pen sizes, colors, a marker, an eraser and undo.'),
      h('div', { class: 'stack small' }, h('div', {}, h('span', { class: 'kbd' }, 'Esc'), '  clears everything and closes drawing at once'), h('div', {}, h('span', { class: 'kbd' }, 'Ctrl+Z'), '  undo the last stroke'))));
  });

  Plugins.register({
    id: 'coffee',
    async mount(root, c) {
      root.append(c.head(c.meta.name, c.meta.desc));
      const state = h('div', { class: 'big' }, 'Off'), btn = h('button', { class: 'btn primary', onclick: () => c.ey.invoke('ey:run', 'coffee') }, 'Turn on');
      const sel = h('select', { class: 'input', style: 'width:220px', onchange: () => c.save({ coffeeMinutes: +sel.value }) },
        [[0, 'Until I turn it off'], [30, 'For 30 minutes'], [60, 'For 1 hour'], [120, 'For 2 hours'], [240, 'For 4 hours']].map(([v, n]) => h('option', { value: v }, n)));
      sel.value = String(c.S.coffeeMinutes || 0);
      const paint = (on) => { state.textContent = on ? 'On' : 'Off'; state.className = 'big ' + (on ? 'ok' : ''); btn.textContent = on ? 'Turn off' : 'Turn on'; };
      paint(await c.ey.invoke('ey:coffee'));
      root.append(h('div', { class: 'card' }, h('div', { class: 'row sp' }, h('div', {}, h('span', { class: 'label' }, 'Status'), state), btn)),
        h('div', { class: 'card' }, h('span', { class: 'label' }, 'Turn off automatically'), sel,
          h('p', { class: 'small faint' }, 'While it is on, Windows will not dim the screen or start the screen saver, and your eyes stay wide open on the island. It resets when you quit Eyeland.')));
      return c.ey.on('coffee', paint);
    },
  });
})();
