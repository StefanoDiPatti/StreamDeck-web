// Posta in arrivo sul tablet (pagina EMAIL), letta da Thunderbird sul PC.
//
// L'unico modo di collegare un account è aggiungerlo a Thunderbird: l'accesso
// (Gmail con la conferma sul telefono, Microsoft 365 di università e aziende,
// iCloud, Libero...) lo fa e lo rinnova Thunderbird, con i metodi ufficiali.
// La dock non chiede e non salva password né token: legge in SOLA LETTURA i
// file del profilo di Thunderbird (vedi thunderbird.js). Non segna le email
// come lette, non le sposta e non le cancella.
//
// data/mail.json tiene solo quali account mostrare sul tablet.
const fs = require('fs');
const path = require('path');
const { simpleParser } = require('mailparser');
const paths = require('../paths');
const platform = require('../platform');
const log = require('../log');
const secrets = require('../secrets');
const tb = require('./thunderbird');

const FILE = path.join(paths.DATA_DIR, 'mail.json');
const LIST_SIZE = 40;
const MAX_SOURCE = 3 * 1024 * 1024;   // oltre, il messaggio viene letto solo in parte
const MAX_TEXT = 20000;
const PROFILE_TTL = 15000;            // ogni quanto rileggere prefs.js (account nuovi)

let store = null;                     // { hidden: [id...] }
let found = { at: 0, profile: null, accounts: [] };
const cache = {};                     // id -> { stamp, messages, unread, total, error }

function fail(msg, code) { return Object.assign(new Error(msg), { code: code || 'UNAVAILABLE' }); }

function load() {
  if (store) return store;
  store = secrets.loadJson(FILE, log) || {};
  if (store.accounts) {
    // account IMAP della versione vecchia (con password): non servono più, si tolgono dal disco
    delete store.accounts;
    save();
    log.info('mail', 'account IMAP vecchi rimossi da data/mail.json: ora la posta si legge da Thunderbird');
  }
  if (!Array.isArray(store.hidden)) store.hidden = [];
  return store;
}
function save() { secrets.writeJson(FILE, store); }

// Profilo e account di Thunderbird (riletti ogni tanto: si possono aggiungere account).
function discover(force) {
  if (!force && found.at && Date.now() - found.at < PROFILE_TTL) return found;
  const profile = tb.findProfile();
  let list = [];
  if (profile && profile.dir) {
    try { list = tb.accounts(profile.dir); } catch (e) { log.debug('mail', 'prefs.js: ' + e.message); }
  }
  found = { at: Date.now(), profile: profile, accounts: list };
  return found;
}

function account(id) {
  const a = discover().accounts.filter(function (x) { return x.key === id; })[0];
  if (!a) throw fail('Account non trovato in Thunderbird (è stato rimosso?)', 'NOT_FOUND');
  return a;
}

function stampOf(file) {
  try { const s = fs.statSync(file); return s.size + ':' + s.mtimeMs; } catch (e) { return ''; }
}

// Elenco completo della posta in arrivo, rifatto solo se i file di Thunderbird cambiano.
function readInbox(a) {
  const inbox = tb.inboxPath(a);
  const stamp = stampOf(inbox + '.msf') + '|' + stampOf(inbox);
  const c = cache[a.key];
  if (c && c.stamp === stamp) return c;
  let messages = null;
  if (fs.existsSync(inbox + '.msf')) {
    try {
      messages = tb.messagesFromMork(tb.parseMork(fs.readFileSync(inbox + '.msf', 'latin1')));
    } catch (e) {
      log.debug('mail', a.email + ': .msf illeggibile (' + e.message + ')');
      if (c) return c;   // Thunderbird lo sta scrivendo: si tiene l'elenco di prima
    }
  }
  if (!messages || (!messages.length && !a.maildir && stampOf(inbox))) {
    if (!a.maildir && fs.existsSync(inbox) && fs.statSync(inbox).isFile()) messages = tb.messagesFromMbox(inbox);
  }
  if (!messages) {
    throw fail('Posta in arrivo di ' + a.email + ' non ancora scaricata: apri Thunderbird e aspetta che finisca di sincronizzare', 'UNAVAILABLE');
  }
  messages.sort(function (x, y) { return y.date - x.date; });
  const out = {
    stamp: stamp,
    messages: messages,
    unread: messages.filter(function (m) { return !m.seen; }).length,
    total: messages.length
  };
  cache[a.key] = out;
  return out;
}

