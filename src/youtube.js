// YouTube downloader built on yt-dlp (downloaded on first use) and ffmpeg.
const { app } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ffmpegBin } = require('./media');
const { fmtBytes } = require('./util');

const binDir = () => path.join(app.getPath('userData'), 'bin');
const ytPath = () => path.join(binDir(), 'yt-dlp.exe');
const jobs = new Map();
const outDir = () => path.join(app.getPath('downloads'), 'Eyeland');

function status() { return { installed: fs.existsSync(ytPath()), dir: outDir() }; }

async function install(emit) {
  fs.mkdirSync(binDir(), { recursive: true });
  const r = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', { redirect: 'follow' });
  if (!r.ok) throw new Error('Download failed (HTTP ' + r.status + ')');
  const total = +r.headers.get('content-length') || 0, tmp = ytPath() + '.part';
  const ws = fs.createWriteStream(tmp);
  let got = 0;
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (!ws.write(Buffer.from(value))) await new Promise((res) => ws.once('drain', res));
    if (total && emit) emit({ percent: (got / total) * 100 });
  }
  await new Promise((res) => ws.end(res));
  fs.renameSync(tmp, ytPath());
}

function update() {
  return new Promise((resolve, reject) => execFile(ytPath(), ['-U'], { windowsHide: true }, (e, so, se) => (e ? reject(new Error(se || e.message)) : resolve((so || '').trim()))));
}

function info(url) {
  return new Promise((resolve, reject) => {
    if (!status().installed) return reject(new Error('Engine not installed'));
    const p = spawn(ytPath(), ['-J', '--no-playlist', '--no-warnings', url], { windowsHide: true });
    let out = '', err = '';
    p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(err.split('\n').filter((l) => l.trim()).pop() || 'Could not read the video'));
      try {
        const j = JSON.parse(out);
        resolve({ id: j.id, title: j.title, thumbnail: j.thumbnail, duration: j.duration || 0, uploader: j.uploader || j.channel || '', url });
      } catch { reject(new Error('Unexpected response from yt-dlp')); }
    });
  });
}

const toSec = (t) => {
  if (t == null || t === '') return null;
  if (/^\d+(\.\d+)?$/.test(String(t))) return +t;
  const parts = String(t).split(':').map(Number);
  if (parts.some(isNaN)) return null;
  return parts.reduce((a, b) => a * 60 + b, 0);
};
const hms = (s) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), Math.floor(s % 60)].map((v) => String(v).padStart(2, '0')).join(':');

function download({ id, url, format, start, end, duration }, emit) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outDir(), { recursive: true });
    const a = toSec(start), b = toSec(end);
    const args = ['--no-playlist', '--newline', '--no-warnings', '--windows-filenames', '--ffmpeg-location', ffmpegBin(), '-P', outDir(), '-o', '%(title).120B.%(ext)s'];
    if (format === 'mp3') args.push('-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0');
    else args.push('-f', 'bv*+ba/b', '-S', 'res,ext:mp4:m4a', '--merge-output-format', 'mp4');
    let sectionLen = 0;
    if (a != null || b != null) {
      const s = a || 0;
      args.push('--download-sections', `*${hms(s)}-${b != null ? hms(b) : 'inf'}`, '--force-keyframes-at-cuts');
      sectionLen = (b != null ? b : duration || 0) - s;
    }
    args.push(url);

    const p = spawn(ytPath(), args, { windowsHide: true });
    jobs.set(id, p);
    const stages = format === 'mp4' && sectionLen === 0 ? 2 : 1;
    let stage = 0, file = '', size = '', speed = '', eta = '', percent = 0, cancelled = false, lastErr = '';
    const push = (state, extra) => emit({ id, state, percent, speed, size, eta, ...extra });
    push('preparing');
    const onLine = (line) => {
      let m;
      if ((m = /\[download\] Destination:\s*(.+)$/.exec(line))) { file = m[1].trim(); stage++; }
      else if ((m = /\[ExtractAudio\] Destination:\s*(.+)$/.exec(line))) { file = m[1].trim(); push('processing', { label: 'Converting to MP3' }); }
      else if ((m = /\[Merger\] Merging formats into "(.+)"/.exec(line))) { file = m[1]; percent = 97; push('processing', { label: 'Merging audio and video' }); }
      else if ((m = /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\s*\S+?)(?:\s+at\s+(\S+(?:\s\S+)?\/s|Unknown B\/s))?(?:\s+ETA\s+(\S+))?/.exec(line))) {
        const pct = parseFloat(m[1]);
        size = m[2].replace(/\s+/g, ''); speed = (m[3] || '').trim(); eta = m[4] || '';
        percent = Math.min(96, ((Math.max(stage, 1) - 1 + pct / 100) / stages) * 96);
        push('downloading', { label: stages === 2 ? (stage <= 1 ? 'Downloading video' : 'Downloading audio') : 'Downloading' });
      } else if (sectionLen && (m = /time=(\d+):(\d+):([\d.]+)/.exec(line))) {
        const t = +m[1] * 3600 + +m[2] * 60 + +m[3];
        percent = Math.min(96, (t / sectionLen) * 96);
        const sp = /speed=\s*([\d.]+)x/.exec(line);
        speed = sp ? sp[1] + 'x' : speed; eta = '';
        push('downloading', { label: 'Downloading segment' });
      } else if (/has already been downloaded/.test(line)) { const mm = /\[download\]\s+(.+) has already been downloaded/.exec(line); if (mm) file = mm[1]; percent = 97; }
      else if (/error/i.test(line)) lastErr = line;
    };
    let buf = '';
    const feed = (d) => { buf += d; const parts = buf.split(/[\r\n]+/); buf = parts.pop(); parts.forEach(onLine); };
    p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('error', reject);
    p.on('close', (code) => {
      jobs.delete(id);
      if (cancelled || p.__cancelled) return resolve({ cancelled: true });
      if (code !== 0) return reject(new Error(lastErr.replace(/^ERROR:\s*/, '') || 'Download failed'));
      if (!file || !fs.existsSync(file)) {
        const newest = fs.readdirSync(outDir()).map((n) => ({ n, t: fs.statSync(path.join(outDir(), n)).mtimeMs })).sort((x, y) => y.t - x.t)[0];
        if (newest) file = path.join(outDir(), newest.n);
      }
      const bytes = file && fs.existsSync(file) ? fs.statSync(file).size : 0;
      percent = 100;
      resolve({ file, bytes, sizeText: fmtBytes(bytes) });
    });
  });
}

function cancel(id) {
  const p = jobs.get(id);
  if (!p) return;
  p.__cancelled = true;
  execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }, () => {});
}

module.exports = { status, install, update, info, download, cancel, outDir };
