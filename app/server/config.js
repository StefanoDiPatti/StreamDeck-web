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

// Impronta di un file di config, uguale su Windows (CRLF) e Linux (LF).
function fingerprint(text) {
  return require('crypto').createHash('sha1').update(String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')).digest('hex');
}

// I file in config/ ancora identici a un default precedente (nessuno li ha toccati)
// passano alla versione nuova: così gli aggiornamenti arrivano anche a chi li ha già.
// Ritorna i file aggiornati. (Le cartelle si possono cambiare per i test.)
function upgradeUserConfig(configDir, defaultsDir) {
  configDir = configDir || paths.CONFIG_DIR;
  defaultsDir = defaultsDir || paths.DEFAULTS_DIR;
  let history = {};
  try { history = parseJson(fs.readFileSync(path.join(defaultsDir, 'history.json'), 'utf8')); } catch (e) { return []; }
  const updated = [];
  FILES.forEach(function (name) {
    const target = path.join(configDir, name + '.json');
    const source = path.join(defaultsDir, name + '.json');
    const old = Array.isArray(history[name]) ? history[name] : [];
    if (!old.length || !fs.existsSync(target) || !fs.existsSync(source)) return;
    try {
      const mine = fingerprint(fs.readFileSync(target, 'utf8'));
      const fresh = fs.readFileSync(source, 'utf8');
      if (mine === fingerprint(fresh) || old.indexOf(mine) < 0) return;
      fs.writeFileSync(target + '.tmp', fresh);
      fs.renameSync(target + '.tmp', target);
      updated.push(name + '.json');
    } catch (e) {
      log.warn('config', 'aggiornamento di ' + name + '.json non riuscito: ' + e.message);
    }
  });
  return updated;
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

// Sistema di questo PC nei file di config: "windows" | "linux" | "darwin".
function currentOs() { return process.platform === 'win32' ? 'windows' : process.platform; }

// Pagine e pulsanti per sistema operativo:
//   "os": "linux" (o una lista)  -> compare solo lì
//   "linux": { "label": ... }    -> campi sostituiti su quel sistema (anche "windows")
// Ritorna null se l'elemento non vale per questo sistema.
function forOs(item, osKey) {
  if (!item || typeof item !== 'object') return item;
  if (item.os) {
    const list = Array.isArray(item.os) ? item.os : [item.os];
    if (list.indexOf(osKey) < 0) return null;
  }
  const out = Object.assign({}, item, item[osKey] && typeof item[osKey] === 'object' && !Array.isArray(item[osKey]) ? item[osKey] : {});
  delete out.os; delete out.windows; delete out.linux; delete out.darwin;
  return out;
}

// Griglia scelta in base al numero di celle occupate: niente buchi inutili e
// celle di forma comoda sul tablet (orizzontale). Meno pulsanti = pulsanti più grandi.
function autoGrid(tiles) {
  let cells = 0, minCols = 1, minRows = 1;
  tiles.forEach(function (t) { cells += (t.w || 1) * (t.h || 1); minCols = Math.max(minCols, t.w || 1); minRows = Math.max(minRows, t.h || 1); });
  cells = Math.max(1, cells);
  let best = null;
  for (let r = minRows; r <= 6; r++) {
    const c = Math.max(minCols, Math.ceil(cells / r));
    if (c > 8) continue;
    const score = (c * r - cells) + 3 * Math.abs(Math.log((c / r) / 1.7));
    if (!best || score < best.score - 1e-9) best = { columns: c, rows: r, score: score };
  }
  return best ? { columns: best.columns, rows: best.rows } : { columns: 8, rows: 6 };
}

// Le pagine i cui pulsanti si scelgono e ordinano dal pannello: solo pulsanti, oppure
// (con "buttonRow") widget sopra e una fila di pulsanti sotto (pagina VIBER).
function editablePage(p) {
  const buttons = p.tiles.filter(function (t) { return !t.widget; });
  return buttons.length > 0 && (buttons.length === p.tiles.length || !!p.buttonRow);
}

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

// Normalizza dock.json: id per ogni tile, dimensioni valide, default sensati.
// layout = scelte del pannello di controllo; osKey = sistema (per i test).
function normalizeDock(raw, layout, osKey) {
  raw = raw || {};
  layout = layout || {};
  osKey = osKey || currentOs();
  const grid = raw.grid || {};
  const columns = clampInt(grid.columns, 1, 8, 5);
  const rows = clampInt(grid.rows, 1, 6, 3);
  const pages = [];
  const seenPages = {};
  const tileLayout = layout.tiles && typeof layout.tiles === 'object' ? layout.tiles : {};
  (Array.isArray(raw.pages) ? raw.pages : []).forEach(function (p) {
    if (!p || typeof p.id !== 'string' || seenPages[p.id]) return;
    p = forOs(p, osKey);
    if (!p) return;
    seenPages[p.id] = true;
    let cols = clampInt(p.columns, 1, 8, columns);
    let rws = clampInt(p.rows, 1, 6, rows);
    const seenTiles = {};
    // gli id automatici si calcolano prima del filtro per sistema: restano uguali ovunque
    let all = (Array.isArray(p.tiles) ? p.tiles : []).map(function (t, i) {
      t = Object.assign({}, t || {});
      let id = typeof t.id === 'string' && t.id ? t.id : p.id + '-' + i;
      while (seenTiles[id]) id += '_';
      seenTiles[id] = true;
      t.id = id;
      return t;
    }).map(function (t) { return forOs(t, osKey); }).filter(Boolean);

    // Pulsanti scelti dal pannello: "show" in ordine, "hide" nascosti,
    // quelli nuovi (in nessuna delle due liste) in fondo.
    // "hidden": true = pulsante disponibile ma nascosto finché non lo mostri dal pannello.
    const custom = tileLayout[p.id];
    const row = !!p.buttonRow;
    const editable = editablePage({ tiles: all, buttonRow: row });
    const fixed = all.filter(function (t) { return t.widget; });
    const buttons = all.filter(function (t) { return !t.widget; });
    let shownButtons = buttons.filter(function (t) { return !t.hidden; });
    const useCustom = !!(custom && Array.isArray(custom.show) && editable);
    if (useCustom) {
      const byId = {};
      buttons.forEach(function (t) { byId[t.id] = t; });
      const hide = Array.isArray(custom.hide) ? custom.hide : [];
      const shown = custom.show.filter(function (id, i) { return byId[id] && custom.show.indexOf(id) === i; });
      shownButtons = shown.map(function (id) { return byId[id]; })
        .concat(buttons.filter(function (t) { return shown.indexOf(t.id) < 0 && hide.indexOf(t.id) < 0 && !t.hidden; }));
    }
    // widget prima, poi i pulsanti. Con "buttonRow" la griglia è solo per i widget: i
    // pulsanti stanno in una fila in fondo (il tablet toglie quelli che non si possono usare).
    let tiles = editable ? fixed.concat(shownButtons) : all;
    const changed = tiles.length !== all.length || tiles.some(function (t, i) { return t !== all[i]; });
    if (!row && (p.autoGrid || useCustom || changed)) {
      const g = autoGrid(tiles.map(function (t) { return { w: clampInt(t.w, 1, 8, 1), h: clampInt(t.h, 1, 6, 1) }; }));
      cols = g.columns;
      rws = g.rows;
    }
    tiles.forEach(function (t) {
      t.w = clampInt(t.w, 1, cols, 1);
      t.h = clampInt(t.h, 1, rws, 1);
    });
    pages.push({
      id: p.id,
      title: p.title || p.id.toUpperCase(),
      icon: p.icon || null,
      description: typeof p.description === 'string' ? p.description : '',
      tab: p.tab !== false,
      columns: cols,
      rows: rws,
      tiles: tiles,
      allTiles: all,
      buttonRow: row,
      editable: editable
    });
  });
  if (!pages.length) {
    pages.push({ id: 'main', title: 'HOME', icon: 'home', description: '', tab: true, columns: columns, rows: rows, tiles: [], allTiles: [], editable: false });
  }
  let home = raw.home && seenPages[raw.home] ? raw.home : pages[0].id;

  // Pannello di controllo (layout.json): quali pagine stanno nella barra in basso e in che ordine.
  // Le altre restano raggiungibili dai pulsanti { "type": "page" }.
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
    title: raw.title || 'VIBE DECK',
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

// Il dock per il tablet: senza i dati che servono solo al pannello.
function tabletDock() {
  const d = dock();
  return Object.assign({}, d, {
    pages: d.pages.map(function (p) {
      const out = Object.assign({}, p);
      delete out.allTiles; delete out.editable;
      return out;
    })
  });
}

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
//  tabs/home : pagine nella barra e pagina iniziale
//  tiles     : { idPagina: { show: [id pulsanti in ordine], hide: [id nascosti] } }
//              (se manca restano le scelte già salvate)
function saveLayout(tabs, home, tiles) {
  const all = normalizeDock(mergedDock(), {});
  const ids = {};
  all.pages.forEach(function (p) { ids[p.id] = p; });
  tabs = (Array.isArray(tabs) ? tabs : []).map(String).filter(function (id, i, a) { return ids[id] && a.indexOf(id) === i; });
  if (!tabs.length) throw Object.assign(new Error('Serve almeno una pagina nella barra'), { code: 'BAD_REQUEST' });
  if (tabs.length > 10) throw Object.assign(new Error('Al massimo 10 pagine nella barra: sul tablet non ci starebbero'), { code: 'BAD_REQUEST' });
  home = ids[home] ? String(home) : tabs[0];
  const previous = get('layout') || {};
  let outTiles = previous.tiles && typeof previous.tiles === 'object' ? Object.assign({}, previous.tiles) : {};
  if (tiles && typeof tiles === 'object') {
    Object.keys(tiles).forEach(function (pageId) {
      const page = ids[pageId];
      const t = tiles[pageId];
      if (!page || !page.editable || !t) return;
      // pulsanti di altri sistemi (es. Windows se sei su Linux): restano dove sono
      const known = {};
      page.allTiles.forEach(function (x) { if (!x.widget) known[x.id] = true; });
      const clean = function (list) { return (Array.isArray(list) ? list : []).map(String).filter(function (id, i, a) { return known[id] && a.indexOf(id) === i; }); };
      const show = clean(t.show);
      const hide = clean(t.hide).filter(function (id) { return show.indexOf(id) < 0; });
      if (!show.length) throw Object.assign(new Error('La pagina ' + page.title + ' deve avere almeno un pulsante'), { code: 'BAD_REQUEST' });
      if (show.length > 48) throw Object.assign(new Error('Troppi pulsanti nella pagina ' + page.title), { code: 'BAD_REQUEST' });
      const old = outTiles[pageId] || {};
      const keep = function (list) { return (Array.isArray(list) ? list : []).filter(function (id) { return !known[id]; }); };
      outTiles[pageId] = { show: show.concat(keep(old.show)), hide: hide.concat(keep(old.hide)) };
    });
  }
  const data = { tabs: tabs, home: home };
  if (Object.keys(outTiles).length) data.tiles = outTiles;
  const file = path.join(paths.CONFIG_DIR, 'layout.json');
  if (!fs.existsSync(paths.CONFIG_DIR)) fs.mkdirSync(paths.CONFIG_DIR, { recursive: true });
  const text = '// Scritto dal pannello di controllo (doppio clic sull\'icona Vibe Deck).\n' +
    '// tabs = pagine nella barra del tablet, in ordine. home = pagina iniziale.\n' +
    '// tiles = per pagina, i pulsanti mostrati (show, in ordine) e quelli nascosti (hide).\n' +
    JSON.stringify(data, null, 2) + '\n';
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
  upgradeUserConfig: upgradeUserConfig,
  fingerprint: fingerprint,
  get: get,
  dock: dock,
  tabletDock: tabletDock,
  apps: apps,
  normalizeDock: normalizeDock,
  autoGrid: autoGrid,
  currentOs: currentOs,
  findTile: findTile,
  saveLayout: saveLayout,
  resetLayout: resetLayout,
  version: version,
  errors: getErrors
};
