const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const island = $('#island');

let S = {};                       // settings
let mode = 'idle';                // idle | overlay | panel
let inside = false, interactive = false;
let hoverT, leaveT, overlayT;
let cur = { x: -999, y: -999 };
let activeTab = 'home';
const state = { vol: 0, muted: false, bri: null, media: { title: '', artist: '', app: '', playing: false }, clips: [] };
let dragging = false;

/* ---------- icons ---------- */
const I = {
  speaker: (v, muted) => `<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/>${
    muted ? '<path d="M16 9l5 6M21 9l-5 6" fill="none"/>' :
    (v > 0 ? '<path d="M16 9.5a4 4 0 0 1 0 5" fill="none"/>' : '') + (v > 50 ? '<path d="M18.5 7a7.5 7.5 0 0 1 0 10" fill="none"/>' : '')}</svg>`,
  sun: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" fill="none"/></svg>`,
  bell: `<svg viewBox="0 0 24 24"><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4" fill="none"/></svg>`,
  play: `<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>`,
  warn: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3zM12 10v4M12 17h.01"/></svg>',
};

/* ---------- size / shape ---------- */
const SIZE = { idle: [150, 34], overlay: [330, 40], panel: [520, 250] };
function setMode(m) {
  mode = m;
  island.dataset.mode = m;
  layout();
}
function layout() {
  let [w, h] = SIZE[mode];
  if (mode === 'idle' && timer.remaining < timer.total) w = 210;
  island.style.width = w + 'px';
  island.style.height = h + 'px';
  const r = mode === 'panel' ? 30 : mode === 'overlay' ? 20 : 17;
  const flush = (S.offsetY || 0) === 0;
  const bottom = S.position === 'bottom';
  island.style.borderRadius = bottom ? (flush ? `${r}px ${r}px 0 0` : `${r}px`) : (flush ? `0 0 ${r}px ${r}px` : `${r}px`);
  island.style.top = bottom ? 'auto' : (S.offsetY || 0) + 'px';
  island.style.bottom = bottom ? (S.offsetY || 0) + 'px' : 'auto';
}

/* ---------- eyes: follow the cursor, blink ---------- */
function look(x, y) {
  $$('.eyes').forEach((eyes) => {
    const r = eyes.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(d / 90, 1);                       // gentler the closer you are
    const small = eyes.classList.contains('small');
    const mx = small ? 1.6 : 3, my = small ? 1.2 : 2.4;
    eyes.querySelectorAll('.eye').forEach((e) => {
      e.style.setProperty('--tx', (dx / d) * k * mx + 'px');
      e.style.setProperty('--ty', (dy / d) * k * my + 'px');
    });
  });
}
function blink() {
  if (document.body.classList.contains('coffee')) return setTimeout(blink, 2000);
  const eyes = $$('.eye');
  eyes.forEach((e) => e.classList.add('blink'));
  setTimeout(() => eyes.forEach((e) => e.classList.remove('blink')), 130 / (S.animSpeed || 1));
  const double = Math.random() < 0.2;
  setTimeout(blink, (double ? 260 : 2600 + Math.random() * 3800) / (S.animSpeed || 1));
}

/* ---------- hover / interactivity ---------- */
api.onCursor(({ x, y }) => {
  cur = { x, y };
  look(x, y);
  const r = island.getBoundingClientRect();
  const pad = mode === 'panel' ? 12 : 8;
  const hit = x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  if (hit && !inside) {
    inside = true; clearTimeout(leaveT);
    if (mode !== 'panel') { clearTimeout(hoverT); hoverT = setTimeout(() => openPanel(), S.hoverDelay ?? 120); }
  } else if (!hit && inside) {
    inside = false; clearTimeout(hoverT);
    if (mode === 'panel') scheduleClose();
  }
  const want = mode === 'panel' && hit;
  if (want !== interactive) { interactive = want; api.setInteractive(want); }
});
function openPanel(d) { clearTimeout(overlayT); clearTimeout(leaveT); if (d && d.tab) showTab(d.tab); loadApps(); setMode('panel'); }
function scheduleClose() {
  clearTimeout(leaveT);
  leaveT = setTimeout(() => {
    if (inside || document.activeElement === $('#taskInput')) return;
    closePanel();
  }, 350);
}
function closePanel() { setMode('idle'); if (interactive) { interactive = false; api.setInteractive(false); } }
api.onOpenPanel(openPanel);

