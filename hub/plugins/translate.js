Plugins.register({
  id: 'translate',
  mount(root, c) {
    const { h } = c;
    root.append(c.head(c.meta.name, 'Scan text from anywhere on screen, or type it, and read the translation.'));
    const LANGS = [['en', 'English'], ['hi', 'Hindi'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['ru', 'Russian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh-CN', 'Chinese (Simplified)'], ['ar', 'Arabic'], ['bn', 'Bengali'], ['ta', 'Tamil'], ['te', 'Telugu'], ['mr', 'Marathi'], ['gu', 'Gujarati'], ['pa', 'Punjabi'], ['ur', 'Urdu'], ['tr', 'Turkish'], ['nl', 'Dutch'], ['pl', 'Polish'], ['id', 'Indonesian'], ['th', 'Thai'], ['vi', 'Vietnamese'], ['sv', 'Swedish']];
    const src = h('textarea', { class: 'input', rows: 8, placeholder: 'Type or paste text, or press Scan screen' });
    const out = h('textarea', { class: 'input', rows: 8, readonly: true, placeholder: 'Translation' });
    const to = h('select', { class: 'input', style: 'width:200px', onchange: () => { c.save({ translateTo: to.value }); run(); } }, LANGS.map(([k, n]) => h('option', { value: k }, n)));
    to.value = c.S.translateTo || 'en';
    const from = h('select', { class: 'input', style: 'width:200px', onchange: run }, [h('option', { value: 'auto' }, 'Detect language'), ...LANGS.map(([k, n]) => h('option', { value: k }, n))]);
    const info = h('span', { class: 'small faint' });
    let busy = false, timer;
    async function run() {
      const text = src.value.trim();
      if (!text) { out.value = ''; info.textContent = ''; return; }
      if (busy) return; busy = true; info.textContent = 'Translating';
      try {
        const r = await c.ey.invoke('ey:translate', text, to.value, from.value);
        out.value = r.text;
        const name = (LANGS.find((l) => l[0] === r.detected) || [])[1] || r.detected;
        info.textContent = from.value === 'auto' && name ? `Detected ${name}` : '';
      } catch (e) { out.value = ''; info.textContent = 'Translation failed. Check your connection.'; }
      busy = false;
    }
    src.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 700); });
    const swap = h('button', { class: 'btn', onclick: () => { if (!out.value) return; src.value = out.value; if (LANGS.some((l) => l[0] === to.value) && from.value !== 'auto') { const t = from.value; from.value = to.value; to.value = t; } else from.value = 'auto'; run(); } }, c.icon('convert'), 'Swap');
    root.append(
      h('div', { class: 'row wrap', style: 'margin-bottom:12px' },
        h('button', { class: 'btn primary', onclick: () => c.ey.invoke('ey:capture', 'translate') }, c.icon('textExtract'), 'Scan screen'),
        c.meta.key ? h('span', { class: 'kbd' }, c.meta.key) : null),
      h('div', { class: 'cols c2' },
        h('div', { class: 'card' }, h('div', { class: 'row sp', style: 'margin-bottom:8px' }, from, swap), src),
        h('div', { class: 'card' }, h('div', { class: 'row sp', style: 'margin-bottom:8px' }, to, h('button', { class: 'btn', onclick: () => { if (out.value) { c.ey.invoke('ey:copy', out.value); c.toast('Translation copied'); } } }, c.icon('copy'), 'Copy')), out, h('div', { style: 'margin-top:8px' }, info))),
      h('div', { class: 'card' }, c.ocrPicker(c), h('p', { class: 'small faint' }, 'Translation uses an online service, so the text you scan is sent to it.')));
    return c.ey.on('translate:text', ({ text }) => { src.value = text; from.value = 'auto'; run(); });
  },
});
