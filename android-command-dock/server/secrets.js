// Cifratura dei dati sensibili salvati su disco (password, token, client secret).
//
// AES-256-GCM con una chiave casuale da 32 byte, custodita dal sistema:
//  - Linux: portachiavi del desktop (Secret Service: KWallet, GNOME Keyring) via secret-tool
//  - Windows: DPAPI dell'utente (la chiave cifrata sta in data/secret-key.dpapi
//             e solo il tuo account Windows su questo PC può aprirla)
//  - altrimenti (o con DOCK_KEYSTORE=file): file data/secret-key con permessi 600.
//    Protegge meno: chi legge la cartella data/ legge anche la chiave.
//
// data/secret-key.json ricorda dove sta la chiave, così se il portachiavi non
// risponde la dock non ne crea una nuova (renderebbe illeggibili i dati cifrati).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const paths = require('./paths');

const PREFIX = 'enc:v1:';
const SERVICE = 'command-dock';

let cachedKey = null;
let keyInfo = { store: null, warning: '' };

function dataDir() { return process.env.DOCK_DATA_DIR || paths.DATA_DIR; }
function markerFile() { return path.join(dataDir(), 'secret-key.json'); }
// Un'installazione = una chiave (più copie della dock sullo stesso PC non si mescolano).
function keyId() { return crypto.createHash('sha1').update(path.resolve(dataDir())).digest('hex').slice(0, 12); }

function ensureDir() { if (!fs.existsSync(dataDir())) fs.mkdirSync(dataDir(), { recursive: true }); }
function writePrivate(file, content) {
  ensureDir();
  fs.writeFileSync(file + '.tmp', content, { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
  try { fs.chmodSync(file, 0o600); } catch (e) { /* Windows */ }
}

// ------------------------------------------------------------ dove sta la chiave

function preferredStore() {
  const forced = (process.env.DOCK_KEYSTORE || '').toLowerCase();
  if (forced) return forced;
  if (process.env.NODE_TEST_CONTEXT) return 'file';   // i test non toccano il portachiavi vero
  if (process.platform === 'win32') return 'dpapi';
  if (process.platform === 'linux') return 'keyring';
  return 'file';
}

const stores = {
  keyring: {
    available: function () {
      return spawnSync('sh', ['-c', 'command -v secret-tool'], { stdio: 'ignore' }).status === 0;
    },
    load: function () {
      const r = spawnSync('secret-tool', ['lookup', 'service', SERVICE, 'key', keyId()], { encoding: 'utf8', timeout: 20000 });
      if (r.status !== 0 || !r.stdout.trim()) return null;
      return Buffer.from(r.stdout.trim(), 'base64');
    },
    save: function (key) {
      const r = spawnSync('secret-tool', ['store', '--label=Command Dock (' + keyId() + ')', 'service', SERVICE, 'key', keyId()],
        { input: key.toString('base64'), encoding: 'utf8', timeout: 20000 });
      return r.status === 0;
    }
  },
  dpapi: {
    file: function () { return path.join(dataDir(), 'secret-key.dpapi'); },
    available: function () { return process.platform === 'win32'; },
    run: function (script, value) {
      const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        'Add-Type -AssemblyName System.Security; ' + script],
        { env: Object.assign({}, process.env, { DOCK_K: value }), encoding: 'utf8', timeout: 20000, windowsHide: true });
      return r.status === 0 ? r.stdout.trim() : null;
    },
    load: function () {
      if (!fs.existsSync(this.file())) return null;
      const out = this.run('[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($env:DOCK_K), $null, \'CurrentUser\'))',
        fs.readFileSync(this.file(), 'utf8').trim());
      return out ? Buffer.from(out, 'base64') : null;
    },
    save: function (key) {
      const out = this.run('[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Convert]::FromBase64String($env:DOCK_K), $null, \'CurrentUser\'))',
        key.toString('base64'));
      if (!out) return false;
      writePrivate(this.file(), out + '\n');
      return true;
    }
  },
  file: {
    file: function () { return path.join(dataDir(), 'secret-key'); },
    available: function () { return true; },
    load: function () {
      if (!fs.existsSync(this.file())) return null;
      return Buffer.from(fs.readFileSync(this.file(), 'utf8').trim(), 'base64');
    },
    save: function (key) { writePrivate(this.file(), key.toString('base64') + '\n'); return true; }
  }
};

