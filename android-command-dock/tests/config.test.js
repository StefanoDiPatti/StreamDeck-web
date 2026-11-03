const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const config = require('../server/config');
const keys = require('../server/platform/keys');

const DEFAULTS = path.join(__dirname, '..', 'config', 'defaults');
function readDefault(name) { return config.parseJson(fs.readFileSync(path.join(DEFAULTS, name + '.json'), 'utf8')); }

test('i commenti e le virgole finali sono ammessi, le stringhe restano intatte', function () {
  const parsed = config.parseJson('{\n // commento\n "url": "http://a//b", /* blocco */ "t": "x,}", "l": [1,2,],\n}');
  assert.deepStrictEqual(parsed, { url: 'http://a//b', t: 'x,}', l: [1, 2] });
});

test('tutti i file di default sono JSON validi', function () {
  ['dock', 'apps', 'commands', 'services', 'todo'].forEach(function (n) { assert.ok(readDefault(n)); });
});

test('normalizeDock assegna id e limita le dimensioni', function () {
  const d = config.normalizeDock({ grid: { columns: 4, rows: 2 }, pages: [{ id: 'a', tiles: [{ label: 'x', w: 9, h: 0 }, { id: 'k' }, { id: 'k' }] }, { id: 'a' }] });
  assert.strictEqual(d.pages.length, 1);
  const t = d.pages[0].tiles;
  assert.strictEqual(t[0].id, 'a-0');
  assert.strictEqual(t[0].w, 4);
  assert.strictEqual(t[0].h, 1);
  assert.notStrictEqual(t[1].id, t[2].id);
});

test('dock vuoto produce comunque una pagina', function () {
  assert.strictEqual(config.normalizeDock({}).pages.length, 1);
});

test('ogni pulsante di default punta ad app, comandi, pagine e tasti esistenti', function () {
  const dock = config.normalizeDock(readDefault('dock'));
  const apps = readDefault('apps').apps;
  const commands = readDefault('commands').commands;
  const pageIds = dock.pages.map(function (p) { return p.id; });
  const widgets = ['system', 'nowplaying', 'queue', 'github', 'todo', 'chat', 'clock', 'claude', 'discord', 'screens', 'mail'];
  function checkAction(a, where) {
    switch (a.type) {
      case 'launch': assert.ok(apps[a.app], where + ': app ' + a.app); break;
      case 'command': assert.ok(commands[a.id], where + ': comando ' + a.id); break;
      case 'page': assert.ok(pageIds.indexOf(a.page) >= 0, where + ': pagina ' + a.page); break;
      case 'hotkey': keys.parseCombo(a.keys); break;
      case 'key': keys.parseCombo([a.key]); break;
      case 'macro': a.steps.forEach(function (s, i) { checkAction(s, where + ' passo ' + i); }); break;
      case 'discord': assert.ok(['mute', 'deaf', 'video', 'stream'].indexOf(a.command) >= 0, where + ': discord ' + a.command); break;
      case 'media': case 'open_url': case 'text': case 'wait': case 'open_path': case 'focus': break;
      default: assert.fail(where + ': tipo sconosciuto ' + a.type);
    }
  }
  dock.pages.forEach(function (p) {
    p.tiles.forEach(function (t) {
      if (t.widget) assert.ok(widgets.indexOf(t.widget) >= 0, 'widget ' + t.widget);
      else checkAction(t.action, p.id + '/' + (t.label || t.id));
    });
  });
});

test('le pagine di default stanno nella griglia', function () {
  const dock = config.normalizeDock(readDefault('dock'));
  dock.pages.forEach(function (p) {
    const cells = p.tiles.reduce(function (n, t) { return n + t.w * t.h; }, 0);
    assert.ok(cells <= p.columns * p.rows, p.id + ' ha ' + cells + ' celle');
  });
});
