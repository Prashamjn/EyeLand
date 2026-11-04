// ffmpeg based conversion and compression, plus Ghostscript for PDFs and Compress-Archive for everything else.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { unpacked, uniquePath } = require('./util');

const EXT = {
  image: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'],
  audio: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'wma'],
  video: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'flv', 'm4v'],
  doc: ['txt', 'md', 'html', 'htm'],
  pdf: ['pdf'],
};
const TARGETS = {
  image: ['png', 'jpg', 'webp', 'bmp', 'gif', 'tiff', 'pdf'],
  audio: ['mp3', 'wav', 'flac', 'm4a', 'ogg'],
  video: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'gif', 'mp3', 'wav', 'm4a'],
  doc: ['pdf'],
  pdf: ['png', 'jpg'],
};
const extOf = (f) => path.extname(f).slice(1).toLowerCase();
function category(ext) { for (const k of Object.keys(EXT)) if (EXT[k].includes(ext)) return k; return 'other'; }

const jobs = new Map();
const ffmpegBin = () => { try { return unpacked(require('ffmpeg-static')); } catch { return null; } };

function run(bin, args, { id, duration, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (!bin) return reject(new Error('ffmpeg is not installed. Run npm install again.'));
    const p = spawn(bin, args, { windowsHide: true });
    if (id) jobs.set(id, p);
    let err = '';
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (d) => {
      err = (err + d).slice(-4000);
      const m = /time=(\d+):(\d+):([\d.]+)/.exec(d);
      if (m && duration && onProgress) onProgress(Math.min(99, ((+m[1] * 3600 + +m[2] * 60 + +m[3]) / duration) * 100));
    });
    p.on('error', reject);
    p.on('close', (code) => { if (id) jobs.delete(id); code === 0 ? resolve() : reject(new Error(jobs.cancelled === id ? 'Cancelled' : (err.split('\n').filter(Boolean).pop() || 'ffmpeg failed'))); });
  });
}

function probeDuration(file) {
  return new Promise((resolve) => {
    const bin = ffmpegBin(); if (!bin) return resolve(0);
    execFile(bin, ['-hide_banner', '-i', file], { windowsHide: true }, (_e, _o, se) => {
      const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(se || '');
      resolve(m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0);
    });
  });
}

function cancel(id) { const p = jobs.get(id); if (p) { jobs.cancelled = id; p.kill(); } }

/* ---------- convert ---------- */
function convertArgs(cat, to) {
  const a = {
    jpg: ['-filter_complex', '[0:v]split[a][b];[a]drawbox=color=white:t=fill[bg];[bg][b]overlay=format=auto,format=yuvj420p[o]', '-map', '[o]', '-frames:v', '1', '-q:v', '2'],
    png: ['-frames:v', '1'], webp: ['-frames:v', '1', '-quality', '90'], bmp: ['-frames:v', '1'], tiff: ['-frames:v', '1'], gif: [],
  };
  const audio = {
    mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'], wav: ['-vn', '-c:a', 'pcm_s16le'], flac: ['-vn', '-c:a', 'flac'],
    m4a: ['-vn', '-c:a', 'aac', '-b:a', '192k'], ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '5'],
  };
  const even = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  const video = {
    mp4: ['-vf', even, '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'],
    mov: ['-vf', even, '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k'],
    mkv: ['-vf', even, '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k'],
    webm: ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '5', '-c:a', 'libopus'],
    avi: ['-c:v', 'mpeg4', '-q:v', '3', '-c:a', 'libmp3lame', '-q:a', '3'],
    gif: ['-vf', 'fps=12,scale=480:-1:flags=lanczos', '-loop', '0', '-an'],
  };
  if (cat === 'image') return a[to];
  if (cat === 'audio') return audio[to];
  if (cat === 'video') return audio[to] || video[to];
  return null;
}

async function convert({ id, input, to }, emit) {
  const cat = category(extOf(input));
  const args = convertArgs(cat, to);
  if (!args) throw new Error(`Cannot convert ${cat} to ${to}`);
  const { dir, name } = path.parse(input);
  const output = uniquePath(path.join(dir, `${name}.${to === 'tiff' ? 'tif' : to}`));
  const duration = cat === 'image' ? 0 : await probeDuration(input);
  await run(ffmpegBin(), ['-y', '-hide_banner', '-i', input, ...args, output], { id, duration, onProgress: (p) => emit && emit({ id, percent: p }) });
  return { output, before: fs.statSync(input).size, after: fs.statSync(output).size };
}