/* ---------- overlay (volume / brightness / toast) ---------- */
function showOverlay({ icon, pct, text }) {
  if (mode === 'panel') return;                // sliders already show it
  clearTimeout(hoverT);
  $('#ovIcon').innerHTML = icon; $('#ovIcon').classList.remove('line'); $('.v-overlay').classList.remove('msg');
  $('#ovFill').style.width = pct + '%';
  $('#ovText').textContent = text;
  if (mode !== 'overlay') setMode('overlay');
  clearTimeout(overlayT);
  overlayT = setTimeout(() => { if (mode === 'overlay') setMode('idle'); }, S.overlayMs || 1800);
}

api.onSystem((m) => {
  if (m.kind === 'vol') {
    const first = state.vol === null;
    const changed = m.value !== state.vol || m.muted !== state.muted;
    state.vol = m.value; state.muted = m.muted;
    paintSystem();
    if (changed && !state.firstVol) showOverlay({ icon: I.speaker(m.value, m.muted), pct: m.muted ? 0 : m.value, text: m.muted ? 'Muted' : m.value + '%' });
    state.firstVol = false;
  } else if (m.kind === 'bri') {
    if (m.value === null) { state.bri = null; $('#briRow').style.display = 'none'; return; }
    const changed = m.value !== state.bri;
    state.bri = m.value; paintSystem();
    if (changed && !state.firstBri) showOverlay({ icon: I.sun, pct: m.value, text: m.value + '%' });
    state.firstBri = false;
  }
});
state.vol = 0; state.firstVol = true; state.firstBri = true;   // the first reading at startup should not pop the overlay

