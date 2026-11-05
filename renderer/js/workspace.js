// Expanded workspace (bottom half): navigation rail + sections + the in-island plugin view.
// Plugins come from the central registry (shared/registry.js): favourites, recents, search and navigation.
// A plugin opens in the 'plugin' view and is hosted by PluginHost, never in a separate window.
(function () {
  const { $, $$, S, manager, icon, setText, later, cancel, own } = Island;
  const api = window.api, P = ActivityManager.PRIORITY;
  const state = Island.state;
  let activeTab = 'home', clips = [], coffeeOn = false, displays = [];

  /* ---------- nav ---------- */
  const NAV = { home: 'house', apps: 'layout-grid', timer: 'timer', tasks: 'list-checks', clips: 'clipboard', settings: 'sliders' };
  $$('#nav button').forEach((b) => { b.innerHTML = icon(NAV[b.dataset.tab], 18); b.addEventListener('click', () => showTab(b.dataset.tab)); });
  $('.search-ico').innerHTML = icon('search', 14);
  const reg = () => Island.registry;
  let returnTab = 'home';
  function paintTab(t) {                                    // DOM only
    activeTab = t;
    const railTab = t === 'plugin' ? 'apps' : t;
    $$('.tab').forEach((x) => x.classList.toggle('on', x.dataset.tab === t));
    $$('#nav button').forEach((x) => { const on = x.dataset.tab === railTab; x.classList.toggle('on', on); x.setAttribute('aria-current', on ? 'page' : 'false'); });
    if (t === 'tasks') paintTasks();
    if (t === 'home') renderQuick();
  }
  function showTab(t) {
    if (t !== 'plugin' && activeTab === 'plugin') leavePlugin();
    if (t !== 'plugin' && !NAV[t]) t = 'home';
    paintTab(t);
  }

  // The island window is not focusable by default; allow typing only while a text box is in use.
  function typable(input) {
    input.addEventListener('mousedown', () => { api.setFocusable(true); later(() => input.focus(), 60); });
    input.addEventListener('blur', () => { if (!Engine.isPinned()) api.setFocusable(false); if (!Engine.isInside()) Engine.scheduleClose(); });
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

  /* ---------- plugins: favourites, grid, search, in-island view ---------- */
  const tile = (p, withLabel) => {
    const b = document.createElement('button');
    b.className = withLabel ? 'app' + (p.id === 'coffee' && coffeeOn ? ' on' : '') + (reg().isFavourite(p.id) ? ' fav' : '') : '';
    b.dataset.id = p.id; b.type = 'button';
    b.title = p.name + (p.key ? '  (' + p.key + ')' : '') + (withLabel ? '\nRight-click to ' + (reg().isFavourite(p.id) ? 'remove from' : 'add to') + ' favourites' : '');
    b.setAttribute('aria-label', p.name);
    b.innerHTML = ICONS.svg(p.id) + (withLabel ? '<span>' + p.name + '</span>' : '');
    b.addEventListener('click', () => launch(p.id, !withLabel));
    if (withLabel) b.addEventListener('contextmenu', (e) => { e.preventDefault(); reg().toggleFavourite(p.id); });
    return b;
  };
  function renderQuick() {
    if (!reg()) return;
    const q = $('#quickGrid'); q.innerHTML = '';
    const favs = reg().favourites().filter((p) => !p.hidden).slice(0, 8);
    favs.forEach((p) => q.appendChild(tile(p, false)));
    if (!favs.length) { const e = document.createElement('div'); e.className = 'quick-empty'; e.textContent = 'Open a plugin and tap the star to pin it here.'; q.appendChild(e); }
    q.classList.toggle('empty-state', !favs.length);
  }
  function renderApps() {
    if (!reg()) return;
    const grid = $('#appsGrid'); grid.innerHTML = '';
    const section = (label, list) => {
      if (!list.length) return;
      const l = document.createElement('div'); l.className = 'grp'; l.textContent = label; grid.appendChild(l);
      list.forEach((p) => grid.appendChild(tile(p, true)));
    };
    section('Recent', reg().recents().filter((p) => !p.hidden).slice(0, 5));
    reg().categories().forEach((c) => section(c, reg().list({ category: c })));
  }
  // Quick access runs instant plugins (screen tools, coffee mode) directly; everything else opens in the workspace.
  function launch(id, quick) {
    const p = reg() && reg().get(id); if (!p) return;
    if (quick && (p.kind === 'action' || p.kind === 'toggle')) {
      reg().markUsed(id); api.run(id);
      if (p.kind === 'action') Engine.closePanel();
      return;
    }
    openPlugin(id);
  }
  function setCoffee(on) { coffeeOn = on; const t = document.querySelector('.app[data-id="coffee"]'); if (t) t.classList.toggle('on', on); }

  /* ---- plugin view: open, back, home ---- */
  const bar = { icon: $('#pIcon'), title: $('#pTitle'), fav: $('#pFav'), back: $('#pBack'), home: $('#pHome') };
  bar.back.innerHTML = icon('arrow-left', 16); bar.home.innerHTML = icon('house', 15); bar.fav.innerHTML = icon('star', 15);
  $('#headClose').innerHTML = icon('chevron-up', 14);
  $('#headClose').addEventListener('click', () => Engine.closePanel());
  function paintPluginBar() {
    const p = reg() && reg().get(reg().current()); if (!p) return;
    bar.icon.innerHTML = ICONS.svg(p.id); setText(bar.title, p.name);
    const f = reg().isFavourite(p.id);
    bar.fav.classList.toggle('on', f); bar.fav.setAttribute('aria-pressed', String(f)); bar.fav.title = f ? 'Remove from favourites' : 'Add to favourites';
  }
  bar.back.addEventListener('click', () => back());
  bar.home.addEventListener('click', () => goHome());
  bar.fav.addEventListener('click', () => { const id = reg().current(); if (id) reg().toggleFavourite(id); });

  // Shows the registry's current plugin: resize the workspace, keep the island open, mount the page.
  async function present(p) {
    paintTab('plugin'); paintPluginBar();
    Engine.setSizeMode(p.size === 'compact' ? 'compact' : 'large');
    Engine.pin(true);
    if (!Engine.isExpanded()) Engine.openPanel();
    try { await PluginHost.mount(p, { onBack: back }); } finally { api.pluginMounted(); }
  }
  async function openPlugin(id) {
    if (!reg()) return;
    let p;
    try { p = reg().open(id); }
    catch (e) { manager.post({ id: 'plugin-error', type: 'notice', icon: 'triangle-alert', title: e.message, priority: P.NOTICE, expiresIn: 3200, data: { tone: 'warn' } }); api.pluginMounted(); return; }
    if (activeTab !== 'plugin') returnTab = NAV[activeTab] ? activeTab : 'home';
    clearSearch();
    await present(p);
  }
  function leavePlugin(to) {
    PluginHost.unmount(); reg().home();
    Engine.pin(false); Engine.setSizeMode('compact');
    if (to) paintTab(to);
  }
  function back() {
    if (activeTab !== 'plugin') return;
    const prev = reg().back();
    if (prev) present(prev); else leavePlugin(returnTab);
  }
  function goHome() { if (activeTab === 'plugin') leavePlugin('home'); else showTab('home'); }

  /* ---- search: names, descriptions, categories and keywords; arrows + Enter + Esc ---- */
  const sIn = $('#pluginSearch'), sBox = $('#searchResults'), homeEl = $('.home');
  let results = [], sel = 0;
  typable(sIn);
  function paintSel() {
    [...sBox.children].forEach((c, i) => { const on = i === sel; c.classList.toggle('on', on); c.setAttribute('aria-selected', String(on)); if (on) c.scrollIntoView({ block: 'nearest' }); });
    const c = sBox.children[sel];
    if (c && c.id) sIn.setAttribute('aria-activedescendant', c.id); else sIn.removeAttribute('aria-activedescendant');
  }
  function renderResults() {
    const q = sIn.value.trim(), searching = q.length > 0;
    homeEl.classList.toggle('searching', searching); sBox.hidden = !searching;
    sBox.innerHTML = ''; results = [];
    if (!searching) { sIn.setAttribute('aria-expanded', 'false'); sIn.removeAttribute('aria-activedescendant'); return; }
    results = reg() ? reg().search(q, { limit: 8 }) : [];
    sIn.setAttribute('aria-expanded', String(results.length > 0));
    if (!results.length) {
      const e = document.createElement('div'); e.className = 'results-empty'; e.setAttribute('role', 'status');
      const t = document.createElement('div'); t.textContent = 'No plugins match \u201C' + q + '\u201D';
      const h = document.createElement('small'); h.textContent = 'Try a name, a category such as Files, or a word like convert.';
      e.append(t, h); sBox.appendChild(e); sIn.removeAttribute('aria-activedescendant'); return;
    }
    sel = Math.min(sel, results.length - 1);
    results.forEach((p, i) => {
      const r = document.createElement('div'); r.className = 'result'; r.id = 'sr-' + p.id; r.setAttribute('role', 'option');
      const ic = document.createElement('span'); ic.className = 'r-ico'; ic.innerHTML = ICONS.svg(p.id);
      const tx = document.createElement('span'); tx.className = 'r-text';
      const nm = document.createElement('span'); nm.className = 'r-name'; nm.textContent = p.name;
      const ds = document.createElement('span'); ds.className = 'r-desc'; ds.textContent = p.desc;
      tx.append(nm, ds);
      const cat = document.createElement('span'); cat.className = 'r-cat'; cat.textContent = p.category;
      r.append(ic, tx, cat);
      r.addEventListener('mousemove', () => { if (sel !== i) { sel = i; paintSel(); } });
      r.addEventListener('mousedown', (e) => e.preventDefault());         // keep focus in the search box
      r.addEventListener('click', () => launch(p.id, false));
      sBox.appendChild(r);
    });
    paintSel();
  }
  function clearSearch() { if (sIn.value) { sIn.value = ''; sel = 0; renderResults(); } }
  sIn.addEventListener('input', () => { sel = 0; renderResults(); });
  sIn.addEventListener('keydown', (e) => {
    const n = results.length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); sel = (sel + 1) % n; paintSel(); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); sel = (sel - 1 + n) % n; paintSel(); }
    else if (e.key === 'Enter' && n) { e.preventDefault(); launch(results[sel].id, false); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (sIn.value) clearSearch(); else sIn.blur(); }
  });

  // Keyboard (needs the window to be focused, which it is while a plugin or a text box is in use):
  // Esc steps back (blurs a focused field first), Alt+Left goes back, Alt+Home goes to the workspace home.
  document.addEventListener('keydown', (e) => {
    if (!Engine.isExpanded() || e.defaultPrevented) return;
    const t = e.composedPath()[0], inField = t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '');
    if (e.key === 'Escape') {
      if (inField) { t.blur(); return; }
      if (activeTab === 'plugin') back(); else Engine.closePanel();
    } else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    else if (e.altKey && e.key === 'Home') { e.preventDefault(); goHome(); }
  });

  own(api.onOpenPlugin(({ id }) => openPlugin(id)));

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
      const cur = S[f.k] ?? (f.k === 'display' ? 'primary' : f.k === 'tempUnit' ? 'c' : undefined);
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
    const sc = document.createElement('button'); sc.className = 'link-btn'; sc.textContent = 'Plugin shortcuts'; sc.addEventListener('click', () => openPlugin('shortcuts')); form.appendChild(sc);
    const q = document.createElement('button'); q.className = 'quit'; q.textContent = 'Quit EyeLand'; q.addEventListener('click', () => api.quit()); form.appendChild(q);
  }

  window.Workspace = {
    showTab, focusLocation, paintSystem, paintBattery, setCoffee, openPlugin, back, goHome,
    onOpen() { renderApps(); renderQuick(); paintLocation(); },
    applySettings() { if (reg()) reg().setState(S.plugins); paintClips(); paintTasks(); paintLocation(); paintBattery(); },
    async init() {
      try { displays = await api.displays(); } catch { displays = []; }
      let cat = []; try { cat = await api.catalog(); } catch {}
      // The registry owns favourites / recents / enabled state and persists it through the settings store.
      Island.registry = PluginRegistry.Registry.fromCatalog(cat, { state: S.plugins, onChange: (st) => { S.plugins = st; api.saveSettings({ plugins: st }); } });
      reg().on((t) => { if (t === 'state' || t === 'keys') { renderQuick(); renderApps(); if (activeTab === 'plugin') paintPluginBar(); } });
      buildSettings(); setTimerMode('focus'); paintSystem(); paintBattery(); paintTasks(); paintClips(); paintLocation(); showTab('home'); renderApps(); renderQuick();
    },
  };
})();
