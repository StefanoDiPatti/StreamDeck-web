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
const todosync = require('./services/todosync');
const desktopcode = require('./services/desktopcode');
const mixer = require('./services/mixer');
const bridge = require('./services/bridge');
const voice = require('./services/voice');
const appsState = require('./services/apps');
const discord = require('./services/discord');
const screens = require('./services/screens');
const vdesk = require('./services/vdesk');
const viber = require('./services/viber');
const pairing = require('./services/pairing');
const mail = require('./services/mail');
const pkg = require('../package.json');

const PORT = parseInt(process.env.PORT, 10) || 8787;
const HOST = process.env.HOST || '0.0.0.0';

config.ensureUserConfig();
config.upgradeUserConfig().forEach(function (f) { log.info('config', f + ' aggiornato alla nuova versione predefinita (non era stato modificato)'); });

const app = express();
app.disable('x-powered-by');
app.use(auth.lanOnly);
app.use(express.json({ limit: '64kb' }));

// --- risposte standard { ok, data } / { ok:false, error:{ code, message } } ---
function ok(res, data) { res.json({ ok: true, data: data === undefined ? null : data }); }
function sendError(res, e) {
  const map = { UNAUTHORIZED: 409, BAD_REQUEST: 400, BAD_CONFIG: 400, UNKNOWN_ACTION: 400, NOT_FOUND: 404, CONFIG_CHANGED: 409, BUSY: 409, TOO_LONG: 409, UNAVAILABLE: 503, UNSUPPORTED: 501 };
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

// La pagina del tablet: a ogni file JS/CSS si aggiunge ?v=<data di modifica>.
// I browser di Android 4 a volte ignorano "no-cache" e tengono i file vecchi:
// cambiando l'indirizzo dopo ogni aggiornamento sono costretti a riscaricarli.
// Versione del client = data di modifica più recente dei suoi file.
// Il tablet la confronta a ogni aggiornamento di stato e si ricarica se cambia.
let buildCache = { at: 0, value: '' };
function clientBuild() {
  if (Date.now() - buildCache.at < 3000) return buildCache.value;
  const fs = require('fs');
  let max = 0;
  ['index.html', 'css', 'js'].forEach(function (p) {
    const full = path.join(paths.PUBLIC_DIR, p);
    try {
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        fs.readdirSync(full).forEach(function (f) { max = Math.max(max, fs.statSync(path.join(full, f)).mtimeMs); });
      } else max = Math.max(max, st.mtimeMs);
    } catch (e) { /* ignora */ }
  });
  buildCache = { at: Date.now(), value: Math.round(max).toString(36) };
  return buildCache.value;
}

function versionedIndex() {
  const fs = require('fs');
  const html = fs.readFileSync(path.join(paths.PUBLIC_DIR, 'index.html'), 'utf8')
    .replace('<head>', '<head>\n  <meta name="dock-build" content="' + clientBuild() + '">');
  return html.replace(/(src|href)="((?:js|css)\/[^"?]+)"/g, function (m, attr, file) {
    let v = '0';
    try { v = Math.round(fs.statSync(path.join(paths.PUBLIC_DIR, file)).mtimeMs).toString(36); } catch (e) { /* file mancante */ }
    return attr + '="' + file + '?v=' + v + '"';
  });
}
app.get(['/', '/index.html'], function (req, res) {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.type('html').send(versionedIndex());
});
app.use(express.static(paths.PUBLIC_DIR, {
  index: false,
  setHeaders: function (res) {
    // Sempre rivalidato (ETag); in più l'indirizzo cambia a ogni aggiornamento
    res.setHeader('Cache-Control', 'no-cache');
  }
}));

// --- estensione del browser (stesso PC, niente token) ---
// Accettata solo da 127.0.0.1 e con l'header X-Dock-Bridge: un sito web
// aperto nel browser non può impostarlo senza un preflight CORS, che qui non passa.
function bridgeOnly(req, res, next) {
  const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if ((ip === '127.0.0.1' || ip === '::1') && req.get('x-dock-bridge') === '1') return next();
  res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Solo per l\'estensione su questo PC' } });
}
app.post('/api/bridge/state', bridgeOnly, function (req, res) {
  const b = req.body || {};
  ok(res, { commands: bridge.update(String(b.key || ''), b.state) });
});
app.post('/api/bridge/closed', bridgeOnly, function (req, res) {
  bridge.remove(String((req.body || {}).key || ''));
  ok(res, null);
});

