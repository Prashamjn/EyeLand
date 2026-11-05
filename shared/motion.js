// Motion system: one set of timing tokens and a spring solver that is converted
// into a CSS `linear()` easing, so springs run in plain CSS transitions and the
// page does no per-frame JavaScript.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Motion = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Interaction durations in ms (guidelines from the design brief).
  const TIMING = { quick: 200, normal: 340, content: 200 };

  // Spring presets: stiffness (k), damping (c), mass (m = 1).
  const SPRING = {
    expand:   { k: 380, c: 26 },   // slight overshoot, feels alive
    contract: { k: 420, c: 40 },   // settles without bounce
    quick:    { k: 700, c: 52 },   // small feedback changes
  };

  /**
   * Simulate a unit step response of a damped spring and sample it.
   * Returns { css, duration } where css is a `linear(...)` easing and duration is ms.
   */
  function solve({ k, c }, samples = 36) {
    const dt = 1 / 240; let x = 0, v = 0, t = 0, settledFor = 0;
    const path = [0];
    while (t < 3) {
      const a = -k * (x - 1) - c * v;
      v += a * dt; x += v * dt; t += dt;
      path.push(x);
      if (Math.abs(x - 1) < 0.01 && Math.abs(v) < 0.15) { if (++settledFor > 2) break; } else settledFor = 0;   // visually settled: within 1%
    }
    const n = Math.min(samples, path.length - 1), pts = [];
    for (let i = 0; i <= n; i++) pts.push(+path[Math.round((i / n) * (path.length - 1))].toFixed(4));
    pts[pts.length - 1] = 1;
    return { css: 'linear(' + pts.join(', ') + ')', duration: Math.round(t * 1000), overshoot: Math.max(...pts) - 1 };
  }

  const cache = {};
  function spring(name) { return cache[name] || (cache[name] = solve(SPRING[name] || SPRING.expand)); }

  /** Resolve a transition for the current preferences. speed >= 0.5, reduced = prefers-reduced-motion. */
  function resolve(name, { speed = 1, reduced = false } = {}) {
    if (reduced) return { easing: 'ease-out', duration: 120 };
    const s = spring(name);
    return { easing: s.css, duration: Math.round(s.duration / Math.max(0.25, speed)) };
  }

  return { TIMING, SPRING, solve, spring, resolve };
});
