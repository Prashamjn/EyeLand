const test = require('node:test');
const assert = require('node:assert/strict');
const EqState = require('../shared/eq-state');

// Fake timers so the settle delay can be stepped through deterministically.
function make(settleMs) {
  let id = 0; const timers = new Map(), changes = [];
  const eq = EqState.create({
    settleMs, onChange: (v) => changes.push(v),
    setTimer: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
    clearTimer: (h) => timers.delete(h),
  });
  const fire = () => { const all = [...timers.entries()]; timers.clear(); all.forEach(([, t]) => t.fn()); };
  return { eq, changes, timers, fire };
}

test('starts at rest: nothing is animating and nothing is reported', () => {
  const { eq, changes } = make();
  assert.equal(eq.playing, false); assert.deepEqual(changes, []);
});

test('playing starts the animation immediately, once', () => {
  const { eq, changes } = make();
  eq.set(true); eq.set(true); eq.set(true);
  assert.equal(eq.playing, true); assert.deepEqual(changes, [true]);
});

test('paused stops after the settle delay, not before', () => {
  const { eq, changes, timers, fire } = make(250);
  eq.set(true); eq.set(false);
  assert.equal(eq.playing, true); assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].ms, 250);
  fire();
  assert.equal(eq.playing, false); assert.deepEqual(changes, [true, false]);
});

test('a brief pause (track change, or two apps trading the session) never flickers the lines', () => {
  const { eq, changes, timers } = make(250);
  eq.set(true); eq.set(false); eq.set(true);
  assert.equal(timers.size, 0); assert.equal(eq.playing, true); assert.deepEqual(changes, [true]);
});

test('resume after a real pause animates again', () => {
  const { eq, changes, fire } = make();
  eq.set(true); eq.set(false); fire(); eq.set(true);
  assert.deepEqual(changes, [true, false, true]);
});

test('no media session: rests immediately and cancels any pending settle', () => {
  const { eq, changes, timers } = make();
  eq.set(true); eq.set(false); eq.clear();
  assert.equal(eq.playing, false); assert.equal(timers.size, 0); assert.deepEqual(changes, [true, false]);
});

test('paused while already at rest, and clear() at rest, report nothing', () => {
  const { eq, changes, timers } = make();
  eq.set(false); eq.clear();
  assert.equal(timers.size, 0); assert.deepEqual(changes, []);
});

test('repeated paused events do not stack timers; dispose cancels the pending one', () => {
  const { eq, timers } = make();
  eq.set(true); eq.set(false); eq.set(false); eq.set(false);
  assert.equal(timers.size, 1);
  eq.dispose(); assert.equal(timers.size, 0);
});

test('a throwing listener cannot break the state machine', () => {
  const orig = console.error; console.error = () => {};
  try {
    const eq = EqState.create({ onChange() { throw new Error('boom'); }, setTimer: () => 1, clearTimer() {} });
    assert.doesNotThrow(() => { eq.set(true); eq.clear(); });
    assert.equal(eq.playing, false);
  } finally { console.error = orig; }
});
