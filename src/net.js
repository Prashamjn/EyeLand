// Small network helpers: JSON fetch, IP location, translation.
async function fetchJSON(url, opts = {}) {
  if (!/^https:\/\//i.test(url)) throw new Error('Only https requests are allowed');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout || 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Eyeland/1.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Approximate location from the public IP address (no GPS prompt, no API key).
async function ipLocation() {
  try {
    const d = await fetchJSON('https://ipwho.is/');
    if (d && d.success !== false && d.latitude != null) return { name: [d.city, d.country].filter(Boolean).join(', '), lat: d.latitude, lon: d.longitude };
  } catch {}
  const d = await fetchJSON('https://ipapi.co/json/');
  return { name: [d.city, d.country_name].filter(Boolean).join(', '), lat: d.latitude, lon: d.longitude };
}

function chunk(text, max = 1500) {
  const out = []; let cur = '';
  for (const part of text.split(/(?<=[.!?\n])/)) {
    if ((cur + part).length > max && cur) { out.push(cur); cur = ''; }
    cur += part;
    while (cur.length > max) { out.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur) out.push(cur);
  return out;
}

async function translate(text, to, from = 'auto') {
  text = String(text || '').trim();
  if (!text) return { text: '', detected: from };
  let detected = from, result = '';
  try {
    for (const c of chunk(text)) {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(c)}`;
      const d = await fetchJSON(url);
      result += (d[0] || []).map((x) => x[0]).join('');
      if (d[2]) detected = d[2];
    }
    return { text: result, detected, engine: 'google' };
  } catch (e) {
    // Fallback: MyMemory (needs a known source language)
    const src = from === 'auto' ? 'en' : from;
    result = '';
    for (const c of chunk(text, 450)) {
      const d = await fetchJSON(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(c)}&langpair=${src}|${to}`);
      result += (d.responseData && d.responseData.translatedText) || '';
    }
    return { text: result, detected: src, engine: 'mymemory' };
  }
}

module.exports = { fetchJSON, ipLocation, translate };
