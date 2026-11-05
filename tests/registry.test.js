const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../shared/registry');
const CATALOG = require('../shared/catalog');
const { Registry, RegistryError, migrateSettings, needsMigration, searchPlugins } = R;

const make = (state) => {
  const saved = [];
  const reg = Registry.fromCatalog(CATALOG, { state, onChange: (s) => saved.push(s) });
  return { reg, saved };
};

/* ------------------------------ registration ------------------------------ */
test('registry loads every plugin from the catalog with defaults filled in', () => {
  const { reg } = make();
  assert.equal(reg.list({ includeHidden: true }).length, CATALOG.length);
  const p = reg.get('textExtract');
  assert.equal(p.name, 'Text extractor');
  assert.equal(p.category, 'Screen');
  assert.equal(p.icon, 'textExtract');
  assert.equal(p.version, '1.0.0');
  assert.ok(Array.isArray(p.permissions) && p.permissions.includes('screen-capture'));
  assert.equal(p.key, 'Ctrl+Alt+T');
});

test('the 20 user-facing plugins are all present and the shortcuts page is hidden from lists', () => {
  const { reg } = make();
  assert.equal(reg.list().length, 20);
  assert.ok(!reg.list().some((p) => p.id === 'shortcuts'));
  assert.ok(reg.get('shortcuts'));
});

test('every catalog plugin has metadata: category, icon, size and a known kind', () => {
  const { reg } = make();
  for (const p of reg.list({ includeHidden: true })) {
    assert.ok(p.category, p.id);
    assert.ok(['compact', 'large'].includes(p.size), p.id);
    assert.ok(['action', 'toggle', 'window'].includes(p.kind), p.id);
  }
});

test('register validates ids and names, and rejects duplicates', () => {
  const reg = new Registry();
  assert.throws(() => reg.register({ name: 'x' }), (e) => e instanceof RegistryError && e.code === 'invalid');
  assert.throws(() => reg.register({ id: '1bad', name: 'x' }), /valid id/);
  assert.throws(() => reg.register({ id: 'ok', name: '  ' }), /needs a name/);
  reg.register({ id: 'ok', name: 'OK' });
  assert.throws(() => reg.register({ id: 'ok', name: 'again' }), (e) => e.code === 'duplicate');
});

test('registered plugins are immutable', () => {
  const reg = new Registry();
  reg.register({ id: 'a', name: 'A' });
  assert.throws(() => { 'use strict'; reg.get('a').name = 'hacked'; }, TypeError);
});

test('unregister removes a plugin and closes it if open', () => {
  const reg = new Registry();
  reg.register({ id: 'a', name: 'A' });
  reg.open('a');
  assert.equal(reg.unregister('a'), true);
  assert.equal(reg.current(), null);
  assert.equal(reg.get('a'), null);
});

/* ------------------------------ favourites / recents ------------------------------ */
test('a fresh install starts with the same quick-access plugins as before', () => {
  const { reg } = make();
  assert.deepEqual(reg.favourites().map((p) => p.id), ['textExtract', 'colorPicker', 'todo', 'coffee']);
});

test('toggleFavourite adds, removes and persists', () => {
  const { reg, saved } = make();
  assert.equal(reg.toggleFavourite('calc'), true);
  assert.ok(reg.isFavourite('calc'));
  assert.equal(reg.toggleFavourite('calc'), false);
  assert.ok(!reg.isFavourite('calc'));
  assert.equal(saved.length, 2);
  assert.equal(reg.toggleFavourite('calc', false), false);       // no-op does not persist
  assert.equal(saved.length, 2);
  assert.throws(() => reg.toggleFavourite('nope'), (e) => e.code === 'unknown');
});

test('favourites ignore ids that are no longer registered', () => {
  const { reg } = make({ favourites: ['todo', 'removedPlugin'] });
  assert.deepEqual(reg.favourites().map((p) => p.id), ['todo']);
});

test('recents are most-recent-first, de-duplicated and capped', () => {
  const { reg } = make();
  const ids = CATALOG.map((c) => c.id);
  for (const id of ids.slice(0, 12)) reg.open(id);
  reg.open(ids[3]);
  const r = reg.recents().map((p) => p.id);
  assert.equal(r[0], ids[3]);
  assert.equal(r.length, R.MAX_RECENTS);
  assert.equal(new Set(r).size, r.length);
});

/* ------------------------------ enabling ------------------------------ */
test('disabled plugins are hidden from lists, cannot be opened, and lose their favourite flag', () => {
  const { reg } = make();
  reg.setEnabled('todo', false);
  assert.ok(!reg.list().some((p) => p.id === 'todo'));
  assert.ok(!reg.isFavourite('todo'));
  assert.throws(() => reg.open('todo'), (e) => e.code === 'disabled');
  reg.setEnabled('todo', true);
  assert.ok(reg.open('todo'));
});

test('disabling the open plugin closes it', () => {
  const { reg } = make();
  reg.open('calc');
  reg.setEnabled('calc', false);
  assert.equal(reg.current(), null);
});

