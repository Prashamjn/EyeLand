// Shared renderer helpers and the one Island namespace. Nothing here touches Electron directly.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const mq = matchMedia('(prefers-reduced-motion: reduce)');

  const Island = (window.Island = {
    $, $$, S: {}, env: { locale: undefined },
    manager: new ActivityManager(),
    dragging: false,
    reduced: mq.matches,
    icon: (name, size) => LUCIDE.svg(name, size),
    // DOM writes only when the value really changed: no needless layout or repaint.
    setText(el, t) { t = String(t); if (el.textContent !== t) el.textContent = t; },
    setHTML(el, key, html) { if (el.__key !== key) { el.__key = key; el.innerHTML = html; } },
    // Timers and subscriptions are tracked so they can always be cleaned up.
    timers: new Set(), disposers: [],
    later(fn, ms) { const h = setTimeout(() => { Island.timers.delete(h); fn(); }, ms); Island.timers.add(h); return h; },
    cancel(h) { if (h != null) { clearTimeout(h); Island.timers.delete(h); } },
    own(unsubscribe) { if (typeof unsubscribe === 'function') Island.disposers.push(unsubscribe); return unsubscribe; },
    dispose() {
      Island.timers.forEach((h) => clearTimeout(h)); Island.timers.clear();
      Island.disposers.splice(0).forEach((fn) => { try { fn(); } catch {} });
      Island.manager.destroy();
    },
  });

  const onMq = (e) => { Island.reduced = e.matches; };
  mq.addEventListener('change', onMq);
  Island.own(() => mq.removeEventListener('change', onMq));
  window.addEventListener('pagehide', Island.dispose);
})();
