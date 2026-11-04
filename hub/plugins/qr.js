// Helper used by other plugins (QuickShare) to draw a simple QR for a URL.
window.drawQR = (cv, text, size = 260) => QRRender.render(cv, { text, dot: 'rounded', corner: 'round', fg: '#111111', bg: '#ffffff', logo: null, label: '', labelPos: 'below' }, qrcode, size);

Plugins.register({
  id: 'qr',
  mount(root, c) {
    const { h } = c;
    root.append(c.head(c.meta.name, 'Type a link or text, then style it. The preview updates as you go.'));
    const o = { text: '', dot: 'rounded', corner: 'round', fg: '#111111', bg: '#ffffff', logo: null, label: '', labelPos: 'below' };
    const STEPS = ['Content', 'Dots', 'Corners', 'Colors', 'Logo and label', 'Export'];
    let step = 0, logoName = '';

    const canvas = h('canvas', { style: 'width:100%;max-width:340px;border-radius:10px;background:#fff;display:block;margin:0 auto' });
    const note = h('div', { class: 'small muted', style: 'text-align:center;margin-top:10px;min-height:18px' });
    const empty = h('div', { class: 'empty', style: 'display:none' }, 'Enter some text to see the preview.');
    function paint() {
      if (!o.text.trim()) { canvas.style.display = 'none'; empty.style.display = 'block'; note.textContent = ''; return; }
      canvas.style.display = 'block'; empty.style.display = 'none';
      try { QRRender.render(canvas, o, qrcode, 640); note.textContent = ''; }
      catch (e) { note.textContent = 'This text is too long for a QR code.'; }
    }

    const body = h('div', {}), nav = h('div', { class: 'row wrap', style: 'margin-bottom:16px;gap:4px' });
    const back = h('button', { class: 'btn', onclick: () => go(step - 1) }, 'Back');
    const next = h('button', { class: 'btn primary', onclick: () => go(step + 1) }, 'Next');

    function go(i) {
      if (i > 0 && !o.text.trim()) { c.toast('Enter some text first', true); i = 0; }
      step = Math.max(0, Math.min(STEPS.length - 1, i)); render();
    }

    // small preview tile used by the dot and corner pickers
    function tile(label, on, pick, variant) {
      const cv = h('canvas', { style: 'width:100%;border-radius:6px;background:#fff;display:block' });
      try { QRRender.render(cv, { ...o, ...variant, text: 'https://eyeland.app', logo: null, label: '' }, qrcode, 220); } catch {}
      return h('button', { class: 'btn', style: `flex-direction:column;height:auto;padding:8px;gap:6px;${on ? 'border-color:var(--accent);background:rgba(184,255,163,.1)' : ''}`, onclick: pick }, cv, label);
    }

    function render() {
      nav.innerHTML = '';
      STEPS.forEach((s, i) => nav.append(h('button', { class: 'btn sm', style: i === step ? 'border-color:var(--accent)' : '', onclick: () => go(i) }, `${i + 1}  ${s}`)));
      body.innerHTML = '';
      back.hidden = step === 0; next.hidden = step === STEPS.length - 1;
      next.textContent = step === 4 ? (o.logo || o.label ? 'Next' : 'Skip') : 'Next';
      const S = [content, dots, corners, colors, logo, exportStep][step];
      S();
    }

    function content() {
      const t = h('textarea', { class: 'input', rows: 5, placeholder: 'https://example.com or any text', value: o.text, oninput: () => { o.text = t.value; paint(); } });
      body.append(h('span', { class: 'label' }, 'Link or text'), t, h('p', { class: 'small faint' }, 'Tip: for Wi-Fi use the format WIFI:T:WPA;S:NetworkName;P:Password;;'));
      t.focus();
    }
    function dots() {
      const g = h('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px' });
      [['square', 'Square'], ['rounded', 'Rounded'], ['dots', 'Dots'], ['liquid', 'Liquid'], ['lines', 'Lines']].forEach(([k, n]) => g.append(tile(n, o.dot === k, () => { o.dot = k; paint(); render(); }, { dot: k })));
      body.append(h('span', { class: 'label' }, 'Dot style'), g);
    }
    function corners() {
      const g = h('div', { style: 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px' });
      [['square', 'Square'], ['round', 'Round'], ['circle', 'Circle'], ['leaf', 'Leaf']].forEach(([k, n]) => g.append(tile(n, o.corner === k, () => { o.corner = k; paint(); render(); }, { corner: k })));
      body.append(h('span', { class: 'label' }, 'Corner style'), g);
    }
    function colors() {
      const swatches = (list, key) => h('div', { class: 'row wrap' }, list.map(([hex, n]) => h('button', { class: 'btn icon', title: n, style: `background:${hex};border:2px solid ${o[key].toLowerCase() === hex.toLowerCase() ? 'var(--accent)' : 'rgba(255,255,255,.25)'}`, onclick: () => { o[key] = hex; paint(); render(); } })),
        h('input', { type: 'color', value: o[key], title: 'Custom color', style: 'width:32px;height:32px;border:0;background:none;padding:0;cursor:pointer', oninput: (e) => { o[key] = e.target.value; paint(); verdict(); } }));
      const v = h('div', { class: 'small', style: 'margin-top:12px' });
      function verdict() {
        const r = QRRender.contrast(o.fg, o.bg), inverted = parseInt(o.fg.slice(1), 16) > parseInt(o.bg.slice(1), 16) && false;
        const dk = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114); };
        v.className = 'small ' + (r >= 4 && dk(o.fg) < dk(o.bg) ? 'ok' : 'bad');
        v.textContent = dk(o.fg) >= dk(o.bg) ? 'Dots are lighter than the background. Many scanners cannot read inverted codes.' : r >= 4 ? `Contrast ${r.toFixed(1)} to 1. Easy to scan.` : `Contrast ${r.toFixed(1)} to 1. Too low, this may not scan.`;
      }
      body.append(
        h('span', { class: 'label' }, 'Dot color (most used for QR codes)'),
        swatches([['#111111', 'Black'], ['#1E3A8A', 'Navy'], ['#15803D', 'Green'], ['#B91C1C', 'Red'], ['#374151', 'Slate']], 'fg'),
        h('span', { class: 'label', style: 'margin-top:16px' }, 'Background'),
        swatches([['#FFFFFF', 'White'], ['#F5F5F4', 'Light gray'], ['#FEF3C7', 'Cream'], ['#E0F2FE', 'Light blue']], 'bg'), v);
      verdict();
    }
    function logo() {
      const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: () => {
        const f = file.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => { const img = new Image(); img.onload = () => { o.logo = img; logoName = f.name; paint(); render(); }; img.src = r.result; };
        r.readAsDataURL(f);
      } });
      const lab = h('input', { class: 'input', maxlength: 60, placeholder: 'Optional label', value: o.label, oninput: () => { o.label = lab.value; paint(); next.textContent = o.logo || o.label ? 'Next' : 'Skip'; } });
      const pos = h('div', { class: 'seg' });
      [['below', 'Below the code'], ['center', 'In the center']].forEach(([k, n]) => { const b = h('button', { class: o.labelPos === k ? 'on' : '', onclick: () => { o.labelPos = k; [...pos.children].forEach((x) => x.classList.toggle('on', x === b)); paint(); } }, n); pos.append(b); });
      body.append(
        h('p', { class: 'muted', style: 'margin-top:0' }, 'Both are optional. Skip this step if you only want the code.'),
        h('span', { class: 'label' }, 'Logo'),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => file.click() }, o.logo ? 'Change logo' : 'Choose logo'), o.logo ? h('button', { class: 'btn', onclick: () => { o.logo = null; logoName = ''; paint(); render(); } }, 'Remove') : null, h('span', { class: 'muted small trunc' }, logoName)), file,
        h('span', { class: 'label', style: 'margin-top:16px' }, 'Label'), lab,
        h('span', { class: 'label', style: 'margin-top:12px' }, 'Label position'), pos,
        h('p', { class: 'small faint' }, 'A center label shows up to 6 characters when there is no logo. Logos are placed in the middle and the code uses the highest error correction.'));
    }
    function exportStep() {
      let size = 1024;
      const seg = h('div', { class: 'seg' });
      [[512, 'Small'], [1024, 'Standard'], [2048, 'Large']].forEach(([v, n]) => { const b = h('button', { class: v === size ? 'on' : '', onclick: () => { size = v; [...seg.children].forEach((x) => x.classList.toggle('on', x === b)); } }, n); seg.append(b); });
      const png = () => { const cv = document.createElement('canvas'); QRRender.render(cv, o, qrcode, size); return cv.toDataURL('image/png'); };
      body.append(h('span', { class: 'label' }, 'PNG size'), seg,
        h('div', { class: 'row', style: 'margin-top:18px' },
          h('button', { class: 'btn primary', onclick: async () => { await c.ey.invoke('ey:copy-image', png()); c.toast('QR code copied as PNG'); } }, c.icon('copy'), 'Copy PNG'),
          h('button', { class: 'btn', onclick: async () => { const p = await c.ey.invoke('ey:save-dialog', { defaultName: 'qr-code.png', filters: [{ name: 'PNG image', extensions: ['png'] }], base64: png().split(',')[1] }); if (p) { c.toast('Saved'); c.ey.invoke('ey:reveal', p); } } }, c.icon('youtube'), 'Save PNG')),
        h('p', { class: 'small faint' }, 'Test the saved code with your phone before printing it.'));
    }

    const wizard = h('div', { class: 'card' }, nav, body, h('div', { class: 'row sp', style: 'margin-top:20px' }, back, next));
    const preview = h('div', { class: 'card', style: 'position:sticky;top:0' }, canvas, empty, note);
    root.append(h('div', { class: 'cols side' }, wizard, preview));
    render(); paint();
  },
});