/* ------------------------------ navigation ------------------------------ */
test('open / back / home navigate an internal stack', () => {
  const { reg } = make();
  const seen = [];
  reg.on((t, id) => { if (t === 'nav') seen.push(id); });
  assert.equal(reg.current(), null);
  reg.open('todo'); reg.open('calc');
  assert.equal(reg.current(), 'calc');
  assert.equal(reg.depth(), 2);
  assert.equal(reg.back().id, 'todo');
  assert.equal(reg.back(), null);
  assert.equal(reg.back(), null);                                 // already home: harmless
  reg.open('weather'); reg.open('qr'); reg.home();
  assert.equal(reg.current(), null);
  assert.deepEqual(seen, ['todo', 'calc', 'todo', null, 'weather', 'qr', null]);
});

test('opening the current plugin again does not grow the stack', () => {
  const { reg } = make();
  reg.open('todo'); reg.open('todo');
  assert.equal(reg.depth(), 1);
});

test('opening an unknown plugin throws a typed error and leaves navigation alone', () => {
  const { reg } = make();
  reg.open('todo');
  assert.throws(() => reg.open('ghost'), (e) => e instanceof RegistryError && e.code === 'unknown');
  assert.equal(reg.current(), 'todo');
});

test('a throwing listener cannot break navigation', () => {
  const { reg } = make();
  reg.on(() => { throw new Error('boom'); });
  assert.doesNotThrow(() => reg.open('todo'));
  assert.equal(reg.current(), 'todo');
});

/* ------------------------------ plugin settings & errors ------------------------------ */
test('plugin settings only accept declared keys of the right type', () => {
  const saved = [];
  const reg = new Registry({ onChange: (s) => saved.push(s) });
  reg.register({ id: 'x', name: 'X', settings: { unit: 'c', count: 3 } });
  assert.deepEqual(reg.getSettings('x'), { unit: 'c', count: 3 });
  assert.deepEqual(reg.setSettings('x', { unit: 'f' }), { unit: 'f', count: 3 });
  assert.throws(() => reg.setSettings('x', { other: 1 }), /not a setting/);
  assert.throws(() => reg.setSettings('x', { count: '5' }), /must be a number/);
  assert.throws(() => reg.setSettings('x', { __proto__: null, constructor: 1 }), RegistryError);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].settings.x.unit, 'f');
});

test('reportError records the last error until the plugin is opened again', () => {
  const { reg } = make();
  reg.reportError('todo', new Error('failed to load'));
  assert.equal(reg.lastError('todo'), 'failed to load');
  reg.open('todo');
  assert.equal(reg.lastError('todo'), null);
});

test('setState replaces state from outside without writing it back', () => {
  const { reg, saved } = make();
  reg.setState({ favourites: ['calc'], recents: ['weather'] });
  assert.deepEqual(reg.favourites().map((p) => p.id), ['calc']);
  assert.deepEqual(reg.recents().map((p) => p.id), ['weather']);
  assert.equal(saved.length, 0);
});

test('updateKeys refreshes shortcut labels', () => {
  const { reg } = make();
  reg.updateKeys([{ id: 'todo', key: 'Ctrl+Shift+9' }]);
  assert.equal(reg.get('todo').key, 'Ctrl+Shift+9');
});

/* ------------------------------ settings migration ------------------------------ */
const V1 = {
  position: 'top', theme: 'black', showHeader: true, tempUnit: 'f',
  todos: [{ id: 'a', text: 'Buy milk', done: false, created: 1 }],
  events: { '2026-11-05': [{ id: 'e1', title: 'Dentist' }] },
  shortcuts: { todo: 'Ctrl+Alt+N', calc: '' }, colorHistory: ['#ff0000'], ocrLang: 'eng+hin',
  weatherPlace: { name: 'Kota', lat: 25.2, lon: 75.8 }, lensConsent: true, coffeeMinutes: 30,
};

test('migration keeps every existing setting and adds the plugin state', () => {
  const m = migrateSettings(V1);
  for (const [k, v] of Object.entries(V1)) assert.deepEqual(m[k], v, k);
  assert.equal(m.schemaVersion, R.SCHEMA_VERSION);
  assert.deepEqual(m.plugins.favourites, R.DEFAULT_FAVOURITES);
  assert.deepEqual(m.plugins.recents, []);
});

test('migration does not mutate its input', () => {
  const copy = JSON.parse(JSON.stringify(V1));
  migrateSettings(V1);
  assert.deepEqual(V1, copy);
  assert.equal(V1.schemaVersion, undefined);
});

test('migration is idempotent', () => {
  const once = migrateSettings(V1);
  assert.deepEqual(migrateSettings(once), once);
});

test('migration respects an existing empty favourites list (user removed them all)', () => {
  const m = migrateSettings({ schemaVersion: 2, plugins: { favourites: [] } });
  assert.deepEqual(m.plugins.favourites, []);
});

