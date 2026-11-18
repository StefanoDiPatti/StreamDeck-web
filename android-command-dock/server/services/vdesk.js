'use strict';
// Desktop virtuali di Windows (pagina SCHERMI).
// Windows non ha un'API pubblica per gestirli, quindi:
//  - l'elenco, l'ordine e quello attivo si leggono dal registro (lo scrive Explorer):
//    HKCU\...\Explorer\VirtualDesktops -> VirtualDesktopIDs (16 byte per desktop),
//    CurrentVirtualDesktop, Desktops\{guid}\Name (nome scelto dall'utente)
//    Su Windows 10 il desktop attivo sta in ...\Explorer\SessionInfo\<n>\VirtualDesktops.
//  - passare, creare e chiudere si fa con le scorciatoie di Windows
//    (Win+Ctrl+←/→, Win+Ctrl+D, Win+Ctrl+F4), come faresti dalla tastiera.
const { execFile } = require('child_process');
const platform = require('../platform');
const log = require('../log');

const KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VirtualDesktops';
const SESSION_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\SessionInfo';
const MAX = 20;

function supported() { return process.platform === 'win32'; }

function err(msg, code) { return Object.assign(new Error(msg), { code: code || 'BAD_REQUEST' }); }

function regQuery(key) {
  return new Promise(function (resolve) {
    execFile('reg', ['query', key, '/s'], { windowsHide: true, timeout: 5000 }, function (e, out) {
      resolve(e ? '' : String(out || ''));
    });
  });
}

// 16 byte del registro -> GUID in maiuscolo (i primi tre campi sono little endian)
function guidFromHex(hex) {
  const h = String(hex || '').toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(h)) return '';
  function rev(s) { return s.match(/../g).reverse().join(''); }
  return rev(h.slice(0, 8)) + '-' + rev(h.slice(8, 12)) + '-' + rev(h.slice(12, 16)) + '-' + h.slice(16, 20) + '-' + h.slice(20, 32);
}

function binValue(text, name) {
  const m = new RegExp('^\\s+' + name + '\\s+REG_BINARY\\s+([0-9A-Fa-f]*)\\s*$', 'm').exec(text);
  return m ? m[1] : null;
}

// Uscita di "reg query <KEY> /s" (+ quella di SessionInfo per Windows 10) -> desktop in ordine.
function parse(text, sessionText) {
  const ids = [];
  const raw = binValue(text, 'VirtualDesktopIDs');
  if (raw) for (let i = 0; i + 32 <= raw.length; i += 32) ids.push(guidFromHex(raw.slice(i, i + 32)));
  // nomi: blocchi "...\Desktops\{GUID}" seguiti da "Name REG_SZ ..."
  const names = {};
  const re = /\\Desktops\\\{([0-9A-Fa-f-]{36})\}\r?\n((?:[ \t]+\S.*\r?\n?)*)/g;
  let m;
  while ((m = re.exec(text))) {
    const n = /^\s+Name\s+REG_SZ\s+(.*?)\s*$/m.exec(m[2]);
    if (n && n[1]) names[m[1].toUpperCase()] = n[1];
  }
  let cur = binValue(text, 'CurrentVirtualDesktop');
  if (!cur && sessionText) cur = binValue(sessionText, 'CurrentVirtualDesktop');
  const current = cur ? guidFromHex(cur) : '';
  // mai creato un secondo desktop: Explorer non scrive l'elenco, ce n'è uno solo
  if (!ids.length) return [{ id: current || 'unico', n: 1, name: 'Desktop 1', current: true }];
  let found = false;
  const list = ids.map(function (id, i) {
    const on = id === current;
    if (on) found = true;
    return { id: id, n: i + 1, name: names[id] || 'Desktop ' + (i + 1), current: on };
  });
  if (!found) list[0].current = true;   // Win10 senza SessionInfo leggibile: meglio il primo che niente
  return list;
}

async function read() {
  const text = await regQuery(KEY);
  const sess = binValue(text, 'CurrentVirtualDesktop') ? '' : await regQuery(SESSION_KEY);
  return parse(text, sess);
}

