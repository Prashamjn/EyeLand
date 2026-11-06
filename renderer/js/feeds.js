// Feeds: turn the existing Windows signals (volume, brightness, charger, media, coffee mode,
// plugin results) into activities. Nothing here draws; the engine and views do that.
(function () {
  const { S, manager, own } = Island;
  const P = ActivityManager.PRIORITY;
  const api = window.api;
  const feedbackMs = () => S.overlayMs || 1800;

  /* ---- volume + brightness ---- */
  const state = (Island.state = { vol: 0, muted: false, bri: null, firstVol: true, firstBri: true });
  own(api.onSystem((m) => {
    if (m.kind === 'vol') {
      const changed = m.value !== state.vol || m.muted !== state.muted;
      state.vol = m.value; state.muted = m.muted;
      if (window.Workspace) Workspace.paintSystem();
      if (changed && !state.firstVol && !Island.dragging) {
        manager.post({ id: 'volume', type: 'volume', title: 'Volume', priority: P.FEEDBACK, expiresIn: feedbackMs(), progress: m.muted ? 0 : m.value / 100, data: { value: m.value, muted: m.muted } });
      }
      state.firstVol = false;           // the very first reading at startup must not pop the island
    } else if (m.kind === 'bri') {
      if (m.value === null) { state.bri = null; if (window.Workspace) Workspace.paintSystem(); return; }
      const changed = m.value !== state.bri;
      state.bri = m.value;
      if (window.Workspace) Workspace.paintSystem();
      if (changed && !state.firstBri && !Island.dragging) {
        manager.post({ id: 'brightness', type: 'brightness', title: 'Brightness', priority: P.FEEDBACK, expiresIn: feedbackMs(), progress: m.value / 100, data: { value: m.value } });
      }
      state.firstBri = false;
    }
  }));

  /* ---- charger (Battery Status API; event driven, no polling) ---- */
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      Island.battery = b;
      let lowShown = false;
      const level = () => Math.round(b.level * 100);
      const onCharge = () => {
        lowShown = false;
        manager.post({ id: 'charging', type: 'charging', title: b.charging ? 'Charging' : 'Charger disconnected', priority: P.FEEDBACK, expiresIn: 3200, progress: b.level, data: { charging: b.charging, level: level() } });
        if (window.Workspace) Workspace.paintBattery();
      };
      const onLevel = () => {
        if (manager.has('charging')) manager.update('charging', { progress: b.level, data: { charging: b.charging, level: level() } });
        if (!b.charging && level() <= 15 && !lowShown) {
          lowShown = true;
          manager.post({ id: 'battery-low', type: 'notice', icon: 'battery', title: `Battery low · ${level()}%`, subtitle: 'Plug in your charger', priority: P.CRITICAL, expiresIn: 6000, data: { tone: 'warn' } });
        }
        if (level() > 20) lowShown = false;
        if (window.Workspace) Workspace.paintBattery();
      };
      b.addEventListener('chargingchange', onCharge); b.addEventListener('levelchange', onLevel);
      own(() => { b.removeEventListener('chargingchange', onCharge); b.removeEventListener('levelchange', onLevel); });
      if (window.Workspace) Workspace.paintBattery();
    }).catch(() => {});
  }

  /* ---- charger connect: soft chime + one-shot pulse ----
     The main process watches Windows power events and sends { onAc, connected } only for a real battery -> AC transition
     (never at launch, never for duplicates or disconnects). The chime is synthesised locally (shared/chime.js). */
  const chime = (Island.chime = Chime.createPlayer({ getCtor: () => window.AudioContext || window.webkitAudioContext }));
  const power = (Island.power = { onAc: true });
  api.powerState().then((p) => { if (p) power.onAc = !!p.onAc; }).catch(() => {});
  const soundOn = () => S.chargingSound !== false;
  const soundVol = () => (S.chargingSoundVolume == null ? 60 : S.chargingSoundVolume);
  Island.previewChime = () => { if (soundOn()) chime.play(soundVol()); };          // used by the settings slider
  own(api.onPower((p) => {
    if (!p) return;
    power.onAc = !!p.onAc;
    if (!p.connected) return;                                  // a disconnect only updates the state
    if (soundOn()) chime.play(soundVol());                     // read at event time, so a settings change applies immediately
    const b = Island.battery;
    if (b) manager.post({ id: 'charging', type: 'charging', title: 'Charging', priority: P.FEEDBACK, expiresIn: 3200, progress: b.level, data: { charging: true, level: Math.round(b.level * 100), pulse: Date.now() } });
    if (window.Workspace) Workspace.paintBattery();
  }));

  /* ---- media ---- */
  const cur = { key: '', art: null, playing: false, seen: false };
  const artUri = (b64) => (b64 ? `data:image/${b64.startsWith('iVBOR') ? 'png' : 'jpeg'};base64,${b64}` : null);
  own(api.onMedia((m) => {
    if (m.art !== undefined) {                      // artwork arrives separately, once per track
      if (m.key === cur.key) {
        cur.art = artUri(m.art);
        const a = manager.get('media'); if (a) manager.update('media', { data: { ...a.data, art: cur.art } });
      }
      return;
    }
    if (!m.title) { cur.key = ''; cur.art = null; cur.playing = false; manager.complete('media'); Eq.media(null); return; }
    const key = `${m.title}|${m.artist || ''}|${m.app || ''}`, changed = key !== cur.key;
    if (changed) cur.art = null;
    const started = !!m.playing && (!cur.playing || changed);
    cur.key = key; cur.playing = !!m.playing;
    Eq.media(!!m.playing);                          // the three lines follow the one session Windows reports as current
    const base = { id: 'media', type: 'media', title: m.title, subtitle: m.artist || m.app || '', priority: P.MEDIA, data: { playing: !!m.playing, app: m.app || '', art: cur.art } };
    if (!cur.seen) { cur.seen = true; manager.post({ ...base, display: 'ambient' }); }                 // already playing at startup: stay quiet
    else if (started) manager.post({ ...base, focusMs: 5500 });                                        // media started: peek, then settle
    else if (!manager.has('media')) manager.post({ ...base, display: 'ambient' });
    else manager.update('media', { title: base.title, subtitle: base.subtitle, data: base.data, ...(m.playing ? {} : { display: 'ambient' }) });
  }));

  /* ---- coffee mode ---- */
  const setCoffee = (on) => {
    if (on) manager.post({ id: 'coffee', type: 'coffee', title: 'Coffee mode', subtitle: 'Screen stays awake', icon: 'coffee', priority: P.AMBIENT, display: 'ambient' });
    else manager.complete('coffee');
    if (window.Workspace) Workspace.setCoffee(on);
  };
  own(api.onCoffee(setCoffee));
  api.coffeeState().then(setCoffee).catch(() => {});

  /* ---- plugin results (copied text, picked colour, ...) ---- */
  const TOAST_ICON = { copy: 'copy', check: 'check', warn: 'triangle-alert', search: 'search', coffee: 'coffee' };
  own(api.onToast(({ icon, text, color }) => {
    if (window.Engine && Engine.isExpanded() && !Engine.isPinned()) Engine.closePanel();   // results appear in the activity area when a plugin keeps the island open
    manager.post({ id: 'toast', type: 'notice', icon: TOAST_ICON[icon] || 'check', title: String(text || ''), priority: P.NOTICE, expiresIn: Math.max(2200, feedbackMs()), data: { color: icon === 'color' ? color : null, tone: icon === 'warn' ? 'warn' : null } });
  }));
})();
