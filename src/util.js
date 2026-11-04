const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unpacked = (p) => (p ? p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep).replace('app.asar/', 'app.asar.unpacked/') : p);

function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  let i = 1;
  while (fs.existsSync(path.join(dir, `${name} (${i})${ext}`))) i++;
  return path.join(dir, `${name} (${i})${ext}`);
}

function fmtBytes(n) {
  if (!isFinite(n)) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n.toFixed(0) : n.toFixed(n >= 100 ? 0 : 1)) + ' ' + u[i];
}

module.exports = { sleep, unpacked, uniquePath, fmtBytes };
