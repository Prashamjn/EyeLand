const test = require('node:test');
const assert = require('node:assert/strict');
const { createWeather, searchPlaces, nameForCoords, TTL_MS } = require('../src/weather');
const WC = require('../shared/weather-codes');
const L = require('../shared/lucide');

const place = { name: 'Jaipur, India', lat: 26.91, lon: 75.79 };
const payload = (t = 28.4, code = 2, day = 1) => ({ current: { temperature_2m: t, weather_code: code, is_day: day } });
function svc(fetchJSON, start = 1_000_000) {
  let disk = null, t = start, calls = 0;
  const s = createWeather({ fetchJSON: async (...a) => { calls++; return fetchJSON(...a); }, readCache: () => { if (!disk) throw new Error('none'); return JSON.parse(disk); }, writeCache: (o) => { disk = JSON.stringify(o); }, now: () => t });
  return { s, calls: () => calls, tick: (ms) => { t += ms; }, disk: () => disk, reload: () => createWeather({ fetchJSON: async () => { throw new Error('fetch failed'); }, readCache: () => JSON.parse(disk), writeCache: () => {}, now: () => t }) };
}

test('fetches, shapes and caches a reading; uses no API key', async () => {
  let url; const x = svc(async (u) => { url = u; return payload(); });
  const r = await x.s.get({ place });
  assert.equal(r.ok, true); assert.equal(r.data.temp, 28); assert.equal(r.data.icon, 'cloud-sun'); assert.equal(r.data.text, 'Partly cloudy');
  assert.match(url, /^https:\/\/api\.open-meteo\.com\//); assert.ok(!/key|token/i.test(url));
});
test('serves from cache inside the refresh interval, refetches after it', async () => {
  const x = svc(async () => payload());
  await x.s.get({ place }); x.tick(TTL_MS - 1000); await x.s.get({ place }); assert.equal(x.calls(), 1);
  x.tick(2000); await x.s.get({ place }); assert.equal(x.calls(), 2);
});
test('concurrent callers share one request', async () => {
  const x = svc(async () => { await new Promise((r) => setTimeout(r, 10)); return payload(); });
  await Promise.all([x.s.get({ place }), x.s.get({ place }), x.s.get({ place })]); assert.equal(x.calls(), 1);
});
test('offline with a cache returns stale data; offline without one reports offline', async () => {
  let fail = false; const x = svc(async () => { if (fail) throw new Error('fetch failed'); return payload(31); });
  assert.equal((await x.s.get({ place })).ok, true);
  fail = true; x.tick(TTL_MS + 1);
  const r = await x.s.get({ place }); assert.equal(r.ok, true); assert.equal(r.stale, true); assert.equal(r.data.temp, 31);
  const cold = svc(async () => { throw new Error('fetch failed'); });
  assert.deepEqual(await cold.s.get({ place }), { ok: false, error: 'offline' });
});
test('cache survives a restart; very old cache is not shown', async () => {
  const x = svc(async () => payload(22)); await x.s.get({ place });
  x.tick(TTL_MS + 1); const again = x.reload(); const r = await again.get({ place });
  assert.equal(r.stale, true); assert.equal(r.data.temp, 22);
  x.tick(7 * 3600 * 1000); assert.equal((await x.reload().get({ place })).ok, false);
});
test('changing unit or place does not reuse the wrong cache', async () => {
  const x = svc(async (u) => payload(/fahrenheit/.test(u) ? 82 : 28));
  assert.equal((await x.s.get({ place, unit: 'c' })).data.temp, 28);
  assert.equal((await x.s.get({ place, unit: 'f' })).data.temp, 82);
  assert.equal((await x.s.get({ place: { name: 'Elsewhere', lat: 1, lon: 2 }, unit: 'c' })).data.temp, 28); assert.equal(x.calls(), 3);
});
test('rejects malformed responses and missing place', async () => {
  const x = svc(async () => ({ nope: 1 }));
  assert.equal((await x.s.get({ place })).ok, false);
  assert.deepEqual(await x.s.get({ place: null }), { ok: false, error: 'no-place' });
});
test('place search and reverse-geocode helpers', async () => {
  assert.deepEqual(await searchPlaces(async () => { throw new Error('should not call'); }, 'a'), []);
  const r = await searchPlaces(async () => ({ results: [{ name: 'Kota', admin1: 'Rajasthan', country: 'India', latitude: 25.18, longitude: 75.83 }] }), 'kota');
  assert.deepEqual(r, [{ name: 'Kota, Rajasthan, India', lat: 25.18, lon: 75.83 }]);
  assert.equal(await nameForCoords(async () => ({ city: 'Jaipur', countryName: 'India' }), 1, 2), 'Jaipur, India');
  assert.equal(await nameForCoords(async () => { throw new Error('x'); }, 1, 2), 'Current location');
});
test('weather codes map to real icons', () => {
  for (const c of [0, 1, 2, 3, 45, 51, 61, 71, 80, 85, 95, 99, 123]) for (const d of [true, false]) assert.ok(L.has(WC.describe(c, d).icon), `code ${c}`);
  assert.equal(WC.describe(0, false).icon, 'moon'); assert.equal(WC.describe(999).text, 'Unknown');
});
