// Caricamento configurazione JSON con:
// - copia automatica dei default (config/defaults) al primo avvio
// - commenti // e /* */ ammessi nei file
// - ricarica a caldo quando un file cambia (niente riavvio)
const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const log = require('./log');

const FILES = ['dock', 'apps', 'commands', 'services', 'layout'];
// layout.json è scritto dal pannello di controllo sul PC: se manca va bene così.
const OPTIONAL = { layout: true };
const cache = {};   // name -> { mtime, data }
const errors = {};  // name -> messaggio dell'ultimo errore di parsing

// Rimuove i commenti dal JSON senza toccare le stringhe.
function stripJsonComments(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inString) {
      out += c;
      if (c === '\\') { out += n === undefined ? '' : n; i++; }
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
      continue;
    }
    out += c;
  }
  return removeTrailingCommas(out);
}

// Virgole finali tollerate ( [1,2,] / {"a":1,} ), senza toccare le stringhe.
function removeTrailingCommas(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') { out += text[i + 1] === undefined ? '' : text[i + 1]; i++; }
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') continue;
    }
    out += c;
  }
  return out;
}

function parseJson(text) {
  return JSON.parse(stripJsonComments(text.replace(/^﻿/, '')));
}

// Copia config/defaults/*.json in config/ se mancano. Ritorna i file copiati.
function ensureUserConfig() {
  const copied = [];
  if (!fs.existsSync(paths.CONFIG_DIR)) fs.mkdirSync(paths.CONFIG_DIR, { recursive: true });
  FILES.forEach(function (name) {
    const target = path.join(paths.CONFIG_DIR, name + '.json');
    const source = path.join(paths.DEFAULTS_DIR, name + '.json');
    if (!fs.existsSync(target) && fs.existsSync(source)) {
      fs.copyFileSync(source, target);
      copied.push(name + '.json');
    }
  });
  return copied;
}

function fileFor(name) {
  const user = path.join(paths.CONFIG_DIR, name + '.json');
  if (fs.existsSync(user)) return user;
  return path.join(paths.DEFAULTS_DIR, name + '.json');
}

function get(name) {
  const file = fileFor(name);
  let stat;
  try { stat = fs.statSync(file); } catch (e) {
    if (OPTIONAL[name]) {
      if (cache[name] && cache[name].mtime) log.info('config', name + '.json rimosso');
      cache[name] = { mtime: 0, file: file, data: {} };
      return cache[name].data;
    }
    errors[name] = 'File mancante: ' + path.basename(file);
    return (cache[name] && cache[name].data) || {};
  }
  const entry = cache[name];
  if (entry && entry.mtime === stat.mtimeMs && entry.file === file) return entry.data;
  try {
    const data = parseJson(fs.readFileSync(file, 'utf8'));
    cache[name] = { mtime: stat.mtimeMs, file: file, data: data };
    if (entry) log.info('config', name + '.json ricaricato');
    delete errors[name];
    return data;
  } catch (e) {
    const msg = name + '.json non valido: ' + e.message;
    if (errors[name] !== msg) log.error('config', msg + ' (uso l\'ultima versione valida)');
    errors[name] = msg;
    if (entry) { entry.mtime = stat.mtimeMs; return entry.data; }
    return {};
  }
}

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

// Normalizza dock.json: id per ogni tile, dimensioni valide, default sensati.
function normalizeDock(raw, layout) {
  raw = raw || {};
  const grid = raw.grid || {};
  const columns = clampInt(grid.columns, 1, 8, 5);
  const rows = clampInt(grid.rows, 1, 6, 3);
  const pages = [];
  const seenPages = {};
  (Array.isArray(raw.pages) ? raw.pages : []).forEach(function (p) {
    if (!p || typeof p.id !== 'string' || seenPages[p.id]) return;
    seenPages[p.id] = true;
    const cols = clampInt(p.columns, 1, 8, columns);
    const rws = clampInt(p.rows, 1, 6, rows);
    const seenTiles = {};
    const tiles = (Array.isArray(p.tiles) ? p.tiles : []).map(function (t, i) {
      t = Object.assign({}, t || {});
      let id = typeof t.id === 'string' && t.id ? t.id : p.id + '-' + i;
      while (seenTiles[id]) id += '_';
      seenTiles[id] = true;
      t.id = id;
      t.w = clampInt(t.w, 1, cols, 1);
      t.h = clampInt(t.h, 1, rws, 1);
      return t;
    });
    pages.push({
      id: p.id,
      title: p.title || p.id.toUpperCase(),
      icon: p.icon || null,
      description: typeof p.description === 'string' ? p.description : '',
      tab: p.tab !== false,
      columns: cols,
      rows: rws,
      tiles: tiles
    });
  });
  if (!pages.length) {
    pages.push({ id: 'main', title: 'HOME', icon: 'home', description: '', tab: true, columns: columns, rows: rows, tiles: [] });
  }
  let home = raw.home && seenPages[raw.home] ? raw.home : pages[0].id;

  // Pannello di controllo (layout.json): quali pagine stanno nella barra in basso e in che ordine.
  // Le altre restano raggiungibili dai pulsanti { "type": "page" }.
  layout = layout || {};
  if (Array.isArray(layout.tabs)) {
    const order = layout.tabs.filter(function (id, i) { return seenPages[id] && layout.tabs.indexOf(id) === i; });
    if (order.length) {
      const rank = {};
      pages.forEach(function (p, i) { rank[p.id] = order.indexOf(p.id) >= 0 ? order.indexOf(p.id) : 1000 + i; p.tab = order.indexOf(p.id) >= 0; });
      pages.sort(function (a, b) { return rank[a.id] - rank[b.id]; });
    }
  }
  if (typeof layout.home === 'string' && seenPages[layout.home]) home = layout.home;

  return {
    title: raw.title || 'COMMAND DOCK',
    theme: raw.theme || {},
    grid: { columns: columns, rows: rows },
    home: home,
    pages: pages
  };
}