// --- pannello di controllo (solo da questo PC) ---
// Si apre con il doppio clic sull'icona Command Dock. Le API vogliono anche
// l'header X-Dock-Control, così un sito aperto nel browser non può usarle.
function isLoopback(req) {
  const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1';
}
function localPage(req, res, next) {
  if (isLoopback(req)) return next();
  res.status(403).type('text').send('Il pannello di controllo si apre solo sul PC della dock.');
}
function controlOnly(req, res, next) {
  if (isLoopback(req) && req.get('x-dock-control') === '1') return next();
  res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Solo dal pannello di controllo su questo PC' } });
}
app.get(['/control', '/control/'], localPage, function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(paths.CONTROL_DIR, 'index.html'));
});
app.use('/control', localPage, express.static(paths.CONTROL_DIR, { index: false, setHeaders: function (res) { res.setHeader('Cache-Control', 'no-cache'); } }));

// Riassunto di una pagina per il pannello: cosa contiene.
const WIDGET_NAMES = { mail: 'email', system: 'stato PC', nowplaying: 'musica', queue: 'coda', github: 'GitHub', todo: 'TODO', clock: 'orologio', claude: 'Claude', chat: 'chat', discord: 'Discord', screens: 'schermi e finestre', audio: 'audio' };
function pageSummary(p) {
  const widgets = [], buttons = [];
  p.tiles.forEach(function (t) {
    if (t.widget) widgets.push(t.widget === 'chat' && t.provider ? t.provider : (WIDGET_NAMES[t.widget] || t.widget));
    else if (t.label) buttons.push(t.label);
  });
  let auto = '';
  if (widgets.length) auto = widgets.join(', ');
  if (buttons.length) auto += (auto ? ' + ' : '') + buttons.length + ' pulsanti (' + buttons.slice(0, 4).join(', ') + (buttons.length > 4 ? '…' : '') + ')';
  return { id: p.id, title: p.title, icon: p.icon, tab: p.tab, description: p.description || auto, contents: auto };
}
// Pulsanti di una pagina modificabile dal pannello: tutti (anche nascosti) e quelli mostrati in ordine.
function pageButtons(p) {
  const btn = function (t) { return { id: t.id, label: t.label || '', sub: t.sub || '', icon: t.icon || null, color: t.color || null, w: t.w || 1, h: t.h || 1 }; };
  return { id: p.id, title: p.title, icon: p.icon, columns: p.columns, rows: p.rows, all: p.allTiles.map(btn), shown: p.tiles.map(function (t) { return t.id; }) };
}
function controlInfo() {
  const d = config.dock();
  let urls = [];
  try { urls = JSON.parse(require('fs').readFileSync(path.join(paths.DATA_DIR, 'runtime.json'), 'utf8')).urls || []; } catch (e) { urls = []; }
  return {
    pages: d.pages.map(pageSummary),
    buttons: d.pages.filter(function (p) { return p.editable; }).map(pageButtons),
    tabs: d.pages.filter(function (p) { return p.tab; }).map(function (p) { return p.id; }),
    home: d.home,
    custom: !!(config.get('layout') || {}).tabs,
    discord: discord.panelInfo(),
    tablet: urls,
    pairing: pairing.links(PORT),
    mail: mail.panelInfo(),
    version: pkg.version,
    platform: platform.name
  };
}
// QR di uno dei link di collegamento (solo quelli della dock, niente testo libero)
app.get('/api/control/qr', controlOnly, route(async function (req) {
  const link = String(req.query.link || '');
  const ok = pairing.links(PORT).some(function (l) { return l.link === link; });
  if (!ok) throw Object.assign(new Error('Link sconosciuto'), { code: 'BAD_REQUEST' });
  return { link: link, svg: await pairing.svg(link) };
}));
app.get('/api/control/info', controlOnly, route(async function () { await discord.ensure(); return controlInfo(); }));
app.post('/api/control/layout', controlOnly, route(function (req) {
  const b = req.body || {};
  config.saveLayout(b.tabs, b.home, b.tiles);
  log.info('control', 'pagine del tablet: ' + b.tabs.join(', '));
  return controlInfo();
}));
app.post('/api/control/layout/reset', controlOnly, route(function () { config.resetLayout(); return controlInfo(); }));
app.post('/api/control/discord', controlOnly, route(async function (req) {
  const b = req.body || {};
  await discord.setup(b.clientId, b.clientSecret);
  return controlInfo();
}));
app.post('/api/control/discord/authorize', controlOnly, route(async function () { await discord.authorize(); return controlInfo(); }));
app.post('/api/control/mail', controlOnly, route(async function (req) { await mail.addAccount(req.body || {}); return controlInfo(); }));
app.post('/api/control/mail/remove', controlOnly, route(function (req) { mail.removeAccount(String((req.body || {}).id || '')); return controlInfo(); }));
app.post('/api/control/mail/login', controlOnly, route(async function (req) { await mail.relogin(String((req.body || {}).id || '')); return controlInfo(); }));
app.post('/api/control/discord/logout', controlOnly, route(function () { discord.logout(); return controlInfo(); }));

