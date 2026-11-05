// Plugin host: runs the existing plugin pages (hub/plugins/*.js) INSIDE the island, with no extra window.
//
// How it works
//  - Plugin scripts and their libraries are loaded lazily, the first time a plugin is opened.
//  - Each plugin mounts into a Shadow DOM root, so the plugin stylesheet (hub/hub.css) and the island's
//    own CSS cannot affect each other. Plugin backends and IPC are unchanged.
//  - Loading, error and "unknown plugin" states are handled here, with Retry.
//  - Unmounting always runs the plugin's cleanup function (timers, listeners, streams).
(function () {
  const BASE = '../hub/';
  const FILE = {
    textExtract: 'screen', lens: 'screen', colorPicker: 'screen', draw: 'screen', coffee: 'screen',
    todo: 'todo', calendar: 'calendar', calc: 'calc', weather: 'weather', voice: 'voice', qr: 'qr', translate: 'translate',
    convert: 'convert', compress: 'compress', print: 'print', cleaner: 'cleaner', youtube: 'youtube', speed: 'speed',
    share: 'share', sysinfo: 'sysinfo', shortcuts: 'shortcuts',
  };
  const NEEDS = { share: ['qr'], convert: [], compress: [], print: [] };       // plugins that call helpers defined by another plugin file
  // Libraries needed by only some plugins are loaded on demand.
  const LIBS = { qr: ['vendor/qrcode.js', 'qr-render.js'], share: ['vendor/qrcode.js', 'qr-render.js'], calc: ['calc-engine.js'], convert: ['vendor/pdf.min.js'], compress: ['vendor/pdf.min.js'], print: ['vendor/pdf.min.js'], shortcuts: ['../shared/catalog.js'] };   // shortcuts lists every plugin, so it needs the shared catalog global

  const loaded = new Map();                // src -> Promise
  function script(src) {
    if (loaded.has(src)) return loaded.get(src);
    const p = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = BASE + src; el.async = false;
      el.onload = () => resolve(); el.onerror = () => { loaded.delete(src); reject(new Error('Could not load ' + src)); };
      document.head.append(el);
    });
    loaded.set(src, p);
    return p;
  }
  const seq = async (list) => { for (const s of list) await script(s); };

  let shadow = null, view = null, toast = null, cleanup = null, current = null, token = 0, coreReady = null, stylesReady = null;

  function build(host) {
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<link rel="stylesheet" href="' + BASE + 'hub.css"><link rel="stylesheet" href="plugin-skin.css"><div id="view"></div><div id="toast" role="status"></div>';
    view = shadow.getElementById('view'); toast = shadow.getElementById('toast');
    const links = [...shadow.querySelectorAll('link')];
    stylesReady = Promise.all(links.map((l) => new Promise((r) => { if (l.sheet) r(); else { l.addEventListener('load', r, { once: true }); l.addEventListener('error', r, { once: true }); } })));
  }

  async function core() {
    if (!coreReady) {
      window.EY_VENDOR = new URL(BASE + 'vendor/', document.baseURI).href;
      // hub.js defines the shared plugin context (ctx, Plugins, h).
      coreReady = script('hub.js').then(() => {
        ctx.S = Island.S;                                                       // one live settings object for island and plugins
        ctx.toastEl = toast;
        ctx.refreshCatalog = async () => { try { const cat = await window.api.catalog(); if (Island.registry) Island.registry.updateKeys(cat); } catch {} };
      }).catch((e) => { coreReady = null; throw e; });
    }
    return coreReady;
  }

  async function ensure(id) {
    await core();
    const file = FILE[id];
    if (!file) throw new Error('No page is available for this plugin');
    await seq(LIBS[id] || []);
    for (const dep of NEEDS[id] || []) await script('plugins/' + FILE[dep] + '.js');
    await script('plugins/' + file + '.js');
  }

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function stateView(kind, title, detail, actions) {
    view.replaceChildren();
    const box = el('div', 'state ' + kind);
    if (kind === 'loading') box.append(el('span', 'spin'));
    box.append(el('div', 'state-title', title));
    if (detail) box.append(el('div', 'state-detail', detail));
    if (actions && actions.length) { const row = el('div', 'state-actions'); actions.forEach(([label, fn, primary]) => { const b = el('button', 'btn' + (primary ? ' primary' : ''), label); b.type = 'button'; b.addEventListener('click', fn); row.append(b); }); box.append(row); }
    view.append(box);
  }

  function unmount() {
    token++;
    const fn = cleanup; cleanup = null; current = null;
    if (typeof fn === 'function') { try { fn(); } catch (e) { console.error('[plugin cleanup]', e); } }
    if (view) view.replaceChildren();
  }

  /** Mounts a registry plugin. Resolves when the plugin is on screen (or an error state is shown). */
  async function mount(plugin, hooks = {}) {
    if (!shadow) build(document.getElementById('pluginMount'));
    unmount();
    const my = token; current = plugin.id;
    stateView('loading', 'Loading ' + plugin.name);
    try {
      await stylesReady;
      await ensure(plugin.id);
      if (my !== token) return false;                                         // user navigated away while loading
      const def = Plugins.map.get(plugin.id);
      if (!def) throw new Error('This plugin did not register itself');
      view.replaceChildren(); view.scrollTop = 0;
      const result = await def.mount(view, { ...ctx, meta: plugin });
      if (my !== token) { if (typeof result === 'function') try { result(); } catch {} return false; }
      cleanup = result;
      return true;
    } catch (e) {
      if (my !== token) return false;
      console.error('[plugin]', plugin.id, e);
      if (Island.registry) Island.registry.reportError(plugin.id, e);
      stateView('error', plugin.name + ' could not load', (e && e.message) || 'Something went wrong.', [['Try again', () => mount(plugin, hooks), true], ['Back', () => hooks.onBack && hooks.onBack()]]);
      return false;
    }
  }

  window.PluginHost = { mount, unmount, isOpen: () => current !== null, currentId: () => current, supports: (id) => id in FILE };
  Island.own(unmount);
})();
