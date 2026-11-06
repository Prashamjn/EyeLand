// Activity views. One registry maps an activity type to how it looks in the pill and in the
// expanded top section. A view is created once, then only updated, so live values (the volume
// bar, a waveform) change without re-rendering.
(function () {
  const { icon, setText } = Island;
  const div = (cls, html) => { const d = document.createElement('div'); d.className = cls; if (html != null) d.innerHTML = html; return d; };
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(+v || 0)));

  const speaker = (v, muted) => (muted ? 'volume-x' : v === 0 ? 'volume' : v < 50 ? 'volume-1' : 'volume-2');
  const swatch = (c) => `<svg width="20" height="20" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" fill="${/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#fff'}" stroke="rgba(255,255,255,.5)"/></svg>`;
  const wave = (on) => `<span class="wave${on ? ' on' : ''}"><i></i><i></i><i></i><i></i></span>`;

  function setIcon(box, state, name, html) {            // swap an icon only when it changed, with a small pop
    if (state.key === name) return;
    const first = state.key == null; state.key = name;
    box.innerHTML = html || icon(name, box.parentElement && box.parentElement.classList.contains('card') ? 22 : 20);
    if (!first) { box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); }
  }

  /* ---- volume / brightness ---- */
  const meter = {
    size: () => [300, 44],
    create(variant) {
      const card = variant === 'card';
      const root = div('view' + (card ? ' card' : '')), ico = div('v-ico'), mid = div('v-text mid'), pct = div('v-pct');
      const title = card ? div('v-title') : null, track = div('v-track'), fill = div('v-fill');
      track.append(fill); if (title) mid.append(title); mid.append(track); root.append(ico, mid, pct);
      const st = {};
      return { el: root, update(a) {
        const d = a.data || {}, v = clamp(d.value), isVol = a.type === 'volume';
        setIcon(ico, st, isVol ? speaker(v, d.muted) : 'sun');
        fill.style.transform = `scaleX(${(d.muted ? 0 : v) / 100})`;
        setText(pct, d.muted ? 'Muted' : v + '%');
        if (title) setText(title, isVol ? 'Volume' : 'Brightness');
      } };
    },
  };

  /* ---- charger ---- */
  const charging = {
    size: () => [292, 44],
    create(variant) {
      const card = variant === 'card';
      const root = div('view' + (card ? ' card' : '')), ico = div('v-ico'), text = div('v-text'), t = div('v-title'), s = div('v-sub'), pct = div('v-pct');
      const track = div('v-track'), fill = div('v-fill green'); track.append(fill);
      text.append(t, s); if (card) { track.style.marginTop = '8px'; text.append(track); }
      root.append(ico, text, pct);
      const st = {};
      ico.addEventListener('animationend', (e) => { if (e.animationName === 'chg-ring') ico.classList.remove('pulse'); });
      return { el: root, update(a) {
        const d = a.data || {}, lvl = clamp(d.level), on = !!d.charging;
        setIcon(ico, st, on ? 'battery-charging' : 'battery');
        ico.className = 'v-ico ' + (on ? 'tint-green' : lvl <= 15 ? 'tint-amber' : '') + (ico.classList.contains('pulse') ? ' pulse' : '');
        if (on && d.pulse && d.pulse !== st.pulse) {                       // one-shot ring when the charger was just connected
          st.pulse = d.pulse;
          if (!Island.reduced) { ico.classList.remove('pulse'); void ico.offsetWidth; ico.classList.add('pulse'); }
        }
        setText(t, on ? 'Charging' : 'Charger disconnected');
        setText(s, on ? (lvl >= 100 ? 'Fully charged' : 'Plugged in') : 'On battery');
        setText(pct, lvl + '%'); fill.style.transform = `scaleX(${lvl / 100})`;
      } };
    },
  };

  /* ---- media ---- */
  const media = {
    size: () => [348, 56],
    create(variant) {
      const card = variant === 'card';
      const root = div('view' + (card ? ' card' : '')), art = div('art'), text = div('v-text'), t = div('v-title'), s = div('v-sub');
      text.append(t, s);
      const w = document.createElement('span'); w.innerHTML = wave(false); const waveEl = w.firstChild;
      let ctrls = null, playBtn = null;
      root.append(art, text);
      if (card) {
        ctrls = div('v-ctrls');
        const mk = (cmd, ic, cls) => { const b = document.createElement('button'); b.className = 'circ ' + (cls || ''); b.dataset.cmd = cmd; b.setAttribute('aria-label', cmd); b.innerHTML = icon(ic, 18).replace('<svg', cmd === 'play' ? '<svg class="fill"' : '<svg'); b.addEventListener('click', () => window.api.media(cmd)); return b; };
        playBtn = mk('play', 'play', 'main');
        ctrls.append(mk('prev', 'skip-back'), playBtn, mk('next', 'skip-forward'));
        root.append(ctrls);
      } else root.append(waveEl);
      let artSrc = null, playing = null;
      return { el: root, update(a) {
        const d = a.data || {};
        setText(t, a.title || 'Unknown'); setText(s, a.subtitle || d.app || '');
        if (d.art !== artSrc) { artSrc = d.art; art.innerHTML = artSrc ? `<img alt="" src="${artSrc}">` : icon('music', 18); }
        waveEl.classList.toggle('on', !!d.playing);
        if (playBtn && playing !== !!d.playing) { playing = !!d.playing; playBtn.innerHTML = icon(playing ? 'pause' : 'play', 18).replace('<svg', '<svg class="fill"'); playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play'); }
      } };
    },
  };

  /* ---- generic: notifications, timers, long-running tasks, system activity ---- */
  const generic = {
    size: (a) => [Math.max(230, Math.min(430, 96 + String(a.title || '').length * 7.4)), 44],
    create(variant) {
      const card = variant === 'card';
      const root = div('view' + (card ? ' card' : '')), ico = div('v-ico'), text = div('v-text'), t = div('v-title'), s = div('v-sub');
      const track = div('v-track'), fill = div('v-fill'); track.append(fill); track.style.display = 'none';
      text.append(t, s, track); root.append(ico, text);
      const st = {};
      return { el: root, update(a) {
        const d = a.data || {};
        if (d.color) setIcon(ico, st, 'swatch:' + d.color, swatch(d.color)); else setIcon(ico, st, a.icon || 'bell');
        ico.classList.toggle('tint-amber', d.tone === 'warn'); ico.classList.toggle('tint-red', d.tone === 'critical');
        setText(t, a.title || ''); setText(s, a.subtitle || ''); s.style.display = a.subtitle ? '' : 'none';
        const has = typeof a.progress === 'number';
        track.style.display = has ? '' : 'none'; if (has) fill.style.transform = `scaleX(${Math.max(0, Math.min(1, a.progress))})`;
      } };
    },
  };
  const timerChip = { chip: (a) => ({ key: 'timer:' + (a.subtitle || ''), w: 36, html: `<span class="chip mono">${a.subtitle || ''}</span>` }) };
  const coffeeChip = { chip: () => ({ key: 'coffee', w: 14, html: icon('coffee', 14) }) };

  const REG = {
    volume: meter, brightness: meter, charging, media,
    notice: generic, task: generic,
    timer: { ...generic, ...timerChip }, coffee: { ...generic, ...coffeeChip },
  };
  const def = (type) => REG[type] || generic;

  /* ---- Slot: hosts one view at a time and crossfades between them ---- */
  class Slot {
    constructor(root, variant) { this.root = root; this.variant = variant; this.cur = null; this.defn = null; }
    show(act) {
      if (!act) return this.clear();
      const d = def(act.type);
      if (this.cur && this.defn === d) { this.cur.update(act); return; }
      const next = d.create(this.variant); next.update(act);
      next.el.classList.add('in'); this.root.append(next.el);
      requestAnimationFrame(() => requestAnimationFrame(() => next.el.classList.remove('in')));
      this._retire(this.cur); this.cur = next; this.defn = d;
    }
    clear() { this._retire(this.cur); this.cur = null; this.defn = null; }
    _retire(inst) {
      if (!inst) return;
      inst.el.classList.add('out');
      Island.later(() => inst.el.remove(), 260);
    }
  }

  window.Views = { Slot, size: (a) => def(a.type).size(a), chip: (a) => (def(a.type).chip ? def(a.type).chip(a) : null), has: (t) => t in REG };
})();
