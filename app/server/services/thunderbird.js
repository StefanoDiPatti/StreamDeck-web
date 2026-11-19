// Lettura della posta di Thunderbird, in SOLA LETTURA, dai file del suo profilo.
//
// Perché Thunderbird: l'accesso agli account (Gmail con la conferma sul telefono,
// Microsoft 365 di università e aziende, iCloud...) lo fa e lo rinnova lui, con i
// metodi ufficiali di ogni servizio. La dock non vede mai password o token: legge
// solo i file che Thunderbird tiene sul PC.
//
//  - profiles.ini / installs.ini  -> cartella del profilo in uso
//  - prefs.js                     -> account, indirizzi, cartelle dei server
//  - <cartella>/INBOX.msf         -> elenco dei messaggi (formato Mork): oggetto,
//                                    mittente, data, letto/non letto, posizione
//  - <cartella>/INBOX             -> testo dei messaggi (mbox, o cartella Maildir)
//
// Thunderbird non va mai modificato: qui si aprono i file solo in lettura.
const fs = require('fs');
const os = require('os');
const path = require('path');
const libmime = require('libmime');

// ------------------------------------------------------------ dove sta Thunderbird

function roots() {
  if (process.env.DOCK_THUNDERBIRD_DIR) return [process.env.DOCK_THUNDERBIRD_DIR];
  const home = os.homedir();
  if (process.platform === 'win32') {
    return [path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Thunderbird')];
  }
  if (process.platform === 'darwin') return [path.join(home, 'Library', 'Thunderbird')];
  return [
    path.join(home, '.thunderbird'),
    path.join(home, '.var', 'app', 'org.mozilla.Thunderbird', '.thunderbird'),   // Flatpak
    path.join(home, 'snap', 'thunderbird', 'common', '.thunderbird'),             // Snap
    path.join(home, '.config', 'thunderbird')
  ];
}

// File .ini semplice: { sezione: { chiave: valore } }
function parseIni(text) {
  const out = {};
  let cur = null;
  String(text || '').split(/\r?\n/).forEach(function (line) {
    const s = line.trim();
    if (!s || s[0] === ';' || s[0] === '#') return;
    const sec = /^\[(.+)\]$/.exec(s);
    if (sec) { cur = out[sec[1]] = {}; return; }
    const i = s.indexOf('=');
    if (cur && i > 0) cur[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  });
  return out;
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
}

// Cartella del profilo in uso: quella "Default" dell'installazione, poi quella con Default=1.
function findProfile() {
  const list = roots();
  for (let i = 0; i < list.length; i++) {
    const root = list[i];
    const ini = readText(path.join(root, 'profiles.ini'));
    if (ini === null) continue;
    const p = parseIni(ini);
    const inst = parseIni(readText(path.join(root, 'installs.ini')) || '');
    const resolve = function (rel, isRel) {
      const r = String(rel || '').replace(/\//g, path.sep);
      return isRel === '0' ? r : path.join(root, r);
    };
    const candidates = [];
    Object.keys(p).forEach(function (k) { if (/^Install/i.test(k) && p[k].Default) candidates.push(resolve(p[k].Default, '1')); });
    Object.keys(inst).forEach(function (k) { if (inst[k].Default) candidates.push(resolve(inst[k].Default, '1')); });
    const profiles = Object.keys(p).filter(function (k) { return /^Profile/i.test(k) && p[k].Path; }).map(function (k) { return p[k]; });
    profiles.filter(function (x) { return x.Default === '1'; }).forEach(function (x) { candidates.push(resolve(x.Path, x.IsRelative)); });
    profiles.forEach(function (x) { candidates.push(resolve(x.Path, x.IsRelative)); });
    for (let j = 0; j < candidates.length; j++) {
      if (fs.existsSync(path.join(candidates[j], 'prefs.js'))) return { root: root, dir: candidates[j] };
    }
    return { root: root, dir: null };     // installato ma senza profilo usato
  }
  return null;
}

// prefs.js: righe user_pref("chiave", valore);
function parsePrefs(text) {
  const out = {};
  const re = /^\s*user_pref\(\s*("(?:[^"\\]|\\.)*")\s*,\s*([\s\S]*?)\s*\);\s*$/gm;
  let m;
  while ((m = re.exec(String(text || '')))) {
    try { out[JSON.parse(m[1])] = JSON.parse(m[2]); } catch (e) { /* valore strano: ignorato */ }
  }
  return out;
}

// Account di posta (IMAP e POP) del profilo, nell'ordine di Thunderbird.
function accounts(profileDir) {
  const prefs = parsePrefs(readText(path.join(profileDir, 'prefs.js')));
  const keys = String(prefs['mail.accountmanager.accounts'] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  const out = [];
  keys.forEach(function (acc) {
    const server = prefs['mail.account.' + acc + '.server'];
    if (!server) return;
    const sp = function (k) { return prefs['mail.server.' + server + '.' + k]; };
    const type = sp('type');
    if (type !== 'imap' && type !== 'pop3') return;   // niente "Cartelle locali", feed, newsgroup
    const ident = String(prefs['mail.account.' + acc + '.identities'] || '').split(',')[0].trim();
    const email = (ident && prefs['mail.identity.' + ident + '.useremail']) || String(sp('userName') || '');
    let dir = '';
    const rel = sp('directory-rel');
    if (rel && /^\[ProfD\]/.test(rel)) dir = path.join(profileDir, rel.replace(/^\[ProfD\]/, '').replace(/\//g, path.sep));
    if ((!dir || !fs.existsSync(dir)) && sp('directory')) dir = sp('directory');
    out.push({
      key: server,
      email: email,
      name: String(sp('name') || email),
      host: String(sp('hostname') || ''),
      type: type,
      dir: dir,
      maildir: /maildir/i.test(String(sp('storeContractID') || '')),
      offline: type === 'pop3' || sp('offline_download') !== false
    });
  });
  return out;
}

// La cartella della posta in arrivo: "INBOX" per IMAP, "Inbox" per POP.
function inboxPath(acc) {
  const names = acc.type === 'imap' ? ['INBOX', 'Inbox'] : ['Inbox', 'INBOX'];
  for (let i = 0; i < names.length; i++) {
    const p = path.join(acc.dir, names[i]);
    if (fs.existsSync(p + '.msf') || fs.existsSync(p)) return p;
  }
  return path.join(acc.dir, names[0]);
}

// ------------------------------------------------------------ Mork (.msf)
//
// Formato testuale di Mozilla. Qui basta la parte che usa Thunderbird:
//   < <(a=c)> (80=subject)(81=sender) >   dizionario delle colonne
//   <(9A=valore)>                          dizionario dei valori
//   {1:^80 {(k^BF:c)(s=9u)} [1A(^80=Ciao)(^81^9A)] -1B }  tabella con righe
//   [-1A ...]   la riga riparte da zero      -1B  toglie la riga dalla tabella
//   @$${1{@ ... @$$}1}@   gruppo di modifiche (con ~abort~ va scartato)

function parseMork(input) {
  let text = String(input).replace(/@\$\$\{([0-9A-Fa-f]+)\{@([\s\S]*?)@\$\$\}(~abort~)?\1\}@/g, function (all, id, body, abort) {
    return abort ? '' : body;
  });
  // gruppo ancora aperto (Thunderbird sta scrivendo): si ignora
  const open = text.indexOf('@$${');
  if (open >= 0) text = text.slice(0, open);

  const cols = {};      // id hex -> nome colonna
  const atoms = {};     // id hex -> valore
  const rows = {};      // "id:scope" -> { colonna: valore }
  const tables = [];    // { scope, kind, rows: { key: true } }
  let i = 0;
  const n = text.length;

  function skip() {
    for (;;) {
      while (i < n && /\s/.test(text[i])) i++;
      if (text[i] === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
      return;
    }
  }
  // valore di una cella fino alla ")" non protetta; $XX = byte, "\" protegge, "\"+a capo = continua
  function literal() {
    const bytes = [];
    while (i < n && text[i] !== ')') {
      let c = text[i];
      if (c === '\\') {
        const nx = text[i + 1];
        if (nx === '\n') { i += 2; continue; }
        if (nx === '\r') { i += text[i + 2] === '\n' ? 3 : 2; continue; }
        c = nx; i += 2;
        pushChar(bytes, c);
        continue;
      }
      if (c === '$' && /^[0-9A-Fa-f]{2}$/.test(text.substr(i + 1, 2))) {
        bytes.push(parseInt(text.substr(i + 1, 2), 16)); i += 3; continue;
      }
      pushChar(bytes, c); i++;
    }
    return Buffer.from(bytes).toString('utf8');
  }
  function pushChar(bytes, c) {
    const b = Buffer.from(c, 'utf8');
    for (let k = 0; k < b.length; k++) bytes.push(b[k]);
  }
  function token() {
    const s = i;
    while (i < n && /[^\s()[\]{}<>=^:]/.test(text[i])) i++;
    return text.slice(s, i);
  }
  // "id" oppure "id:scope" (scope = ^col o nome)
  function oid() {
    let id = token();
    let scope = '';
    if (text[i] === ':') {
      i++;
      if (text[i] === '^') { i++; scope = colName(token()); } else scope = token();
    }
    return { id: id.toUpperCase(), scope: scope };
  }
  function colName(id) { return cols[String(id).toUpperCase()] || String(id); }

  // dizionario: <(id=valore)...> con meta <(a=c)> che lo rende delle colonne
  function dict() {
    i++;   // <
    let isCols = false;
    for (;;) {
      skip();
      if (i >= n) return;
      const c = text[i];
      if (c === '>') { i++; return; }
      if (c === '<') {   // meta del dizionario
        i++;
        for (;;) {
          skip();
          if (text[i] === '>' || i >= n) { i++; break; }
          if (text[i] === '(') {
            i++;
            const k = token();
            if (text[i] === '=') { i++; const v = literal(); if (k === 'a') isCols = v === 'c'; }
            i++;   // )
          } else i++;
        }
        continue;
      }
      if (c === '(') {
        i++;
        const id = token().toUpperCase();
        if (text[i] === '=') { i++; const v = literal(); (isCols ? cols : atoms)[id] = v; }
        while (i < n && text[i] !== ')') i++;
        i++;
        continue;
      }
      i++;
    }
  }

  // riga: [id(cella)(cella)...] — scopeDef = scope della tabella che la contiene
  function row(scopeDef, table) {
    i++;   // [
    skip();
    let cut = false;
    if (text[i] === '-') { cut = true; i++; }
    const o = oid();
    const key = o.id + ':' + (o.scope || scopeDef || '');
    if (!rows[key] || cut) rows[key] = {};
    const r = rows[key];
    if (table) table.rows[key] = true;
    for (;;) {
      skip();
      if (i >= n) return key;
      const c = text[i];
      if (c === ']') { i++; return key; }
      if (c === '[') { skipBlock('[', ']'); continue; }   // meta della riga
      if (c === '(') {
        i++;
        let col;
        if (text[i] === '^') { i++; col = colName(token()); } else col = token();
        if (text[i] === '=') { i++; r[col] = literal(); }
        else if (text[i] === '^') { i++; const a = token().toUpperCase(); r[col] = atoms[a] !== undefined ? atoms[a] : ''; }
        while (i < n && text[i] !== ')') i++;
        i++;
        continue;
      }
      i++;
    }
  }
  function skipBlock(a, b) {
    let depth = 0;
    while (i < n) {
      const c = text[i];
      if (c === '(') { i++; literal(); i++; continue; }   // salta i valori (possono contenere [ ] { })
      if (c === a) depth++;
      else if (c === b) { depth--; if (depth === 0) { i++; return; } }
      i++;
    }
  }

  function table() {
    i++;   // {
    skip();
    let clear = false;
    if (text[i] === '-') { clear = true; i++; }
    const o = oid();
    let t = tables.filter(function (x) { return x.id === o.id && x.scope === o.scope; })[0];
    if (!t) { t = { id: o.id, scope: o.scope, kind: '', rows: {} }; tables.push(t); }
    if (clear) t.rows = {};
    for (;;) {
      skip();
      if (i >= n) return;
      const c = text[i];
      if (c === '}') { i++; return; }
      if (c === '{') {   // meta della tabella: (k^BF:c) = tipo
        const s = i;
        skipBlock('{', '}');
        const m = /\(k\^([0-9A-Fa-f]+)/.exec(text.slice(s, i));
        if (m) t.kind = colName(m[1]);
        continue;
      }
      if (c === '[') { row(o.scope, t); continue; }
      if (c === '-') {   // toglie una riga dalla tabella
        i++;
        skip();
        if (text[i] === '[') { delete t.rows[row(o.scope, null)]; continue; }
        const r = oid();
        delete t.rows[r.id + ':' + (r.scope || o.scope || '')];
        continue;
      }
      if (/[0-9A-Fa-f]/.test(c)) { const r = oid(); t.rows[r.id + ':' + (r.scope || o.scope || '')] = true; continue; }
      i++;
    }
  }

  while (i < n) {
    skip();
    if (i >= n) break;
    const c = text[i];
    if (c === '<') dict();
    else if (c === '{') table();
    else if (c === '[') row('', null);
    else if (c === '@') { while (i < n && text[i] !== '\n') i++; }
    else i++;
  }
  return { cols: cols, atoms: atoms, rows: rows, tables: tables };
}

// Righe dei messaggi di un .msf, come oggetti semplici.
const F_READ = 0x1, F_MARKED = 0x4, F_EXPUNGED = 0x8, F_HASRE = 0x10, F_OFFLINE = 0x80;

function hex(v) { const x = parseInt(v, 16); return isNaN(x) ? 0 : x; }

function decode(s) {
  try { return libmime.decodeWords(String(s || '')); } catch (e) { return String(s || ''); }
}
function parseAddress(s) {
  const t = decode(s).trim();
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(t);
  if (m) return { name: m[1].trim(), address: m[2].trim() };
  return { name: '', address: t };
}

function messagesFromMork(db) {
  let keys = null;
  const msgTables = db.tables.filter(function (t) { return /msgs/i.test(t.kind) || /msgs:all|scope:msgs/i.test(t.scope); });
  if (msgTables.length) {
    keys = {};
    msgTables.forEach(function (t) { Object.keys(t.rows).forEach(function (k) { keys[k] = true; }); });
  }
  const out = [];
  Object.keys(keys || db.rows).forEach(function (k) {
    const r = db.rows[k];
    if (!r || r['date'] === undefined || r['flags'] === undefined) return;
    const flags = hex(r['flags']);
    if (flags & F_EXPUNGED) return;
    const subj = decode(r['subject'] || '');
    const id = k.split(':')[0];
    out.push({
      key: id,
      subject: (flags & F_HASRE ? 'Re: ' : '') + subj,
      from: parseAddress(r['sender'] || ''),
      date: new Date(hex(r['date']) * 1000),
      seen: !!(flags & F_READ),
      flagged: !!(flags & F_MARKED),
      offline: !!(flags & F_OFFLINE),
      messageId: r['message-id'] || '',
      token: r['storeToken'] !== undefined && r['storeToken'] !== '' ? String(r['storeToken']) : (r['msgOffset'] !== undefined ? String(hex(r['msgOffset'])) : ''),
      size: hex(r['offlineMsgSize'] || r['size'] || '0')
    });
  });
  return out;
}

// ------------------------------------------------------------ mbox / Maildir

const SEP = /(^|\n)From [^\n]*\n(?=[\x21-\x39\x3b-\x7e]+:)/g;   // "From ..." seguita da un'intestazione

// Fallback senza .msf (o .msf illeggibile): scorre la fine del file mbox.
// Lo stato letto/non letto viene da X-Mozilla-Status (può essere vecchio per IMAP).
function messagesFromMbox(file, maxBytes) {
  let fd;
  try { fd = fs.openSync(file, 'r'); } catch (e) { return []; }
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, maxBytes || 32 * 1024 * 1024);
    const start = size - len;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    const text = buf.toString('latin1');   // 1 byte = 1 carattere: gli indici sono offset
    const starts = [];
    let m;
    SEP.lastIndex = 0;
    while ((m = SEP.exec(text))) starts.push(m.index + m[1].length);
    if (start === 0 && text.indexOf('From ') === 0 && starts[0] !== 0) starts.unshift(0);
    const out = [];
    starts.forEach(function (s, idx) {
      const end = idx + 1 < starts.length ? starts[idx + 1] : text.length;
      const head = text.slice(s, Math.min(end, s + 32768));
      const nl = head.indexOf('\n');
      const hEnd = head.search(/\r?\n\r?\n/);
      const headers = Buffer.from(head.slice(nl + 1, hEnd > 0 ? hEnd : head.length), 'latin1').toString('utf8');
      const h = parseHeaders(headers);
      const st = parseInt(h['x-mozilla-status'] || '0', 16) || 0;
      if (st & F_EXPUNGED) return;
      const d = new Date(h['date'] || '');
      out.push({
        key: String(start + s),
        subject: decode(h['subject'] || ''),
        from: parseAddress(h['from'] || ''),
        date: isNaN(d.getTime()) ? new Date(0) : d,
        seen: !!(st & F_READ),
        flagged: !!(st & F_MARKED),
        offline: true,
        messageId: (h['message-id'] || '').replace(/[<>]/g, ''),
        token: String(start + s),
        size: end - s
      });
    });
    return out;
  } finally { fs.closeSync(fd); }
}

function parseHeaders(text) {
  const out = {};
  String(text).replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(function (line) {
    const i = line.indexOf(':');
    if (i > 0) { const k = line.slice(0, i).trim().toLowerCase(); if (out[k] === undefined) out[k] = line.slice(i + 1).trim(); }
  });
  return out;
}

// Testo grezzo di un messaggio. mbox: token = posizione; Maildir: token = nome del file.
function readSource(inbox, msg, maildir, maxBytes) {
  if (maildir) {
    const name = path.basename(String(msg.token || ''));
    if (!name) return null;
    const dirs = ['cur', 'new', ''];
    for (let i = 0; i < dirs.length; i++) {
      const f = path.join(inbox, dirs[i], name);
      if (fs.existsSync(f)) {
        const fd = fs.openSync(f, 'r');
        try {
          const len = Math.min(fs.fstatSync(fd).size, maxBytes);
          const b = Buffer.alloc(len);
          fs.readSync(fd, b, 0, len, 0);
          return b;
        } finally { fs.closeSync(fd); }
      }
    }
    return null;
  }
  const off = parseInt(msg.token, 10);
  if (isNaN(off) || off < 0) return null;
  let fd;
  try { fd = fs.openSync(inbox, 'r'); } catch (e) { return null; }
  try {
    const size = fs.fstatSync(fd).size;
    if (off >= size) return null;
    const want = Math.min(maxBytes, size - off, msg.size ? msg.size + 4096 : maxBytes);
    const b = Buffer.alloc(want);
    fs.readSync(fd, b, 0, want, off);
    let text = b.toString('latin1');
    if (text.indexOf('From ') !== 0) return null;   // posizione non valida (cartella compattata?)
    text = text.slice(text.indexOf('\n') + 1);
    SEP.lastIndex = 0;
    const m = SEP.exec(text);
    if (m) text = text.slice(0, m.index);
    return Buffer.from(text.replace(/^>(>*From )/gm, '$1'), 'latin1');
  } finally { fs.closeSync(fd); }
}

// ------------------------------------------------------------ programma

function executable() {
  if (process.platform === 'win32') {
    const list = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Mozilla Thunderbird', 'thunderbird.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Mozilla Thunderbird', 'thunderbird.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Mozilla Thunderbird', 'thunderbird.exe')
    ];
    return list.filter(function (f) { return fs.existsSync(f); })[0] || '';
  }
  const list = ['/usr/bin/thunderbird', '/usr/local/bin/thunderbird', '/snap/bin/thunderbird', '/var/lib/flatpak/exports/bin/org.mozilla.Thunderbird',
    path.join(os.homedir(), '.local/share/flatpak/exports/bin/org.mozilla.Thunderbird')];
  return list.filter(function (f) { return fs.existsSync(f); })[0] || '';
}

const DOWNLOAD_URL = 'https://www.thunderbird.net/download/';

module.exports = {
  DOWNLOAD_URL: DOWNLOAD_URL,
  roots: roots,
  findProfile: findProfile,
  accounts: accounts,
  inboxPath: inboxPath,
  parseIni: parseIni,
  parsePrefs: parsePrefs,
  parseMork: parseMork,
  messagesFromMork: messagesFromMork,
  messagesFromMbox: messagesFromMbox,
  readSource: readSource,
  executable: executable
};
