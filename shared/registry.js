// Central plugin registry, settings migration and plugin search.
// Pure logic: no DOM, no Electron. Loaded by the main process (settings migration) and by the
// island renderer (registry, navigation, search), and unit tested with Node.
//
// Persisted shape (settings.plugins), added by schema version 2:
//   { favourites: [id], recents: [id], enabled: { id: bool }, settings: { id: {...} } }
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PluginRegistry = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SCHEMA_VERSION = 2;
  const MAX_RECENTS = 8;
  const DEFAULT_FAVOURITES = ['textExtract', 'colorPicker', 'todo', 'coffee'];   // what Quick access showed before v2

  /* ---------------- extra metadata layered over shared/catalog.js ---------------- */
  // size: 'compact' keeps the normal island, 'large' (default) asks for the larger workspace.
  // permissions are descriptive: they document what a plugin touches. Enforcement stays in the main process.
  const META = {
    textExtract: { keywords: ['ocr', 'text recognition', 'screenshot', 'copy text', 'scan'], permissions: ['screen-capture', 'clipboard'] },
    lens: { keywords: ['image search', 'reverse image', 'google lens', 'visual search'], permissions: ['screen-capture', 'network'] },
    colorPicker: { keywords: ['colour', 'eyedropper', 'hex', 'rgb', 'hsl', 'pipette'], permissions: ['screen-capture', 'clipboard'] },
    draw: { keywords: ['annotate', 'pen', 'marker', 'sketch', 'highlight'], permissions: ['screen-overlay'] },
    translate: { keywords: ['language', 'translation', 'ocr'], permissions: ['network', 'screen-capture'] },
    todo: { keywords: ['tasks', 'to-do', 'todo', 'checklist', 'reminders'], permissions: ['storage'] },
    calendar: { keywords: ['events', 'month', 'schedule', 'date', 'agenda'], permissions: ['storage'] },
    calc: { keywords: ['calculator', 'math', 'unit converter', 'units'], permissions: [], size: 'compact' },
    weather: { keywords: ['forecast', 'temperature', 'rain', 'location', 'humidity', 'wind'], permissions: ['network', 'location'], size: 'compact' },
    voice: { keywords: ['recorder', 'microphone', 'audio', 'record', 'memo'], permissions: ['microphone', 'storage'] },
    qr: { keywords: ['qr', 'barcode', 'link', 'generate'], permissions: ['clipboard', 'files'] },
    coffee: { keywords: ['keep awake', 'caffeine', 'sleep', 'screen on', 'prevent sleep'], permissions: ['power'], size: 'compact' },
    convert: { keywords: ['converter', 'format', 'image', 'audio', 'video', 'pdf', 'mp3', 'png', 'jpg'], permissions: ['files'] },
    compress: { keywords: ['reducer', 'shrink', 'compress', 'smaller', 'size', 'zip'], permissions: ['files'] },
    print: { keywords: ['printer', 'pdf', 'paper', 'save as pdf'], permissions: ['files', 'printer'] },
    cleaner: { keywords: ['temp', 'temporary files', 'cache', 'junk', 'clean', 'disk'], permissions: ['files-delete'] },
    youtube: { keywords: ['video', 'download', 'mp3', 'mp4', 'audio', 'music'], permissions: ['network', 'files'] },
    speed: { keywords: ['speedtest', 'internet', 'ping', 'bandwidth', 'download', 'upload', 'jitter'], permissions: ['network'], size: 'compact' },
    share: { keywords: ['quickshare', 'send files', 'phone', 'wifi', 'transfer', 'receive'], permissions: ['network', 'files'] },
    sysinfo: { keywords: ['cpu', 'ram', 'memory', 'disk', 'monitor', 'performance', 'system', 'task manager'], permissions: [] },
    shortcuts: { keywords: ['keyboard', 'hotkey', 'keys', 'bindings'], permissions: ['settings'], hidden: true },
  };

  class RegistryError extends Error {
    constructor(code, message) { super(message); this.name = 'RegistryError'; this.code = code; }
  }

  /* ---------------- helpers ---------------- */
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const idList = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x))] : []);
  const SAFE_KEY = (k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype';
  const boolMap = (v) => { const o = {}; if (isObj(v)) for (const [k, x] of Object.entries(v)) if (SAFE_KEY(k) && typeof x === 'boolean') o[k] = x; return o; };
  const objMap = (v) => { const o = {}; if (isObj(v)) for (const [k, x] of Object.entries(v)) if (SAFE_KEY(k) && isObj(x)) o[k] = { ...x }; return o; };

  /* ---------------- settings migration ---------------- */
  // True when a stored settings object predates the registry (so a backup is worth making first).
  function needsMigration(stored) {
    return isObj(stored) && !(Number.isInteger(stored.schemaVersion) && stored.schemaVersion >= SCHEMA_VERSION);
  }

  // Returns a NEW object. Every existing key (tasks, events, shortcuts, weather place, ...) is carried over untouched.
  // Only `plugins` and `schemaVersion` are added or normalised. Idempotent. Never downgrades a newer schemaVersion.
  function migrateSettings(input) {
    const s = isObj(input) ? { ...input } : {};
    const from = Number.isInteger(s.schemaVersion) ? s.schemaVersion : 1;
    const p = isObj(s.plugins) ? s.plugins : {};
    s.plugins = {
      ...p,                                                         // keep unknown future keys
      favourites: Array.isArray(p.favourites) ? idList(p.favourites) : [...DEFAULT_FAVOURITES],
      recents: idList(p.recents).slice(0, MAX_RECENTS),
      enabled: boolMap(p.enabled),
      settings: objMap(p.settings),
    };
    s.schemaVersion = Math.max(from, SCHEMA_VERSION);
    return s;
  }

  /* ---------------- search ---------------- */
  const fold = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = (t) => fold(t).split(/[^a-z0-9]+/).filter(Boolean);

  // Scores a plugin against the query. Every query word must match something, otherwise the plugin is excluded.
  function scorePlugin(p, tokens, whole) {
    const name = fold(p.name), nameW = words(p.name), id = fold(p.id), cat = fold(p.category);
    const descW = words(p.desc), kw = (p.keywords || []).map(fold);
    let total = 0;
    if (name === whole) total += 20;
    for (const t of tokens) {
      let best = 0;
      if (nameW.some((w) => w === t)) best = Math.max(best, 14);
      if (nameW.some((w) => w.startsWith(t))) best = Math.max(best, 12);
      if (name.includes(t)) best = Math.max(best, 8);
      if (id === t) best = Math.max(best, 10);
      else if (id.includes(t)) best = Math.max(best, 4);
      if (kw.some((k) => k === t || k.split(/\s+/).some((w) => w.startsWith(t)))) best = Math.max(best, 7);
      else if (kw.some((k) => k.includes(t))) best = Math.max(best, 5);
      if (cat.startsWith(t)) best = Math.max(best, 5);
      if (descW.some((w) => w.startsWith(t))) best = Math.max(best, 3);
      else if (fold(p.desc).includes(t)) best = Math.max(best, 2);
      if (!best) return 0;
      total += best;
    }
    return total;
  }

  // Searches plugin names, descriptions, categories (and keywords/ids). Empty query returns [].
  function searchPlugins(list, query, opts = {}) {
    const tokens = words(query);
    if (!tokens.length) return [];
    const whole = fold(query).trim();
    const out = [];
    for (const p of list) { const s = scorePlugin(p, tokens, whole); if (s > 0) out.push({ p, s }); }
    out.sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name));
    const r = out.map((x) => x.p);
    return opts.limit ? r.slice(0, opts.limit) : r;
  }

  /* ---------------- registry ---------------- */
  class Registry {
    /**
     * @param {object} [o]
     * @param {object} [o.state]      settings.plugins (favourites, recents, enabled, settings)
     * @param {(state:object)=>void} [o.onChange]  called whenever persisted state changes
     */
    constructor(o = {}) {
      this.plugins = new Map();
      this.stack = [];                      // navigation: ids of open plugins, last is current
      this.errors = new Map();
      this.listeners = new Set();
      this.onChange = o.onChange || (() => {});
      this.state = migrateSettings({ plugins: o.state }).plugins;
    }

    /** Build from the shared catalog (+ META). `catalog` rows: { id, name, group, kind, key, desc }. */
    static fromCatalog(catalog, o = {}) {
      const r = new Registry(o);
      for (const c of catalog) r.register(Registry.fromCatalogEntry(c));
      return r;
    }
    static fromCatalogEntry(c) {
      const m = META[c.id] || {};
      return {
        id: c.id, name: c.name, desc: c.desc || '', category: c.group || 'Other', kind: c.kind || 'window',
        icon: c.id, version: m.version || '1.0.0', key: c.key || '', size: m.size || 'large',
        keywords: m.keywords || [], permissions: m.permissions || [], hidden: !!m.hidden, settings: m.settings || null,
      };
    }

    /* -- registration & lookup -- */
    register(def) {
      if (!isObj(def) || typeof def.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(def.id)) throw new RegistryError('invalid', 'Plugin needs a valid id');
      if (typeof def.name !== 'string' || !def.name.trim()) throw new RegistryError('invalid', `Plugin "${def.id}" needs a name`);
      if (this.plugins.has(def.id)) throw new RegistryError('duplicate', `Plugin "${def.id}" is already registered`);
      const p = {
        desc: '', category: 'Other', kind: 'window', icon: def.id, version: '1.0.0', key: '', size: 'large',
        keywords: [], permissions: [], hidden: false, settings: null, ...def,
      };
      if (!['compact', 'large'].includes(p.size)) p.size = 'large';
      this.plugins.set(p.id, Object.freeze(p));
      this._emit('register', p.id);
      return p;
    }
    unregister(id) {
      if (this.stack.includes(id)) this._pop(id);
      const had = this.plugins.delete(id);
      if (had) this._emit('unregister', id);
      return had;
    }
    has(id) { return this.plugins.has(id); }
    get(id) { return this.plugins.get(id) || null; }
    /** Plugins that are enabled (or all, with includeDisabled). */
    list(o = {}) {
      return [...this.plugins.values()].filter((p) => (o.includeDisabled || this.isEnabled(p.id)) && (o.includeHidden || !p.hidden) && (!o.category || p.category === o.category));
    }
    categories() { return [...new Set(this.list().map((p) => p.category))]; }
    /** Updates the shortcut labels after the user changed a key binding. */
    updateKeys(catalog) {
      for (const c of catalog) { const p = this.plugins.get(c.id); if (p && p.key !== (c.key || '')) this.plugins.set(c.id, Object.freeze({ ...p, key: c.key || '' })); }
      this._emit('keys');
    }

    /* -- enabled state -- */
    isEnabled(id) { return this.state.enabled[id] !== false; }
    setEnabled(id, on) {
      if (!this.plugins.has(id)) throw new RegistryError('unknown', `Unknown plugin "${id}"`);
      this.state = { ...this.state, enabled: { ...this.state.enabled, [id]: !!on } };
      if (!on) { this.state.favourites = this.state.favourites.filter((x) => x !== id); if (this.stack.includes(id)) this._pop(id); }
      this._persist();
    }

    /* -- favourites & recents -- */
    isFavourite(id) { return this.state.favourites.includes(id); }
    favourites() { return this.state.favourites.map((id) => this.plugins.get(id)).filter((p) => p && this.isEnabled(p.id)); }
    toggleFavourite(id, force) {
      const p = this.plugins.get(id);
      if (!p) throw new RegistryError('unknown', `Unknown plugin "${id}"`);
      const has = this.isFavourite(id), want = typeof force === 'boolean' ? force : !has;
      if (want === has) return has;
      this.state = { ...this.state, favourites: want ? [...this.state.favourites, id] : this.state.favourites.filter((x) => x !== id) };
      this._persist();
      return want;
    }
    recents() { return this.state.recents.map((id) => this.plugins.get(id)).filter((p) => p && this.isEnabled(p.id)); }
    markUsed(id) {
      if (!this.plugins.has(id)) return;
      if (this.state.recents[0] === id) return;
      this.state = { ...this.state, recents: [id, ...this.state.recents.filter((x) => x !== id)].slice(0, MAX_RECENTS) };
      this._persist();
    }

    /* -- plugin settings (only keys declared in the plugin's `settings` defaults are accepted) -- */
    getSettings(id) {
      const p = this.plugins.get(id);
      if (!p) throw new RegistryError('unknown', `Unknown plugin "${id}"`);
      return { ...(p.settings || {}), ...(this.state.settings[id] || {}) };
    }
    setSettings(id, patch) {
      const p = this.plugins.get(id);
      if (!p) throw new RegistryError('unknown', `Unknown plugin "${id}"`);
      if (!isObj(patch)) throw new RegistryError('invalid', 'Settings patch must be an object');
      const defs = p.settings || {}, next = { ...(this.state.settings[id] || {}) };
      for (const [k, v] of Object.entries(patch)) {
        if (!SAFE_KEY(k) || !(k in defs)) throw new RegistryError('invalid', `"${k}" is not a setting of ${id}`);
        if (typeof v !== typeof defs[k]) throw new RegistryError('invalid', `"${k}" must be a ${typeof defs[k]}`);
        next[k] = v;
      }
      this.state = { ...this.state, settings: { ...this.state.settings, [id]: next } };
      this._persist();
      return this.getSettings(id);
    }

    /* -- activation & internal navigation -- */
    current() { return this.stack.length ? this.stack[this.stack.length - 1] : null; }
    depth() { return this.stack.length; }
    /** Open a plugin in the workspace. Throws RegistryError('unknown' | 'disabled'). */
    open(id) {
      const p = this.plugins.get(id);
      if (!p) throw new RegistryError('unknown', `Unknown plugin "${id}"`);
      if (!this.isEnabled(id)) throw new RegistryError('disabled', `${p.name} is turned off`);
      if (this.current() !== id) { this.stack.push(id); }
      this.errors.delete(id);
      this.markUsed(id);
      this._emit('nav', id);
      return p;
    }
    /** Go back one step. Returns the plugin now current, or null when back at the workspace. */
    back() {
      if (!this.stack.length) return null;
      const left = this.stack.pop();
      this._emit('leave', left);
      this._emit('nav', this.current());
      return this.current() ? this.plugins.get(this.current()) : null;
    }
    home() {
      const left = this.stack.splice(0);
      left.reverse().forEach((id) => this._emit('leave', id));
      this._emit('nav', null);
    }
    _pop(id) { this.stack = this.stack.filter((x) => x !== id); this._emit('leave', id); this._emit('nav', this.current()); }

    /* -- error handling -- */
    reportError(id, err) { this.errors.set(id, String((err && err.message) || err || 'Unknown error')); this._emit('error', id); }
    lastError(id) { return this.errors.get(id) || null; }

    /* -- search -- */
    search(query, opts) { return searchPlugins(this.list({ includeHidden: true }), query, opts); }

    /* -- state sync -- */
    /** Replace persisted state from outside (settings changed elsewhere) without writing it back. */
    setState(state) { this.state = migrateSettings({ plugins: state }).plugins; this._emit('state'); }
    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    _emit(type, id) { for (const fn of [...this.listeners]) { try { fn(type, id); } catch (e) { /* a bad listener must not break navigation */ } } }
    _persist() { this._emit('state'); try { this.onChange(this.state); } catch (e) { /* persistence errors are the caller's to report */ } }
  }

  return { Registry, RegistryError, migrateSettings, needsMigration, searchPlugins, META, SCHEMA_VERSION, DEFAULT_FAVOURITES, MAX_RECENTS };
});
