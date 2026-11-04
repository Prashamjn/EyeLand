Plugins.register({
  id: 'weather',
  mount(root, c) {
    const { h } = c;
    root.append(c.head(c.meta.name, 'Uses your approximate location from your IP address. Search a city to change it.'));
    const body = h('div', {});
    const search = h('input', { class: 'input', placeholder: 'Search a city', style: 'max-width:280px' });
    const results = h('div', { class: 'list', style: 'margin-top:8px;max-width:420px' });
    const unitSeg = h('div', { class: 'seg' });
    ['c', 'f'].forEach((u) => { const b = h('button', { class: (c.S.tempUnit || 'c') === u ? 'on' : '', onclick: () => { c.save({ tempUnit: u }); [...unitSeg.children].forEach((x) => x.classList.toggle('on', x === b)); load(); } }, '°' + u.toUpperCase()); unitSeg.append(b); });
    let timer;
    search.addEventListener('input', () => {
      clearTimeout(timer); const q = search.value.trim();
      if (q.length < 2) { results.innerHTML = ''; return; }
      timer = setTimeout(async () => {
        try {
          const d = await c.ey.invoke('ey:fetch-json', `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5`);
          results.innerHTML = '';
          (d.results || []).forEach((r) => results.append(h('button', { class: 'li btn', style: 'justify-content:flex-start;font-weight:500', onclick: () => { c.save({ weatherPlace: { name: [r.name, r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude } }); results.innerHTML = ''; search.value = ''; load(); } }, [r.name, r.admin1, r.country].filter(Boolean).join(', '))));
          if (!d.results) results.append(h('div', { class: 'empty' }, 'No matches.'));
        } catch (e) { results.innerHTML = ''; }
      }, 350);
    });
    const here = h('button', { class: 'btn', onclick: () => { c.save({ weatherPlace: null }); load(); } }, 'Use my location');
    root.append(h('div', { class: 'row wrap', style: 'margin-bottom:14px' }, search, here, unitSeg), results, body);

    const WMO = (code) => {
      if (code === 0) return ['Clear sky', 'sun']; if (code <= 2) return ['Partly cloudy', 'partly']; if (code === 3) return ['Overcast', 'cloud'];
      if (code <= 48) return ['Fog', 'fog']; if (code <= 57) return ['Drizzle', 'rain']; if (code <= 67) return ['Rain', 'rain'];
      if (code <= 77) return ['Snow', 'snow']; if (code <= 82) return ['Rain showers', 'rain']; if (code <= 86) return ['Snow showers', 'snow']; return ['Thunderstorm', 'storm'];
    };
    const GL = {
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
      partly: '<circle cx="8" cy="8" r="3"/><path d="M8 2v1M2 8h1M4 4l.7.7M12 4l-.7.7"/><path d="M9 20h9a4 4 0 0 0 0-8 5 5 0 0 0-9.4 1A3.5 3.5 0 0 0 9 20z"/>',
      cloud: '<path d="M7 19h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1A3.6 3.6 0 0 0 7 19z"/>',
      fog: '<path d="M4 9h16M3 13h18M6 17h12"/>', rain: '<path d="M7 14h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1A3.6 3.6 0 0 0 7 14zM8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
      snow: '<path d="M12 3v18M4 7.5l16 9M20 7.5l-16 9"/>', storm: '<path d="M7 13h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1A3.6 3.6 0 0 0 7 13zM12 13l-2 4h3l-2 4"/>',
    };
    const icon = (k, size = 22) => h('span', { html: `<svg viewBox="0 0 24 24" style="width:${size}px;height:${size}px">${GL[k]}</svg>` });

    async function load() {
      body.innerHTML = ''; body.append(h('div', { class: 'empty' }, 'Loading weather'));
      try {
        let place = c.S.weatherPlace;
        if (!place) place = await c.ey.invoke('ey:ip-location');
        const f = (c.S.tempUnit || 'c') === 'f';
        const d = await c.ey.invoke('ey:fetch-json', `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=6${f ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : ''}`);
        const cur = d.current, [text, gl] = WMO(cur.weather_code), U = f ? '°F' : '°C', W = f ? 'mph' : 'km/h';
        body.innerHTML = '';
        body.append(h('div', { class: 'card' }, h('div', { class: 'row sp' },
          h('div', {}, h('div', { class: 'muted' }, place.name || 'Your location'), h('div', { class: 'big', style: 'font-size:48px;margin:6px 0' }, Math.round(cur.temperature_2m) + U), h('div', {}, text)),
          icon(gl, 72)),
          h('div', { class: 'row wrap', style: 'margin-top:14px;gap:28px' },
            [['Feels like', Math.round(cur.apparent_temperature) + U], ['Humidity', cur.relative_humidity_2m + '%'], ['Wind', Math.round(cur.wind_speed_10m) + ' ' + W]].map(([k, v]) => h('div', {}, h('div', { class: 'small faint' }, k), h('b', {}, v))))));
        const row = h('div', { style: 'display:grid;grid-template-columns:repeat(5,1fr);gap:10px' });
        d.daily.time.slice(1, 6).forEach((t, i) => {
          const [tx, g] = WMO(d.daily.weather_code[i + 1]);
          row.append(h('div', { class: 'card', style: 'text-align:center;margin:0;padding:12px 8px' }, h('div', { class: 'small muted' }, new Date(t + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' })), h('div', { style: 'margin:8px 0' }, icon(g)),
            h('div', {}, h('b', {}, Math.round(d.daily.temperature_2m_max[i + 1]) + '°'), h('span', { class: 'muted' }, ' ' + Math.round(d.daily.temperature_2m_min[i + 1]) + '°')), h('div', { class: 'small faint' }, (d.daily.precipitation_probability_max[i + 1] ?? 0) + '% rain')));
        });
        body.append(h('div', { style: 'margin-top:12px' }, row));
      } catch (e) { body.innerHTML = ''; body.append(h('div', { class: 'card' }, 'Could not load the weather. Check your connection and try again. ', h('button', { class: 'btn sm', onclick: load }, 'Retry'))); }
    }
    load();
  },
});
