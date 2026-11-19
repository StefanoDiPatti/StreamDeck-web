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

// Finto Viber: risponde 200 con { error } come fa il vero quando il pannello non è tra le schede.
function fakeViber(t, handler) {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const http = require('http');
  const server = http.createServer(function (req, res) {
    let b = '';
    req.on('data', function (c) { b += c; });
    req.on('end', function () { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(handler(req.url, b ? JSON.parse(b) : null))); });
  });
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viber-'));
      const file = path.join(dir, 'browser-mcp.json');
      fs.writeFileSync(file, JSON.stringify({ port: server.address().port, token: 'x' }));
      const prev = process.env.VIBER_MCP_ENDPOINT;
      process.env.VIBER_MCP_ENDPOINT = file;
      t.after(function () {
        if (prev === undefined) delete process.env.VIBER_MCP_ENDPOINT; else process.env.VIBER_MCP_ENDPOINT = prev;
        server.close();
        fs.rmSync(dir, { recursive: true, force: true });
      });
      resolve();
    });
  });
}

test('Viber: errore dentro una risposta 200 diventa un errore leggibile', async function (t) {
  await fakeViber(t, function (url) {
    if (url === '/viber/focus-panel') return { error: 'Panel files is not open in this layout (it may be turned off for this project)' };
    return { layout: { leaves: [{ panels: ['terminal', 'chat'], activePanel: 'chat' }] }, worktree: { path: '/p/vibe-deck' } };
  });
  await assert.rejects(viber.focusPanel('files'), /non è tra le schede aperte in Viber/);
  const st = await viber.state();
  assert.strictEqual(st.online, true);
  assert.deepStrictEqual(st.open.sort(), ['chat', 'terminal']);
});

test('Viber: vista non valida rifiutata, viste con le scorciatoie Ctrl+Alt+1/2/3', async function () {
  await assert.rejects(viber.view('barra'), /Vista non valida/);
  assert.deepStrictEqual(viber.VIEWS, { tabs: '1', agents: '2', focus: '3' });
});
