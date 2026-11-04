// QuickShare: a small LAN-only HTTP server. Send: phone downloads files. Receive: phone uploads files.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { uniquePath } = require('./util');

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', mp3: 'audio/mpeg', pdf: 'application/pdf', txt: 'text/plain', zip: 'application/zip' };

function lanIps() {
  const bad = /vethernet|virtualbox|vmware|wsl|hyper-v|loopback|tailscale|zerotier|vpn/i;
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) out.push({ name, ip: n.address, virtual: bad.test(name) });
  return out.sort((a, b) => a.virtual - b.virtual || rank(a.ip) - rank(b.ip));
}
const isPrivate = (ip) => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fe80:|f[cd][0-9a-f]{2}:)/i.test(ip);
const safeName = (n) => (path.basename(String(n || 'file')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 180) || 'file');

function createShare(emit) {
  let st = null, timer = null;

  function snapshot() {
    if (!st) return null;
    return {
      mode: st.mode, url: st.url, ip: st.ip, port: st.port, dir: st.dir,
      files: st.files.map(({ id, name, size }) => ({ id, name, size })),
      transfers: [...st.transfers.values()].map((t) => ({ id: t.id, fileId: t.fileId, name: t.name, dir: t.dir, bytes: t.bytes, total: t.total, speed: t.speed, status: t.status, device: t.device })),
    };
  }

  function track(key, init) {
    let t = st.transfers.get(key);
    if (!t || t.status !== 'active') { t = { id: key, bytes: 0, speed: 0, last: 0, status: 'active', ...init }; st.transfers.set(key, t); }
    return t;
  }

  function page(res) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(st.mode === 'send' ? sendPage(st) : receivePage(st));
  }

  function sendFile(req, res, ra, id) {
    const f = st.files.find((x) => x.id === id);
    if (!f) { res.writeHead(404); return res.end(); }
    let start = 0, end = f.size - 1, code = 200;
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      if (m[1] !== '') start = parseInt(m[1], 10);
      if (m[2] !== '') end = Math.min(end, parseInt(m[2], 10));
      if (m[1] === '' && m[2] !== '') { start = Math.max(0, f.size - parseInt(m[2], 10)); end = f.size - 1; }
      if (start > end || start >= f.size) { res.writeHead(416, { 'Content-Range': `bytes */${f.size}` }); return res.end(); }
      code = 206;
    }
    const len = end - start + 1;
    const t = track(`d:${id}:${ra}`, { fileId: id, name: f.name, dir: 'down', total: len, device: ra });
    const ext = path.extname(f.name).slice(1).toLowerCase();
    const h = {
      'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': len, 'Accept-Ranges': 'bytes',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(f.name)}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    };
    if (code === 206) h['Content-Range'] = `bytes ${start}-${end}/${f.size}`;
    res.writeHead(code, h);
    const rs = fs.createReadStream(f.path, { start, end, highWaterMark: 1 << 20 });
    rs.on('data', (c) => { t.bytes += c.length; });
    res.on('close', () => { t.status = t.bytes >= len ? 'done' : 'interrupted'; });
    rs.on('error', () => { t.status = 'failed'; res.destroy(); });
    rs.pipe(res);
  }

  function receive(req, res, ra, u) {
    const name = safeName(u.searchParams.get('name'));
    fs.mkdirSync(st.dir, { recursive: true });
    const dest = uniquePath(path.join(st.dir, name));
    const total = parseInt(u.searchParams.get('size') || req.headers['content-length'] || '0', 10) || 0;
    const key = `u:${crypto.randomBytes(4).toString('hex')}`;
    const t = track(key, { fileId: key, name: path.basename(dest), dir: 'up', total, device: ra });
    const ws = fs.createWriteStream(dest, { highWaterMark: 1 << 20 });
    req.on('data', (c) => { t.bytes += c.length; });
    req.on('aborted', () => { t.status = 'failed'; ws.destroy(); fs.unlink(dest, () => {}); });
    ws.on('finish', () => { t.status = 'done'; t.path = dest; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, name: path.basename(dest) })); });
    ws.on('error', () => { t.status = 'failed'; res.writeHead(500); res.end(); });
    req.pipe(ws);
  }

  function handler(req, res) {
    const ra = (req.socket.remoteAddress || '').replace('::ffff:', '');
    if (!isPrivate(ra)) { res.writeHead(403); return res.end(); }
    const u = new URL(req.url, 'http://x');
    const parts = u.pathname.split('/').filter(Boolean);
    if (!st || parts[0] !== st.token) { res.writeHead(404); return res.end('Not found'); }
    const route = parts[1] || '';
    if (!route) return page(res);
    if (route === 'status') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(snapshot().transfers)); }
    if (route === 'f' && st.mode === 'send') return sendFile(req, res, ra, parts[2]);
    if (route === 'u' && st.mode === 'receive' && (req.method === 'PUT' || req.method === 'POST')) return receive(req, res, ra, u);
    res.writeHead(404); res.end();
  }

  function start({ mode, files = [], ip, dir }) {
    return new Promise((resolve, reject) => {
      stop();
      const ips = lanIps();
      const use = ip || (ips[0] && ips[0].ip);
      if (!use) return reject(new Error('No Wi-Fi or LAN connection found'));
      const token = crypto.randomBytes(6).toString('hex');
      const server = http.createServer(handler);
      let tried = false;
      server.on('error', (e) => { if (e.code === 'EADDRINUSE' && !tried) { tried = true; go(0); } else reject(e); });
      const go = (port) => server.listen(port, '0.0.0.0', () => {
        const p = server.address().port;
        st = {
          server, mode, token, ip: use, port: p, dir: dir || '', url: `http://${use}:${p}/${token}`, transfers: new Map(),
          files: files.map((f, i) => { const s = fs.statSync(f); return { id: String(i), name: path.basename(f), path: f, size: s.size }; }),
        };
        let lastBytes = new Map();
        timer = setInterval(() => {
          for (const t of st.transfers.values()) {
            const prev = lastBytes.get(t.id) || 0;
            const inst = (t.bytes - prev) / 0.5;
            t.speed = t.status === 'active' ? (t.speed ? t.speed * 0.6 + inst * 0.4 : inst) : 0;
            lastBytes.set(t.id, t.bytes);
          }
          emit(snapshot());
        }, 500);
        resolve(snapshot());
      });
      go(8787);
    });
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (st) { try { st.server.closeAllConnections(); st.server.close(); } catch {} st = null; }
    emit(null);
  }

  return { start, stop, snapshot: () => snapshot(), lanIps };
}

