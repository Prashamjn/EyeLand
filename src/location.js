// One-shot device location through the Windows location service (native/location.ps1).
// It runs only when the user presses "Use my location", never in the background,
// so Windows is not asked repeatedly. Respects the Windows "Location" privacy switch.
const { execFile } = require('child_process');

function parse(out) {
  const line = String(out || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop();
  if (!line) return { ok: false, error: 'unavailable' };
  try {
    const d = JSON.parse(line);
    if (d.ok && Number.isFinite(d.lat) && Number.isFinite(d.lon) && Math.abs(d.lat) <= 90 && Math.abs(d.lon) <= 180) return { ok: true, lat: d.lat, lon: d.lon };
    return { ok: false, error: ['denied', 'unknown', 'unavailable'].includes(d.error) ? d.error : 'unavailable' };
  } catch { return { ok: false, error: 'unavailable' }; }
}

function getDeviceLocation(psArgs, { timeout = 20000, run = execFile } = {}) {
  return new Promise((resolve) => {
    run('powershell.exe', psArgs, { windowsHide: true, timeout }, (err, stdout) => {
      if (err && !stdout) return resolve({ ok: false, error: err.killed ? 'unknown' : 'unavailable' });
      resolve(parse(stdout));
    });
  });
}

module.exports = { getDeviceLocation, parse };
