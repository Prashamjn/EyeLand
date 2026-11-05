// Weather for the island header. Open-Meteo needs no API key, so there are no credentials in the source.
// - Caches the last good reading on disk (so the header is instant after a restart and works offline).
// - Shares one in-flight request, so many callers cause one network call.
// - Falls back to the cached reading (marked stale) when the network is down.
const WeatherCodes = require('../shared/weather-codes');

const TTL_MS = 15 * 60 * 1000;          // refresh interval
const STALE_MAX_MS = 6 * 60 * 60 * 1000; // older than this is not shown as "current"

function createWeather({ fetchJSON, readCache, writeCache, now = Date.now }) {
  let inflight = null, inflightKey = '';
  let mem = null;

  const keyOf = (place, unit) => `${(+place.lat).toFixed(2)},${(+place.lon).toFixed(2)},${unit}`;
  const load = () => { if (!mem) { try { mem = readCache() || null; } catch { mem = null; } } return mem; };

  function shape(d, place, unit) {
    const c = d && d.current;
    if (!c || typeof c.temperature_2m !== 'number') throw new Error('Unexpected weather response');
    const w = WeatherCodes.describe(c.weather_code, c.is_day !== 0);
    return { temp: Math.round(c.temperature_2m), unit, code: c.weather_code, text: w.text, icon: w.icon, isDay: c.is_day !== 0, place: place.name || '', fetchedAt: now() };
  }

  async function get({ place, unit = 'c', force = false }) {
    if (!place || place.lat == null || place.lon == null) return { ok: false, error: 'no-place' };
    const key = keyOf(place, unit), cached = load();
    const hit = cached && cached.key === key ? cached.data : null;
    if (hit && !force && now() - hit.fetchedAt < TTL_MS) return { ok: true, data: { ...hit, place: place.name || hit.place }, stale: false };
    if (inflight && inflightKey === key) return inflight;
    inflightKey = key;
    const f = unit === 'f' ? '&temperature_unit=fahrenheit' : '';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(place.lat)}&longitude=${encodeURIComponent(place.lon)}&current=temperature_2m,weather_code,is_day&timezone=auto${f}`;
    inflight = (async () => {
      try {
        const data = shape(await fetchJSON(url, { timeout: 10000 }), place, unit);
        mem = { key, data };
        try { writeCache(mem); } catch {}
        return { ok: true, data, stale: false };
      } catch (e) {
        if (hit && now() - hit.fetchedAt < STALE_MAX_MS) return { ok: true, data: { ...hit, place: place.name || hit.place }, stale: true };
        return { ok: false, error: /fetch failed|ENOTFOUND|ECONN|network|abort|timed? ?out|EAI_AGAIN/i.test(String(e && (e.message || e))) ? 'offline' : 'error' };
      } finally { inflight = null; }
    })();
    return inflight;
  }
  return { get, TTL_MS };
}

/** City search (Open-Meteo geocoding, no key). */
async function searchPlaces(fetchJSON, q) {
  q = String(q || '').trim();
  if (q.length < 2) return [];
  const d = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en`);
  return (d.results || []).map((r) => ({ name: [r.name, r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude }));
}

/** Turn coordinates into a readable place name (free endpoint, no key). Never throws. */
async function nameForCoords(fetchJSON, lat, lon) {
  try {
    const d = await fetchJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, { timeout: 8000 });
    const n = [d.city || d.locality, d.countryName].filter(Boolean).join(', ');
    if (n) return n;
  } catch {}
  return 'Current location';
}

module.exports = { createWeather, searchPlaces, nameForCoords, TTL_MS, STALE_MAX_MS };
