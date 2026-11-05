// UI smoke test for the island renderer. Run with:   npx electron tests/ui/smoke.js        (Linux: xvfb-run -a npx electron --no-sandbox tests/ui/smoke.js)
// It loads the REAL renderer with a stubbed preload, so it checks layout, search, navigation and that every plugin page mounts
// inside the island. It cannot check Windows-only features or real backends.
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), OUT = process.env.SHOTS || path.join(require('os').tmpdir(), 'eyeland-shots');
fs.mkdirSync(OUT, { recursive: true });
app.disableHardwareAcceleration();
const results = []; let failed = 0;
const check = (name, ok, detail) => { results.push([ok, name, detail]); if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail && !ok ? '  -> ' + detail : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.on('unhandledRejection', (e) => { console.log('ABORTED:', e && e.message); app.exit(2); });
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 860, height: 700, show: true, backgroundColor: '#6b6b72', webPreferences: { preload: path.join(__dirname, 'preload-stub.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });   // sandbox off only so the test stub can require shared modules
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) errors.push(msg); });
  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  const js = async (code) => { try { return await win.webContents.executeJavaScript(code); } catch (e) { console.log('SCRIPT ERROR in: ' + code.slice(0, 90) + '\n  ' + e.message + '\n  console: ' + errors.slice(-3).join(' | ')); throw e; } };
  const shot = async (name) => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); };
  await sleep(600);

  /* collapsed */
  check('no permanent weather/time bar element exists', await js(`!document.querySelector('#bar, .bar')`));
  check('header lives inside the island panel', await js(`!!document.querySelector('#island .l-panel #head')`));
  check('collapsed island is the small pill', await js(`document.getElementById('island').dataset.mode === 'idle'`));
  check('collapsed header is not visible', await js(`getComputedStyle(document.querySelector('.l-panel')).visibility === 'hidden'`));
  await shot('01-collapsed');

  /* expanded home */
  await js(`Engine.openPanel()`); await sleep(900); await shot('02-expanded-home');
  check('expanded island is panel mode', await js(`document.getElementById('island').dataset.mode === 'panel'`));
  check('header shows temperature, city, time and date', await js(`(() => { const t = id => document.getElementById(id).textContent; return t('wxTemp') === '31°' && t('wxCity') === 'Kota' && /\\d/.test(t('barClock')) && t('barDate').length > 3; })()`));
  check('header is visible when expanded', await js(`getComputedStyle(document.querySelector('.l-panel')).visibility === 'visible' && document.getElementById('head').getBoundingClientRect().height > 20`));
  check('favourites show the 4 default plugins', await js(`document.querySelectorAll('#quickGrid button').length === 4`));
  check('old placeholder text is gone', await js(`!document.body.innerHTML.includes('coming soon')`));

  /* search */
  const type = (q) => js(`(() => { const i = document.getElementById('pluginSearch'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); return [...document.querySelectorAll('#searchResults .result')].map(r => r.id); })()`);
  const key = (k) => js(`document.getElementById('pluginSearch').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }))`);
  const selId = () => js(`(document.querySelector('#searchResults .result.on') || {}).id || null`);
  let r = await type('conv');
  check('search finds File converter for "conv"', r[0] === 'sr-convert', JSON.stringify(r));
  check('search hides the home cards and shows results', await js(`document.querySelector('.home').classList.contains('searching') && !document.getElementById('searchResults').hidden`));
  await shot('03-search');
  r = await type('file');
  check('search by category "file" returns several Files plugins', r.length >= 4, JSON.stringify(r));
  await key('ArrowDown'); const second = await selId();
  check('ArrowDown moves the selection', second === r[1], second);
  await key('ArrowUp'); await key('ArrowUp');
  check('ArrowUp wraps to the last result', (await selId()) === r[r.length - 1]);
  check('aria-activedescendant follows the selection', await js(`document.getElementById('pluginSearch').getAttribute('aria-activedescendant') === (document.querySelector('.result.on')||{}).id`));
  r = await type('zzzzqq');
  check('no match shows an empty state', await js(`!!document.querySelector('.results-empty')`) && r.length === 0);
  await shot('04-search-empty');
  await key('Escape');
  check('Escape clears the query and restores home', await js(`document.getElementById('pluginSearch').value === '' && !document.querySelector('.home').classList.contains('searching')`));
  await type('calc'); await key('Enter'); await sleep(900);
  check('Enter opens the selected plugin in the island', await js(`Island.registry.current() === 'calc' && PluginHost.isOpen()`));

  /* plugin view */
  check('plugin page mounted inside a shadow root in the island', await js(`!!document.getElementById('pluginMount').shadowRoot.querySelector('#view .card, #view .ph')`));
  check('no extra windows were created', BrowserWindow.getAllWindows().length === 1);
  check('header stays visible while a plugin is open', await js(`getComputedStyle(document.getElementById('head')).visibility === 'visible' && document.getElementById('barClock').textContent.length > 0`));
  check('activity area stays visible while a plugin is open', await js(`document.getElementById('topSection').getBoundingClientRect().height > 50`));
  check('island stays pinned open (Engine.isPinned)', await js(`Engine.isPinned()`));
  await shot('05-plugin-calc');
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }))`); await sleep(500);
  check('Esc goes back to the previous workspace view', await js(`document.querySelector('.tab.on').dataset.tab === 'home' && !PluginHost.isOpen() && !Engine.isPinned()`));

  /* large workspace sizing */
  await js(`Workspace.openPlugin('convert')`); await sleep(1200);
  let calls = (await js(`__test.log()`)).calls;
  check('large plugin asks the host window to grow', calls.some((c) => c[0] === 'size' && c[1] === 'large'));
  check('island panel is the larger workspace', await js(`document.getElementById('island').style.width === '780px'`));
  await shot('06-plugin-large');
  await js(`Workspace.goHome()`); await sleep(1400);
  calls = (await js(`__test.log()`)).calls;
  check('host window shrinks again after leaving the plugin', calls.filter((c) => c[0] === 'size').pop()[1] === 'compact');
  check('compact plugin (calculator) keeps the compact workspace', (async () => true)());
  await js(`Workspace.openPlugin('calc')`); await sleep(500);
  check('compact plugin keeps the compact panel width', await js(`document.getElementById('island').style.width === '560px'`));

  /* favourites + recents persist through the registry */
  await js(`document.getElementById('pFav').click()`);
  let saved = await js(`__test.settings()`);
  check('starring a plugin persists favourites in settings.plugins', saved.plugins.favourites.includes('calc'));
  check('recents are tracked', saved.plugins.recents[0] === 'calc');
  check('existing user data is untouched (tasks, weather place)', saved.todos.length === 2 && saved.weatherPlace.name.startsWith('Kota'));
  await js(`Workspace.goHome()`); await sleep(300);
  check('favourite appears in Favourites on Home', await js(`!!document.querySelector('#quickGrid [data-id="calc"]')`));

  /* every plugin page mounts inside the island */
  const ids = await js(`Island.registry.list({ includeHidden: true }).map(p => p.id)`);
  for (const id of ids) {
    const before = errors.length;
    await js(`Workspace.openPlugin(${JSON.stringify(id)})`); await sleep(450);
    if (errors.length > before) console.log('  console errors while opening ' + id + ': ' + errors.slice(before).join(' | '));
    const st = await js(`(() => { const sr = document.getElementById('pluginMount').shadowRoot; const err = sr.querySelector('.state.error'); const load = sr.querySelector('.state.loading'); return { err: err ? err.textContent : null, loading: !!load, kids: sr.getElementById('view').children.length, cur: Island.registry.current() }; })()`);
    check('plugin "' + id + '" mounts in the island', !st.err && !st.loading && st.kids > 0 && st.cur === id, JSON.stringify(st));
    if (id === 'todo') await shot('07-plugin-tasks');
    if (id === 'sysinfo') await shot('08-plugin-sysinfo');
    await js(`Workspace.goHome()`); await sleep(120);
  }
  check('still only one window after opening every plugin', BrowserWindow.getAllWindows().length === 1);

  /* unknown id + collapse */
  await js(`Workspace.openPlugin('doesNotExist')`); await sleep(200);
  check('unknown plugin id is rejected without breaking the island', await js(`!PluginHost.isOpen()`));
  await js(`Engine.closePanel()`); await sleep(900); await shot('09-collapsed-again');
  check('collapses back to the pill', await js(`document.getElementById('island').dataset.mode !== 'panel'`));
  const bad = errors.filter((m) => !/Autofill|DevTools|Electron Security Warning/i.test(m));
  check('no console errors / CSP violations', bad.length === 0, bad.slice(0, 4).join(' | '));

  console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${OUT}`);
  app.exit(failed ? 1 : 0);
});
