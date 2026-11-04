const $ = (s) => document.querySelector(s);
const ey = window.eyeland;
let cfg = null;

(async () => {
  cfg = await ey.invoke('ov:ready');
  if (!cfg) return ey.send('ov:close');
  if (cfg.mode === 'color') colorMode();
  else if (cfg.mode === 'draw') drawMode();
  else selectMode();
})();

window.addEventListener('keydown', (e) => { if (e.key === 'Escape') ey.send('ov:close'); });
window.addEventListener('contextmenu', (e) => { e.preventDefault(); if (cfg && cfg.mode !== 'draw') ey.send('ov:close'); });

/* ---------- region select ---------- */
function selectMode() {
  $('#select').hidden = false;
  $('#shot').src = cfg.image;
  const hints = { text: 'Drag over the text to copy. Esc cancels.', lens: 'Drag around the object to search. Esc cancels.', translate: 'Drag over the text to translate. Esc cancels.' };
  $('#hint').textContent = hints[cfg.mode] || hints.text;
  const sel = $('#sel'), dim = $('#dim');
  let a = null, r = null;
  const rect = (x, y) => ({ x: Math.min(a.x, x), y: Math.min(a.y, y), w: Math.abs(x - a.x), h: Math.abs(y - a.y) });
  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    a = { x: e.clientX, y: e.clientY }; r = null;
    dim.style.display = 'none'; sel.style.display = 'block'; sel.style.width = sel.style.height = '0px';
    sel.style.left = a.x + 'px'; sel.style.top = a.y + 'px';
  });
  window.addEventListener('pointermove', (e) => {
    if (!a) return;
    r = rect(e.clientX, e.clientY);
    Object.assign(sel.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  });
  window.addEventListener('pointerup', (e) => {
    if (!a || e.button !== 0) return;
    r = rect(e.clientX, e.clientY); a = null;
    if (r.w < 6 || r.h < 6) { sel.style.display = 'none'; dim.style.display = 'block'; return; }
    const k = cfg.imgW / window.innerWidth;
    ey.send('ov:crop', { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k });
  });
}

/* ---------- color picker ---------- */
function colorMode() {
  $('#color').hidden = false;
  const cv = $('#px'), ctx = cv.getContext('2d', { willReadFrequently: true });
  const lp = $('#lp'), lctx = lp.getContext('2d'), loupe = $('#loupe');
  const img = new Image();
  let pos = { x: innerWidth / 2, y: innerHeight / 2 }, ready = false;
  const hex = (d) => '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  const k = () => cfg.imgW / innerWidth;
  const px = () => ({ x: Math.max(0, Math.min(cfg.imgW - 1, Math.floor(pos.x * k()))), y: Math.max(0, Math.min(cfg.imgH - 1, Math.floor(pos.y * k()))) });
  function update() {
    if (!ready) return;
    const p = px(), N = 15, half = 7, S = lp.width / N;
    lctx.imageSmoothingEnabled = false;
    lctx.fillStyle = '#000'; lctx.fillRect(0, 0, lp.width, lp.height);
    lctx.drawImage(cv, p.x - half, p.y - half, N, N, 0, 0, lp.width, lp.height);
    lctx.strokeStyle = '#fff'; lctx.lineWidth = 2; lctx.strokeRect(half * S, half * S, S, S);
    lctx.strokeStyle = '#000'; lctx.lineWidth = 1; lctx.strokeRect(half * S - 1, half * S - 1, S + 2, S + 2);
    const d = ctx.getImageData(p.x, p.y, 1, 1).data;
    $('#lpSwatch').style.background = hex(d); $('#lpText').textContent = hex(d);
    loupe.style.display = 'block';
    const x = pos.x + 22 + 151 > innerWidth ? pos.x - 22 - 151 : pos.x + 22;
    const y = pos.y + 22 + 190 > innerHeight ? pos.y - 22 - 190 : pos.y + 22;
    loupe.style.left = x + 'px'; loupe.style.top = y + 'px';
  }
  img.onload = () => { cv.width = cfg.imgW; cv.height = cfg.imgH; ctx.drawImage(img, 0, 0); ready = true; update(); };
  img.src = cfg.image;
  window.addEventListener('pointermove', (e) => { pos = { x: e.clientX, y: e.clientY }; update(); });
  window.addEventListener('keydown', (e) => {
    const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (m) { pos = { x: pos.x + m[0] / k(), y: pos.y + m[1] / k() }; update(); e.preventDefault(); }
    if (e.key === 'Enter') pick();
  });
  window.addEventListener('pointerdown', (e) => { if (e.button === 0) pick(); });
  function pick() { if (!ready) return; const p = px(), d = ctx.getImageData(p.x, p.y, 1, 1).data; ey.send('ov:color', { r: d[0], g: d[1], b: d[2] }); }
}