function paintSlider(el, v) { el.value = v; el.style.setProperty('--p', v + '%'); }
function paintSystem() {
  if (!dragging) { paintSlider($('#homeVol'), state.muted ? 0 : state.vol); paintSlider($('#homeBri'), state.bri ?? 0); }
  $('#homeVolNum').textContent = state.muted ? 'Mute' : state.vol;
  $('#homeBriNum').textContent = state.bri ?? '';
  $('#homeVolIcon').innerHTML = I.speaker(state.vol, state.muted);
  $('#homeBriIcon').innerHTML = I.sun;
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const pushVol = debounce((v) => api.setSystem('vol', v), 60);
const pushBri = debounce((v) => api.setSystem('bri', v), 120);
[['#homeVol', pushVol, '#homeVolNum'], ['#homeBri', pushBri, '#homeBriNum']].forEach(([sel, push, num]) => {
  const el = $(sel);
  el.addEventListener('pointerdown', () => (dragging = true));
  window.addEventListener('pointerup', () => (dragging = false));
  el.addEventListener('input', () => { el.style.setProperty('--p', el.value + '%'); $(num).textContent = el.value; push(+el.value); });
});
$('#homeVolIcon').addEventListener('click', () => api.setSystem('mute', 0));

/* ---------- media ---------- */
api.onMedia((m) => { state.media = m; paintMedia(); });
function paintMedia() {
  const m = state.media, has = !!m.title;
  $('#homeTrack').textContent = has ? m.title : 'Nothing playing';
  $('#homeArtist').textContent = has ? (m.artist || m.app) : '';
  $('#musicTitle').textContent = has ? m.title : 'Nothing playing';
  $('#musicArtist').textContent = has ? m.artist : '';
  $('#musicApp').textContent = has ? (m.app || 'Now playing') : 'No player';
  $('#musicPlay').innerHTML = $('#homeMusicPlay').innerHTML = m.playing ? I.pause : I.play;
}
$$('[data-media]').forEach((b) => b.addEventListener('click', () => api.media(b.dataset.media)));

/* ---------- focus timer ---------- */
const timer = { mode: 'focus', total: 1500, remaining: 1500, running: false, endAt: 0, sessions: 0 };
const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.max(0, s % 60)).padStart(2, '0');
function timerLength(m) { return ((m === 'focus' ? S.focusMin : S.breakMin) || (m === 'focus' ? 25 : 5)) * 60; }
function setTimerMode(m) { timer.mode = m; timer.total = timer.remaining = timerLength(m); timer.running = false; paintTimer(); }
function toggleTimer() {
  if (timer.running) { timer.running = false; }
  else { timer.running = true; timer.endAt = Date.now() + timer.remaining * 1000; }
  paintTimer();
}
function resetTimer() { timer.running = false; timer.remaining = timer.total; paintTimer(); }
setInterval(() => {
  if (!timer.running) return;
  timer.remaining = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
  if (timer.remaining === 0) finishTimer();
  paintTimer();
}, 250);
function finishTimer() {
  timer.running = false;
  const wasFocus = timer.mode === 'focus';
  if (wasFocus) timer.sessions++;
  new Notification(wasFocus ? 'Focus session complete' : 'Break is over', { body: wasFocus ? 'Time for a break.' : 'Ready for another round?', silent: false });
  showOverlay({ icon: I.bell, pct: 100, text: 'Done' });
  document.body.classList.add('alert'); setTimeout(() => document.body.classList.remove('alert'), 3200);
  setTimeout(() => setTimerMode(wasFocus ? 'break' : 'focus'), 50);
}
function paintTimer() {
  const t = fmt(timer.remaining), started = timer.remaining < timer.total;
  $('#timerBig').textContent = t; $('#homeTimer').textContent = t;
  $('#homeTimerSub').textContent = timer.running ? (timer.mode === 'focus' ? 'Focus session' : 'Break') : started ? 'Paused' : (timer.mode === 'focus' ? 'Focus, ready' : 'Break, ready');
  $('#homeToggle').textContent = timer.running ? 'Pause' : started ? 'Resume' : 'Start';
  $('#timerToggle').textContent = timer.running ? 'Pause' : started ? 'Resume' : 'Start';
  $('#timerFill').style.width = ((timer.total - timer.remaining) / timer.total) * 100 + '%';
  $$('[data-tmode]').forEach((b) => b.classList.toggle('on', b.dataset.tmode === timer.mode));
  $('#timerCount').textContent = `${timer.sessions} focus session${timer.sessions === 1 ? '' : 's'} today`;
  const it = $('#idleTimer');
  it.textContent = t; it.classList.toggle('on', started); it.classList.toggle('paused', started && !timer.running);
  if (mode === 'idle') layout();
}
$('#homeToggle').addEventListener('click', toggleTimer);
$('#homeReset').addEventListener('click', resetTimer);
$('#timerToggle').addEventListener('click', toggleTimer);
$('#timerReset').addEventListener('click', resetTimer);
$$('[data-tmode]').forEach((b) => b.addEventListener('click', () => setTimerMode(b.dataset.tmode)));

