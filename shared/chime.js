// The charger-connect chime. Original sound, synthesised with the Web Audio API (no audio file, no network).
//
// Two soft sine notes, a rising perfect fifth (G5 then D6), each with a very quiet octave partial, a ~10 ms attack and an
// exponential decay. Total length ~550 ms. Loudness is deterministic: the envelope peaks are fixed, and only the user's
// volume setting (0..100) scales the master gain, so every playback at the same setting is the same level.
//
// The player is dependency injected (AudioContext constructor, clock, timer) so it is unit tested with a fake context.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Chime = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // at/dur in seconds, peak is relative (1 = loudest note). The partial is an octave up at 20% of the note.
  const NOTES = [
    { freq: 783.99, at: 0.00, dur: 0.34, peak: 1.0 },    // G5
    { freq: 1174.66, at: 0.13, dur: 0.42, peak: 0.8 },   // D6
  ];
  const PARTIAL = { mult: 2, gain: 0.2 };
  const ATTACK = 0.010, FLOOR = 0.0001;
  const MASTER = 0.14;                                   // linear gain at volume 100; worst-case summed peak stays near 0.3 (-10 dBFS)
  const TOTAL_MS = Math.round(Math.max(...NOTES.map((n) => n.at + n.dur)) * 1000) + 10;
  const MIN_GAP_MS = 700;                                // longer than the sound: two chimes can never overlap

  /** Volume setting 0..100 -> master gain. A gentle curve, so the middle of the slider is a modest level. */
  function levelFor(volume) {
    const v = Number(volume);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return MASTER * Math.pow(Math.min(100, v) / 100, 1.5);
  }

  /** Builds the audio graph on `ctx` starting at `t0` (seconds on the context clock). Returns the end time. */
  function schedule(ctx, level, t0) {
    const master = ctx.createGain();
    master.gain.value = level;
    master.connect(ctx.destination);
    let end = t0;
    for (const n of NOTES) {
      const t = t0 + n.at, stop = t + n.dur + 0.02;
      const env = ctx.createGain();
      env.gain.setValueAtTime(FLOOR, t);
      env.gain.linearRampToValueAtTime(n.peak, t + ATTACK);
      env.gain.exponentialRampToValueAtTime(FLOOR, t + n.dur);
      env.connect(master);
      for (const [mult, g] of [[1, 1], [PARTIAL.mult, PARTIAL.gain]]) {
        const osc = ctx.createOscillator(), amp = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = n.freq * mult;
        amp.gain.value = g;
        osc.connect(amp); amp.connect(env);
        osc.start(t); osc.stop(stop);
      }
      end = Math.max(end, stop);
    }
    return end;
  }

  /**
   * @param {object} o
   * @param {Function} [o.Ctor]            AudioContext constructor
   * @param {() => Function} [o.getCtor]   or a function returning it (resolved on every play, so a missing API is not fatal)
   * @param {() => number} [o.now]
   * @param {(fn: Function, ms: number) => any} [o.setTimer]
   */
  function createPlayer(o = {}) {
    const now = o.now || Date.now, setTimer = o.setTimer || ((fn, ms) => setTimeout(fn, ms));
    let ctx = null, lastAt = -Infinity;
    const stats = { plays: 0, blocked: 0, failed: 0 };
    const resolveCtor = () => (typeof o.getCtor === 'function' ? o.getCtor() : o.Ctor);

    return {
      stats: () => ({ ...stats }),
      /** Plays the chime. Never throws. Returns true when a chime was actually started. */
      play(volume) {
        try {
          const level = levelFor(volume);
          if (level <= 0) { stats.blocked++; return false; }
          const t = now();
          if (t - lastAt < MIN_GAP_MS) { stats.blocked++; return false; }
          const Ctor = resolveCtor();
          if (!Ctor) { stats.failed++; return false; }
          if (!ctx || ctx.state === 'closed') ctx = new Ctor({ latencyHint: 'interactive' });
          lastAt = t;
          const c = ctx;
          const run = () => {
            try { schedule(c, level, c.currentTime + 0.01); }
            catch (e) { stats.failed++; console.error('[chime]', e); }
            // release the audio device again shortly after the sound has ended
            setTimer(() => { try { if (c.state === 'running') c.suspend(); } catch {} }, TOTAL_MS + 150);
          };
          stats.plays++;
          if (c.state === 'suspended' && typeof c.resume === 'function') {
            const p = c.resume();
            if (p && typeof p.then === 'function') p.then(run, () => { stats.failed++; });
            else run();
          } else run();
          return true;
        } catch (e) {
          stats.failed++; ctx = null;
          try { console.error('[chime]', e); } catch {}
          return false;
        }
      },
    };
  }

  return { NOTES, PARTIAL, MASTER, TOTAL_MS, MIN_GAP_MS, levelFor, schedule, createPlayer };
});
