const test = require('node:test');
const assert = require('node:assert/strict');
const AM = require('../shared/activity-manager');
const { PRIORITY: P } = AM;

// deterministic clock + timers
function fake() {
  let t = 1000, id = 0; const q = new Map();
  return {
    now: () => t, setTimer: (fn, ms) => { q.set(++id, { fn, at: t + ms }); return id; }, clearTimer: (h) => q.delete(h),
    advance(ms) { const end = t + ms; for (;;) { const n = [...q.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!n) break; t = n[1].at; q.delete(n[0]); n[1].fn(); } t = end; },
    pending: () => q.size,
  };
}
const mk = () => { const f = fake(); const m = new AM({ now: f.now, setTimer: f.setTimer, clearTimer: f.clearTimer }); return { f, m }; };

test('higher priority wins and the previous activity returns afterwards', () => {
  const { f, m } = mk();
  m.post({ id: 'media', type: 'media', priority: P.MEDIA });
  assert.equal(m.focused().id, 'media');
  m.post({ id: 'volume', type: 'volume', priority: P.FEEDBACK, expiresIn: 1800 });
  assert.equal(m.focused().id, 'volume');
  f.advance(1799); assert.equal(m.focused().id, 'volume');
  f.advance(2);    assert.equal(m.focused().id, 'media');
});

test('critical beats feedback; equal priority prefers the most recent', () => {
  const { f, m } = mk();
  m.post({ id: 'vol', type: 'volume', priority: P.FEEDBACK, expiresIn: 5000 });
  f.advance(10); m.post({ id: 'bri', type: 'brightness', priority: P.FEEDBACK, expiresIn: 5000 });
  assert.equal(m.focused().id, 'bri');
  m.post({ id: 'low', type: 'notice', priority: P.CRITICAL, expiresIn: 1000 });
  assert.equal(m.focused().id, 'low');
  f.advance(1001); assert.equal(m.focused().id, 'bri');
});

test('posting an existing id updates in place, keeps startedAt and restarts expiry', () => {
  const { f, m } = mk();
  m.post({ id: 'volume', type: 'volume', priority: P.FEEDBACK, expiresIn: 1000, progress: 0.2 });
  const started = m.get('volume').startedAt;
  f.advance(800); m.post({ id: 'volume', type: 'volume', priority: P.FEEDBACK, expiresIn: 1000, progress: 0.7 });
  f.advance(800); assert.ok(m.has('volume'), 'expiry restarted');
  assert.equal(m.get('volume').progress, 0.7); assert.equal(m.get('volume').startedAt, started);
  f.advance(300); assert.ok(!m.has('volume'));
  assert.equal(f.pending(), 0, 'no timers left behind');
});

test('focusMs turns a focused activity into an ambient one that stays alive', () => {
  const { f, m } = mk();
  m.post({ id: 'media', type: 'media', priority: P.MEDIA, focusMs: 5000 });
  assert.equal(m.focused().id, 'media');
  f.advance(5001);
  assert.equal(m.focused(), null); assert.equal(m.primary().id, 'media'); assert.equal(m.ambient()[0].id, 'media');
});

test('display:ambient starts quiet and does not arm a focus timer', () => {
  const { f, m } = mk();
  m.post({ id: 'coffee', type: 'coffee', priority: P.AMBIENT, display: 'ambient', focusMs: 100 });
  assert.equal(m.focused(), null); assert.equal(f.pending(), 0);
});

test('inactive activities are hidden; dismiss respects dismissible', () => {
  const { m } = mk();
  m.post({ id: 'a', type: 't', priority: P.TASK, active: false });
  assert.equal(m.primary(), null);
  m.update('a', { active: true }); assert.equal(m.primary().id, 'a');
  m.post({ id: 'b', type: 't', priority: P.TASK, dismissible: false });
  assert.equal(m.dismiss('b'), false); assert.ok(m.has('b'));
  assert.equal(m.dismiss('a'), true); assert.ok(!m.has('a'));
});

test('supports several simultaneous background activities', () => {
  const { m } = mk();
  m.post({ id: 'dl', type: 'task', priority: P.TASK, display: 'ambient' });
  m.post({ id: 'conv', type: 'task', priority: P.TASK, display: 'ambient' });
  m.post({ id: 'timer', type: 'timer', priority: P.TASK, display: 'ambient' });
  assert.equal(m.ambient().length, 3); assert.equal(m.list().length, 3);
});

test('listeners fire only on a visible change and can be removed', () => {
  const { m } = mk(); let n = 0;
  const off = m.onChange(() => n++);
  m.post({ id: 'x', type: 't', priority: P.TASK }); assert.equal(n, 1);
  m.update('x', { title: 'changed' }); assert.equal(n, 2);
  off(); m.update('x', { title: 'again' }); assert.equal(n, 2);
});

test('a throwing listener does not break others; destroy clears timers', () => {
  const { f, m } = mk(); let ok = 0;
  const orig = console.error; console.error = () => {};
  m.onChange(() => { throw new Error('boom'); }); m.onChange(() => ok++);
  m.post({ id: 'x', type: 't', priority: P.TASK, expiresIn: 10 });
  console.error = orig;
  assert.equal(ok, 1);
  m.destroy(); assert.equal(f.pending(), 0); assert.equal(m.post({ id: 'y', type: 't' }), null);
});

test('post validates input', () => {
  const { m } = mk();
  assert.throws(() => m.post({ type: 'x' })); assert.throws(() => m.post({ id: 'x' }));
});