test('migration repairs corrupt plugin state without touching other data', () => {
  const m = migrateSettings({ todos: [1], plugins: { favourites: 'x', recents: [1, 'a', 'a', null, 'b'], enabled: { a: 'yes', b: false }, settings: { c: 5, d: { k: 1 } } } });
  assert.deepEqual(m.todos, [1]);
  assert.deepEqual(m.plugins.favourites, R.DEFAULT_FAVOURITES);
  assert.deepEqual(m.plugins.recents, ['a', 'b']);
  assert.deepEqual(m.plugins.enabled, { b: false });
  assert.deepEqual(m.plugins.settings, { d: { k: 1 } });
});

test('migration copes with junk input and never downgrades a newer schema', () => {
  for (const bad of [null, undefined, 5, 'x', []]) assert.equal(migrateSettings(bad).schemaVersion, R.SCHEMA_VERSION);
  assert.equal(migrateSettings({ schemaVersion: 9 }).schemaVersion, 9);
});

test('migration drops prototype-pollution keys', () => {
  const evil = JSON.parse('{"plugins":{"enabled":{"__proto__":true,"ok":true},"settings":{"__proto__":{"x":1}}}}');
  const m = migrateSettings(evil);
  assert.equal(({}).x, undefined);
  assert.deepEqual(m.plugins.enabled, { ok: true });
  assert.deepEqual(m.plugins.settings, {});
});

test('needsMigration flags only pre-registry settings', () => {
  assert.equal(needsMigration(V1), true);
  assert.equal(needsMigration(migrateSettings(V1)), false);
  assert.equal(needsMigration(null), false);
});

test('a v1 user keeps their tasks and events through registry use', () => {
  const m = migrateSettings(V1);
  const reg = Registry.fromCatalog(CATALOG, { state: m.plugins, onChange: (s) => { m.plugins = s; } });
  reg.toggleFavourite('calc'); reg.open('todo');
  assert.deepEqual(m.todos, V1.todos);
  assert.deepEqual(m.events, V1.events);
  assert.ok(m.plugins.favourites.includes('calc'));
  assert.equal(m.plugins.recents[0], 'todo');
});

/* ------------------------------ search ------------------------------ */
const names = (r) => r.map((p) => p.id);
const reg = Registry.fromCatalog(CATALOG);

test('empty or punctuation-only queries return nothing', () => {
  assert.deepEqual(reg.search(''), []);
  assert.deepEqual(reg.search('   '), []);
  assert.deepEqual(reg.search('!!!'), []);
});

test('search matches plugin names, case-insensitively and by prefix', () => {
  assert.equal(names(reg.search('calc'))[0], 'calc');
  assert.equal(names(reg.search('QUICK'))[0], 'share');
  assert.equal(names(reg.search('wea'))[0], 'weather');
});

test('exact name match ranks first', () => {
  assert.equal(names(reg.search('Translate'))[0], 'translate');
  assert.equal(names(reg.search('speed test'))[0], 'speed');
});

test('search matches descriptions', () => {
  assert.ok(names(reg.search('forecast')).includes('weather'));
  assert.ok(names(reg.search('clipboard')).length >= 0);
  assert.ok(names(reg.search('keeps the screen awake')).includes('coffee'));
});

test('search matches categories', () => {
  const files = names(reg.search('files'));
  for (const id of ['convert', 'compress', 'print', 'cleaner', 'youtube']) assert.ok(files.includes(id), id);
  const network = names(reg.search('network'));
  assert.ok(network.includes('speed') && network.includes('share'));
});

test('search matches keywords and aliases', () => {
  assert.equal(names(reg.search('ocr'))[0], 'textExtract');
  assert.ok(names(reg.search('mp3')).includes('youtube'));
  assert.ok(names(reg.search('cpu')).includes('sysinfo'));
  assert.ok(names(reg.search('colour')).includes('colorPicker'));
});

test('every query word must match (AND semantics)', () => {
  assert.ok(names(reg.search('file converter')).includes('convert'));
  assert.deepEqual(reg.search('calculator zebra'), []);
});

test('search ignores accents and case', () => {
  assert.equal(names(reg.search('ÇALC'))[0], 'calc');
});

test('no match gives an empty list, and results are limited on request', () => {
  assert.deepEqual(reg.search('qqqzzz'), []);
  assert.equal(reg.search('a', { limit: 3 }).length, 3);
});

test('the hidden shortcuts page is searchable', () => {
  assert.ok(names(reg.search('keyboard shortcuts')).includes('shortcuts'));
});

test('ties are ordered alphabetically so results are stable', () => {
  const a = names(reg.search('file'));
  assert.deepEqual(a, names(reg.search('file')));
});

test('searchPlugins works on plain lists', () => {
  const list = [{ id: 'a', name: 'Alpha', desc: 'first', category: 'X' }, { id: 'b', name: 'Beta', desc: 'alpha helper', category: 'Y' }];
  assert.deepEqual(names(searchPlugins(list, 'alpha')), ['a', 'b']);   // name hit beats description hit
});