// Default letto direttamente (per le pagine aggiunte con gli aggiornamenti).
let defaultsCache = null;
function defaultDock() {
  const file = path.join(paths.DEFAULTS_DIR, 'dock.json');
  try {
    const mtime = fs.statSync(file).mtimeMs;
    if (!defaultsCache || defaultsCache.mtime !== mtime) defaultsCache = { mtime: mtime, data: parseJson(fs.readFileSync(file, 'utf8')) };
    return defaultsCache.data;
  } catch (e) { return {}; }
}

// dock.json dell'utente + le pagine dei default che non ha (nuovi moduli, es. Discord):
// arrivano come "disponibili", fuori dalla barra finché non le attivi dal pannello.
function mergedDock() {
  const user = get('dock');
  if (fileFor('dock') === path.join(paths.DEFAULTS_DIR, 'dock.json')) return user;
  const have = {};
  (Array.isArray(user.pages) ? user.pages : []).forEach(function (p) { if (p && p.id) have[p.id] = true; });
  const extra = (defaultDock().pages || []).filter(function (p) { return p && p.id && !have[p.id]; })
    .map(function (p) { return Object.assign({}, p, { tab: false }); });
  if (!extra.length) return user;
  return Object.assign({}, user, { pages: (user.pages || []).concat(extra) });
}

function dock() { return normalizeDock(mergedDock(), get('layout')); }

// apps.json dell'utente + le app dei default che non ha (es. i giochi aggiunti dopo).
function apps() {
  const user = (get('apps').apps) || {};
  if (fileFor('apps') === path.join(paths.DEFAULTS_DIR, 'apps.json')) return user;
  let defaults = {};
  try { defaults = parseJson(fs.readFileSync(path.join(paths.DEFAULTS_DIR, 'apps.json'), 'utf8')).apps || {}; } catch (e) { /* nessun default */ }
  return Object.assign({}, defaults, user);
}

function findTile(pageId, tileId) {
  const d = dock();
  for (let i = 0; i < d.pages.length; i++) {
    if (d.pages[i].id !== pageId) continue;
    const tiles = d.pages[i].tiles;
    for (let j = 0; j < tiles.length; j++) if (tiles[j].id === tileId) return tiles[j];
  }
  return null;
}

// Cambia quando uno dei file di config cambia: il client lo usa per ricaricarsi.
function version() {
  return FILES.map(function (name) {
    get(name);
    return cache[name] ? Math.round(cache[name].mtime) : 0;
  }).join('-');
}

// Salva le scelte del pannello di controllo. Ritorna il dock aggiornato.
function saveLayout(tabs, home) {
  const all = normalizeDock(mergedDock(), {});
  const ids = {};
  all.pages.forEach(function (p) { ids[p.id] = true; });
  tabs = (Array.isArray(tabs) ? tabs : []).map(String).filter(function (id, i, a) { return ids[id] && a.indexOf(id) === i; });
  if (!tabs.length) throw Object.assign(new Error('Serve almeno una pagina nella barra'), { code: 'BAD_REQUEST' });
  if (tabs.length > 10) throw Object.assign(new Error('Al massimo 10 pagine nella barra: sul tablet non ci starebbero'), { code: 'BAD_REQUEST' });
  home = ids[home] ? String(home) : tabs[0];
  const file = path.join(paths.CONFIG_DIR, 'layout.json');
  if (!fs.existsSync(paths.CONFIG_DIR)) fs.mkdirSync(paths.CONFIG_DIR, { recursive: true });
  const text = '// Scritto dal pannello di controllo (doppio clic sull\'icona Command Dock).\n' +
    '// tabs = pagine nella barra del tablet, in ordine. home = pagina iniziale.\n' +
    JSON.stringify({ tabs: tabs, home: home }, null, 2) + '\n';
  fs.writeFileSync(file + '.tmp', text);
  fs.renameSync(file + '.tmp', file);
  return dock();
}

// Torna alle pagine definite in dock.json ("tab": true/false).
function resetLayout() {
  const file = path.join(paths.CONFIG_DIR, 'layout.json');
  try { fs.unlinkSync(file); } catch (e) { /* già assente */ }
  return dock();
}

function getErrors() {
  FILES.forEach(get);
  return Object.keys(errors).map(function (k) { return errors[k]; });
}

module.exports = {
  FILES: FILES,
  stripJsonComments: stripJsonComments,
  parseJson: parseJson,
  ensureUserConfig: ensureUserConfig,
  get: get,
  dock: dock,
  apps: apps,
  normalizeDock: normalizeDock,
  findTile: findTile,
  saveLayout: saveLayout,
  resetLayout: resetLayout,
  version: version,
  errors: getErrors
};