/* ---------- draw on screen ---------- */
function drawMode() {
  $('#draw').hidden = false;
  const cv = $('#cv'), ctx = cv.getContext('2d'), pen = $('#pen');
  const dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const COLORS = ['#ffffff', '#ff4d4f', '#ffb020', '#ffe14d', '#3ddc84', '#4da3ff', '#111111'];
  let color = '#ff4d4f', size = 5, tool = 'pen', strokes = [], cur = null;

  COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'sw' + (c === color ? ' on' : ''); b.style.background = c; b.dataset.c = c;
    b.onclick = () => setColor(c);
    $('#colors').appendChild(b);
  });
  function setColor(c) { color = c; document.querySelectorAll('.sw').forEach((s) => s.classList.toggle('on', s.dataset.c === c)); if (tool === 'eraser') setTool('pen'); }
  $('#custom').addEventListener('input', (e) => setColor(e.target.value));
  document.querySelectorAll('#sizes button').forEach((b) => b.onclick = () => { size = +b.dataset.size; document.querySelectorAll('#sizes button').forEach((x) => x.classList.toggle('on', x === b)); cursorSize(); });
  function setTool(t) { tool = t; ['tPen', 'tMark', 'tEraser'].forEach((id) => $('#' + id).classList.toggle('on', id === { pen: 'tPen', marker: 'tMark', eraser: 'tEraser' }[t])); cursorSize(); }
  $('#tPen').onclick = () => setTool('pen'); $('#tMark').onclick = () => setTool('marker'); $('#tEraser').onclick = () => setTool('eraser');
  const width = (s) => (s.tool === 'eraser' ? Math.max(18, s.size * 3.5) : s.tool === 'marker' ? s.size * 3 : s.size);
  function cursorSize() { const w = width({ tool, size }); pen.style.width = pen.style.height = w + 'px'; }
  cursorSize();

  function paint(s) {
    ctx.save(); ctx.scale(dpr, dpr);
    ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = width(s);
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.globalAlpha = s.tool === 'marker' ? 0.38 : 1;
    ctx.strokeStyle = ctx.fillStyle = s.color;
    const p = s.points;
    if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0].x, p[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
    else {
      ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2);
      ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y); ctx.stroke();
    }
    ctx.restore();
  }
  function redraw() { ctx.clearRect(0, 0, cv.width, cv.height); strokes.forEach(paint); }

  cv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    cv.setPointerCapture(e.pointerId);
    cur = { tool, color, size, points: [{ x: e.clientX, y: e.clientY }] };
    strokes.push(cur); paint(cur);
  });
  cv.addEventListener('pointermove', (e) => {
    pen.style.display = 'block'; pen.style.left = e.clientX + 'px'; pen.style.top = e.clientY + 'px';
    if (!cur) return;
    cur.points.push({ x: e.clientX, y: e.clientY });
    if (cur.points.length % 3 === 0 || cur.tool !== 'pen') redraw(); else paint({ ...cur, points: cur.points.slice(-3) });
  });
  const end = () => { if (cur) { redraw(); cur = null; } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  document.getElementById('bar').addEventListener('pointerenter', () => (pen.style.display = 'none'));

  const undo = () => { strokes.pop(); redraw(); };
  $('#bUndo').onclick = undo;
  $('#bClear').onclick = () => { strokes = []; redraw(); };
  $('#bClose').onclick = () => ey.send('ov:close');
  window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { undo(); e.preventDefault(); } });
}