/* ---------- phone pages ---------- */
const CSS = `*{box-sizing:border-box}body{margin:0;background:#111214;color:#eceef0;font:15px/1.4 system-ui,sans-serif;padding:20px;max-width:560px;margin:auto}
h1{font-size:18px;margin:0 0 4px}p{color:#9a9fa6;margin:0 0 16px}.row{border:1px solid #2a2c31;background:#18191c;border-radius:10px;padding:12px;margin-bottom:10px}
.top{display:flex;justify-content:space-between;gap:10px;align-items:center}.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sub{color:#9a9fa6;font-size:12px}
a.btn,button{background:#eceef0;color:#111;border:0;border-radius:8px;padding:8px 14px;font:600 14px system-ui;text-decoration:none;cursor:pointer}
.bar{height:4px;background:#2a2c31;border-radius:2px;margin-top:10px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:#b8ffa3}
.drop{border:1px dashed #3a3d44;border-radius:12px;padding:28px;text-align:center;margin-bottom:14px;color:#9a9fa6}`;
const fmt = `const fmt=n=>{const u=['B','KB','MB','GB'];let i=0;while(n>=1024&&i<3){n/=1024;i++}return (i?n.toFixed(1):n)+' '+u[i]};`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function sendPage(st) {
  const rows = st.files.map((f) => `<div class="row" data-id="${f.id}"><div class="top"><div><div class="name">${esc(f.name)}</div><div class="sub">${f.size} B</div></div><a class="btn" href="/${st.token}/f/${f.id}" download>Download</a></div><div class="bar"><i></i></div><div class="sub st"></div></div>`).join('');
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eyeland</title><style>${CSS}</style>
<h1>Files from your PC</h1><p>Tap Download on each file.</p>${rows}
<script>${fmt}
document.querySelectorAll('.sub').forEach(e=>{if(!e.classList.contains('st')&&/^\\d+ B$/.test(e.textContent))e.textContent=fmt(parseInt(e.textContent))});
setInterval(async()=>{try{const t=await (await fetch('/${st.token}/status',{cache:'no-store'})).json();
document.querySelectorAll('.row').forEach(r=>{const m=t.filter(x=>x.fileId===r.dataset.id).pop();if(!m)return;
r.querySelector('.bar i').style.width=(m.total?Math.min(100,m.bytes/m.total*100):0)+'%';
r.querySelector('.st').textContent=m.status==='active'?fmt(m.speed)+'/s':m.status==='done'?'Done':m.status==='interrupted'?'Interrupted':'Failed'})}catch(e){}},700);
</script>`;
}

function receivePage(st) {
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eyeland</title><style>${CSS}</style>
<h1>Send files to your PC</h1><p>Choose files. They are saved on the computer.</p>
<div class="drop" id="drop">Drop files here or use the button<br><br><button id="pick">Choose files</button><input id="f" type="file" multiple hidden></div><div id="list"></div>
<script>${fmt}
const list=document.getElementById('list'),f=document.getElementById('f');
document.getElementById('pick').onclick=()=>f.click();
const q=[];let busy=false;
function add(files){for(const file of files){const row=document.createElement('div');row.className='row';
row.innerHTML='<div class="top"><div class="name"></div><div class="sub">Waiting</div></div><div class="bar"><i></i></div>';
row.querySelector('.name').textContent=file.name;list.prepend(row);q.push({file,row});}next()}
function next(){if(busy||!q.length)return;busy=true;const {file,row}=q.shift();const sub=row.querySelector('.sub'),bar=row.querySelector('.bar i');
const x=new XMLHttpRequest();x.open('PUT','/${st.token}/u?name='+encodeURIComponent(file.name)+'&size='+file.size);
let t0=Date.now(),l0=0;
x.upload.onprogress=e=>{const now=Date.now();bar.style.width=(e.loaded/e.total*100)+'%';if(now-t0>400){sub.textContent=fmt((e.loaded-l0)/((now-t0)/1000))+'/s, '+Math.round(e.loaded/e.total*100)+'%';t0=now;l0=e.loaded}};
x.onload=()=>{bar.style.width='100%';sub.textContent=x.status===200?'Done, '+fmt(file.size):'Failed';busy=false;next()};
x.onerror=()=>{sub.textContent='Failed';busy=false;next()};x.send(file)}
f.onchange=()=>{add(f.files);f.value=''};
const d=document.getElementById('drop');d.ondragover=e=>e.preventDefault();d.ondrop=e=>{e.preventDefault();add(e.dataTransfer.files)};
</script>`;
}

module.exports = { createShare, lanIps };
