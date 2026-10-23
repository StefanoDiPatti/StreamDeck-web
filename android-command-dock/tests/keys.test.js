const test = require('node:test');
const assert = require('node:assert');
const keys = require('../server/platform/keys');

test('combinazioni da array e da stringa', function () {
  assert.deepStrictEqual(keys.parseCombo(['ctrl', 'Shift', 'p']), ['CTRL', 'SHIFT', 'P']);
  assert.deepStrictEqual(keys.parseCombo('CTRL+S'), ['CTRL', 'S']);
  assert.deepStrictEqual(keys.parseCombo(['Control', 'Return']), ['CTRL', 'ENTER']);
});

test('tasto sconosciuto: errore leggibile', function () {
  assert.throws(function () { keys.parseCombo(['CTRL', 'BANANA']); }, /Tasto sconosciuto: BANANA/);
  assert.throws(function () { keys.parseCombo(null); });
});

test('codici Windows e keysym Linux', function () {
  assert.deepStrictEqual(keys.toWin(['CTRL', 'S']), [0x11, 0x53]);
  assert.deepStrictEqual(keys.toWin(['F12', 'NUM0']), [0x7B, 0x60]);
  assert.deepStrictEqual(keys.toX11(['CTRL', 'SHIFT', 'Z']), ['ctrl', 'shift', 'z']);
  assert.strictEqual(keys.KEYS.MEDIA_PLAY_PAUSE.x11, 'XF86AudioPlay');
});
