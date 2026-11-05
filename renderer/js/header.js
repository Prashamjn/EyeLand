// Expanded-island header: weather (left), time (centre), date and condition (right). It lives inside the island panel.
// - Time and date use the Windows regional format (locale from the main process).
// - The clock wakes once per minute, aligned to the minute boundary. No per-second timer.
// - Weather arrives from the main process (cached, refreshed every 15 min); the DOM is only touched on change.
(function () {
  const { $, setText, setHTML, later, cancel, own, icon } = Island;
  const el = { bar: $('#head'), btn: $('#barWeather'), ico: $('#wxIcon'), temp: $('#wxTemp'), city: $('#wxCity'), clock: $('#barClock'), date: $('#barDate'), cond: $('#barCond') };
  let timeFmt, dateFmt, clockT = null, lastWeather = null;

  function buildFormats() {
    const loc = Island.env.locale || undefined;
    try {
      timeFmt = new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' });
      dateFmt = new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {                      // unknown locale string: fall back to the browser default
      timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
      dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    }
  }

  function tick() {
    const now = new Date();
    setText(el.clock, timeFmt.format(now));
    setText(el.date, dateFmt.format(now));
    // wake again just after the next minute starts
    clockT = later(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 40);
  }

  const cityOf = (name) => String(name || '').split(',')[0].trim();

  function paintWeather(w) {
    lastWeather = w;
    el.bar.classList.toggle('stale', !!(w && w.ok && w.stale));
    if (w && w.ok && w.data) {
      const d = w.data;
      setHTML(el.ico, 'i:' + d.icon, icon(d.icon, 14));
      setText(el.temp, d.temp + '°'); setText(el.city, cityOf(d.place)); setText(el.cond, d.text);
      el.btn.title = (w.stale ? 'Offline. Last updated ' + new Date(d.fetchedAt).toLocaleTimeString(Island.env.locale || undefined, { hour: 'numeric', minute: '2-digit' }) + '. ' : '') + (d.place || '') + ' · click to change location';
    } else if (w && w.error === 'loading') {
      setHTML(el.ico, 'i:cloud', icon('cloud', 14)); setText(el.temp, '--°'); setText(el.city, ''); setText(el.cond, ''); el.btn.title = 'Loading weather';
    } else if (w && w.error === 'no-place') {
      setHTML(el.ico, 'i:pin', icon('map-pin', 14)); setText(el.temp, ''); setText(el.city, 'Set location'); setText(el.cond, '');
      el.btn.title = 'Choose a location for weather';
    } else {
      setHTML(el.ico, 'i:off', icon('wifi-off', 14)); setText(el.temp, ''); setText(el.city, 'Weather unavailable'); setText(el.cond, '');
      el.btn.title = (w && w.error === 'offline' ? 'No internet connection. ' : '') + 'Click to retry';
    }
  }

  el.btn.addEventListener('click', () => {
    const w = lastWeather;
    if (w && !w.ok && w.error !== 'no-place') { window.api.refreshWeather(); return; }   // unavailable: retry
    Engine.openPanel('settings');
    Workspace.focusLocation();
  });

  const onOnline = () => window.api.refreshWeather();
  window.addEventListener('online', onOnline);
  own(() => window.removeEventListener('online', onOnline));

  async function init() {
    buildFormats(); tick();
    paintWeather({ ok: false, error: 'loading' });
    own(window.api.onWeather(paintWeather));
    try { paintWeather(await window.api.weather()); } catch { paintWeather({ ok: false, error: 'error' }); }
  }
  window.Header = { init, rebuild() { buildFormats(); cancel(clockT); tick(); } };
})();
