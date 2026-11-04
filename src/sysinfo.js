const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');

let prev = null, gpuName = null;
function cpuLoad() {
  const cur = os.cpus().map((c) => ({ ...c.times }));
  if (!prev || prev.length !== cur.length) { prev = cur; return { total: 0, cores: cur.map(() => 0) }; }
  const cores = cur.map((t, i) => {
    const p = prev[i], sum = (o) => o.user + o.nice + o.sys + o.idle + o.irq;
    const tot = sum(t) - sum(p), idle = t.idle - p.idle;
    return tot > 0 ? Math.max(0, Math.min(100, 100 * (1 - idle / tot))) : 0;
  });
  prev = cur;
  return { total: cores.reduce((a, b) => a + b, 0) / (cores.length || 1), cores };
}

function stats() {
  const total = os.totalmem(), free = os.freemem();
  return { cpu: cpuLoad(), mem: { total, used: total - free }, uptime: os.uptime() };
}

async function disks() {
  const out = [];
  for (const L of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    try {
      const s = await fs.promises.statfs(L + ':\\');
      const total = s.blocks * s.bsize, free = s.bavail * s.bsize;
      if (total > 0) out.push({ drive: L + ':', total, free });
    } catch {}
  }
  return out;
}

function gpu() {
  return new Promise((resolve) => {
    if (gpuName) return resolve(gpuName);
    execFile('powershell.exe', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ", "'], { windowsHide: true, timeout: 15000 }, (e, so) => { gpuName = e ? '' : String(so).trim(); resolve(gpuName); });
  });
}

async function details() {
  const c = os.cpus();
  const nets = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) nets.push({ name, ip: n.address });
  return {
    host: os.hostname(), user: os.userInfo().username, os: `${os.version ? os.version() : 'Windows'} (${os.release()})`, arch: os.arch(),
    cpu: c[0] ? c[0].model.trim() : '', cores: c.length, mem: os.totalmem(), gpu: await gpu(), disks: await disks(), nets,
  };
}

module.exports = { stats, details, disks };
