'use strict';
// Dock DEMO con dati finti: per screenshot e prove dell'interfaccia senza i tuoi dati.
//
//   node scripts/demo.js            -> http://127.0.0.1:8790/?t=DEMO1234
//   DEMO_PORT=9000 node scripts/demo.js
//
// Usa solo i default di config/defaults (niente config/ personale) e una cartella dati
// temporanea, e non legge il .env (niente token né account). Musica, stato del PC, TODO e sessioni di Claude Code sono inventati.
// Le pagine non simulate (Discord, schermi, audio...) mostrano quello che risponde il PC.
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-demo-'));
fs.mkdirSync(path.join(tmp, 'config'));
fs.mkdirSync(path.join(tmp, 'data'));
process.env.DOCK_CONFIG_DIR = path.join(tmp, 'config');
process.env.DOCK_DATA_DIR = path.join(tmp, 'data');
process.env.DOCK_TOKEN = process.env.DOCK_TOKEN || 'DEMO1234';
process.env.DOCK_NO_QR = '1';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
os.hostname = function () { return 'MY-PC'; };
// rete finta: link e QR del pannello non mostrano l'indirizzo vero
os.networkInterfaces = function () {
  return { Ethernet: [{ address: '192.168.1.50', netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr: '192.168.1.50/24' }] };
};
require('../server/paths').ENV_FILE = path.join(tmp, 'demo.env');   // nessun .env: niente segreti
const PORT = parseInt(process.env.DEMO_PORT, 10) || 8790;
process.env.PORT = String(PORT);   // i link del pannello usano la porta della demo

const express = require('express');
const { app: dock } = require('../server/index.js');
const auth = require('../server/auth');

const started = Date.now();
const ok = function (res, data) { res.json({ ok: true, data: data }); };
const H = 3600 * 1000;

function system() {
  const t = (Date.now() - started) / 1000;
  const wave = function (base, amp, speed) { return Math.round(base + amp * Math.sin(t / speed)); };
  return {
    hostname: 'MY-PC',
    cpu: { usage: wave(18, 6, 7), temp: 52, cores: 16, model: 'Desktop CPU' },
    ram: { usedGb: 12.4, totalGb: 32, usage: 39 },
    gpu: { name: 'Desktop GPU', usage: wave(24, 8, 5), temp: 48, memUsedGb: 2.1, memTotalGb: 8 },
    net: { downMbps: 12.6, upMbps: 1.4, downKbps: 12600, upKbps: 1400, type: 'ethernet', name: 'Ethernet', signal: null },
    uptimeSeconds: 5 * 3600 + 1234,
    at: Date.now()
  };
}

function media() {
  const duration = 214;
  return {
    supported: true, active: true, bridge: true,
    appName: 'Music', status: 'playing',
    title: 'Neon Skyline', artist: 'The Midnight Drives', album: 'Night Shift',
    duration: duration, position: (62 + (Date.now() - started) / 1000) % duration, canSeek: true,
    volume: 0.7, muted: false, canVolume: true,
    shuffle: true, canShuffle: true, repeat: 'all', canRepeat: true,
    hasArt: true, key: 'demo-art', canQueue: true, queueKey: 'demo-queue'
  };
}

const QUEUE = [
  ['Neon Skyline', 'The Midnight Drives', 214, true],
  ['Glass Highways', 'Paper Satellites', 198],
  ['After Hours', 'Luna Avenue', 241],
  ['Static Hearts', 'The Midnight Drives', 187],
  ['Ocean Radio', 'Coastline Club', 226],
  ['Slow Lights', 'Paper Satellites', 205]
];

const ART = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5c7a"/><stop offset=".55" stop-color="#7a3cff"/><stop offset="1" stop-color="#1b1f4b"/></linearGradient></defs>' +
  '<rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="230" r="90" fill="#ffd23f" opacity=".9"/>' +
  '<g fill="#1b1f4b">' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<rect x="100" y="' + (240 + i * 14) + '" width="200" height="' + (4 + i) + '"/>'; }).join('') + '</g>' +
  '<path d="M0 330 L120 250 L190 300 L280 230 L400 320 L400 400 L0 400Z" fill="#0d0f2a"/></svg>';

