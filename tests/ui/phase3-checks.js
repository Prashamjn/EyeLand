// Phase 3 UI checks (three-line music indicator, charger chime and pulse, settings), shared by:
//   tests/ui/smoke.js   the real island renderer inside Electron with the stubbed preload
//   any other runner that can evaluate JS in the renderer page and provides the same test stub (window.__test)
// `js(code)` evaluates code in the page and returns its value. `check(name, ok, detail)` records a result.
// What this does NOT cover: real Windows power events and real Windows media sessions (see docs/architecture.md).
const REST = [0.42, 0.66, 0.5];                       // resting scaleY of the three lines (renderer/style.css)

exports.run = async function run({ js, sleep, check, note = console.log }) {
  const emit = (ch, d) => js(`__test.emit(${JSON.stringify(ch)}, ${JSON.stringify(d)})`);
  const scale = (i) => js(`(() => { const m = getComputedStyle(document.querySelectorAll('#eq i')[${i}]).transform.match(/matrix\\(([^)]+)\\)/); return m ? +m[1].split(',')[3] : 1; })()`);
  const scales = async () => [await scale(0), await scale(1), await scale(2)];
  const prop = (p) => js(`[...document.querySelectorAll('#eq i')].map(i => getComputedStyle(i).${p})`);
  const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
  const track = { title: 'Song', artist: 'Artist', app: 'Spotify' };

  /* ---------- three-line indicator ---------- */
  let stablePillFrames = 0;
  for (let i = 0; i < 80 && stablePillFrames < 3; i++) {
    const settled = await js(`(() => { const e = document.getElementById('island'), r = e.getBoundingClientRect(); return e.dataset.mode === 'idle' && Math.abs(r.width - 124) < 0.5 && Math.abs(r.height - 32) < 0.5; })()`);
    stablePillFrames = settled ? stablePillFrames + 1 : 0;
    if (stablePillFrames < 3) await sleep(60);
  }
  check('phase 3 starts from the idle pill', stablePillFrames === 3, JSON.stringify(await js(`(() => { const e = document.getElementById('island'), r = e.getBoundingClientRect(); return { mode: e.dataset.mode, size: [r.width, r.height], activities: Island.manager.list().map(a => a.id) }; })()`)));
  check('three lines live in the collapsed (idle) layer', await js(`document.querySelectorAll('#island .l-idle #eq > i').length === 3`));
  check('idle with no media: resting state, nothing animating', await js(`Eq.state() === 'rest'`) && (await prop('animationName')).every((n) => n === 'none'));
  const rest0 = await scales();
  check('resting lines have the three resting heights', rest0.every((v, i) => near(v, REST[i])), JSON.stringify(rest0));
  const pill = await js(`(() => { const e = document.getElementById('island'), r = e.getBoundingClientRect(); return { mode: e.dataset.mode, size: [Math.round(r.width), Math.round(r.height)], style: [e.style.width, e.style.height], ambient: document.getElementById('ambient').innerHTML }; })()`);
  check('collapsed pill keeps its size', pill.mode === 'idle' && pill.size[0] === 124 && pill.size[1] === 32, JSON.stringify(pill));
  await sleep(500);
  check('no media: lines stay still', (await scales()).every((v, i) => near(v, rest0[i], 0.001)));

  await emit('media', { ...track, playing: true }); await sleep(150);
  check('music starts: lines switch to the playing state', await js(`Eq.state() === 'playing'`));
  check('each line runs its own animation', JSON.stringify(await prop('animationName')) === JSON.stringify(['eq-a', 'eq-b', 'eq-c']));
  const dur = await prop('animationDuration');
  check('lines have different speeds (not moving identically)', new Set(dur).size === 3, dur.join(' '));
  check('animation is running while the pill is collapsed', (await prop('animationPlayState')).every((s) => s === 'running'));
  const samples = []; for (let i = 0; i < 14; i++) { samples.push(await scales()); await sleep(110); }
  const col = (k) => samples.map((s) => s[k]);
  const range = (a) => Math.max(...a) - Math.min(...a);
  check('every line actually moves', [0, 1, 2].every((k) => range(col(k)) > 0.12), [0, 1, 2].map((k) => range(col(k)).toFixed(2)).join(' '));
  check('movement stays subtle and inside bounds', samples.flat().every((v) => v >= 0.27 && v <= 1.01), 'min ' + Math.min(...samples.flat()).toFixed(2) + ' max ' + Math.max(...samples.flat()).toFixed(2));
  check('the three lines are out of phase with each other', samples.some((s) => Math.abs(s[0] - s[1]) > 0.08 || Math.abs(s[1] - s[2]) > 0.08));

  await emit('media', { ...track, playing: false }); await sleep(90);
  check('a pause is settled briefly (no flicker on track changes)', await js(`Eq.state() === 'playing'`));
  await sleep(240);
  check('pause: animation stops', await js(`Eq.state() === 'rest'`) && (await prop('animationName')).every((n) => n === 'none'));
  check('pause: lines ease back instead of snapping (a transition is running)', await js(`[...document.querySelectorAll('#eq i')].every(i => /transform/.test(i.style.transition))`));
  await sleep(700);
  check('pause: lines end on the resting pose', (await scales()).every((v, i) => near(v, REST[i])), JSON.stringify(await scales()));
  check('pause: inline overrides are cleaned up', await js(`[...document.querySelectorAll('#eq i')].every(i => i.style.transition === '' && i.style.transform === '')`));

  await emit('media', { ...track, playing: true }); await sleep(150);
  check('resume: lines animate again', await js(`Eq.state() === 'playing'`) && (await prop('animationName')).every((n) => n !== 'none'));
  await emit('media', { ...track, playing: false }); await sleep(60); await emit('media', { ...track, playing: true }); await sleep(500);
  check('a brief pause then play never stops the lines', await js(`Eq.state() === 'playing'`));

  await js(`Engine.openPanel()`); await sleep(350);
  check('nothing animates while the island is expanded (hidden layer)', (await prop('animationPlayState')).every((s) => s === 'paused'));
  await js(`Engine.closePanel()`);
  // A restart shows the media "peek" activity for ~5.5 s first (Phase 2 behaviour); the idle lines stay frozen while hidden.
  for (let i = 0; i < 40 && !(await js(`document.getElementById('island').dataset.mode === 'idle'`)); i++) await sleep(250);
  await sleep(300);
  check('animation resumes when the island is back in the collapsed pill', (await prop('animationPlayState')).every((s) => s === 'running'));

  await emit('media', { title: '', artist: '', app: '', playing: false }); await sleep(80);
  check('media stopped (no session): lines rest immediately', await js(`Eq.state() === 'rest'`));
  await sleep(700);
  check('media stopped: lines are back at the resting pose', (await scales()).every((v, i) => near(v, REST[i])));
  check('no media must not look like playback', await js(`!Island.manager.has('media') && Eq.state() === 'rest'`));

  /* ---------- settings ---------- */
  check('Charging sound setting exists and defaults to on', await js(`(() => { const e = document.getElementById('f_chargingSound'); return !!e && e.type === 'checkbox' && e.checked; })()`));
  check('Sound volume setting exists (0-100)', await js(`(() => { const e = document.getElementById('f_chargingSoundVolume'); return !!e && e.type === 'range' && e.min === '0' && e.max === '100'; })()`));

  /* ---------- charger connect: chime + pulse ---------- */
  check('power state is synchronised at startup', await js(`typeof Island.power === 'object' && Island.power.onAc === true`));
  const stats = () => js(`Island.chime.stats()`);
  const setSound = async (on) => { await js(`(() => { const e = document.getElementById('f_chargingSound'); e.checked = ${on}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); };
  check('no sound has played before any connect event (launch with charger plugged in)', (await stats()).plays === 0);

  const hasBattery = await js(`!!Island.battery`);
  await emit('ey:power', { onAc: true, connected: true }); await sleep(200);
  check('connecting the charger plays exactly one chime', (await stats()).plays === 1, JSON.stringify(await stats()));
  await emit('ey:power', { onAc: true, connected: true }); await sleep(100);
  check('a repeated event does not play a second chime', (await stats()).plays === 1, JSON.stringify(await stats()));
  if (hasBattery) {
    check('connecting shows the charging activity', await js(`Island.manager.has('charging') && Island.manager.get('charging').data.charging === true`));
    check('a one-shot ring plays on the charging icon', await js(`!!document.querySelector('#actSlot .v-ico.pulse')`));
    await sleep(1500);
    check('the ring disappears by itself', await js(`!document.querySelector('#actSlot .v-ico.pulse, #topSlot .v-ico.pulse')`));
    await sleep(2200);
    check('the charging feedback expires on its own', await js(`!Island.manager.has('charging')`));
  } else note('  (Battery API not available here: charging activity and ring checks skipped)');

  await emit('ey:power', { onAc: false, connected: false }); await sleep(150);
  check('disconnecting plays no sound', (await stats()).plays === 1);
  check('disconnecting updates the power state', await js(`Island.power.onAc === false`));
  check('disconnecting shows no charging animation', await js(`!document.querySelector('.v-ico.pulse') && !(Island.manager.get('charging') && Island.manager.get('charging').data.pulse)`));

  await sleep(800);
  await setSound(false);
  check('turning the setting off is saved', await js(`__test.settings().chargingSound === false`));
  await emit('ey:power', { onAc: true, connected: true }); await sleep(200);
  check('with Charging sound disabled, connecting plays nothing', (await stats()).plays === 1, JSON.stringify(await stats()));
  await emit('ey:power', { onAc: false, connected: false }); await sleep(900);
  await setSound(true);
  check('turning it back on is saved', await js(`__test.settings().chargingSound === true`));
  await emit('ey:power', { onAc: true, connected: true }); await sleep(200);
  check('re-enabled: the very next connect plays (takes effect immediately)', (await stats()).plays === 2, JSON.stringify(await stats()));
  await emit('ey:power', { onAc: false, connected: false });

  await js(`(() => { const e = document.getElementById('f_chargingSoundVolume'); e.value = 0; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  check('volume 0 is saved and plays nothing', await js(`__test.settings().chargingSoundVolume === 0`));
  await sleep(800); const before = (await stats()).plays;
  await emit('ey:power', { onAc: true, connected: true }); await sleep(150);
  check('volume 0: no chime', (await stats()).plays === before);
  await js(`(() => { const e = document.getElementById('f_chargingSoundVolume'); e.value = 60; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await emit('ey:power', { onAc: false, connected: false });

  await js(`Island.manager.complete('charging')`);
  check('opening and closing the island never plays the chime', await (async () => { const n = (await stats()).plays; await js(`Engine.openPanel()`); await sleep(500); await js(`Engine.closePanel()`); await sleep(700); return (await stats()).plays === n; })());
};

// Reduced motion: call after the page's prefers-reduced-motion has been switched on.
exports.reduced = async function reduced({ js, sleep, check }) {
  const emit = (ch, d) => js(`__test.emit(${JSON.stringify(ch)}, ${JSON.stringify(d)})`);
  const scale = (i) => js(`(() => { const m = getComputedStyle(document.querySelectorAll('#eq i')[${i}]).transform.match(/matrix\\(([^)]+)\\)/); return m ? +m[1].split(',')[3] : 1; })()`);
  check('reduced motion is detected by the renderer', await js(`Island.reduced === true`));
  await emit('media', { title: 'Song', artist: 'A', app: 'Spotify', playing: true }); await sleep(250);
  check('reduced motion: playing lines do not animate', await js(`[...document.querySelectorAll('#eq i')].every(i => getComputedStyle(i).animationName === 'none')`));
  const a = [await scale(0), await scale(1), await scale(2)]; await sleep(400); const b = [await scale(0), await scale(1), await scale(2)];
  check('reduced motion: lines hold still but show the "playing" pose', JSON.stringify(a) === JSON.stringify(b) && a.every((v, i) => v > REST[i] + 0.1), JSON.stringify(a));
  await emit('media', { title: 'Song', artist: 'A', app: 'Spotify', playing: false }); await sleep(450);
  check('reduced motion: paused returns to the resting pose', [await scale(0), await scale(1), await scale(2)].every((v, i) => Math.abs(v - REST[i]) < 0.02));
  await emit('media', { title: '', artist: '', app: '', playing: false });
};