/* ---------- compress ---------- */
function findGs() {
  const names = ['gswin64c.exe', 'gswin32c.exe', 'gs.exe'];
  for (const d of (process.env.PATH || '').split(path.delimiter)) for (const n of names) { const p = path.join(d, n); if (fs.existsSync(p)) return p; }
  for (const root of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
    const g = path.join(root, 'gs');
    try { for (const v of fs.readdirSync(g).sort().reverse()) for (const n of names) { const p = path.join(g, v, 'bin', n); if (fs.existsSync(p)) return p; } } catch {}
  }
  return null;
}

async function compress({ id, input, level }, emit) {
  const lv = { light: 0, balanced: 1, strong: 2 }[level] ?? 1;
  const ext = extOf(input), cat = category(ext), { dir, name } = path.parse(input);
  const before = fs.statSync(input).size;
  const onProgress = (p) => emit && emit({ id, percent: p });
  let output;

  if (cat === 'image') {
    const W = [4096, 2560, 1600][lv];
    const scale = `scale='min(${W},iw)':-2`;
    let outExt = ext === 'jpeg' ? 'jpg' : ext, args;
    if (outExt === 'jpg') args = ['-vf', scale, '-q:v', String([3, 7, 12][lv])];
    else if (outExt === 'webp') args = ['-vf', scale, '-quality', String([85, 70, 50][lv])];
    else if (outExt === 'png') args = ['-vf', lv === 2 ? `${scale},split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer` : scale, '-compression_level', '9'];
    else { outExt = 'jpg'; args = ['-vf', scale, '-q:v', String([3, 7, 12][lv])]; }
    output = uniquePath(path.join(dir, `${name}-small.${outExt}`));
    await run(ffmpegBin(), ['-y', '-hide_banner', '-i', input, '-frames:v', '1', ...args, output], { id });
  } else if (cat === 'video') {
    const H = [0, 1080, 720][lv];
    const vf = H ? `scale=-2:'min(${H},ih)'` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
    output = uniquePath(path.join(dir, `${name}-small.mp4`));
    await run(ffmpegBin(), ['-y', '-hide_banner', '-i', input, '-vf', vf, '-c:v', 'libx264', '-crf', String([24, 28, 32][lv]), '-preset', 'fast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', ['160k', '128k', '96k'][lv], '-movflags', '+faststart', output], { id, duration: await probeDuration(input), onProgress });
  } else if (cat === 'audio') {
    output = uniquePath(path.join(dir, `${name}-small.mp3`));
    await run(ffmpegBin(), ['-y', '-hide_banner', '-i', input, '-vn', '-c:a', 'libmp3lame', '-b:a', ['192k', '128k', '80k'][lv], output], { id, duration: await probeDuration(input), onProgress });
  } else if (cat === 'pdf') {
    const gs = findGs();
    if (!gs) return { needsRaster: true };
    output = uniquePath(path.join(dir, `${name}-small.pdf`));
    const preset = ['/printer', '/ebook', '/screen'][lv];
    await new Promise((res, rej) => execFile(gs, ['-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', `-dPDFSETTINGS=${preset}`, '-dNOPAUSE', '-dQUIET', '-dBATCH', `-sOutputFile=${output}`, input], { windowsHide: true, maxBuffer: 1 << 24 }, (e) => (e ? rej(e) : res())));
  } else {
    output = uniquePath(path.join(dir, `${name}${ext ? '.' + ext : ''}.zip`));
    const lvl = ['Fastest', 'Optimal', 'Optimal'][lv];
    const q = (s) => s.replace(/'/g, "''");
    await new Promise((res, rej) => execFile('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -LiteralPath '${q(input)}' -DestinationPath '${q(output)}' -CompressionLevel ${lvl} -Force`], { windowsHide: true }, (e) => (e ? rej(e) : res())));
  }
  return { output, before, after: fs.statSync(output).size };
}

module.exports = { category, extOf, TARGETS, convert, compress, cancel, run, ffmpegBin, probeDuration, findGs };
