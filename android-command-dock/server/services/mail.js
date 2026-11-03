// Posta in arrivo sul tablet (pagina EMAIL). Gli account si aggiungono dal
// pannello di controllo e restano in data/mail.json, solo su questo PC.
//
// Il file è cifrato (server/secrets.js): la chiave sta nel portachiavi del sistema.
//
// Lettura via IMAP in SOLA LETTURA (EXAMINE): la dock non segna mai le email
// come lette, non le sposta e non le cancella.
//  - Gmail, iCloud, Yahoo, Libero e altri: email + "password per le app"
//  - Outlook / Hotmail: Microsoft accetta solo l'accesso OAuth2. Serve un'app
//    registrata sul portale Azure (gratis): il pannello guida i passaggi e poi
//    l'accesso avviene con un codice su microsoft.com/devicelogin.
const path = require('path');
const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const paths = require('../paths');
const platform = require('../platform');
const log = require('../log');
const secrets = require('../secrets');

const FILE = path.join(paths.DATA_DIR, 'mail.json');
const LIST_SIZE = 40;
const LIST_TTL = 45000;
const MAX_SOURCE = 3 * 1024 * 1024;   // oltre, il messaggio viene letto solo in parte
const MAX_TEXT = 20000;

const MS_SCOPE = 'offline_access https://outlook.office.com/IMAP.AccessAsUser.All';
// "consumers": account personali (Outlook.com, Hotmail, Live), come l'app registrata
// con "Personal Microsoft accounts" indicata nel pannello.
const MS_BASE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';

// Messaggio di Microsoft senza i codici di traccia (Trace ID, Correlation ID...).
function msError(d) {
  return String((d && (d.error_description || d.error)) || 'risposta non valida').split(/\r?\n| Trace ID:/)[0].trim();
}

const PROVIDERS = {
  gmail: {
    label: 'Gmail', host: 'imap.gmail.com', port: 993, auth: 'password',
    webmail: 'https://mail.google.com/mail/u/0/#inbox',
    help: 'Serve la verifica in due passaggi attiva e una "password per le app" (16 lettere), non la password del tuo account.',
    helpUrl: 'https://myaccount.google.com/apppasswords'
  },
  outlook: {
    label: 'Outlook / Hotmail', host: 'outlook.office365.com', port: 993, auth: 'oauth',
    webmail: 'https://outlook.live.com/mail/0/',
    help: 'Microsoft accetta solo l\'accesso OAuth2: serve il Client ID di un\'app registrata sul portale Azure. Solo account personali (Outlook.com, Hotmail, Live): per quelli di scuola o lavoro inoltra la posta a Gmail.',
    helpUrl: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade'
  },
  icloud: {
    label: 'iCloud', host: 'imap.mail.me.com', port: 993, auth: 'password',
    webmail: 'https://www.icloud.com/mail',
    help: 'Serve una "password specifica per le app" creata dal tuo Apple ID.',
    helpUrl: 'https://account.apple.com/account/manage'
  },
  yahoo: {
    label: 'Yahoo', host: 'imap.mail.yahoo.com', port: 993, auth: 'password',
    webmail: 'https://mail.yahoo.com',
    help: 'Serve una "password per le app" creata nelle impostazioni di sicurezza di Yahoo.',
    helpUrl: 'https://login.yahoo.com/account/security'
  },
  libero: {
    label: 'Libero', host: 'imapmail.libero.it', port: 993, auth: 'password',
    webmail: 'https://mail.libero.it',
    help: 'Usa la password della casella Libero Mail.'
  },
  imap: {
    label: 'Altro (IMAP)', host: '', port: 993, auth: 'password', webmail: '',
    help: 'Server IMAP del tuo provider (es. imap.example.com, porta 993 con SSL).'
  }
};

let store = null;            // { accounts: [...] }
const runtime = {};          // id -> { status, error, unread, list, listAt, queue, pending }

function load() {
  if (store) return store;
  store = secrets.loadJson(FILE, log) || {};
  if (!Array.isArray(store.accounts)) store.accounts = [];
  return store;
}
function save() {
  secrets.writeJson(FILE, store);
}
function rt(id) {
  if (!runtime[id]) runtime[id] = { status: 'idle', error: '', unread: null, list: null, listAt: 0, queue: Promise.resolve(), pending: null };
  return runtime[id];
}
function account(id) {
  const a = load().accounts.filter(function (x) { return x.id === id; })[0];
  if (!a) throw Object.assign(new Error('Account email sconosciuto'), { code: 'NOT_FOUND' });
  return a;
}
function fail(msg, code) { return Object.assign(new Error(msg), { code: code || 'UNAVAILABLE' }); }

