const test = require('node:test');
const assert = require('node:assert/strict');
const Chime = require('../shared/chime');

// Minimal fake Web Audio: records every automation call so loudness and timing can be asserted.
function fakeAudio({ state = 'running', resumeFails = false } = {}) {
  const log = { contexts: [], oscs: [], gains: [], suspended: 0 };
  class Ctx {
    constructor() { this.state = state; this.currentTime = 10; this.destination = { dest: true }; log.contexts.push(this); }
    createGain() {
      const g = { auto: [], connect() {}, gain: { value: 1,
        setValueAtTime(v, t) { g.auto.push(['set', v, t]); }, linearRampToValueAtTime(v, t) { g.auto.push(['lin', v, t]); }, exponentialRampToValueAtTime(v, t) { g.auto.push(['exp', v, t]); } } };
      log.gains.push(g); return g;
    }
    createOscillator() { const o = { type: '', frequency: { value: 0 }, connect() {}, start(t) { o.startAt = t; }, stop(t) { o.stopAt = t; } }; log.oscs.push(o); return o; }
    resume() { if (resumeFails) return Promise.reject(new Error('blocked')); this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; log.suspended++; return Promise.resolve(); }
  }
  return { Ctx, log };
}
const flush = () => new Promise((r) => setImmediate(r));

test('the sound is short and subtle: 300-700 ms', () => {
  assert.ok(Chime.TOTAL_MS >= 300 && Chime.TOTAL_MS <= 700, 'TOTAL_MS = ' + Chime.TOTAL_MS);
  const { Ctx, log } = fakeAudio(); const ctx = new Ctx();
  const end = Chime.schedule(ctx, 0.1, 0);
  assert.ok(end * 1000 >= 300 && end * 1000 <= 700, 'end = ' + end);
  assert.ok(log.oscs.length >= 2 && log.oscs.every((o) => o.type === 'sine'));
});

test('loudness is deterministic and capped: the same setting gives the same envelope every time', () => {
  const run = () => { const { Ctx, log } = fakeAudio(); Chime.schedule(new Ctx(), Chime.levelFor(60), 0); return JSON.stringify(log.gains.map((g) => [g.gain.value, g.auto])); };
  assert.equal(run(), run());
  // even at 100 the summed worst-case peak (all notes + partials, master included) stays below -9 dBFS
  const worst = Chime.NOTES.reduce((s, n) => s + n.peak * (1 + Chime.PARTIAL.gain), 0) * Chime.levelFor(100);
  assert.ok(worst < 0.36, 'worst case peak ' + worst);
});

test('volume curve: 0 is silent, monotonic, clamped, tolerant of junk', () => {
  assert.equal(Chime.levelFor(0), 0); assert.equal(Chime.levelFor(-10), 0); assert.equal(Chime.levelFor('x'), 0); assert.equal(Chime.levelFor(undefined), 0);
  assert.ok(Chime.levelFor(30) < Chime.levelFor(60) && Chime.levelFor(60) < Chime.levelFor(100));
  assert.equal(Chime.levelFor(500), Chime.levelFor(100));
});

test('each note fades to silence (no click at the end) and starts from a floor value', () => {
  const { Ctx, log } = fakeAudio(); Chime.schedule(new Ctx(), 0.1, 0);
  const envs = log.gains.filter((g) => g.auto.length);
  assert.equal(envs.length, Chime.NOTES.length);
  for (const g of envs) { assert.ok(g.auto[0][1] < 0.001); assert.ok(g.auto[g.auto.length - 1][1] < 0.001); }
});

test('player plays once and starts a context', async () => {
  const { Ctx, log } = fakeAudio(); const p = Chime.createPlayer({ Ctor: Ctx, now: () => 1000, setTimer: () => 0 });
  assert.equal(p.play(60), true); await flush();
  assert.equal(log.contexts.length, 1); assert.ok(log.oscs.length > 0);
  assert.deepEqual(p.stats(), { plays: 1, blocked: 0, failed: 0 });
});

test('a second request inside the guard window is blocked (no duplicate sound)', () => {
  const { Ctx, log } = fakeAudio(); const clock = { t: 5000 };
  const p = Chime.createPlayer({ Ctor: Ctx, now: () => clock.t, setTimer: () => 0 });
  assert.equal(p.play(60), true);
  clock.t += 300; assert.equal(p.play(60), false);
  clock.t += 600; assert.equal(p.play(60), true);                     // past the minimum gap again
  assert.equal(log.contexts.length, 1);                                // one context is reused
  assert.equal(p.stats().blocked, 1);
});

test('volume 0 plays nothing', () => {
  const { Ctx, log } = fakeAudio(); const p = Chime.createPlayer({ Ctor: Ctx, setTimer: () => 0 });
  assert.equal(p.play(0), false); assert.equal(log.contexts.length, 0);
});

test('audio unavailable: no constructor, a throwing constructor, a throwing graph and a refused resume never throw', async () => {
  const noop = () => 0, quiet = console.error; console.error = () => {};
  try {
    assert.equal(Chime.createPlayer({ Ctor: undefined, setTimer: noop }).play(60), false);
    assert.equal(Chime.createPlayer({ getCtor: () => undefined, setTimer: noop }).play(60), false);
    assert.equal(Chime.createPlayer({ Ctor: function () { throw new Error('no audio device'); }, setTimer: noop }).play(60), false);
    const broken = fakeAudio(); broken.Ctx.prototype.createGain = () => { throw new Error('graph'); };
    const pb = Chime.createPlayer({ Ctor: broken.Ctx, setTimer: noop });
    assert.doesNotThrow(() => pb.play(60)); await flush(); assert.ok(pb.stats().failed >= 1);
    const refused = fakeAudio({ state: 'suspended', resumeFails: true });
    const pr = Chime.createPlayer({ Ctor: refused.Ctx, setTimer: noop });
    assert.doesNotThrow(() => pr.play(60)); await flush(); assert.equal(refused.log.oscs.length, 0); assert.ok(pr.stats().failed >= 1);
  } finally { console.error = quiet; }
});

test('a suspended context is resumed before playing, and suspended again afterwards to free the audio device', async () => {
  const { Ctx, log } = fakeAudio({ state: 'suspended' }); const timers = [];
  const p = Chime.createPlayer({ Ctor: Ctx, now: () => 1, setTimer: (fn, ms) => timers.push([fn, ms]) });
  p.play(60); await flush();
  assert.equal(log.contexts[0].state, 'running'); assert.ok(log.oscs.length > 0);
  assert.equal(timers.length, 1); assert.ok(timers[0][1] > Chime.TOTAL_MS);
  timers[0][0]();
  assert.equal(log.suspended, 1);
});
