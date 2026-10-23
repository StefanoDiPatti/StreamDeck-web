// Command Dock - server principale.
// Avvio consigliato: start.bat (Windows) / start.sh (Linux), che installano
// le dipendenze al primo avvio. Avvio diretto: node server/index.js
const os = require('os');
const path = require('path');
require('./env').loadEnv();

const express = require('express');
const paths = require('./paths');
const log = require('./log');
const config = require('./config');
const auth = require('./auth');
const platform = require('./platform');
const actions = require('./actions');
const system = require('./services/system');
const media = require('./services/media');
const github = require('./services/github');
const ollama = require('./services/ollama');
const claude = require('./services/claude');
const todo = require('./services/todo');
const pkg = require('../package.json');

const PORT = parseInt(process.env.PORT, 10) || 8787;
const HOST = process.env.HOST || '0.0.0.0';

config.ensureUserConfig();

const app = express();
app.disable('x-powered-by');
app.use(auth.lanOnly);
app.use(express.json({ limit: '64kb' }));

// --- risposte standard { ok, data } / { ok:false, error:{ code, message } } ---
function ok(res, data) { res.json({ ok: true, data: data === undefined ? null : data }); }
function sendError(res, e) {
  const map = { BAD_REQUEST: 400, BAD_CONFIG: 400, UNKNOWN_ACTION: 400, NOT_FOUND: 404, CONFIG_CHANGED: 409, BUSY: 409, TOO_LONG: 409, UNAVAILABLE: 503, UNSUPPORTED: 501 };
  const code = e.code && map[e.code] ? e.code : 'ACTION_FAILED';
  res.status(map[code] || 500).json({ ok: false, error: { code: code, message: e.message || 'Errore' } });
}
// Avvolge gli handler async: qualsiasi eccezione diventa una risposta leggibile.
function route(fn) {
  return function (req, res) {
    Promise.resolve().then(function () { return fn(req, res); }).then(function (data) {
      if (!res.headersSent) ok(res, data);
    }).catch(function (e) {
      if (!e.code) log.error('api', req.method + ' ' + req.path + ': ' + (e.stack || e.message));
      if (!res.headersSent) sendError(res, e);
    });
  };
}
function badRequest(msg) { return Object.assign(new Error(msg), { code: 'BAD_REQUEST' }); }

// --- pubblico (senza token) ---
app.use(auth.tokenFromQuery);
app.get('/api/health', function (req, res) {
  ok(res, { name: 'command-dock', version: pkg.version, platform: platform.name, paired: auth.isAuthorized(req) });
});
app.post('/api/pair', auth.pairHandler);
app.use(express.static(paths.PUBLIC_DIR, {
  setHeaders: function (res) {
    // Sempre rivalidato (ETag): dopo un aggiornamento il tablet non usa file vecchi
    res.setHeader('Cache-Control', 'no-cache');
  }
}));

// --- tutto il resto richiede il token ---
app.use('/api', auth.requireToken);

app.get('/api/config', route(function () {
  return {
    version: config.version(),
    dock: config.dock(),
    capabilities: platform.capabilities(),
    platform: platform.name,
    hostname: os.hostname(),
    claude: claude.info(),
    errors: config.errors()
  };
}));

// Stato veloce per il polling (ogni 2s): sistema + musica.
app.get('/api/state', route(async function () {
  const now = await media.nowPlaying();
  return { version: config.version(), system: system.get(), media: now, time: Date.now() };
}));

app.post('/api/press', route(function (req) {
  const b = req.body || {};
  if (b.version && b.version !== config.version()) {
    throw Object.assign(new Error('Configurazione aggiornata, ricarico...'), { code: 'CONFIG_CHANGED' });
  }
  if (typeof b.page !== 'string' || typeof b.tile !== 'string') throw badRequest('page e tile richiesti');
  return actions.press(b.page, b.tile);
}));

app.post('/api/media', route(function (req) { return media.command(String((req.body || {}).command || '')); }));