// --- tutto il resto richiede il token ---
app.use('/api', auth.requireToken);

// --- Email (tablet): solo lettura, gli account si scelgono dal pannello ---
app.get('/api/mail', route(function () { return mail.state(); }));
app.get('/api/mail/list', route(function (req) { return mail.list(String(req.query.account || ''), req.query.refresh === '1'); }));
app.get('/api/mail/message', route(function (req) { return mail.message(String(req.query.account || ''), req.query.uid); }));
app.post('/api/mail/open', route(function (req) { return mail.openWebmail(String((req.body || {}).account || '')); }));

// --- Discord (tablet) ---
app.get('/api/discord/state', route(async function () { await discord.ensure(); return discord.state(); }));
app.get('/api/discord/guilds', route(function (req) { return discord.guilds(req.query.refresh === '1'); }));
app.get('/api/discord/channels', route(function (req) { return discord.channels(String(req.query.guild || '')); }));
// what: mute | deaf | video (webcam) | stream (Go Live del gioco aperto)
app.post('/api/discord/toggle', route(function (req) {
  const what = String((req.body || {}).what || '');
  if (['mute', 'deaf', 'video', 'stream'].indexOf(what) < 0) throw badRequest('Comando non valido');
  return actions.execute({ type: 'discord', command: what });
}));
app.post('/api/discord/join', route(function (req) {
  const c = (req.body || {}).channel;
  return discord.join(c === null || c === undefined || c === '' ? null : String(c));
}));
app.post('/api/discord/user', route(function (req) {
  const b = req.body || {};
  return discord.userVoice(String(b.user || ''), { mute: typeof b.mute === 'boolean' ? b.mute : undefined, volume: typeof b.volume === 'number' ? b.volume : undefined });
}));
app.get('/api/discord/img', function (req, res) {
  discord.image(String(req.query.p || '')).then(function (im) {
    res.setHeader('Cache-Control', 'max-age=86400');
    res.type(im.type).send(im.body);
  }).catch(function () { res.status(404).end(); });
});

// --- Audio: dispositivi e volume delle app ---
app.get('/api/audio', route(function () { return mixer.state(); }));
app.post('/api/audio/default', route(function (req) { return mixer.setDefault(String((req.body || {}).id || '')); }));
app.post('/api/audio/device', route(function (req) { const b = req.body || {}; return mixer.device(String(b.id || ''), b); }));
app.post('/api/audio/app', route(function (req) { const b = req.body || {}; return mixer.app(String(b.id || ''), b); }));

// --- Schermi: monitor, finestre e disposizioni ---
app.get('/api/screens', route(function () { return screens.info(); }));
app.get('/api/screens/windows', route(function () { return screens.windows(); }));
app.post('/api/screens/target', route(function (req) {
  const m = (req.body || {}).monitor;
  return screens.setTarget(m === null || m === undefined || m === '' ? null : String(m));
}));
app.post('/api/screens/place', route(function (req) {
  const b = req.body || {};
  return screens.place(String(b.window || ''), String(b.monitor || ''), String(b.layout || ''), b.zone);
}));
app.post('/api/screens/window', route(function (req) {
  const b = req.body || {};
  return screens.act(String(b.window || ''), String(b.action || ''));
}));
// --- Viber: pannelli, barra laterale, task ---
app.get('/api/viber/state', route(function () { return viber.state(); }));
app.get('/api/viber/tasks', route(function () { return viber.tasks(); }));
app.post('/api/viber/panel', route(function (req) { return viber.focusPanel(String((req.body || {}).panel || '')); }));
app.post('/api/viber/sidebar', route(function (req) { return viber.sidebar(String((req.body || {}).mode || 'toggle')); }));

// desktop virtuali: elenco, passa a uno, crea, chiudi
app.get('/api/screens/desktops', route(function () { return vdesk.list(); }));
app.post('/api/screens/desktops', route(function (req) {
  const b = req.body || {};
  return vdesk.action(String(b.action || ''), b.desktop ? String(b.desktop) : '');
}));