// Un'operazione alla volta per account (un solo collegamento IMAP aperto).
function serial(id, fn) {
  const r = rt(id);
  const next = r.queue.then(fn, fn);
  r.queue = next.catch(function () {});
  return next;
}

// ------------------------------------------------------------ OAuth2 Microsoft

async function msPost(url, form) {
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 15000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: ctrl.signal
    });
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function accessToken(a) {
  const o = a.oauth || {};
  if (o.accessToken && o.expiresAt > Date.now() + 60000) return o.accessToken;
  if (!o.refreshToken) throw fail('Accesso a Microsoft da completare dal pannello', 'UNAUTHORIZED');
  const d = await msPost(MS_BASE + '/token', { client_id: o.clientId, grant_type: 'refresh_token', refresh_token: o.refreshToken, scope: MS_SCOPE });
  if (!d.access_token) {
    o.refreshToken = '';
    save();
    throw fail('Microsoft ha rifiutato il rinnovo dell\'accesso: rifai l\'accesso dal pannello (' + msError(d) + ')', 'UNAUTHORIZED');
  }
  o.accessToken = d.access_token;
  o.expiresAt = Date.now() + (d.expires_in || 3600) * 1000;
  if (d.refresh_token) o.refreshToken = d.refresh_token;
  save();
  return o.accessToken;
}

// Avvia l'accesso con codice: l'utente apre microsoft.com/devicelogin e lo scrive.
async function startDeviceLogin(a) {
  const d = await msPost(MS_BASE + '/devicecode', { client_id: a.oauth.clientId, scope: MS_SCOPE });
  if (!d.device_code) throw fail('Microsoft: ' + msError(d), 'BAD_REQUEST');
  const r = rt(a.id);
  r.status = 'login';
  r.error = '';
  r.pending = { userCode: d.user_code, uri: d.verification_uri, expiresAt: Date.now() + (d.expires_in || 900) * 1000 };
  pollDeviceLogin(a.id, d.device_code, Math.max(2, d.interval || 5));
}

function pollDeviceLogin(id, deviceCode, interval) {
  setTimeout(async function () {
    let a;
    try { a = account(id); } catch (e) { return; }   // account rimosso nel frattempo
    const r = rt(id);
    if (!r.pending) return;
    if (Date.now() > r.pending.expiresAt) { r.pending = null; r.status = 'error'; r.error = 'Codice scaduto: riprova dal pannello'; return; }
    let d;
    try {
      d = await msPost(MS_BASE + '/token', { client_id: a.oauth.clientId, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode });
    } catch (e) { return pollDeviceLogin(id, deviceCode, interval); }
    if (d.error === 'authorization_pending') return pollDeviceLogin(id, deviceCode, interval);
    if (d.error === 'slow_down') return pollDeviceLogin(id, deviceCode, interval + 5);
    r.pending = null;
    if (!d.access_token) {
      r.status = 'error';
      r.error = d.error === 'authorization_declined' ? 'Accesso rifiutato su Microsoft' : 'Microsoft: ' + msError(d);
      return;
    }
    a.oauth.accessToken = d.access_token;
    a.oauth.refreshToken = d.refresh_token || '';
    a.oauth.expiresAt = Date.now() + (d.expires_in || 3600) * 1000;
    save();
    log.info('mail', a.email + ': accesso Microsoft completato');
    r.status = 'idle';
    refreshSoon(id);
  }, interval * 1000);
}

// ------------------------------------------------------------ IMAP

async function connect(a) {
  const auth = a.auth === 'oauth' ? { user: a.user || a.email, accessToken: await accessToken(a) } : { user: a.user || a.email, pass: a.pass };
  const client = new ImapFlow({
    host: a.host, port: a.port || 993, secure: a.secure !== false,
    auth: auth, logger: false,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000
  });
  client.on('error', function (e) { log.debug('mail', a.email + ': ' + e.message); });
  try {
    await client.connect();
  } catch (e) {
    throw fail(friendlyError(e, a));
  }
  return client;
}

function friendlyError(e, a) {
  if (e.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed|authenticat/i.test((e.responseText || '') + ' ' + e.message)) {
    return a.auth === 'oauth' ? 'Accesso rifiutato da Microsoft: rifai l\'accesso dal pannello' : 'Accesso rifiutato: controlla l\'indirizzo e la password per le app';
  }
  if (e.code === 'ENOTFOUND') return 'Server ' + a.host + ' non trovato';
  if (e.code === 'ETIMEDOUT' || /timeout/i.test(e.message)) return 'Il server ' + a.host + ' non risponde';
  if (e.code === 'ECONNREFUSED') return 'Connessione rifiutata da ' + a.host;
  return e.responseText || e.message || 'Errore IMAP';
}

