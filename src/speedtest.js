// Speed test against Cloudflare's public endpoints.
const crypto = require('crypto');
const DOWN = 'https://speed.cloudflare.com/__down?bytes=';
const UP = 'https://speed.cloudflare.com/__up';
let current = null;

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };

async function run(emit) {
  if (current) return;
  const ctl = new AbortController();
  current = ctl;
  const result = { ping: 0, jitter: 0, down: 0, up: 0 };
  try {
    emit({ phase: 'ping' });
    const pings = [];
    for (let i = 0; i < 8; i++) {
      const t = performance.now();
      const r = await fetch(DOWN + '0', { cache: 'no-store', signal: ctl.signal });
      await r.arrayBuffer();
      pings.push(performance.now() - t);
    }
    result.ping = median(pings);
    result.jitter = pings.slice(1).reduce((a, v, i) => a + Math.abs(v - pings[i]), 0) / (pings.length - 1);
    emit({ phase: 'ping', ping: result.ping, jitter: result.jitter });

    // download: 4 parallel streams for 8 seconds
    {
      const t0 = performance.now(), end = t0 + 8000;
      let bytes = 0, mark = null;
      const timer = setInterval(() => {
        const now = performance.now();
        if (!mark && now - t0 > 1000) mark = { t: now, b: bytes };
        const mbps = mark ? ((bytes - mark.b) * 8) / ((now - mark.t) / 1000) / 1e6 : (bytes * 8) / ((now - t0) / 1000) / 1e6;
        emit({ phase: 'download', mbps });
      }, 250);
      const worker = async () => {
        while (performance.now() < end && !ctl.signal.aborted) {
          const r = await fetch(DOWN + '50000000', { cache: 'no-store', signal: ctl.signal });
          const reader = r.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.length;
            if (performance.now() >= end) { try { await reader.cancel(); } catch {} break; }
          }
        }
      };
      try { await Promise.all([worker(), worker(), worker(), worker()]); } finally { clearInterval(timer); }
      const now = performance.now();
      result.down = mark ? ((bytes - mark.b) * 8) / ((now - mark.t) / 1000) / 1e6 : (bytes * 8) / ((now - t0) / 1000) / 1e6;
      emit({ phase: 'download', mbps: result.down, done: true });
    }

    // upload: 4 parallel workers posting 2 MB chunks for 8 seconds
    {
      const chunk = crypto.randomBytes(2 * 1024 * 1024);
      const t0 = performance.now(), end = t0 + 8000;
      let bytes = 0;
      const timer = setInterval(() => emit({ phase: 'upload', mbps: (bytes * 8) / ((performance.now() - t0) / 1000) / 1e6 }), 250);
      const worker = async () => {
        while (performance.now() < end && !ctl.signal.aborted) {
          const r = await fetch(UP, { method: 'POST', body: chunk, signal: ctl.signal });
          await r.arrayBuffer();
          bytes += chunk.length;
        }
      };
      try { await Promise.all([worker(), worker(), worker(), worker()]); } finally { clearInterval(timer); }
      result.up = (bytes * 8) / ((performance.now() - t0) / 1000) / 1e6;
      emit({ phase: 'upload', mbps: result.up, done: true });
    }
    emit({ phase: 'done', ...result });
    return result;
  } catch (e) {
    if (ctl.signal.aborted) emit({ phase: 'cancelled' }); else emit({ phase: 'error', message: e.message });
  } finally { current = null; }
}

function cancel() { if (current) current.abort(); }
module.exports = { run, cancel };