// Risparmio energetico del tablet (services.json -> tablet), con limiti sensati.
function tabletPower() {
  const t = (config.get('services') || {}).tablet || {};
  const num = function (v, min, max, def) { const n = Number(v); return isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
  return {
    idleAfterSec: num(t.idleAfterSec, 10, 3600, 60),
    pollSec: num(t.pollSec, 1, 30, 2),
    idlePollSec: num(t.idlePollSec, 2, 300, 15),
    sleepAfterMin: num(t.sleepAfterMin, 0, 240, 10)
  };
}
app.get('/api/config', route(function () {
  return {
    version: config.version(),
    dock: config.tabletDock(),
    capabilities: platform.capabilities(),
    power: tabletPower(),
    platform: platform.name,
    hostname: os.hostname(),
    claude: claude.info(),
    errors: config.errors()
  };
}));

// Stato veloce per il polling (ogni 2s): sistema + musica.
app.get('/api/state', route(async function () {
  const [now, running] = await Promise.all([media.nowPlaying(), appsState.running()]);
  return { version: config.version(), build: clientBuild(), system: system.get(), media: now, apps: running, time: Date.now() };
}));

app.post('/api/press', route(function (req) {
  const b = req.body || {};
  if (b.version && b.version !== config.version()) {
    throw Object.assign(new Error('Configurazione aggiornata, ricarico...'), { code: 'CONFIG_CHANGED' });
  }
  if (typeof b.page !== 'string' || typeof b.tile !== 'string') throw badRequest('page e tile richiesti');
  return actions.press(b.page, b.tile);
}));

app.post('/api/media', route(function (req) {
  const b = req.body || {};
  return media.command(String(b.command || ''), b.value);
}));
app.get('/api/media/queue', route(function () { return media.queue(); }));

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

// source "memo" = Memo di Windows, "local" = lista della dock
function todoState() { return { items: todo.list(), source: todo.source(), notes: todo.notes(), voiceServer: voice.available(), sync: todosync.status() }; }
app.get('/api/todo', route(todoState));
app.post('/api/todo/add', route(async function (req) {
  const b = req.body || {};
  const item = await todo.add(b.text, b.priority, b.note ? String(b.note) : '');
  return Object.assign(todoState(), { item: item });
}));
app.post('/api/todo/toggle', route(async function (req) { await todo.toggle((req.body || {}).id); return todoState(); }));
app.post('/api/todo/remove', route(async function (req) { await todo.remove((req.body || {}).id); return todoState(); }));
app.post('/api/todo/sync', route(async function () { await todosync.sync(); return todoState(); }));
app.post('/api/todo/clear', route(async function () { const removed = await todo.clearDone(); return Object.assign(todoState(), { removed: removed }); }));

app.get('/api/ollama/models', route(function () { return ollama.models(); }));
app.post('/api/ollama/chat', route(function (req) {
  const b = req.body || {};
  if (!b.text || !String(b.text).trim()) throw badRequest('Messaggio vuoto');
  return ollama.chat(b.sessionId, String(b.model || ''), String(b.text).slice(0, 8000));
}));

app.get('/api/claude/info', route(function () {
  return Object.assign(claude.info(), { voiceServer: voice.available() });
}));
// Sessioni dell'app desktop di Claude (come nella barra laterale del PC)
app.get('/api/claude/desktop', route(function () { return desktopcode.list(); }));
app.get('/api/claude/desktop/session', route(function (req) { return desktopcode.get(String(req.query.id || '')); }));
app.post('/api/claude/desktop/send', route(function (req) { const b = req.body || {}; return desktopcode.send(String(b.id || ''), b.text); }));
app.post('/api/claude/desktop/cancel', route(function (req) { return desktopcode.cancel(String((req.body || {}).id || '')); }));
app.post('/api/claude/desktop/stop', route(function (req) { return desktopcode.stop(String((req.body || {}).id || '')); }));
app.post('/api/claude/desktop/open', route(function (req) { return desktopcode.openOnPc(String((req.body || {}).id || '')); }));
app.post('/api/claude/desktop/new', route(function (req) { const b = req.body || {}; return desktopcode.create(String(b.section || ''), b.text); }));
app.get('/api/claude/chats', route(function () { return claude.listChats(); }));
app.get('/api/claude/chat', route(function (req) { return claude.getChat(String(req.query.kind || ''), String(req.query.id || '')); }));
app.post('/api/claude/send', route(function (req) {
  const b = req.body || {};
  return claude.send(String(b.kind || ''), b.id ? String(b.id) : null, String(b.text || '').slice(0, 12000), b.cwd ? String(b.cwd) : null);
}));
app.get('/api/claude/job', route(function (req) { return claude.getJob(String(req.query.id || '')); }));
app.post('/api/claude/delete', route(function (req) { return claude.deleteChat(String((req.body || {}).id || '')); }));
// vecchia API sincrona, tenuta per compatibilità
app.post('/api/claude/chat', route(function (req) {
  const b = req.body || {};
  if (!b.text || !String(b.text).trim()) throw badRequest('Messaggio vuoto');
  return claude.chat(b.sessionId, String(b.text).slice(0, 8000));
}));

// Tablet come tastiera remota: scrive il testo nella finestra scelta sul PC.
app.post('/api/remote/type', route(async function (req) {
  const b = req.body || {};
  const text = String(b.text || '');
  if (!text.trim()) throw badRequest('Testo vuoto');
  if (text.length > 8000) throw badRequest('Testo troppo lungo');
  if (b.focus) await platform.focus(String(b.focus));
  await platform.typeText(text);
  if (b.enter) await platform.sendKeys(['ENTER']);
  return { message: b.enter ? 'Inviato sul PC' : 'Scritto sul PC' };
}));

// Audio registrato sul tablet -> testo (se services.json -> voice è configurato)
app.post('/api/voice', express.raw({ type: function () { return true; }, limit: '25mb' }), route(function (req) {
  return voice.transcribe(req.body, req.get('content-type'));
}));

app.use('/api', function (req, res) {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Endpoint inesistente' } });
});

// --- avvio ---
const lanAddresses = pairing.lanAddresses;

function banner() {
  const ips = lanAddresses();
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
    // QR del link diretto: lo inquadri con il telefono e la dock si apre già collegata
    if (ips[0] && process.stdout.isTTY && process.env.DOCK_SERVICE !== '1' && process.env.DOCK_NO_QR !== '1') {
      try {
        console.log('\n  Inquadra con il telefono o il tablet:');
        console.log(pairing.terminal(pairing.links(PORT)[0].link, '  '));
      } catch (e) { log.debug('server', 'QR non stampato: ' + e.message); }
    }
  } else {
    console.log('  ATTENZIONE: DOCK_TOKEN vuoto, chiunque in rete può usare la dock.');
  }
  console.log('  Pannello di controllo (solo da questo PC):  http://127.0.0.1:' + PORT + '/control');
  const caps = platform.capabilities();
  (caps.notes || []).forEach(function (n) { console.log('  Nota: ' + n); });
  const ci = claude.info();
  console.log('  Claude: ' + (ci.available ? ci.backend + ' (' + ci.model + ')' : 'non configurato'));
  config.errors().forEach(function (e) { console.log('  ERRORE CONFIG: ' + e); });
  console.log(line);
  console.log(process.env.DOCK_SERVICE === '1'
    ? '  In background: icona vicino all\'orologio per chiudere.\n'
    : '  Ctrl+C per fermare.\n');
  // Letto dall'icona nell'area di notifica (Windows) per mostrare l'indirizzo
  try {
    const fs = require('fs');
    if (!fs.existsSync(paths.DATA_DIR)) fs.mkdirSync(paths.DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(paths.DATA_DIR, 'runtime.json'), JSON.stringify({
      port: PORT,
      urls: ips.map(function (ip) { return 'http://' + ip.address + ':' + PORT; }),
      startedAt: new Date().toISOString(),
      pid: process.pid
    }, null, 2));
  } catch (e) { log.warn('server', 'runtime.json non scritto: ' + e.message); }
}

const EXIT_PORT_IN_USE = 3;

function start() {
  return platform.init().catch(function (e) {
    log.error('platform', 'avvio backend ' + platform.name + ' non riuscito: ' + e.message);
  }).then(function () {
    return new Promise(function (resolve, reject) {
      const server = app.listen(PORT, HOST, function () { banner(); todosync.start(); resolve(server); });
      server.on('error', function (e) {
        if (e.code === 'EADDRINUSE') log.error('server', 'La porta ' + PORT + ' è già in uso: la dock è già avviata? (cambia PORT nel .env)');
        reject(e);
      });
    });
  });
}

function shutdown() {
  system.stop();
  todosync.stop();
  platform.shutdown();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
  start().catch(function (e) { process.exit(e && e.code === 'EADDRINUSE' ? EXIT_PORT_IN_USE : 1); });
}

module.exports = { app: app, start: start };