async function withInbox(a, fn) {
  const client = await connect(a);
  try {
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try { return await fn(client); } finally { lock.release(); }
  } finally {
    client.logout().catch(function () { client.close(); });
  }
}

function addr(list) {
  const x = (list || [])[0];
  return x ? { name: x.name || '', address: x.address || '' } : { name: '', address: '' };
}

async function fetchList(a) {
  return withInbox(a, async function (client) {
    const exists = client.mailbox.exists || 0;
    const out = [];
    let unread = 0;
    if (exists) {
      const from = Math.max(1, exists - LIST_SIZE + 1);
      for await (const m of client.fetch(from + ':*', { uid: true, envelope: true, flags: true, internalDate: true })) {
        const seen = m.flags ? m.flags.has('\\Seen') : true;
        out.push({
          uid: m.uid,
          from: addr(m.envelope && m.envelope.from),
          subject: (m.envelope && m.envelope.subject) || '',
          date: ((m.envelope && m.envelope.date) || m.internalDate || new Date()).toISOString(),
          seen: seen,
          flagged: m.flags ? m.flags.has('\\Flagged') : false
        });
      }
      const unseen = await client.search({ seen: false });
      unread = Array.isArray(unseen) ? unseen.length : 0;
    }
    out.sort(function (x, y) { return y.uid - x.uid; });
    return { messages: out, unread: unread, total: exists };
  });
}

// ------------------------------------------------------------ API per il tablet

function publicAccount(a) {
  const r = rt(a.id);
  const p = PROVIDERS[a.provider] || PROVIDERS.imap;
  return { id: a.id, label: a.label || p.label, provider: a.provider, email: a.email, unread: r.unread, status: r.status, error: r.error };
}

function state() {
  return { accounts: load().accounts.map(publicAccount) };
}

