// Charger connect detection logic and charging-sound settings. Pure: no Electron, no DOM, so it is unit tested with Node.
//
// The main process feeds it Electron powerMonitor events ('on-ac', 'on-battery', 'resume'). It decides which of them are a
// REAL battery -> AC transition worth a sound and an animation, and swallows everything else:
//   - the state at launch (the charger already being plugged in) is only recorded, never announced
//   - repeated 'on-ac' events while already on AC (Windows can send duplicates) are ignored
//   - a connect that follows another connect within `minGapMs` (a flaky cable bouncing) is ignored
//   - events around a resume from sleep are ignored for `quiet()` ms, but the state is still tracked
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PowerEvents = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULT_GAP_MS = 1200;
  const SOUND_DEFAULTS = { chargingSound: true, chargingSoundVolume: 60 };

  /**
   * @param {object} o
   * @param {boolean} o.onBattery        initial state, read once at startup (powerMonitor.isOnBatteryPower())
   * @param {() => number} [o.now]
   * @param {number} [o.minGapMs]
   * @param {() => void} [o.onConnected]     called only for a genuine, un-guarded battery -> AC transition
   * @param {() => void} [o.onDisconnected]  called for AC -> battery (state sync only, never a sound)
   */
  function createPowerTracker(o = {}) {
    const now = o.now || Date.now, minGap = o.minGapMs == null ? DEFAULT_GAP_MS : o.minGapMs;
    let onAc = !o.onBattery, lastConnectAt = -Infinity, quietUntil = -Infinity;
    const call = (fn) => { if (typeof fn === 'function') { try { fn(); } catch (e) { console.error('[power]', e); } } };

    return {
      get onAc() { return onAc; },
      /** 'on-ac' event. Returns true only when it counts as a new connection. */
      ac() {
        if (onAc) return false;                                  // duplicate: already on AC
        onAc = true;
        const t = now();
        if (t < quietUntil) return false;                        // just resumed from sleep: update state, stay silent
        if (t - lastConnectAt < minGap) return false;            // bouncing contact
        lastConnectAt = t;
        call(o.onConnected);
        return true;
      },
      /** 'on-battery' event. Returns true when the state actually changed. */
      battery() {
        if (!onAc) return false;
        onAc = false;
        call(o.onDisconnected);
        return true;
      },
      /** Re-read the real state without announcing anything (after resume). Returns true if it changed. */
      sync(onBattery) {
        const next = !onBattery;
        if (next === onAc) return false;
        onAc = next;
        return true;
      },
      /** Ignore connect events for the next `ms` milliseconds (the state is still tracked). */
      quiet(ms) { quietUntil = now() + Math.max(0, +ms || 0); },
    };
  }

  // Normalises only the keys this feature owns; every other key passes through untouched.
  function sanitizeSoundSettings(partial) {
    if (!partial || typeof partial !== 'object') return partial;
    const out = { ...partial };
    if ('chargingSound' in out) out.chargingSound = out.chargingSound !== false && out.chargingSound !== 0 && out.chargingSound !== 'false';
    if ('chargingSoundVolume' in out) {
      const v = Number(out.chargingSoundVolume);
      out.chargingSoundVolume = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : SOUND_DEFAULTS.chargingSoundVolume;
    }
    return out;
  }

  return { createPowerTracker, sanitizeSoundSettings, SOUND_DEFAULTS, DEFAULT_GAP_MS };
});
