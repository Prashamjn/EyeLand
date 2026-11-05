// Island engine: decides the island's shape from the activity manager and drives the spring.
//   idle      small pill (with quiet ambient indicators)
//   activity  the pill grows to show the focused activity, then contracts when it ends
//   panel     expanded: activity section on top, workspace below (hover or click)
(function () {
  const { $, S, manager, later, cancel, own } = Island;
  const root = $('#island'), bar = $('#bar'), ambientEl = $('#ambient');
  const PANEL = [560, 360], IDLE = 124, IDLE_H = 32;
  const actSlot = new Views.Slot($('#actSlot'), 'pill');
  const topSlot = new Views.Slot($('#topSlot'), 'card');
  const topEmpty = $('#topEmpty');
  topEmpty.querySelector('.top-empty-ico').innerHTML = Island.icon('info', 15);

  let mode = 'idle', size = [IDLE, IDLE_H], expanded = false, inside = false, interactive = false, hitIsland = false;
  let hoverT = null, leaveT = null, clearT = null;

  function springFor(grow) {
    const sp = S.animSpeed || 1;
    const r = Motion.resolve(grow ? 'expand' : 'contract', { speed: sp, reduced: Island.reduced });
    root.style.setProperty('--dur', r.duration + 'ms');
    root.style.setProperty('--ease', r.easing);
    root.style.setProperty('--ct', (Island.reduced ? 100 : Math.round(Motion.TIMING.content / sp)) + 'ms');
  }

  function idleWidth(chips) {
    if (!chips.length) return IDLE;
    return Math.max(IDLE, 46 + chips.reduce((w, c) => w + c.w, 0) + 14 * chips.length);
  }

  function render() {
    const focused = manager.focused(), primary = manager.primary();
    topSlot.show(primary);
    topEmpty.classList.toggle('hide', !!primary);

    let nextMode, next;
    if (expanded) { nextMode = 'panel'; next = PANEL; }
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
      root.style.borderRadius = (nextMode === 'panel' ? 34 : next[1] / 2) + 'px';
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
  }
  function closePanel() {
    expanded = false; root.classList.remove('hover'); render();
    if (interactive && !inside) { interactive = false; window.api.setInteractive(false); }
  }
  function scheduleClose() {
    cancel(leaveT);
    leaveT = later(() => { if (inside || Island.typing()) return; closePanel(); }, 350);
  }
  Island.typing = () => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' && a.type !== 'range' && a.type !== 'checkbox'); };

  /* ---- hover: the window is click-through, so the main process reports the cursor ---- */
  const within = (r, x, y, pad) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  function onCursor({ x, y }) {
    const ir = root.getBoundingClientRect();
    const barShown = bar.offsetParent !== null;
    hitIsland = within(ir, x, y, expanded ? 14 : 8);
    const hit = hitIsland || (barShown && within(bar.getBoundingClientRect(), x, y, 4));
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
    document.body.classList.toggle('no-bar', S.showHeader === false);
    document.body.dataset.theme = S.theme === 'graphite' ? 'graphite' : 'black';   // old light/midnight themes fall back to black
    document.documentElement.style.setProperty('--edge', (6 + (S.offsetY || 0)) + 'px');
    springFor(true); render();
  }

  own(manager.onChange(render));
  own(window.api.onCursor(onCursor));
  own(window.api.onOpenPanel((d) => openPanel(d && d.tab)));

  window.Engine = { render, openPanel, closePanel, scheduleClose, applyLayout, isExpanded: () => expanded, isInside: () => inside };
})();