app.get('/api/media/art', function (req, res) {
  media.artwork().then(function (art) {
    if (!art) return res.status(404).end();
    res.setHeader('Content-Type', art.mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(art.data);
  }).catch(function () { res.status(404).end(); });
});

app.get('/api/github', route(function (req) { return github.summary(req.query.refresh === '1'); }));
app.post('/api/github/open', route(async function (req) {
  const b = req.body || {};
  const url = github.urlFor(String(b.repo || ''), String(b.what || ''));
  if (!url) throw Object.assign(new Error('Repository sconosciuto'), { code: 'NOT_FOUND' });
  await platform.open(url);
  return { message: 'Aperto sul PC' };
}));

app.get('/api/todo', route(function () { return { items: todo.list() }; }));
app.post('/api/todo/add', route(function (req) { return { item: todo.add((req.body || {}).text, (req.body || {}).priority) }; }));
app.post('/api/todo/toggle', route(function (req) { return { item: todo.toggle((req.body || {}).id) }; }));
app.post('/api/todo/remove', route(function (req) { todo.remove((req.body || {}).id); return { items: todo.list() }; }));
app.post('/api/todo/clear', route(function () { return { removed: todo.clearDone(), items: todo.list() }; }));

app.get('/api/ollama/models', route(function () { return ollama.models(); }));
app.post('/api/ollama/chat', route(function (req) {
  const b = req.body || {};
  if (!b.text || !String(b.text).trim()) throw badRequest('Messaggio vuoto');
  return ollama.chat(b.sessionId, String(b.model || ''), String(b.text).slice(0, 8000));
}));

app.get('/api/claude/info', route(function () { return claude.info(); }));
app.post('/api/claude/chat', route(function (req) {
  const b = req.body || {};
  if (!b.text || !String(b.text).trim()) throw badRequest('Messaggio vuoto');
  return claude.chat(b.sessionId, String(b.text).slice(0, 8000));
}));

app.use('/api', function (req, res) {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Endpoint inesistente' } });
});

// --- avvio ---
function lanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function (name) {
    if (/vEthernet|VirtualBox|VMware|WSL|docker|br-|virbr|veth|Loopback|tailscale|zerotier/i.test(name)) return;
    (ifaces[name] || []).forEach(function (d) {
      if ((d.family === 'IPv4' || d.family === 4) && !d.internal && auth.isPrivateIp(d.address)) out.push({ name: name, address: d.address });
    });
  });
  return out;
}

function banner() {
  const ips = process.env.SERVER_IP ? [{ name: 'SERVER_IP', address: process.env.SERVER_IP }] : lanAddresses();
  const token = (process.env.DOCK_TOKEN || '').trim();
  const line = '─'.repeat(52);
  console.log('\n' + line);
  console.log('  COMMAND DOCK ' + pkg.version + '   (' + platform.name + ', porta ' + PORT + ')');
  console.log(line);
  if (!ips.length) console.log('  Nessuna rete locale trovata: il tablet non potrà collegarsi.');
  ips.forEach(function (ip, i) {
    const url = 'http://' + ip.address + ':' + PORT;
    console.log((i === 0 ? '  Apri sul tablet:  ' : '  oppure:          ') + url + '   (' + ip.name + ')');
  });
  if (token) {
    console.log('  Codice di accesso: ' + token);
    if (ips[0]) console.log('  Link diretto (salva il codice):  http://' + ips[0].address + ':' + PORT + '/?t=' + token);
  } else {
    console.log('  ATTENZIONE: DOCK_TOKEN vuoto, chiunque in rete può usare la dock.');
  }
  const caps = platform.capabilities();
  (caps.notes || []).forEach(function (n) { console.log('  Nota: ' + n); });
  const ci = claude.info();
  console.log('  Claude: ' + (ci.available ? ci.backend + ' (' + ci.model + ')' : 'non configurato'));
  config.errors().forEach(function (e) { console.log('  ERRORE CONFIG: ' + e); });
  console.log(line);
  console.log('  Ctrl+C per fermare.\n');
}

function start() {
  return platform.init().catch(function (e) {
    log.error('platform', 'avvio backend ' + platform.name + ' non riuscito: ' + e.message);
  }).then(function () {
    return new Promise(function (resolve, reject) {
      const server = app.listen(PORT, HOST, function () { banner(); resolve(server); });
      server.on('error', function (e) {
        if (e.code === 'EADDRINUSE') log.error('server', 'La porta ' + PORT + ' è già in uso: la dock è già avviata? (cambia PORT nel .env)');
        reject(e);
      });
    });
  });
}

function shutdown() {
  system.stop();
  platform.shutdown();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
  start().catch(function () { process.exit(1); });
}

module.exports = { app: app, start: start };
