// Caricamento configurazione JSON con:
// - copia automatica dei default (config/defaults) al primo avvio
// - commenti // e /* */ ammessi nei file
// - ricarica a caldo quando un file cambia (niente riavvio)
const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const log = require('./log');

const FILES = ['dock', 'apps', 'commands', 'services'];
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
function normalizeDock(raw) {
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
      tab: p.tab !== false,
      columns: cols,
      rows: rws,
      tiles: tiles
    });
  });
  if (!pages.length) {
    pages.push({ id: 'main', title: 'HOME', icon: 'home', tab: true, columns: columns, rows: rows, tiles: [] });
  }
  return {
    title: raw.title || 'COMMAND DOCK',
    theme: raw.theme || {},
    grid: { columns: columns, rows: rows },
    home: raw.home && seenPages[raw.home] ? raw.home : pages[0].id,
    pages: pages
  };
}

function dock() { return normalizeDock(get('dock')); }

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
  normalizeDock: normalizeDock,
  findTile: findTile,
  version: version,
  errors: getErrors
};
