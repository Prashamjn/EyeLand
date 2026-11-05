// Expanded workspace (bottom half): navigation rail + sections.
// Existing features are kept (system sliders, timer, tasks, clipboard, plugin grid, settings).
// Favourites, plugin search and plugin navigation are visual placeholders for the next phase.
(function () {
  const { $, $$, S, manager, icon, setText, later, cancel, own } = Island;
  const api = window.api, P = ActivityManager.PRIORITY;
  const state = Island.state;
  let activeTab = 'home', clips = [], coffeeOn = false, displays = [];

  /* ---------- nav ---------- */
  const NAV = { home: 'house', apps: 'layout-grid', timer: 'timer', tasks: 'list-checks', clips: 'clipboard', settings: 'sliders' };
  $$('#nav button').forEach((b) => { b.innerHTML = icon(NAV[b.dataset.tab], 18); b.addEventListener('click', () => showTab(b.dataset.tab)); });
  $('.search-ico').innerHTML = icon('search', 14);
  function showTab(t) {
    if (!NAV[t]) t = 'home';
    activeTab = t;
    $$('.tab').forEach((s) => s.classList.toggle('on', s.dataset.tab === t));
    $$('#nav button').forEach((b) => { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-current', b.dataset.tab === t ? 'page' : 'false'); });
  }

  // The island window is not focusable by default; allow typing only while a text box is in use.
  function typable(input) {
    input.addEventListener('mousedown', () => { api.setFocusable(true); later(() => input.focus(), 60); });
    input.addEventListener('blur', () => { api.setFocusable(false); if (!Engine.isInside()) Engine.scheduleClose(); });
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------- system: volume, brightness, battery ---------- */
  const paintSlider = (el, v) => { el.value = v; el.style.setProperty('--p', v + '%'); };
  function paintSystem() {
    if (!Island.dragging) { paintSlider($('#homeVol'), state.muted ? 0 : state.vol); paintSlider($('#homeBri'), state.bri ?? 0); }
    setText($('#homeVolNum'), state.muted ? 'Mute' : state.vol);
    setText($('#homeBriNum'), state.bri ?? '');
    $('#homeVolIcon').innerHTML = icon(state.muted ? 'volume-x' : state.vol === 0 ? 'volume' : state.vol < 50 ? 'volume-1' : 'volume-2', 16);
    $('#homeBriIcon').innerHTML = icon('sun', 16);
    $('#briRow').style.display = state.bri === null ? 'none' : '';
  }
  function paintBattery() {
    const b = Island.battery, row = $('#batRow');
    const none = !b || S.showBattery === false || (b.charging && b.level === 1 && b.chargingTime === 0 && b.dischargingTime === Infinity);   // desktop PCs report a full, plugged-in battery
    row.style.display = none ? 'none' : '';
    if (none) return;
    $('#homeBatIcon').innerHTML = icon(b.charging ? 'battery-charging' : 'battery', 16);
    $('#homeBatIcon').classList.toggle('tint-green', !!b.charging);
    setText($('#homeBatNum'), Math.round(b.level * 100) + '%' + (b.charging ? ' · charging' : ''));
  }
  const pushVol = debounce((v) => api.setSystem('vol', v), 60);
  const pushBri = debounce((v) => api.setSystem('bri', v), 120);
  [['#homeVol', pushVol, '#homeVolNum'], ['#homeBri', pushBri, '#homeBriNum']].forEach(([sel, push, num]) => {
    const el = $(sel);
    el.addEventListener('pointerdown', () => (Island.dragging = true));
    const up = () => (Island.dragging = false);
    window.addEventListener('pointerup', up); own(() => window.removeEventListener('pointerup', up));
    el.addEventListener('input', () => { el.style.setProperty('--p', el.value + '%'); setText($(num), el.value); push(+el.value); });
  });
  $('#homeVolIcon').addEventListener('click', () => api.setSystem('mute', 0));

  /* ---------- focus timer (also an activity: a quiet countdown in the pill) ---------- */
  const timer = { mode: 'focus', total: 1500, remaining: 1500, running: false, endAt: 0, sessions: 0, tick: null, shown: '' };
  const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.max(0, s % 60)).padStart(2, '0');
  const timerLength = (m) => ((m === 'focus' ? S.focusMin : S.breakMin) || (m === 'focus' ? 25 : 5)) * 60;
  function setTimerMode(m) { stopTick(); timer.mode = m; timer.total = timer.remaining = timerLength(m); timer.running = false; paintTimer(); }
  function stopTick() { if (timer.tick) { clearInterval(timer.tick); timer.tick = null; } }
  function toggleTimer() {
    if (timer.running) { timer.running = false; stopTick(); }
    else {
      timer.running = true; timer.endAt = Date.now() + timer.remaining * 1000;
      timer.tick = setInterval(() => { timer.remaining = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000)); if (timer.remaining === 0) finishTimer(); paintTimer(); }, 500);   // only exists while running
    }
    paintTimer();
  }
  function resetTimer() { stopTick(); timer.running = false; timer.remaining = timer.total; paintTimer(); }
  function finishTimer() {
    stopTick(); timer.running = false;
    const wasFocus = timer.mode === 'focus';
    if (wasFocus) timer.sessions++;
    try { new Notification(wasFocus ? 'Focus session complete' : 'Break is over', { body: wasFocus ? 'Time for a break.' : 'Ready for another round?', silent: false }); } catch {}
    manager.post({ id: 'timer-done', type: 'notice', icon: 'bell', title: wasFocus ? 'Focus session complete' : 'Break is over', priority: P.NOTICE, expiresIn: 3200 });
    later(() => setTimerMode(wasFocus ? 'break' : 'focus'), 50);
  }
  function paintTimer() {
    const t = fmt(timer.remaining), started = timer.remaining < timer.total;
    setText($('#timerBig'), t);
    setText($('#timerToggle'), timer.running ? 'Pause' : started ? 'Resume' : 'Start');
    $('#timerFill').style.transform = `scaleX(${(timer.total - timer.remaining) / timer.total})`;
    $$('[data-tmode]').forEach((b) => b.classList.toggle('on', b.dataset.tmode === timer.mode));
    setText($('#timerCount'), `${timer.sessions} focus session${timer.sessions === 1 ? '' : 's'} today`);
    // background activity: shown as a small countdown while the timer is started
    if (started) {
      const label = timer.mode === 'focus' ? 'Focus' : 'Break';
      if (!manager.has('timer')) manager.post({ id: 'timer', type: 'timer', title: label, subtitle: t, icon: 'timer', priority: P.TASK, display: 'ambient', progress: (timer.total - timer.remaining) / timer.total, data: { running: timer.running } });
      else if (timer.shown !== t + timer.running) manager.update('timer', { title: label, subtitle: t, progress: (timer.total - timer.remaining) / timer.total, data: { running: timer.running } });
      timer.shown = t + timer.running;
    } else { manager.complete('timer'); timer.shown = ''; }
  }
  $('#timerToggle').addEventListener('click', toggleTimer);
  $('#timerReset').addEventListener('click', resetTimer);
  $$('[data-tmode]').forEach((b) => b.addEventListener('click', () => setTimerMode(b.dataset.tmode)));

  /* ---------- clipboard ---------- */
  function paintClips() {
    const box = $('#clipList'); box.innerHTML = '';
    if (!S.clipboardHistory) { box.innerHTML = '<div class="empty">Clipboard history is off. Turn it on in Settings.</div>'; return; }
    if (!clips.length) { box.innerHTML = '<div class="empty">Copy some text and it will show up here.</div>'; return; }
    clips.forEach((c) => {
      const b = document.createElement('button'); b.textContent = c.replace(/\s+/g, ' ').trim(); b.title = 'Click to copy again';
      b.addEventListener('click', () => api.copyClip(c)); box.appendChild(b);
    });
  }
  own(api.onClips((l) => { clips = l; paintClips(); }));
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
      const del = document.createElement('button'); del.className = 'task-del'; del.setAttribute('aria-label', 'Delete'); del.innerHTML = icon('x', 12);
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
  typable(taskInput);

  /* ---------- plugins grid + quick access ---------- */
  const QUICK = ['textExtract', 'colorPicker', 'todo', 'coffee'];
  async function loadApps() {
    let cat; try { cat = await api.catalog(); } catch { return; }
    const grid = $('#appsGrid'); grid.innerHTML = '';
    const mk = (p, withLabel) => {
      const b = document.createElement('button'); b.className = withLabel ? 'app' + (p.id === 'coffee' && coffeeOn ? ' on' : '') : ''; b.dataset.id = p.id;
      b.title = p.name + (p.key ? '  (' + p.key + ')' : ''); b.setAttribute('aria-label', p.name);
      b.innerHTML = ICONS.svg(p.id) + (withLabel ? '<span>' + p.name + '</span>' : '');
      b.addEventListener('click', () => { api.run(p.id); if (p.id !== 'coffee') Engine.closePanel(); });
      return b;
    };
    cat.filter((p) => p.id !== 'shortcuts').forEach((p) => grid.appendChild(mk(p, true)));
    const q = $('#quickGrid'); q.innerHTML = '';
    QUICK.map((id) => cat.find((p) => p.id === id)).filter(Boolean).forEach((p) => q.appendChild(mk(p, false)));
  }
  function setCoffee(on) { coffeeOn = on; const t = document.querySelector('.app[data-id="coffee"]'); if (t) t.classList.toggle('on', on); }

  /* ---------- location (weather) ---------- */
  const loc = { name: $('#locName'), device: $('#locDevice'), clear: $('#locClear'), search: $('#locSearch'), results: $('#locResults'), msg: $('#locMsg') };
  typable(loc.search);
  function say(text, err, action) {
    loc.msg.className = 'loc-msg' + (err ? ' err' : ''); loc.msg.textContent = text;
    if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.addEventListener('click', action.run); loc.msg.append(b); }
  }
  function paintLocation() {
    const p = S.weatherPlace;
    setText(loc.name, p ? p.name : 'Not set');
    loc.clear.style.display = p ? '' : 'none';
  }
  loc.device.addEventListener('click', async () => {
    loc.device.disabled = true; say('Asking Windows for your location…');
    try {
      const r = await api.useDeviceLocation();
      if (r.ok) say('Location set to ' + r.place.name);
      else if (r.error === 'denied') say('Windows location access is turned off for desktop apps.', true, { label: 'Open Windows privacy settings', run: () => api.openLocationPrivacy() });
      else if (r.error === 'busy') say('Already looking up your location.');
      else say('Could not read your location. Search for a city instead.', true);
    } catch { say('Could not read your location. Search for a city instead.', true); }
    loc.device.disabled = false;
  });
  loc.clear.addEventListener('click', async () => { await api.setPlace(null); say('Location cleared'); });
  const runSearch = debounce(async () => {
    const q = loc.search.value.trim();
    if (q.length < 2) { loc.results.innerHTML = ''; return; }
    const r = await api.searchPlaces(q);
    loc.results.innerHTML = '';
    if (!r.ok) { say('City search needs an internet connection.', true); return; }
    if (!r.results.length) { say('No matching city.'); return; }
    loc.msg.textContent = '';
    r.results.forEach((p) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = p.name;
      b.addEventListener('click', async () => { loc.results.innerHTML = ''; loc.search.value = ''; await api.setPlace(p); say('Location set to ' + p.name); });
      loc.results.appendChild(b);
    });
  }, 350);
  loc.search.addEventListener('input', runSearch);
  function focusLocation() { later(() => $('#locBlock').scrollIntoView({ block: 'nearest' }), 30); }

  /* ---------- settings form ---------- */
  const FIELDS = [
    { k: 'theme', l: 'Theme', t: 'select', o: [['black', 'Black'], ['graphite', 'Graphite']] },
    { k: 'tempUnit', l: 'Temperature', t: 'select', o: [['c', '°C'], ['f', '°F']] },
    { k: 'position', l: 'Position', t: 'select', o: [['top', 'Top'], ['bottom', 'Bottom']] },
    { k: 'offsetY', l: 'Edge gap', t: 'range', min: 0, max: 40, step: 1 },
    { k: 'animSpeed', l: 'Animation speed', t: 'range', min: 0.5, max: 2, step: 0.1 },
    { k: 'hoverDelay', l: 'Open delay (ms)', t: 'range', min: 0, max: 600, step: 20 },
    { k: 'overlayMs', l: 'Feedback time (ms)', t: 'range', min: 800, max: 4000, step: 100 },
    { k: 'focusMin', l: 'Focus (min)', t: 'number', min: 1, max: 120 },
    { k: 'breakMin', l: 'Break (min)', t: 'number', min: 1, max: 60 },
    { k: 'showHeader', l: 'Weather and clock bar', t: 'checkbox' },
    { k: 'showBattery', l: 'Show battery', t: 'checkbox' },
    { k: 'clipboardHistory', l: 'Clipboard history', t: 'checkbox' },
    { k: 'hideInFullscreen', l: 'Hide in full screen', t: 'checkbox' },
    { k: 'autostart', l: 'Start with Windows', t: 'checkbox' },
  ];
  function buildSettings() {
    const form = $('#settingsForm'); form.innerHTML = '';
    const fields = [...FIELDS];
    if (displays.length > 1) fields.splice(3, 0, { k: 'display', l: 'Display', t: 'select', o: [['primary', 'Primary'], ...displays.filter((d) => !/primary/.test(d.label)).map((d) => [d.id, d.label])] });
    fields.forEach((f) => {
      const wrap = document.createElement('div'); wrap.className = 'field';
      const label = document.createElement('label'); label.textContent = f.l; label.htmlFor = 'f_' + f.k;
      let el;
      if (f.t === 'select') { el = document.createElement('select'); f.o.forEach(([v, text]) => { const op = document.createElement('option'); op.value = v; op.textContent = text; el.appendChild(op); }); }
      else { el = document.createElement('input'); el.type = f.t; if (f.min !== undefined) { el.min = f.min; el.max = f.max; } if (f.step) el.step = f.step; }
      el.id = 'f_' + f.k;
      const cur = S[f.k] ?? (f.k === 'showHeader' ? true : f.k === 'display' ? 'primary' : f.k === 'tempUnit' ? 'c' : undefined);
      if (f.t === 'checkbox') el.checked = !!cur; else if (cur !== undefined) el.value = cur;
      if (f.t === 'select' && !f.o.some(([v]) => v === el.value)) el.value = f.o[0][0];   // e.g. old "light" theme
      const paintRange = () => el.style.setProperty('--p', ((el.value - f.min) / (f.max - f.min)) * 100 + '%');
      el.addEventListener('input', () => {
        const v = f.t === 'checkbox' ? el.checked : (f.t === 'range' || f.t === 'number') ? +el.value : el.value;
        S[f.k] = v; api.saveSettings({ [f.k]: v }); Engine.applyLayout(); paintBattery();
        if (f.t === 'range') paintRange();
        if ((f.k === 'focusMin' || f.k === 'breakMin') && !timer.running && timer.remaining === timer.total) setTimerMode(timer.mode);
      });
      wrap.append(label, el); form.appendChild(wrap);
      if (f.t === 'range') paintRange();
    });
    const sc = document.createElement('button'); sc.className = 'link-btn'; sc.textContent = 'Plugin shortcuts'; sc.addEventListener('click', () => api.openHub('shortcuts')); form.appendChild(sc);
    const q = document.createElement('button'); q.className = 'quit'; q.textContent = 'Quit EyeLand'; q.addEventListener('click', () => api.quit()); form.appendChild(q);
  }

  window.Workspace = {
    showTab, focusLocation, paintSystem, paintBattery, setCoffee,
    onOpen() { loadApps(); paintLocation(); },
    applySettings() { paintClips(); paintTasks(); paintLocation(); paintBattery(); },
    async init() {
      try { displays = await api.displays(); } catch { displays = []; }
      buildSettings(); setTimerMode('focus'); paintSystem(); paintBattery(); paintTasks(); paintClips(); paintLocation(); showTab('home'); loadApps();
    },
  };
})();
