// Temp file cleaner. Only touches a fixed list of known temporary locations.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function targets() {
  const win = process.env.windir || 'C:\\Windows', local = process.env.LOCALAPPDATA || '';
  return [
    { id: 'userTemp', name: 'User temp files', note: os.tmpdir(), dir: os.tmpdir(), keepRoot: true },
    { id: 'winTemp', name: 'Windows temp files', note: 'Needs administrator rights for some files', dir: path.join(win, 'Temp') },
    { id: 'wuCache', name: 'Windows Update downloads', note: 'Needs administrator rights', dir: path.join(win, 'SoftwareDistribution', 'Download') },
    { id: 'crash', name: 'Crash dumps', note: 'Old application crash reports', dir: path.join(local, 'CrashDumps') },
    { id: 'thumbs', name: 'Thumbnail cache', note: 'Rebuilt automatically by Explorer', dir: path.join(local, 'Microsoft', 'Windows', 'Explorer'), filter: /^(thumbcache|iconcache).*\.db$/i },
    { id: 'chrome', name: 'Chrome cache', note: 'Close Chrome first for best results', dir: path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Cache', 'Cache_Data') },
    { id: 'edge', name: 'Edge cache', note: 'Close Edge first for best results', dir: path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache', 'Cache_Data') },
    { id: 'bin', name: 'Recycle Bin', note: 'Empties the bin for all drives', special: 'bin' },
  ];
}

async function walk(dir, onFile, onDir) {
  let ents;
  try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { await walk(p, onFile, onDir); if (onDir) await onDir(p); }
    else await onFile(p);
  }
}

function ps(cmd) {
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true, timeout: 30000 }, (e, so) => resolve(e ? '' : String(so).trim())));
}

async function scan({ minAgeHours = 1 } = {}) {
  const minAge = minAgeHours * 3600 * 1000, out = [];
  for (const t of targets()) {
    let bytes = 0, count = 0;
    if (t.special === 'bin') {
      const r = await ps("(New-Object -ComObject Shell.Application).NameSpace(10).Items() | ForEach-Object { $_.Size } | Measure-Object -Sum | Select-Object -ExpandProperty Sum");
      bytes = parseInt(r, 10) || 0; count = bytes ? 1 : 0;
    } else if (fs.existsSync(t.dir)) {
      await walk(t.dir, async (p) => {
        if (t.filter && !t.filter.test(path.basename(p))) return;
        try { const st = await fs.promises.lstat(p); if (Date.now() - st.mtimeMs >= minAge) { bytes += st.size; count++; } } catch {}
      });
    }
    out.push({ id: t.id, name: t.name, note: t.note, bytes, count });
  }
  return out;
}

async function clean({ ids, minAgeHours = 1 }, emit) {
  const minAge = minAgeHours * 3600 * 1000;
  let freed = 0, removed = 0, skipped = 0;
  const list = targets().filter((t) => ids.includes(t.id));
  for (const [i, t] of list.entries()) {
    emit && emit({ step: i, total: list.length, name: t.name });
    if (t.special === 'bin') { await ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue'); continue; }
    if (!fs.existsSync(t.dir)) continue;
    await walk(t.dir, async (p) => {
      if (t.filter && !t.filter.test(path.basename(p))) return;
      try {
        const st = await fs.promises.lstat(p);
        if (Date.now() - st.mtimeMs < minAge) { skipped++; return; }
        await fs.promises.unlink(p); freed += st.size; removed++;
      } catch { skipped++; }
    }, async (d) => { if (!t.filter) { try { await fs.promises.rmdir(d); } catch {} } });
  }
  return { freed, removed, skipped };
}

module.exports = { scan, clean };
