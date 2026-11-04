Plugins.register({
  id: 'voice',
  async mount(root, c) {
    const { h } = c;
    root.append(c.head(c.meta.name, 'Record audio notes. Memos are stored on this PC and can be exported as MP3, WAV or M4A.'));
    let rec = null, stream = null, chunks = [], t0 = 0, acc = 0, paused = false, tick = null, raf = null, audioCtx = null, analyser = null;
    const timeEl = h('div', { class: 'big mono' }, '0:00');
    const cv = h('canvas', { width: 520, height: 70, style: 'width:100%;height:70px;display:block;margin:12px 0;border-radius:8px;background:rgba(0,0,0,.2)' });
    const btnRec = h('button', { class: 'btn primary', onclick: toggle }, c.icon('voice'), 'Record');
    const btnPause = h('button', { class: 'btn', hidden: true, onclick: pause }, 'Pause');
    const btnStop = h('button', { class: 'btn', hidden: true, onclick: stop }, c.icon('stop'), 'Save');
    const list = h('div', { class: 'list' });
    root.append(h('div', { class: 'card' }, timeEl, cv, h('div', { class: 'row' }, btnRec, btnPause, btnStop)), h('div', { class: 'card' }, h('h3', {}, 'Your memos'), list));

    const elapsed = () => acc + (paused ? 0 : Date.now() - t0) / 1000;
    function draw() {
      const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
      if (analyser) {
        const d = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(d);
        g.strokeStyle = '#b8ffa3'; g.lineWidth = 2; g.beginPath();
        for (let i = 0; i < d.length; i += 4) { const x = (i / d.length) * cv.width, y = (d[i] / 255) * cv.height; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
      raf = requestAnimationFrame(draw);
    }
    async function toggle() { rec ? stop() : start(); }
    async function start() {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } }); }
      catch { return c.toast('Microphone unavailable. Allow microphone access in Windows privacy settings.', true); }
      audioCtx = new AudioContext(); analyser = audioCtx.createAnalyser(); analyser.fftSize = 1024;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' }); chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(250); t0 = Date.now(); acc = 0; paused = false;
      btnRec.hidden = true; btnPause.hidden = false; btnStop.hidden = false; btnPause.textContent = 'Pause';
      tick = setInterval(() => (timeEl.textContent = c.fmtTime(elapsed())), 250); draw();
    }
    function pause() {
      if (!rec) return;
      if (paused) { rec.resume(); t0 = Date.now(); paused = false; btnPause.textContent = 'Pause'; }
      else { rec.pause(); acc += (Date.now() - t0) / 1000; paused = true; btnPause.textContent = 'Resume'; }
    }
    async function stop() {
      if (!rec) return;
      const dur = elapsed();
      await new Promise((res) => { rec.onstop = res; rec.stop(); });
      stream.getTracks().forEach((t) => t.stop()); clearInterval(tick); cancelAnimationFrame(raf); audioCtx && audioCtx.close(); analyser = null;
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(blob); });
      await c.ey.invoke('ey:voice:save', { base64: b64, duration: dur });
      rec = null; btnRec.hidden = false; btnPause.hidden = true; btnStop.hidden = true; timeEl.textContent = '0:00';
      cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
      c.toast('Memo saved'); refresh();
    }

    const player = new Audio(); let playing = null;
    player.addEventListener('ended', () => { playing = null; refresh(); });
    async function play(m) {
      if (playing === m.id) { player.pause(); playing = null; return refresh(); }
      const b64 = await c.ey.invoke('ey:voice:read', m.id);
      player.src = URL.createObjectURL(new Blob([c.b64ToBytes(b64)], { type: 'audio/webm' })); player.play(); playing = m.id; refresh();
    }
    async function refresh() {
      const items = await c.ey.invoke('ey:voice:list'); list.innerHTML = '';
      if (!items.length) list.append(h('div', { class: 'empty' }, 'No memos yet. Press Record to start.'));
      items.forEach((m) => {
        const fmt = h('select', { class: 'input', style: 'width:84px;height:28px' }, ['mp3', 'wav', 'm4a'].map((f) => h('option', {}, f)));
        const name = h('input', { class: 'input', value: m.name, style: 'height:28px;background:transparent;border-color:transparent', onchange: (e) => c.ey.invoke('ey:voice:rename', m.id, e.target.value) });
        list.append(h('div', { class: 'li' },
          h('button', { class: 'btn icon', onclick: () => play(m), title: playing === m.id ? 'Pause' : 'Play' }, c.icon(playing === m.id ? 'pause' : 'play')),
          h('div', { class: 'grow' }, name, h('div', { class: 'small faint', style: 'padding-left:10px' }, `${c.fmtTime(m.duration)} , ${c.fmtBytes(m.size)}`)),
          fmt, h('button', { class: 'btn sm', onclick: async () => { const p = await c.ey.invoke('ey:voice:export', m.id, fmt.value, m.name).catch((e) => { c.toast('Export failed: ' + e.message, true); }); if (p) { c.toast('Exported'); c.ey.invoke('ey:reveal', p); } } }, 'Export'),
          h('button', { class: 'btn icon sm', title: 'Delete', onclick: async () => { await c.ey.invoke('ey:voice:delete', m.id); refresh(); } }, c.icon('trash'))));
      });
    }
    refresh();
    return () => { try { rec && rec.state !== 'inactive' && rec.stop(); stream && stream.getTracks().forEach((t) => t.stop()); } catch {} clearInterval(tick); cancelAnimationFrame(raf); player.pause(); };
  },
});
