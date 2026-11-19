'use strict';
const test = require('node:test');
const assert = require('node:assert');
const viber = require('../server/services/viber');

test('Viber: pannello attivo e pannelli aperti dal layout (nomi interni tradotti)', function () {
  const s = viber._summarize({
    layout: { leaves: [{ panels: ['terminal', 'git-diff', 'chat', 'browser:abc', 'todos'], activePanel: 'git-diff' }] },
    worktree: { path: '/home/io/Progetti/StreamDeck-web/' }
  });
  assert.strictEqual(s.active, 'git');
  assert.strictEqual(s.name, 'StreamDeck-web');
  assert.deepStrictEqual(s.open.sort(), ['browser', 'chat', 'git', 'tasks', 'terminal']);
});

test('Viber: senza layout niente pannello attivo', function () {
  const s = viber._summarize({});
  assert.strictEqual(s.active, '');
  assert.deepStrictEqual(s.open, []);
});

test('Viber: pannello non valido rifiutato prima di chiamare Viber', async function () {
  await assert.rejects(viber.focusPanel('impostazioni'), /Pannello non valido/);
});