async function list(id, force) {
  const a = account(id);
  const r = rt(id);
  if (!force && r.list && Date.now() - r.listAt < LIST_TTL) return Object.assign({ account: publicAccount(a) }, r.list);
  return serial(id, async function () {
    if (!force && r.list && Date.now() - r.listAt < LIST_TTL) return Object.assign({ account: publicAccount(a) }, r.list);
    if (r.pending) throw fail('Accesso a Microsoft in corso: completa il codice dal pannello', 'UNAUTHORIZED');
    r.status = 'loading';
    try {
      const data = await fetchList(a);
      r.list = data; r.listAt = Date.now(); r.unread = data.unread; r.status = 'ready'; r.error = '';
      return Object.assign({ account: publicAccount(a) }, data);
    } catch (e) {
      r.status = 'error'; r.error = e.message;
      throw e.code ? e : fail(e.message);
    }
  });
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const msgCache = {};   // "id:uid" -> messaggio (gli ultimi letti)
async function message(id, uid) {
  uid = parseInt(uid, 10);
  if (!uid) throw fail('Messaggio non valido', 'BAD_REQUEST');
  const key = id + ':' + uid;
  if (msgCache[key]) return msgCache[key];
  const a = account(id);
  return serial(id, async function () {
    const msg = await withInbox(a, async function (client) {
      const m = await client.fetchOne(String(uid), { uid: true, envelope: true, source: { maxLength: MAX_SOURCE } }, { uid: true });
      if (!m || !m.source) throw fail('Messaggio non trovato (forse spostato o cancellato)', 'NOT_FOUND');
      const parsed = await simpleParser(m.source);
      let text = parsed.text || htmlToText(parsed.html);
      const cut = text.length > MAX_TEXT;
      if (cut) text = text.slice(0, MAX_TEXT);
      return {
        uid: uid,
        subject: parsed.subject || (m.envelope && m.envelope.subject) || '',
        from: addr(parsed.from && parsed.from.value),
        to: ((parsed.to && parsed.to.value) || []).map(function (x) { return x.address; }).slice(0, 5),
        date: (parsed.date || (m.envelope && m.envelope.date) || new Date()).toISOString(),
        text: text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
        truncated: cut,
        attachments: (parsed.attachments || []).filter(function (x) { return x.contentDisposition !== 'inline'; })
          .map(function (x) { return x.filename || 'allegato'; }).slice(0, 10)
      };
    });
    const keys = Object.keys(msgCache);
    if (keys.length > 30) delete msgCache[keys[0]];
    msgCache[key] = msg;
    return msg;
  });
}

// Apre la webmail dell'account nel browser del PC.
async function openWebmail(id) {
  const a = account(id);
  const p = PROVIDERS[a.provider] || PROVIDERS.imap;
  const url = a.webmail || p.webmail;
  if (!url) throw fail('Nessuna webmail per questo account', 'UNSUPPORTED');
  await platform.open(url);
  return { message: (a.label || p.label) + ' aperta sul PC' };
}

function refreshSoon(id) {
  setTimeout(function () { list(id, true).catch(function () {}); }, 200);
}

// ------------------------------------------------------------ pannello di controllo

function panelInfo() {
  return {
    providers: Object.keys(PROVIDERS).map(function (k) {
      const p = PROVIDERS[k];
      return { id: k, label: p.label, auth: p.auth, host: p.host, port: p.port, help: p.help, helpUrl: p.helpUrl || '' };
    }),
    accounts: load().accounts.map(function (a) {
      const r = rt(a.id);
      return Object.assign(publicAccount(a), {
        host: a.host,
        auth: a.auth,
        login: r.pending ? { code: r.pending.userCode, uri: r.pending.uri, expiresAt: r.pending.expiresAt } : null,
        needsLogin: a.auth === 'oauth' && !(a.oauth && a.oauth.refreshToken) && !r.pending
      });
    })
  };
}

function cleanEmail(v) {
  const s = String(v || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw fail('Indirizzo email non valido', 'BAD_REQUEST');
  return s;
}

// Aggiunge un account. Con la password prova subito l'accesso: se fallisce non salva nulla.
async function addAccount(b) {
  b = b || {};
  const provider = PROVIDERS[b.provider] ? b.provider : null;
  if (!provider) throw fail('Scegli il tipo di account', 'BAD_REQUEST');
  const p = PROVIDERS[provider];
  const email = cleanEmail(b.email);
  if (load().accounts.some(function (x) { return x.email.toLowerCase() === email.toLowerCase() && x.provider === provider; })) {
    throw fail(email + ' è già collegato', 'BAD_REQUEST');
  }
  const a = {
    id: crypto.randomBytes(5).toString('hex'),
    provider: provider,
    label: String(b.label || '').trim().slice(0, 30) || p.label,
    email: email,
    host: provider === 'imap' ? String(b.host || '').trim() : p.host,
    port: provider === 'imap' ? (parseInt(b.port, 10) || 993) : p.port,
    secure: true,
    auth: p.auth
  };
  if (!a.host || !/^[a-z0-9.-]+$/i.test(a.host)) throw fail('Server IMAP non valido', 'BAD_REQUEST');
  a.secure = a.port !== 143;   // 143 = connessione in chiaro che passa a TLS (STARTTLS)
  if (provider === 'imap' && b.user) a.user = String(b.user).trim();

  if (a.auth === 'oauth') {
    const clientId = String(b.clientId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(clientId)) throw fail('Client ID non valido: è un codice come 1a2b3c4d-....-....', 'BAD_REQUEST');
    a.oauth = { clientId: clientId, refreshToken: '', accessToken: '', expiresAt: 0 };
    // se Microsoft rifiuta subito il Client ID non salva nulla
    try { await startDeviceLogin(a); } catch (e) { delete runtime[a.id]; throw e; }
    load().accounts.push(a);
    save();
    return a.id;
  }

  a.pass = String(b.password || '').replace(/\s+/g, provider === 'gmail' ? '' : ' ').trim();
  if (!a.pass) throw fail('Manca la password per le app', 'BAD_REQUEST');
  const data = await fetchList(a);       // prova l'accesso prima di salvare
  load().accounts.push(a);
  save();
  const r = rt(a.id);
  r.list = data; r.listAt = Date.now(); r.unread = data.unread; r.status = 'ready';
  log.info('mail', 'account aggiunto: ' + a.email + ' (' + p.label + ')');
  return a.id;
}

async function relogin(id) {
  const a = account(id);
  if (a.auth !== 'oauth') throw fail('Solo per gli account Outlook', 'BAD_REQUEST');
  await startDeviceLogin(a);
}

function removeAccount(id) {
  const s = load();
  const before = s.accounts.length;
  s.accounts = s.accounts.filter(function (x) { return x.id !== id; });
  if (s.accounts.length === before) throw fail('Account email sconosciuto', 'NOT_FOUND');
  save();
  delete runtime[id];
  Object.keys(msgCache).forEach(function (k) { if (k.indexOf(id + ':') === 0) delete msgCache[k]; });
}

module.exports = {
  PROVIDERS: PROVIDERS,
  state: state,
  list: list,
  message: message,
  openWebmail: openWebmail,
  panelInfo: panelInfo,
  addAccount: addAccount,
  removeAccount: removeAccount,
  relogin: relogin,
  htmlToText: htmlToText,
  _reset: function () { store = null; Object.keys(runtime).forEach(function (k) { delete runtime[k]; }); }
};