/* ---------- tabs ---------- */
function showTab(t) {
  activeTab = t;
  $$('.tab').forEach((s) => s.classList.toggle('on', s.dataset.tab === t));
  $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
}
$$('#nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
$$('[data-go]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.go)));

/* ---------- clipboard ---------- */
api.onClips((list) => { state.clips = list; paintClips(); });
function paintClips() {
  const box = $('#clipList');
  box.innerHTML = '';
  if (!S.clipboardHistory) { box.innerHTML = '<div class="empty">Clipboard history is off. Turn it on in Settings.</div>'; return; }
  if (!state.clips.length) { box.innerHTML = '<div class="empty">Copy some text and it will show up here.</div>'; return; }
  state.clips.forEach((c) => {
    const b = document.createElement('button');
    b.textContent = c.replace(/\s+/g, ' ').trim(); b.title = 'Click to copy again';
    b.addEventListener('click', () => api.copyClip(c));
    box.appendChild(b);
  });
}
$('#clipClear').addEventListener('click', () => api.clearClips());

/* ---------- tasks ---------- */
const taskInput = $('#taskInput');
const saveTodos = (list) => { S.todos = list; api.saveSettings({ todos: list }); paintTasks(); };
function paintTasks() {
  const box = $('#taskList'); box.innerHTML = '';
  const list = [...(S.todos || [])].sort((a, b) => a.done - b.done);
  if (!list.length) { box.innerHTML = '<div class="empty">No tasks yet.</div>'; return; }
  list.forEach((t) => {
    const row = document.createElement('div'); row.className = 'task' + (t.done ? ' done' : '');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = t.done;
    cb.addEventListener('change', () => saveTodos(S.todos.map((x) => (x.id === t.id ? { ...x, done: cb.checked } : x))));
    const tx = document.createElement('span'); tx.textContent = t.text;
    const del = document.createElement('button'); del.className = 'task-del'; del.setAttribute('aria-label', 'Delete'); del.innerHTML = ICONS.svg('close');
    del.addEventListener('click', () => saveTodos(S.todos.filter((x) => x.id !== t.id)));
    row.append(cb, tx, del); box.appendChild(row);
  });
}
function addTask() {
  const text = taskInput.value.trim(); if (!text) return;
  saveTodos([{ id: Math.random().toString(36).slice(2, 10), text, done: false, created: Date.now() }, ...(S.todos || [])]);
  taskInput.value = '';
}
$('#taskAdd').addEventListener('click', addTask);
taskInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
// the island window is not focusable by default, so allow typing only while the box is used
taskInput.addEventListener('mousedown', () => { api.setFocusable(true); setTimeout(() => taskInput.focus(), 60); });
taskInput.addEventListener('blur', () => { api.setFocusable(false); if (!inside) scheduleClose(); });

/* ---------- plugins grid ---------- */
let coffeeOn = false;
async function loadApps() {
  const cat = await api.catalog();
  const grid = $('#appsGrid'); grid.innerHTML = '';
  cat.filter((p) => p.id !== 'shortcuts').forEach((p) => {
    const b = document.createElement('button'); b.className = 'app' + (p.id === 'coffee' && coffeeOn ? ' on' : ''); b.dataset.id = p.id;
    b.title = p.name + (p.key ? '  (' + p.key + ')' : '');
    b.innerHTML = ICONS.svg(p.id) + '<span>' + p.name + '</span>';
    b.addEventListener('click', () => { api.run(p.id); if (p.id !== 'coffee') closePanel(); });
    grid.appendChild(b);
  });
}
api.onCoffee((on) => {
  coffeeOn = on; document.body.classList.toggle('coffee', on);
  const ico = $('#coffeeIco'); ico.hidden = !on; ico.innerHTML = on ? ICONS.svg('coffee') : '';
  const t = document.querySelector('.app[data-id="coffee"]'); if (t) t.classList.toggle('on', on);
});

/* ---------- toast (plugin results) ---------- */
function showToast({ icon, text, color }) {
  if (mode === 'panel') closePanel();
  const el = $('#ovIcon');
  const map = { copy: ICONS.svg('copy'), check: ICONS.svg('check'), warn: I.warn, search: ICONS.svg('lens'), coffee: ICONS.svg('coffee'), color: `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" style="fill:${color || '#fff'};stroke:rgba(255,255,255,.5)"/></svg>` };
  el.innerHTML = map[icon] || map.check; el.classList.add('line');
  $('.v-overlay').classList.add('msg'); $('#ovMsg').textContent = text;
  if (mode !== 'overlay') setMode('overlay');
  clearTimeout(overlayT);
  overlayT = setTimeout(() => { if (mode === 'overlay') setMode('idle'); }, Math.max(2200, S.overlayMs || 1800));
}
api.onToast(showToast);

/* ---------- settings form ---------- */
const FIELDS = [
  { k: 'eyeColor', l: 'Eye color', t: 'color' },
  { k: 'theme', l: 'Theme', t: 'select', o: ['black', 'graphite', 'midnight', 'light'] },
  { k: 'animSpeed', l: 'Animation speed', t: 'range', min: 0.5, max: 2, step: 0.1 },
  { k: 'position', l: 'Position', t: 'select', o: ['top', 'bottom'] },
  { k: 'offsetY', l: 'Edge gap', t: 'range', min: 0, max: 40, step: 1 },
  { k: 'hoverDelay', l: 'Open delay (ms)', t: 'range', min: 0, max: 600, step: 20 },
  { k: 'overlayMs', l: 'Overlay time (ms)', t: 'range', min: 800, max: 4000, step: 100 },
  { k: 'focusMin', l: 'Focus (min)', t: 'number', min: 1, max: 120 },
  { k: 'breakMin', l: 'Break (min)', t: 'number', min: 1, max: 60 },
  { k: 'clipboardHistory', l: 'Clipboard history', t: 'checkbox' },
  { k: 'hideInFullscreen', l: 'Hide in full screen', t: 'checkbox' },
  { k: 'autostart', l: 'Start with Windows', t: 'checkbox' },
];
function buildSettings() {
  const form = $('#settingsForm'); form.innerHTML = '';
  FIELDS.forEach((f) => {
    const wrap = document.createElement('div'); wrap.className = 'field';
    const label = document.createElement('label'); label.textContent = f.l; label.htmlFor = 'f_' + f.k;
    let el;
    if (f.t === 'select') { el = document.createElement('select'); f.o.forEach((o) => { const op = document.createElement('option'); op.value = o; op.textContent = o[0].toUpperCase() + o.slice(1); el.appendChild(op); }); }
    else { el = document.createElement('input'); el.type = f.t; if (f.min !== undefined) { el.min = f.min; el.max = f.max; } if (f.step) el.step = f.step; }
    el.id = 'f_' + f.k;
    if (f.t === 'checkbox') el.checked = !!S[f.k]; else el.value = S[f.k];
    el.addEventListener('input', () => {
      let v = f.t === 'checkbox' ? el.checked : (f.t === 'range' || f.t === 'number') ? +el.value : el.value;
      S[f.k] = v; api.saveSettings({ [f.k]: v }); applySettings();
      if (f.k === 'focusMin' || f.k === 'breakMin') { if (!timer.running && timer.remaining === timer.total) setTimerMode(timer.mode); }
    });
    wrap.append(label, el); form.appendChild(wrap);
    if (f.t === 'range') el.style.setProperty('--p', ((el.value - f.min) / (f.max - f.min)) * 100 + '%'), el.addEventListener('input', () => el.style.setProperty('--p', ((el.value - f.min) / (f.max - f.min)) * 100 + '%'));
  });
  const sc = document.createElement('button'); sc.className = 'link-btn'; sc.textContent = 'Plugin shortcuts'; sc.addEventListener('click', () => api.openHub('shortcuts')); form.appendChild(sc);
  const q = document.createElement('button'); q.className = 'quit'; q.textContent = 'Quit Eyeland'; q.addEventListener('click', () => api.quit());
  form.appendChild(q);
}
function applySettings() {
  document.documentElement.style.setProperty('--eye', S.eyeColor);
  document.documentElement.style.setProperty('--speed', S.animSpeed);
  document.body.dataset.theme = S.theme;
  $('#battery').style.display = S.showBattery === false ? 'none' : '';
  paintClips(); layout();
}

/* ---------- header: clock + battery ---------- */
function tick() {
  const d = new Date();
  $('#date').textContent = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  $('#clock').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
setInterval(tick, 1000); tick();
if (navigator.getBattery) navigator.getBattery().then((b) => {
  const paint = () => { $('#battery').textContent = `${b.charging ? '⚡ ' : ''}${Math.round(b.level * 100)}%`; };
  paint(); b.addEventListener('levelchange', paint); b.addEventListener('chargingchange', paint);
});

api.onSettings((s) => { S = s; applySettings(); paintTasks(); });

/* ---------- boot ---------- */
(async () => {
  S = await api.getSettings();
  buildSettings(); applySettings();
  setTimerMode('focus'); paintMedia(); paintSystem(); paintTasks(); showTab('home'); setMode('idle');
  setTimeout(blink, 2500);
})();
