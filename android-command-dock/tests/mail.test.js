// Email: lettura in sola lettura da un server IMAP finto (hoodiecrow-imap).
// Non usa data/mail.json vero: dati in una cartella temporanea.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DOCK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-mail-'));
process.env.LOG_LEVEL = 'error';
const hoodiecrow = require('hoodiecrow-imap');
const mail = require('../server/services/mail');

const PORT = 14000 + Math.floor(Math.random() * 1000);
let server;

function account(pass) {
  return { id: 'acc1', provider: 'imap', label: 'Prova', email: 'io@example.com', host: '127.0.0.1', port: PORT, secure: false, auth: 'password', pass: pass };
}
function useAccounts(list) {
  fs.writeFileSync(path.join(process.env.DOCK_DATA_DIR, 'mail.json'), JSON.stringify({ accounts: list }));
  mail._reset();
}

test.before(function () {
  server = hoodiecrow({
    plugins: ['id', 'idle', 'unselect', 'enable', 'condstore', 'special-use', 'namespace', 'uidplus'],
    users: { 'io@example.com': { password: 'segreta' } },
    storage: { INBOX: { messages: [
      { raw: 'From: Mario Rossi <mario@example.com>\r\nTo: io@example.com\r\nSubject: =?UTF-8?Q?Ciao_=C3=A8_pronto?=\r\nDate: Mon, 2 Nov 2026 10:00:00 +0000\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nPrima riga\r\nSeconda riga', flags: ['\\Seen'] },
      { raw: 'From: GitHub <noreply@github.com>\r\nTo: io@example.com\r\nSubject: CI fallita\r\nDate: Tue, 3 Nov 2026 10:00:00 +0000\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>La build <b>main</b> &amp; test</p><br>falliti', flags: [] }
    ] } }
  });
  return new Promise(function (resolve) { server.listen(PORT, '127.0.0.1', resolve); });
});
test.after(function () { server.close(); });

test('elenco: più recenti prima, non lette, oggetti decodificati', async function () {
  useAccounts([account('segreta')]);
  const l = await mail.list('acc1', true);
  assert.strictEqual(l.total, 2);
  assert.strictEqual(l.unread, 1);
  assert.deepStrictEqual(l.messages.map(function (m) { return m.subject; }), ['CI fallita', 'Ciao è pronto']);
  assert.strictEqual(l.messages[0].seen, false);
  assert.strictEqual(l.messages[1].from.name, 'Mario Rossi');
  // al tablet non arriva mai la password
  assert.ok(JSON.stringify(mail.state()).indexOf('segreta') < 0);
  assert.ok(JSON.stringify(mail.panelInfo()).indexOf('segreta') < 0);
});

test('aprire un messaggio non lo segna come letto (sola lettura)', async function () {
  useAccounts([account('segreta')]);
  const l = await mail.list('acc1', true);
  const html = await mail.message('acc1', l.messages[0].uid);
  assert.strictEqual(html.text, 'La build main & test\n\nfalliti');
  const plain = await mail.message('acc1', l.messages[1].uid);
  assert.strictEqual(plain.text, 'Prima riga\nSeconda riga');
  assert.strictEqual((await mail.list('acc1', true)).unread, 1);
});

test('password sbagliata: errore chiaro', async function () {
  useAccounts([account('sbagliata')]);
  await assert.rejects(mail.list('acc1', true), /Accesso rifiutato/);
  assert.strictEqual(mail.state().accounts[0].status, 'error');
});

test('aggiunta dal pannello: prova l\'accesso prima di salvare', async function () {
  useAccounts([]);
  await assert.rejects(mail.addAccount({ provider: 'gmail', email: 'non-valida' }), /non valido/);
  await assert.rejects(mail.addAccount({ provider: 'imap', email: 'io@example.com', host: 'bad host!', password: 'x' }), /Server IMAP non valido/);
  await assert.rejects(mail.addAccount({ provider: 'outlook', email: 'io@outlook.com', clientId: 'abc' }), /Client ID non valido/);
  assert.strictEqual(mail.state().accounts.length, 0);
});

test('htmlToText: testo leggibile dalle email in HTML', function () {
  assert.strictEqual(mail.htmlToText('<style>p{}</style><p>Ciao &amp; <b>benvenuto</b></p><br>riga'), 'Ciao & benvenuto\n\nriga');
});

test('account sconosciuto e messaggio non valido', async function () {
  useAccounts([account('segreta')]);
  await assert.rejects(mail.list('nessuno'), /sconosciuto/);
  await assert.rejects(mail.message('acc1', 'abc'), /non valido/);
  assert.throws(function () { mail.removeAccount('nessuno'); }, /sconosciuto/);
  mail.removeAccount('acc1');
  assert.strictEqual(mail.state().accounts.length, 0);
});