const NOTES = [{ id: 'n1', title: 'TODO:' }, { id: 'n2', title: 'DA COMPRARE:' }, { id: 'n3', title: 'IDEE:' }];
const todo = [
  ['n1', 'Aggiornare i driver della scheda video', false, 'high'],
  ['n1', 'Registrare il tutorial per il canale', false, 'normal'],
  ['n1', 'Backup delle foto sul NAS', true, 'normal'],
  ['n1', 'Rispondere alle email del progetto', false, 'normal'],
  ['n2', 'Cavo USB-C da 2 m', false, 'normal'],
  ['n2', 'Supporto per il tablet', false, 'normal'],
  ['n3', 'Pagina con i comandi di OBS', false, 'normal'],
  ['n3', 'Tema scuro per il blog', false, 'normal']
].map(function (t, i) {
  const g = NOTES.filter(function (n) { return n.id === t[0]; })[0];
  return { group: g.title, id: t[0] + ':' + i, text: t[1], label: '', done: t[2], priority: t[3], note: t[0] };
});

function session(id, title, project, ago, busy) {
  return { id: 'local_demo' + id, cli: 'demo' + id, title: title, cwd: '/home/demo/' + project, project: project, permissionMode: 'auto', updatedAt: Date.now() - ago, busy: !!busy, queued: false };
}

const demo = express.Router();
demo.use('/api', function (req, res, next) {
  if (req.path === '/health' || req.path === '/pair' || req.path.indexOf('/control/') === 0) return next();
  auth.requireToken(req, res, next);
});
demo.get('/api/state', function (req, res, next) {
  // versione e build vere (il tablet ricarica se cambiano), il resto finto
  const json = res.json.bind(res);
  res.json = function (body) {
    if (body && body.data) Object.assign(body.data, { system: system(), media: media(), apps: Object.assign({}, body.data.apps, { vscode: true, discord: true, claude_desktop: true, spotify: false }) });
    return json(body);
  };
  next();
});
demo.get('/api/media/art', function (req, res) { res.type('image/svg+xml').send(ART); });
demo.get('/api/media/queue', function (req, res) {
  ok(res, { available: true, items: QUEUE.map(function (q, i) { return { id: 'q' + i, title: q[0], artist: q[1], duration: q[2], current: !!q[3] }; }) });
});
demo.get('/api/todo', function (req, res) {
  ok(res, { items: todo, source: 'memo', notes: NOTES, voiceServer: false, sync: { enabled: false, ok: null, at: 0, message: '' } });
});
demo.post('/api/todo/toggle', express.json(), function (req, res) {
  todo.forEach(function (t) { if (t.id === (req.body || {}).id) t.done = !t.done; });
  ok(res, { items: todo, source: 'memo', notes: NOTES, voiceServer: false, sync: { enabled: false, ok: null, at: 0, message: '' } });
});
demo.get('/api/claude/desktop', function (req, res) {
  ok(res, {
    available: true, appUi: true,
    sections: [
      { id: 's1', name: 'Lavoro', sessions: [session(1, 'Refactoring API ordini', 'shop-api', 0.2 * H, true), session(2, 'Test end-to-end checkout', 'shop-web', 3 * H)] },
      { id: 's2', name: 'Progetti personali', sessions: [session(3, 'Stream Deck: pagina audio', 'command-dock', 26 * H), session(4, 'Blog: nuovo tema', 'blog', 50 * H), session(5, 'Script backup foto', 'scripts', 72 * H)] }
    ]
  });
});
demo.get('/api/claude/usage', function (req, res) {
  ok(res, { ok: true, fiveHour: { percent: 34, resetsAt: new Date(Date.now() + 2.5 * H).toISOString() }, sevenDay: { percent: 58, resetsAt: new Date(Date.now() + 60 * H).toISOString() }, models: [], at: Date.now() });
});
demo.get('/api/claude/chats', function (req, res) { ok(res, []); });

const server = express();
server.use(demo);
server.use(dock);
server.listen(PORT, '127.0.0.1', function () {
  console.log('Command Dock DEMO (dati finti): http://127.0.0.1:' + PORT + '/?t=' + process.env.DOCK_TOKEN);
  console.log('Pannello: http://127.0.0.1:' + PORT + '/control      Ctrl+C per fermare.');
});

function stop() {
  try { require('../server/platform').shutdown(); } catch (e) { /* niente */ }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* niente */ }
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