function visible() {
  const hidden = load().hidden;
  return discover().accounts.filter(function (a) { return hidden.indexOf(a.key) < 0; });
}

function publicAccount(a) {
  const c = cache[a.key];
  return { id: a.key, label: a.name && a.name !== a.email ? a.name : (a.host || 'Email'), provider: 'thunderbird', email: a.email, unread: c ? c.unread : null, status: c ? 'ready' : 'idle', error: '' };
}

// ------------------------------------------------------------ API per il tablet

function state() {
  return { accounts: visible().map(publicAccount) };
}

async function list(id) {
  const a = account(id);
  const d = readInbox(a);
  return {
    account: publicAccount(a),
    unread: d.unread,
    total: d.total,
    messages: d.messages.slice(0, LIST_SIZE).map(function (m) {
      return { uid: m.key, from: m.from, subject: m.subject, date: m.date.toISOString(), seen: m.seen, flagged: m.flagged };
    })
  };
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function addr(list) {
  const x = (list || [])[0];
  return x ? { name: x.name || '', address: x.address || '' } : { name: '', address: '' };
}

async function message(id, uid) {
  uid = String(uid || '');
  if (!/^[\w.,:+=-]{1,200}$/.test(uid)) throw fail('Messaggio non valido', 'BAD_REQUEST');
  const a = account(id);
  const d = readInbox(a);
  const m = d.messages.filter(function (x) { return x.key === uid; })[0];
  if (!m) throw fail('Messaggio non trovato (forse spostato o cancellato)', 'NOT_FOUND');
  const src = tb.readSource(tb.inboxPath(a), m, a.maildir, MAX_SOURCE);
  if (!src) {
    return {
      uid: uid, subject: m.subject, from: m.from, to: [], date: m.date.toISOString(), attachments: [], truncated: false,
      text: 'Il testo di questo messaggio non è sul PC.\n\nIn Thunderbird: impostazioni dell\'account > Sincronizzazione e archiviazione > "Conserva i messaggi di questo account sul computer", oppure apri il messaggio una volta in Thunderbird.'
    };
  }
  const parsed = await simpleParser(src);
  let text = parsed.text || htmlToText(parsed.html);
  const cut = text.length > MAX_TEXT;
  if (cut) text = text.slice(0, MAX_TEXT);
  return {
    uid: uid,
    subject: parsed.subject || m.subject,
    from: parsed.from ? addr(parsed.from.value) : m.from,
    to: ((parsed.to && parsed.to.value) || []).map(function (x) { return x.address; }).slice(0, 5),
    date: (parsed.date || m.date).toISOString(),
    text: text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
    truncated: cut,
    attachments: (parsed.attachments || []).filter(function (x) { return x.contentDisposition !== 'inline'; })
      .map(function (x) { return x.filename || 'allegato'; }).slice(0, 10)
  };
}

// "APRI SUL PC": apre Thunderbird.
async function openWebmail() {
  const exe = tb.executable();
  if (exe) await platform.launch({ path: exe });
  else if (process.platform !== 'win32') await platform.launch({ path: 'thunderbird' });
  else throw fail('Thunderbird non trovato sul PC', 'UNSUPPORTED');
  return { message: 'Thunderbird aperto sul PC' };
}

// ------------------------------------------------------------ pannello di controllo

function panelInfo() {
  const f = discover(true);
  const hidden = load().hidden;
  return {
    source: 'thunderbird',
    download: tb.DOWNLOAD_URL,
    installed: !!(tb.executable() || f.profile),
    profile: !!(f.profile && f.profile.dir),
    accounts: f.accounts.map(function (a) {
      let unread = null, error = '';
      try { unread = readInbox(a).unread; } catch (e) { error = e.message; }
      return Object.assign(publicAccount(a), {
        host: a.host,
        shown: hidden.indexOf(a.key) < 0,
        unread: unread,
        status: error ? 'error' : 'ready',
        error: error,
        offline: a.offline
      });
    })
  };
}

// Mostra o nasconde un account di Thunderbird sul tablet.
function setShown(id, shown) {
  account(id);
  const s = load();
  s.hidden = s.hidden.filter(function (x) { return x !== id; });
  if (!shown) s.hidden.push(id);
  save();
}

module.exports = {
  state: state,
  list: list,
  message: message,
  openWebmail: openWebmail,
  panelInfo: panelInfo,
  setShown: setShown,
  htmlToText: htmlToText,
  _reset: function () { store = null; found = { at: 0, profile: null, accounts: [] }; Object.keys(cache).forEach(function (k) { delete cache[k]; }); }
};
