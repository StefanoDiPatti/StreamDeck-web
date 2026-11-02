// App aperte / chiuse. Per le app con "toggle": true in apps.json il pulsante
// sul tablet mostra se l'app è aperta e, se lo è, la chiude.
//  - di default l'app si riconosce dal nome del processo (es. Code.exe -> "code");
//    si può forzare con "process" e restringere con "title" (regex sul titolo).
//  - con "bridge": "apple" | "youtube" | "ytmusic" si usa l'estensione del
//    browser: aperta = c'è una scheda di quel sito, chiudi = chiude la scheda.
const path = require('path');
const config = require('../config');
const platform = require('../platform');
const bridge = require('./bridge');
const log = require('../log');

let cache = { at: 0, data: null, pending: null };

function forPlatform(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const key = process.platform === 'win32' ? 'windows' : process.platform;
  const specific = entry[key];
  if (specific && typeof specific === 'object') return Object.assign({}, entry, specific);
  if ((entry.windows || entry.linux) && !entry.path) return null;
  return entry;
}

// App con toggle attivo, già "risolte" per questo sistema.
function toggleApps() {
  const apps = (config.get('apps').apps) || {};
  const out = {};
  Object.keys(apps).forEach(function (id) {
    const a = forPlatform(apps[id]);
    if (!a || !a.toggle) return;
    out[id] = {
      id: id,
      label: a.label || id,
      bridge: a.bridge || null,
      process: String(a.process || path.basename(String(a.path || '')).replace(/\.(exe|lnk|cmd|bat)$/i, '')).toLowerCase(),
      title: a.title || ''
    };
  });
  return out;
}

function matches(app, w) {
  if (w.process !== app.process) return false;
  if (!app.title) return true;
  try { return new RegExp(app.title, 'i').test(w.title); } catch (e) { return false; }
}

async function compute() {
  const apps = toggleApps();
  const ids = Object.keys(apps);
  if (!ids.length) return {};
  const needWindows = ids.some(function (id) { return !apps[id].bridge; });
  const windows = needWindows ? await platform.windows().catch(function (e) {
    log.debug('apps', 'elenco finestre: ' + e.message);
    return [];
  }) : [];
  const out = {};
  ids.forEach(function (id) {
    const a = apps[id];
    out[id] = a.bridge ? bridge.hasSite(a.bridge) : windows.some(function (w) { return matches(a, w); });
  });
  return out;
}

// Mappa { appId: true/false }, aggiornata al massimo ogni 2,5 s.
function running() {
  if (cache.data && Date.now() - cache.at < 2500) return Promise.resolve(cache.data);
  if (cache.pending) return cache.pending;
  cache.pending = compute().then(function (d) {
    cache = { at: Date.now(), data: d, pending: null };
    return d;
  }).catch(function () {
    cache.pending = null;
    return cache.data || {};
  });
  return cache.pending;
}

function invalidate() { cache.at = 0; }

// Se l'app ha il toggle ed è aperta, la chiude e ritorna true.
async function closeIfRunning(id) {
  const app = toggleApps()[id];
  if (!app) return false;
  invalidate();
  const state = await running();
  if (!state[id]) return false;
  if (app.bridge) {
    bridge.sendSite(app.bridge, { type: 'close_tab' });
  } else {
    const n = await platform.closeWindows(app.process, app.title);
    if (!n) return false;
  }
  invalidate();
  return true;
}

module.exports = { running: running, closeIfRunning: closeIfRunning, invalidate: invalidate, toggleApps: toggleApps };
