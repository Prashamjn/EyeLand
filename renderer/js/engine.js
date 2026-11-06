// Island engine: decides the island's shape from the activity manager and drives the spring.
//   idle      small pill (with quiet ambient indicators)
//   activity  the pill grows to show the focused activity, then contracts when it ends
//   panel     expanded: header (weather, time, date), activity section, workspace (hover or click)
//             'compact' for the normal workspace, 'large' while a plugin that needs room is open.
//             The host window grows before the island does and shrinks after it has contracted.
(function () {
  const { $, S, manager, later, cancel, own } = Island;
  const root = $('#island'), ambientEl = $('#ambient');
  const PANELS = { compact: [560, 392], large: [780, 600] }, IDLE = 124, IDLE_H = 32, EQ_W = 25;   // EQ_W: the three-line indicator (15px) plus its gap
  const actSlot = new Views.Slot($('#actSlot'), 'pill');
  const topSlot = new Views.Slot($('#topSlot'), 'card');
  const topEmpty = $('#topEmpty');
  topEmpty.querySelector('.top-empty-ico').innerHTML = Island.icon('info', 15);

  let mode = 'idle', size = [IDLE, IDLE_H], expanded = false, inside = false, interactive = false, hitIsland = false;
  let hoverT = null, leaveT = null, clearT = null, shrinkT = null;
  let sizeMode = 'compact', winMode = 'compact', pinned = false;

  // The transparent host window must be big enough BEFORE the island grows into it, and only shrink once the
  // island has contracted. Pure bookkeeping: the main process validates the mode and resizes.
  function syncWindow() {
    const want = expanded && sizeMode === 'large' ? 'large' : 'compact';
    if (want === 'large') {
      cancel(shrinkT); shrinkT = null;
      if (winMode !== 'large') { winMode = 'large'; window.api.setIslandSize('large'); }
    } else if (winMode === 'large' && shrinkT == null) {
      shrinkT = later(() => { shrinkT = null; if (!(expanded && sizeMode === 'large')) { winMode = 'compact'; window.api.setIslandSize('compact'); } }, 720);
    }
  }

  function springFor(grow) {
    const sp = S.animSpeed || 1;
    const r = Motion.resolve(grow ? 'expand' : 'contract', { speed: sp, reduced: Island.reduced });
    root.style.setProperty('--dur', r.duration + 'ms');
    root.style.setProperty('--ease', r.easing);
    root.style.setProperty('--ct', (Island.reduced ? 100 : Math.round(Motion.TIMING.content / sp)) + 'ms');
  }

  function idleWidth(chips) {
    if (!chips.length) return IDLE;
    return Math.max(IDLE, 46 + EQ_W + chips.reduce((w, c) => w + c.w, 0) + 14 * chips.length);
  }

  function render() {
    syncWindow();
    const focused = manager.focused(), primary = manager.primary();
    topSlot.show(primary);
    topEmpty.classList.toggle('hide', !!primary);

    let nextMode, next;
    if (expanded) { nextMode = 'panel'; next = PANELS[sizeMode]; }
    else if (focused) { nextMode = 'activity'; next = Views.size(focused); actSlot.show(focused); cancel(clearT); }
    else {
      nextMode = 'idle';
      const chips = manager.ambient().map((a) => Views.chip(a)).filter(Boolean);
      Island.setHTML(ambientEl, chips.map((c) => c.key).join('|'), chips.map((c) => c.html).join(''));
      next = [idleWidth(chips), IDLE_H];
    }
    if (nextMode !== 'activity' && mode === 'activity') { cancel(clearT); clearT = later(() => { if (mode !== 'activity') actSlot.clear(); }, 320); }

    const changed = next[0] !== size[0] || next[1] !== size[1];
    if (changed) {
      springFor(next[0] * next[1] > size[0] * size[1]);
      root.style.width = next[0] + 'px'; root.style.height = next[1] + 'px';
      root.style.borderRadius = (nextMode === 'panel' ? 36 : next[1] / 2) + 'px';
      if (nextMode === 'panel') { root.style.setProperty('--pw', next[0] + 'px'); root.style.setProperty('--ph', next[1] + 'px'); }
      size = next;
    }
    if (nextMode !== mode) { mode = nextMode; root.dataset.mode = mode; }
  }

  /* ---- expand / contract ---- */
  function openPanel(tab) {
    cancel(hoverT); hoverT = null; cancel(leaveT);
    if (tab && window.Workspace) Workspace.showTab(tab);
    if (window.Workspace) Workspace.onOpen();
    expanded = true; render();
    if (pinned) window.api.setFocusable(true);
  }
  function closePanel() {
    expanded = false; root.classList.remove('hover'); render();
    if (pinned) window.api.setFocusable(false);
    if (interactive && !inside) { interactive = false; window.api.setInteractive(false); }
  }
  function scheduleClose() {
    cancel(leaveT);
    leaveT = later(() => { if (inside || pinned || Island.typing()) return; closePanel(); }, 350);   // an open plugin keeps the island open
  }
  // Text boxes inside a plugin live in a Shadow DOM, so look through shadow roots to find the focused element.
  Island.typing = () => {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return !!a && ((a.tagName === 'INPUT' && a.type !== 'range' && a.type !== 'checkbox') || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
  };

  /* ---- workspace size + pinning (used while a plugin is open) ---- */
  function setSizeMode(m) { m = m === 'large' ? 'large' : 'compact'; if (m === sizeMode) return; sizeMode = m; render(); }
  function pin(v) {
    v = !!v; if (v === pinned) return; pinned = v;
    window.api.setFocusable(pinned && expanded);          // keyboard input needs a focusable window; only while the island is open
    if (!pinned && expanded && !inside) scheduleClose();
  }

  /* ---- hover: the window is click-through, so the main process reports the cursor ---- */
  const within = (r, x, y, pad) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  function onCursor({ x, y }) {
    const ir = root.getBoundingClientRect();
    hitIsland = within(ir, x, y, expanded ? 14 : 8);
    const hit = hitIsland;
    root.classList.toggle('hover', hitIsland && !expanded);

    if (hitIsland && !expanded) {
      if (hoverT == null) hoverT = later(() => { hoverT = null; if (hitIsland && !expanded) openPanel(); }, S.hoverDelay ?? 160);
    } else if (!hitIsland && hoverT != null) { cancel(hoverT); hoverT = null; }

    if (hit) { inside = true; cancel(leaveT); }
    else if (inside) { inside = false; if (expanded) scheduleClose(); }
    if (hit !== interactive) { interactive = hit; window.api.setInteractive(hit); }
  }
  root.addEventListener('click', () => { if (!expanded) openPanel(); });

  function applyLayout() {
    document.body.classList.toggle('pos-bottom', S.position === 'bottom');
    document.body.dataset.theme = S.theme === 'graphite' ? 'graphite' : 'black';   // old light/midnight themes fall back to black
    document.documentElement.style.setProperty('--edge', (6 + (S.offsetY || 0)) + 'px');
    springFor(true); render();
  }

  own(manager.onChange(render));
  own(window.api.onCursor(onCursor));
  own(window.api.onOpenPanel((d) => openPanel(d && d.tab)));

  window.Engine = { render, openPanel, closePanel, scheduleClose, applyLayout, setSizeMode, pin, isExpanded: () => expanded, isInside: () => inside, isPinned: () => pinned };
})();
