const test = require('node:test');
const assert = require('node:assert/strict');
const { parse, getDeviceLocation } = require('../src/location');

test('parses a good reading and rejects out-of-range values', () => {
  assert.deepEqual(parse('{"ok":true,"lat":26.9,"lon":75.8}\r\n'), { ok: true, lat: 26.9, lon: 75.8 });
  assert.equal(parse('{"ok":true,"lat":126,"lon":75}').ok, false);
});
test('maps denial and unknown, tolerates noise', () => {
  assert.deepEqual(parse('{"ok":false,"error":"denied"}'), { ok: false, error: 'denied' });
  assert.deepEqual(parse('warning text\n{"ok":false,"error":"unknown"}'), { ok: false, error: 'unknown' });
  assert.deepEqual(parse('not json'), { ok: false, error: 'unavailable' });
  assert.deepEqual(parse(''), { ok: false, error: 'unavailable' });
  assert.deepEqual(parse('{"ok":false,"error":"<script>"}'), { ok: false, error: 'unavailable' });
});
test('runs the helper once and handles spawn failure and timeout', async () => {
  let n = 0;
  assert.equal((await getDeviceLocation(['x'], { run: (c, a, o, cb) => { n++; cb(null, '{"ok":true,"lat":1,"lon":2}'); } })).ok, true); assert.equal(n, 1);
  assert.equal((await getDeviceLocation(['x'], { run: (c, a, o, cb) => cb(new Error('ENOENT'), '') })).error, 'unavailable');
  assert.equal((await getDeviceLocation(['x'], { run: (c, a, o, cb) => cb(Object.assign(new Error('t'), { killed: true }), '') })).error, 'unknown');
});