function readMarker() {
  try { return JSON.parse(fs.readFileSync(markerFile(), 'utf8')); } catch (e) { return null; }
}

// La chiave (32 byte). La crea al primo uso.
function key() {
  if (cachedKey) return cachedKey;
  const marker = readMarker();
  if (marker && stores[marker.store]) {
    const k = stores[marker.store].load();
    if (!k || k.length !== 32) {
      throw Object.assign(new Error(marker.store === 'keyring'
        ? 'Chiave di cifratura non trovata nel portachiavi del sistema (KWallet/GNOME Keyring chiuso o bloccato?)'
        : 'Chiave di cifratura non leggibile (' + marker.store + ')'), { code: 'NO_KEY' });
    }
    keyInfo = { store: marker.store, warning: marker.store === 'file' && preferredStore() !== 'file' ? 'chiave in un file: il portachiavi del sistema non era disponibile' : '' };
    cachedKey = k;
    return k;
  }
  // I test non creano mai chiavi nella cartella dati vera.
  if (process.env.NODE_TEST_CONTEXT && !process.env.DOCK_DATA_DIR) {
    throw Object.assign(new Error('Nei test serve DOCK_DATA_DIR per la chiave di cifratura'), { code: 'NO_KEY' });
  }
  // primo avvio: nuova chiave nel posto migliore disponibile
  const k = crypto.randomBytes(32);
  let store = preferredStore();
  if (!stores[store] || !stores[store].available() || !stores[store].save(k)) {
    keyInfo.warning = store !== 'file' ? 'portachiavi del sistema non disponibile: chiave salvata in data/secret-key' : '';
    store = 'file';
    stores.file.save(k);
  }
  writePrivate(markerFile(), JSON.stringify({ store: store, id: keyId(), created: new Date().toISOString() }, null, 2) + '\n');
  keyInfo.store = store;
  cachedKey = k;
  return k;
}

// ------------------------------------------------------------ cifra / decifra

function isEncrypted(s) { return typeof s === 'string' && s.indexOf(PREFIX) === 0; }

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

function decrypt(s) {
  if (!isEncrypted(s)) return s;
  const raw = Buffer.from(s.slice(PREFIX.length), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  try {
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch (e) {
    throw Object.assign(new Error('Dati cifrati con un\'altra chiave o danneggiati'), { code: 'BAD_KEY' });
  }
}

// ------------------------------------------------------------ file JSON cifrati

// Legge un JSON che può essere cifrato ({ "encrypted": "enc:v1:..." }) o ancora in chiaro.
// Ritorna { data, plain } (plain = era in chiaro: va riscritto cifrato). File assente -> data null.
function readJson(file) {
  if (!fs.existsSync(file)) return { data: null, plain: false };
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (parsed && isEncrypted(parsed.encrypted)) return { data: JSON.parse(decrypt(parsed.encrypted)), plain: false };
  return { data: parsed, plain: true };
}

function writeJson(file, data) {
  writePrivate(file, JSON.stringify({
    note: 'Cifrato da Command Dock: la chiave è nel portachiavi del sistema (vedi secret-key.json).',
    encrypted: encrypt(JSON.stringify(data))
  }, null, 2) + '\n');
}

// Lettura tollerante per i servizi: se il file in chiaro c'è lo cifra subito;
// se non si può decifrare lo mette da parte (.illeggibile) e riparte vuoto.
function loadJson(file, log) {
  try {
    const r = readJson(file);
    if (r.data && r.plain) {
      try { writeJson(file, r.data); if (log) log.info('secrets', path.basename(file) + ' ora è cifrato'); } catch (e) { if (log) log.warn('secrets', 'cifratura di ' + path.basename(file) + ' non riuscita: ' + e.message); }
    }
    return r.data;
  } catch (e) {
    if (log) log.error('secrets', path.basename(file) + ': ' + e.message);
    if (e.code === 'BAD_KEY') { try { fs.renameSync(file, file + '.illeggibile'); } catch (x) { /* ignora */ } }
    return null;
  }
}

function info() { return { store: keyInfo.store, warning: keyInfo.warning }; }

function _reset() { cachedKey = null; keyInfo = { store: null, warning: '' }; }

module.exports = {
  PREFIX: PREFIX,
  encrypt: encrypt,
  decrypt: decrypt,
  isEncrypted: isEncrypted,
  readJson: readJson,
  writeJson: writeJson,
  loadJson: loadJson,
  key: key,
  info: info,
  _reset: _reset
};
