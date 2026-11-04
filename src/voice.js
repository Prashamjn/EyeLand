const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { run, ffmpegBin } = require('./media');
const { uniquePath } = require('./util');

const dir = () => { const d = path.join(app.getPath('userData'), 'memos'); fs.mkdirSync(d, { recursive: true }); return d; };
const metaFile = () => path.join(dir(), 'memos.json');
const readMeta = () => { try { return JSON.parse(fs.readFileSync(metaFile(), 'utf8')); } catch { return []; } };
const writeMeta = (m) => fs.writeFileSync(metaFile(), JSON.stringify(m, null, 2));

function list() {
  const m = readMeta().filter((x) => fs.existsSync(path.join(dir(), x.file)));
  return m.map((x) => ({ ...x, size: fs.statSync(path.join(dir(), x.file)).size }));
}
function save({ base64, duration }) {
  const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  const file = `memo-${stamp}.webm`;
  fs.writeFileSync(path.join(dir(), file), Buffer.from(base64, 'base64'));
  const item = { id: file, file, name: `Memo ${d.toLocaleDateString()} ${p2(d.getHours())}:${p2(d.getMinutes())}`, duration: duration || 0, created: d.getTime() };
  writeMeta([item, ...readMeta()]);
  return item;
}
const read = (id) => fs.readFileSync(path.join(dir(), path.basename(id))).toString('base64');
function remove(id) { try { fs.unlinkSync(path.join(dir(), path.basename(id))); } catch {} writeMeta(readMeta().filter((x) => x.id !== id)); }
function rename(id, name) { writeMeta(readMeta().map((x) => (x.id === id ? { ...x, name } : x))); }
async function exportAs(id, format, dest) {
  const src = path.join(dir(), path.basename(id));
  const args = { mp3: ['-c:a', 'libmp3lame', '-q:a', '2'], wav: ['-c:a', 'pcm_s16le'], m4a: ['-c:a', 'aac', '-b:a', '192k'], webm: ['-c:a', 'copy'] }[format] || ['-c:a', 'copy'];
  const out = uniquePath(dest);
  await run(ffmpegBin(), ['-y', '-hide_banner', '-i', src, ...args, out]);
  return out;
}

module.exports = { list, save, read, remove, rename, exportAs, dir };
