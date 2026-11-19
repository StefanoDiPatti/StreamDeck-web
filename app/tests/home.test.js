// HOME configurabile dal pannello: catalogo, controlli, salvataggio in layout.json e API.
// Usa cartelle temporanee: non tocca config/layout.json vero.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-home-'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_PLUGINS_DIR = path.join(tmp, 'plugins');
process.env.DOCK_TOKEN = 'TESTCODE';
process.env.LOG_LEVEL = 'error';
fs.mkdirSync(process.env.DOCK_CONFIG_DIR, { recursive: true });

const home = require('../server/home');
const config = require('../server/config');
const check = require('../server/check');
const { app } = require('../server/index.js');

let server, base;
test.before(function () {
  return new Promise(function (resolve) {
    server = app.listen(0, '127.0.0.1', function () { base = 'http://127.0.0.1:' + server.address().port; resolve(); });
  });
});
test.after(function () { server.close(); });

function control(method, p, body) {
  return fetch(base + p, { method: method, headers: { 'Content-Type': 'application/json', 'X-Dock-Control': '1' }, body: body ? JSON.stringify(body) : undefined })
    .then(function (r) { return r.json(); });
}
const mainPage = function () { return config.dock().pages.filter(function (p) { return p.id === 'main'; })[0]; };

test('catalogo: solo widget che il tablet sa disegnare', function () {
  home.CATALOG.forEach(function (c) {
    assert.ok(check.WIDGETS.indexOf(c.widget) >= 0, c.widget);
    assert.ok(c.minW <= c.w && c.minH <= c.h, c.widget + ': misura minima');
  });
  assert.ok(home.CATALOG.some(function (c) { return c.widget === 'claudeusage'; }), 'consumi di Claude');
});

test('sistemazione come il tablet: in ordine, prima cella libera', function () {
  const p = home.pack([{ w: 3, h: 2 }, { w: 3, h: 4 }, { w: 3, h: 2 }], 6, 4);
  assert.deepStrictEqual(p.placed.map(function (x) { return x.x + ',' + x.y; }), ['0,0', '3,0', '0,2']);
  assert.deepStrictEqual(p.left, []);
  assert.deepStrictEqual(home.pack([{ w: 4, h: 4 }, { w: 3, h: 1 }], 6, 4).left, [1]);
});

test('controlli: spazio, widget sconosciuti, misure minime', function () {
  assert.throws(function () { home.clean({ columns: 6, rows: 4, tiles: [] }); }, /almeno un widget/);
  assert.throws(function () { home.clean({ columns: 6, rows: 4, tiles: [{ widget: 'volare' }] }); }, /non disponibile/);
  assert.throws(function () { home.clean({ columns: 4, rows: 2, tiles: [{ widget: 'todo', w: 4, h: 2 }, { widget: 'clock', w: 1, h: 1 }] }); }, /Non c'è spazio per: Orologio/);
  const c = home.clean({ columns: 99, rows: 0, tiles: [{ widget: 'system', w: 1, h: 9 }] });
  assert.strictEqual(c.columns, 8);
  assert.strictEqual(c.rows, 2);
  assert.deepStrictEqual(c.tiles[0], { widget: 'system', w: 2, h: 2 }, 'non sotto la misura minima, non oltre la griglia');
});

test('HOME salvata: vince sulla pagina main e sopravvive alle scelte delle pagine', function () {
  config.saveHome({ columns: 6, rows: 3, tiles: [{ widget: 'claudeusage', w: 2, h: 2 }, { widget: 'github', w: 4, h: 3 }, { widget: 'clock', w: 2, h: 1 }] });
  let m = mainPage();
  assert.strictEqual(m.columns, 6);
  assert.strictEqual(m.rows, 3);
  assert.deepStrictEqual(m.tiles.map(function (t) { return t.widget + ' ' + t.w + 'x' + t.h; }), ['claudeusage 2x2', 'github 4x3', 'clock 2x1']);
  // salvare le pagine del tablet non perde la HOME
  config.saveLayout(['main', 'media'], 'main');
  m = mainPage();
  assert.strictEqual(m.tiles[0].widget, 'claudeusage');
  assert.ok(fs.readFileSync(path.join(process.env.DOCK_CONFIG_DIR, 'layout.json'), 'utf8').indexOf('"homePage"') > 0);
  // reset: torna la pagina main dei file
  config.saveHome(null);
  assert.deepStrictEqual(mainPage().tiles.map(function (t) { return t.widget; }), ['nowplaying', 'todo', 'system']);
});

test('API del pannello: info, salva, errore leggibile, ripristina', async function () {
  let r = await control('GET', '/api/control/info');
  assert.strictEqual(r.ok, true);
  const ed = r.data.homeEditor;
  assert.strictEqual(ed.custom, false);
  assert.deepStrictEqual(ed.tiles.map(function (t) { return t.widget; }), ['nowplaying', 'todo', 'system']);
  assert.ok(ed.catalog.length >= 8);

  r = await control('POST', '/api/control/home', { columns: 6, rows: 4, tiles: [{ widget: 'todo', w: 3, h: 4 }, { widget: 'claudeusage', w: 3, h: 2 }, { widget: 'system', w: 3, h: 2 }] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.homeEditor.custom, true);
  assert.strictEqual(r.data.homeEditor.tiles[1].widget, 'claudeusage');

  r = await control('POST', '/api/control/home', { columns: 3, rows: 2, tiles: [{ widget: 'discord' }] });
  assert.strictEqual(r.ok, false);

  // senza l'header del pannello: rifiutato
  const no = await fetch(base + '/api/control/home', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.strictEqual(no.status, 403);

  r = await control('POST', '/api/control/home/reset');
  assert.strictEqual(r.data.homeEditor.custom, false);
});

test('una HOME salvata non valida viene ignorata (vale la pagina main)', function () {
  assert.strictEqual(home.fromLayout({ homePage: { tiles: [{ widget: 'sparito' }] } }), null);
  const page = { id: 'main', tiles: [{ widget: 'todo' }] };
  assert.strictEqual(home.apply(page, { homePage: { tiles: [] } }), page);
});
