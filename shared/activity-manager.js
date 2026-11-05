// Central activity manager: one place that decides what the island shows.
// Pure logic (no DOM, no Electron) so it can be unit tested with Node.
//
// Priority bands (higher wins):
//   CRITICAL 100  system warnings (low battery)
//   FEEDBACK  80  user-triggered feedback (volume, brightness, charger)
//   NOTICE    70  plugin results / notifications
//   MEDIA     50  active media
//   TASK      30  long-running background work (timers, downloads, conversions)
//   AMBIENT   10  passive indicators (coffee mode)
//   IDLE       0  nothing
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ActivityManager = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const PRIORITY = { CRITICAL: 100, FEEDBACK: 80, NOTICE: 70, MEDIA: 50, TASK: 30, AMBIENT: 10, IDLE: 0 };

  class ActivityManager {
    /**
     * @param {object} [o]
     * @param {() => number} [o.now]
     * @param {(fn: Function, ms: number) => any} [o.setTimer]
     * @param {(h: any) => void} [o.clearTimer]
     */
    constructor(o = {}) {
      this.now = o.now || Date.now;
      this.setTimer = o.setTimer || ((fn, ms) => setTimeout(fn, ms));
      this.clearTimer = o.clearTimer || ((h) => clearTimeout(h));
      this.items = new Map();       // id -> activity
      this.timers = new Map();      // id -> { expire, focus }
      this.listeners = new Set();
      this.seq = 0;
      this.last = { focusId: null, focusRev: -1, primaryId: null, primaryRev: -1 };
      this.destroyed = false;
    }

    /**
     * Create or update an activity. Posting an existing id updates it in place,
     * keeps its start time and restarts its timers.
     * Fields: id, type, title, subtitle, icon, progress (0..1 | null), priority,
     *   display ('focus' default | 'ambient' = start as a quiet background indicator),
     *   expiresIn (ms, omit = stays until completed), focusMs (ms the island is
     *   *focused* on it before it falls back to an ambient indicator; omit = while
     *   it exists), dismissible, active, data.
     */
    post(a) {
      if (this.destroyed) return null;
      if (!a || !a.id || !a.type) throw new Error('activity needs id and type');
      const prev = this.items.get(a.id);
      const t = this.now();
      const next = {
        title: '', subtitle: '', icon: null, progress: null, priority: PRIORITY.TASK,
        dismissible: true, active: true, data: {}, expiresIn: null, focusMs: null,
        ...(prev || {}), ...a,
        startedAt: prev ? prev.startedAt : t, updatedAt: t,
        display: a.display === 'ambient' ? 'ambient' : 'focus', rev: ++this.seq,
      };
      this.items.set(a.id, next);
      this._arm(next);
      this._emit();
      return next.id;
    }

    /** Merge fields into an existing activity without restarting its timers. */
    update(id, patch) {
      const a = this.items.get(id);
      if (!a) return false;
      Object.assign(a, patch, { updatedAt: this.now(), rev: ++this.seq });
      this._emit();
      return true;
    }

    /** Mark finished and remove. */
    complete(id) { return this._remove(id); }

    /** Remove only if the activity allows it. */
    dismiss(id) {
      const a = this.items.get(id);
      if (!a || !a.dismissible) return false;
      return this._remove(id);
    }

    has(id) { return this.items.has(id); }
    get(id) { return this.items.get(id) || null; }

    /** All active activities, best first. */
    list() { return [...this.items.values()].filter((a) => a.active).sort(cmp); }

    /** What the collapsed island should focus on: best active activity currently in focus. */
    focused() { return this.list().find((a) => a.display === 'focus') || null; }

    /** Best active activity regardless of focus (used by the expanded top section). */
    primary() { return this.list()[0] || null; }

    /** Active activities that are running quietly in the background. */
    ambient() { return this.list().filter((a) => a.display === 'ambient'); }

    onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

    destroy() {
      this.destroyed = true;
      for (const id of [...this.timers.keys()]) this._disarm(id);
      this.items.clear(); this.listeners.clear();
    }

    /* ---- internals ---- */
    _arm(a) {
      this._disarm(a.id);
      const h = {};
      if (a.expiresIn != null) h.expire = this.setTimer(() => this._remove(a.id), a.expiresIn);
      if (a.focusMs != null && a.display !== 'ambient') h.focus = this.setTimer(() => {
        const cur = this.items.get(a.id);
        if (cur) { cur.display = 'ambient'; this._emit(); }
      }, a.focusMs);
      this.timers.set(a.id, h);
    }
    _disarm(id) {
      const h = this.timers.get(id);
      if (!h) return;
      if (h.expire != null) this.clearTimer(h.expire);
      if (h.focus != null) this.clearTimer(h.focus);
      this.timers.delete(id);
    }
    _remove(id) {
      if (!this.items.has(id)) return false;
      this._disarm(id);
      this.items.delete(id);
      this._emit();
      return true;
    }
    _emit() {
      if (this.destroyed) return;
      const f = this.focused(), p = this.primary();
      const same = this.last.focusId === (f && f.id) && this.last.focusRev === (f ? f.rev : -1) &&
                   this.last.primaryId === (p && p.id) && this.last.primaryRev === (p ? p.rev : -1);
      const ambientKey = this.ambient().map((a) => a.id + ':' + a.rev).join(',');
      if (same && ambientKey === this.last.ambientKey) return;
      this.last = { focusId: f && f.id, focusRev: f ? f.rev : -1, primaryId: p && p.id, primaryRev: p ? p.rev : -1, ambientKey };
      const snap = { focused: f, primary: p, ambient: this.ambient(), all: this.list() };
      for (const fn of [...this.listeners]) { try { fn(snap); } catch (e) { console.error('[activity]', e); } }
    }
  }

  // higher priority first; ties go to the most recently updated
  function cmp(a, b) { return b.priority - a.priority || b.updatedAt - a.updatedAt || b.rev - a.rev; }

  ActivityManager.PRIORITY = PRIORITY;
  return ActivityManager;
});
