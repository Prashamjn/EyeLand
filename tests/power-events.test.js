const test = require('node:test');
const assert = require('node:assert/strict');
const { createPowerTracker, sanitizeSoundSettings, SOUND_DEFAULTS } = require('../shared/power-events');
const { migrateSettings } = require('../shared/registry');

// A tracker with a controllable clock that records what it announced.
function make(onBattery, extra = {}) {
  const clock = { t: 100000 }, seen = [];
  const tr = createPowerTracker({ onBattery, now: () => clock.t, onConnected: () => seen.push('connected'), onDisconnected: () => seen.push('disconnected'), ...extra });
  return { tr, clock, seen };
}

test('launching with the charger already connected announces nothing', () => {
  const { tr, seen } = make(false);
  assert.equal(tr.onAc, true);
  assert.deepEqual(seen, []);
});

test('a duplicate on-ac while already on AC is ignored', () => {
  const { tr, seen } = make(false);
  assert.equal(tr.ac(), false); assert.equal(tr.ac(), false);
  assert.deepEqual(seen, []);
});

test('battery -> AC announces exactly one connection', () => {
  const { tr, seen } = make(true);
  assert.equal(tr.onAc, false);
  assert.equal(tr.ac(), true);
  assert.equal(tr.ac(), false);                 // a repeated event for the same transition
  assert.deepEqual(seen, ['connected']);
  assert.equal(tr.onAc, true);
});

test('disconnecting updates state and never reports a connection', () => {
  const { tr, seen } = make(false);
  assert.equal(tr.battery(), true);
  assert.equal(tr.onAc, false);
  assert.equal(tr.battery(), false);            // duplicate on-battery
  assert.deepEqual(seen, ['disconnected']);
});

test('connect / disconnect repeatedly behaves correctly every time (spaced events)', () => {
  const { tr, clock, seen } = make(true);
  for (let i = 0; i < 5; i++) { clock.t += 5000; tr.ac(); clock.t += 5000; tr.battery(); }
  assert.deepEqual(seen, Array(5).fill(['connected', 'disconnected']).flat());
});

test('a bouncing connector inside the guard window yields one connection', () => {
  const { tr, clock, seen } = make(true);
  tr.ac(); clock.t += 200; tr.battery(); clock.t += 200; tr.ac(); clock.t += 200; tr.battery(); clock.t += 200; tr.ac();
  assert.equal(seen.filter((x) => x === 'connected').length, 1);
  assert.equal(tr.onAc, true);                  // the state still ends up correct
});

test('a connection after the guard window counts again', () => {
  const { tr, clock, seen } = make(true);
  tr.ac(); clock.t += 300; tr.battery(); clock.t += 1500; tr.ac();
  assert.equal(seen.filter((x) => x === 'connected').length, 2);
});

test('quiet() after resume: state is tracked but nothing is announced', () => {
  const { tr, clock, seen } = make(true);
  tr.quiet(4000); clock.t += 1000;
  assert.equal(tr.ac(), false);
  assert.equal(tr.onAc, true);
  assert.deepEqual(seen, []);
  tr.battery(); clock.t += 10000;               // quiet period is over
  assert.equal(tr.ac(), true);
});

test('sync() re-reads the real state silently', () => {
  const { tr, seen } = make(true);
  assert.equal(tr.sync(false), true); assert.equal(tr.onAc, true);
  assert.equal(tr.sync(false), false);
  assert.deepEqual(seen, []);
});

test('a throwing callback cannot break the tracker', () => {
  const tr = createPowerTracker({ onBattery: true, onConnected() { throw new Error('boom'); } });
  const orig = console.error; console.error = () => {};
  try { assert.equal(tr.ac(), true); assert.equal(tr.onAc, true); } finally { console.error = orig; }
});

test('charging sound defaults: enabled, modest volume', () => {
  assert.deepEqual(SOUND_DEFAULTS, { chargingSound: true, chargingSoundVolume: 60 });
});

test('sanitizeSoundSettings clamps the volume and normalises the toggle', () => {
  assert.equal(sanitizeSoundSettings({ chargingSoundVolume: 250 }).chargingSoundVolume, 100);
  assert.equal(sanitizeSoundSettings({ chargingSoundVolume: -5 }).chargingSoundVolume, 0);
  assert.equal(sanitizeSoundSettings({ chargingSoundVolume: 'abc' }).chargingSoundVolume, 60);
  assert.equal(sanitizeSoundSettings({ chargingSoundVolume: 42.6 }).chargingSoundVolume, 43);
  assert.equal(sanitizeSoundSettings({ chargingSound: false }).chargingSound, false);
  assert.equal(sanitizeSoundSettings({ chargingSound: true }).chargingSound, true);
});

test('sanitizeSoundSettings leaves every other key alone and adds none', () => {
  const input = { theme: 'graphite', todos: [{ id: 1 }], plugins: { favourites: ['qr'] } };
  assert.deepEqual(sanitizeSoundSettings(input), input);
  assert.equal(sanitizeSoundSettings(null), null);
});

test('existing saved settings keep every value and gain the new defaults (no migration needed)', () => {
  // This is the merge main.js performs on load: { ...defaults, ...stored } then migrateSettings.
  const stored = { theme: 'graphite', todos: [{ id: 'a', text: 'x', done: false }], events: { '2026-11-05': ['e'] }, shortcuts: { qr: 'Ctrl+Alt+Q' }, weatherPlace: { name: 'Kota', lat: 1, lon: 2 }, schemaVersion: 2, plugins: { favourites: ['calc'], recents: [], enabled: {}, settings: {} } };
  const merged = migrateSettings({ position: 'top', ...SOUND_DEFAULTS, ...stored });
  assert.equal(merged.chargingSound, true); assert.equal(merged.chargingSoundVolume, 60);
  assert.deepEqual(merged.todos, stored.todos); assert.deepEqual(merged.events, stored.events);
  assert.deepEqual(merged.plugins.favourites, ['calc']); assert.equal(merged.theme, 'graphite');
  // a saved preference wins over the default
  const off = migrateSettings({ ...SOUND_DEFAULTS, ...stored, chargingSound: false, chargingSoundVolume: 20 });
  assert.equal(off.chargingSound, false); assert.equal(off.chargingSoundVolume, 20);
});
