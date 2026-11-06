// State logic for the collapsed island's three-line music indicator. Pure, unit tested.
//
// The indicator animates only while the active media session reports "playing". Starting is immediate. Stopping is
// settled for `settleMs`, so a player that briefly reports "paused" while it changes track (or two apps trading the
// active session) does not make the lines flicker; a "no media session at all" signal stops them straight away.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.EqState = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SETTLE_MS = 250;

  /**
   * @param {object} o
   * @param {(playing: boolean) => void} o.onChange   called only when the displayed state really changes
   * @param {number} [o.settleMs]
   * @param {(fn: Function, ms: number) => any} [o.setTimer]
   * @param {(h: any) => void} [o.clearTimer]
   */
  function create(o = {}) {
    const settleMs = o.settleMs == null ? SETTLE_MS : o.settleMs;
    const setTimer = o.setTimer || ((fn, ms) => setTimeout(fn, ms)), clearTimer = o.clearTimer || ((h) => clearTimeout(h));
    let shown = false, pending = null;
    const emit = (v) => { if (typeof o.onChange === 'function') { try { o.onChange(v); } catch (e) { console.error('[eq]', e); } } };
    const cancel = () => { if (pending != null) { clearTimer(pending); pending = null; } };

    return {
      get playing() { return shown; },
      /** The active media session's state. */
      set(playing) {
        if (playing) { cancel(); if (!shown) { shown = true; emit(true); } return; }
        if (!shown || pending != null) return;
        pending = setTimer(() => { pending = null; shown = false; emit(false); }, settleMs);
      },
      /** There is no media session (or it ended): rest immediately. */
      clear() { cancel(); if (shown) { shown = false; emit(false); } },
      dispose() { cancel(); },
    };
  }

  return { create, SETTLE_MS };
});
