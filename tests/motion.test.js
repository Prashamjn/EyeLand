const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../shared/motion');

test('springs settle inside the design-brief window', () => {
  for (const n of ['expand', 'contract', 'quick']) {
    const s = M.spring(n);
    assert.ok(s.duration >= 150 && s.duration <= 450, `${n} took ${s.duration}ms`);
    assert.match(s.css, /^linear\(0, .*, 1\)$/);
  }
});
test('expand overshoots slightly, contract does not', () => {
  assert.ok(M.spring('expand').overshoot > 0.01 && M.spring('expand').overshoot < 0.12);
  assert.ok(M.spring('contract').overshoot < 0.001);
});
test('reduced motion removes the spring', () => {
  assert.deepEqual(M.resolve('expand', { reduced: true }), { easing: 'ease-out', duration: 120 });
});
test('speed scales duration and is clamped', () => {
  const base = M.resolve('expand', { speed: 1 }).duration;
  assert.ok(M.resolve('expand', { speed: 2 }).duration < base);
  assert.ok(Number.isFinite(M.resolve('expand', { speed: 0 }).duration));
});