function currentIndex(list) {
  for (let i = 0; i < list.length; i++) if (list[i].current) return i;
  return 0;
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// Explorer aggiorna il registro dopo l'animazione: aspetta che arrivi la condizione.
async function waitFor(test, ms) {
  const end = Date.now() + (ms || 2000);
  let list = await read();
  while (!test(list) && Date.now() < end) { await sleep(120); list = await read(); }
  return list;
}

// Per l'anteprima (come Win+Tab): ogni desktop con le sue finestre e i monitor in scala.
async function preview(desktops) {
  const out = { supported: true, desktops: desktops, monitors: [] };
  try {
    const screens = require('./screens');
    out.monitors = (await screens.monitors()).map(function (m) { return { id: m.id, n: m.n, x: m.x, y: m.y, w: m.w, h: m.h }; });
  } catch (e) { log.debug('vdesk', 'monitor: ' + e.message); }
  let wins = [];
  if (typeof platform.deskWindows === 'function') {
    try { wins = await platform.deskWindows(); } catch (e) { log.debug('vdesk', 'finestre: ' + e.message); }
  }
  const by = {};
  desktops.forEach(function (d) { d.windows = []; by[d.id] = d; });
  wins.forEach(function (w) {
    const d = by[w.desktop];
    if (!d || w.pid === process.pid) return;
    d.windows.push({ title: w.title, process: w.process, state: w.state, x: w.x, y: w.y, w: w.w, h: w.h });
  });
  return out;
}

async function list() {
  if (!supported()) return { supported: false, desktops: [], monitors: [] };
  return preview(await read());
}

async function go(list, index) {
  let cur = currentIndex(list);
  const diff = index - cur;
  const key = diff > 0 ? 'RIGHT' : 'LEFT';
  for (let i = 0; i < Math.abs(diff); i++) {
    await platform.sendKeys(['WIN', 'CTRL', key]);
    await sleep(160);
  }
  const want = list[index].id;
  return waitFor(function (l) { return l[currentIndex(l)].id === want; });
}

// action: switch (id) | create | delete (id; senza id quello attivo)
async function action(act, id) {
  if (!supported()) throw err('I desktop virtuali si gestiscono solo su Windows');
  let desktops = await read();
  const idx = id ? desktops.map(function (d) { return d.id; }).indexOf(String(id)) : currentIndex(desktops);
  if (act === 'switch') {
    if (idx < 0) throw err('Desktop non trovato (è stato chiuso?)', 'NOT_FOUND');
    if (!desktops[idx].current) desktops = await go(desktops, idx);
  } else if (act === 'create') {
    if (desktops.length >= MAX) throw err('Hai già ' + MAX + ' desktop');
    const before = desktops.length;
    await platform.sendKeys(['WIN', 'CTRL', 'D']);
    desktops = await waitFor(function (l) { return l.length > before; });
    log.info('vdesk', 'nuovo desktop virtuale (' + desktops.length + ')');
  } else if (act === 'delete') {
    if (idx < 0) throw err('Desktop non trovato (è stato chiuso?)', 'NOT_FOUND');
    if (desktops.length < 2) throw err('C\'è un solo desktop: non si può chiudere');
    const gone = desktops[idx].id, before = desktops.length;
    // Win+Ctrl+F4 chiude quello attivo: prima ci si va
    if (!desktops[idx].current) {
      desktops = await go(desktops, idx);
      if (desktops[currentIndex(desktops)].id !== gone) throw err('Non sono riuscito ad aprire quel desktop per chiuderlo');
    }
    await platform.sendKeys(['WIN', 'CTRL', 'F4']);
    desktops = await waitFor(function (l) { return l.length < before; });
    log.info('vdesk', 'desktop virtuale chiuso (ne restano ' + desktops.length + ')');
  } else {
    throw err('Azione non valida');
  }
  return preview(desktops);
}

module.exports = { list: list, action: action, _parse: parse, _guidFromHex: guidFromHex };
