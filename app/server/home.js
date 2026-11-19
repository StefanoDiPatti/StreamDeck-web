// HOME configurabile dal pannello di controllo: quali widget, dove e quanto grandi.
// Le scelte stanno in config/layout.json ("homePage": { columns, rows, tiles: [{ id, x, y, w, h }] })
// e vincono sulla pagina "main" (config/defaults/pages/main.json o la tua copia in config/pages/).
// x, y = colonna e riga (da 0). Senza posizione (HOME salvate prima) i widget si dispongono
// come sul tablet: in ordine, nella prima cella libera (pack).

const HOME_ID = 'main';

// Un widget per ogni pagina, in versione adatta alla HOME.
// id = voce del catalogo; widget + props = come finisce nella pagina;
// w/h = misura proposta, minW/minH = più piccolo di così non si legge.
const CATALOG = [
  { id: 'nowplaying', widget: 'nowplaying', label: 'Musica', icon: 'music', page: 'MUSICA', description: 'Brano in riproduzione, copertina e comandi', w: 3, h: 2, minW: 2, minH: 2 },
  { id: 'todo', widget: 'todo', label: 'Note e TODO', icon: 'check', page: 'HOME', description: 'Le attività (Memo di Windows o lista della dock), con dettatura', w: 3, h: 4, minW: 2, minH: 2 },
  { id: 'system', widget: 'system', label: 'Diagnostica', icon: 'cpu', page: 'HOME', description: 'CPU, GPU e RAM con le temperature', w: 3, h: 2, minW: 2, minH: 2 },
  { id: 'clock', widget: 'clock', label: 'Orologio', icon: 'target', page: 'HOME', description: 'Ora e data grandi, nel font del tema', w: 2, h: 1, minW: 1, minH: 1 },
  { id: 'claudeusage', widget: 'claudeusage', label: 'Consumi di Claude', icon: 'sparkle', page: 'CLAUDE', description: 'Sessione di 5 ore e settimana', w: 2, h: 2, minW: 2, minH: 1 },
  { id: 'github', widget: 'github', label: 'GitHub', icon: 'github', page: 'GITHUB', description: 'I tuoi repository con CI e pull request', w: 3, h: 2, minW: 2, minH: 2 },
  { id: 'mail', widget: 'mail', label: 'Email', icon: 'mail', page: 'EMAIL', description: 'Messaggi da Thunderbird', w: 3, h: 2, minW: 3, minH: 2 },
  { id: 'audio', widget: 'audio', label: 'Audio', icon: 'volup', page: 'AUDIO', description: 'Uscita, microfono e volume delle app', w: 3, h: 3, minW: 3, minH: 2 },
  { id: 'discordmini', widget: 'discordmini', label: 'Discord', icon: 'headset', page: 'DISCORD', description: 'La stanza in cui sei, chi parla, mute e silenzia', w: 2, h: 2, minW: 2, minH: 2 },
  { id: 'discord', widget: 'discord', label: 'Discord completo', icon: 'headset', page: 'DISCORD', description: 'Server, canali e stanza vocale (serve tanto spazio)', w: 6, h: 4, minW: 4, minH: 3 },
  { id: 'desks', widget: 'desks', label: 'Desktop virtuali', icon: 'desktop', page: 'SCHERMI', description: 'Tocco = passa a quel desktop, + = nuovo', w: 2, h: 2, minW: 2, minH: 1 },
  { id: 'viber-projects', widget: 'viber', props: { show: 'projects' }, label: 'Viber: progetti', icon: 'code', page: 'VIBER', description: 'Progetti aperti con lo stato degli agenti, tocco = passa al progetto', w: 2, h: 2, minW: 2, minH: 2 },
  { id: 'viber-tasks', widget: 'viber', props: { show: 'tasks' }, label: 'Viber: task', icon: 'flag', page: 'VIBER', description: 'Le task del progetto aperto, con i passi', w: 2, h: 2, minW: 2, minH: 2 },
  { id: 'ollama', widget: 'chat', props: { provider: 'ollama' }, label: 'Ollama', icon: 'chat', page: 'OLLAMA', description: 'Chat con il modello locale', w: 3, h: 2, minW: 3, minH: 2 },
  { id: 'games', widget: 'games', label: 'Giochi', icon: 'gamepad', page: 'GAMES', description: 'I tuoi giochi in piccolo, tocco = avvia', w: 2, h: 1, minW: 1, minH: 1 }
];

const LIMITS = { minCols: 3, maxCols: 8, minRows: 2, maxRows: 6, maxTiles: 16 };

function clamp(v, min, max, def) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

// Catalogo completo: quelli del progetto più i widget dei plugin (misura proposta 2x2).
function catalog() {
  const out = CATALOG.map(function (c) { return Object.assign({ plugin: '', props: null }, c); });
  let fromPlugins = {};
  try { fromPlugins = require('./plugins').widgets(); } catch (e) { fromPlugins = {}; }
  Object.keys(fromPlugins).forEach(function (w) {
    if (out.some(function (c) { return c.id === w; })) return;
    out.push({ id: w, widget: w, props: null, label: w.toUpperCase(), icon: 'apps', page: 'PLUGIN', description: 'Widget del plugin ' + fromPlugins[w], w: 2, h: 2, minW: 1, minH: 1, plugin: fromPlugins[w] });
  });
  return out;
}

// Prima cella libera, da sinistra a destra e dall'alto in basso (come public/js/app.js -> pack).
// Le tile con x, y validi e liberi restano lì; le altre vanno nella prima cella libera.
function pack(tiles, cols, rows) {
  const grid = [];
  for (let r = 0; r < rows; r++) { grid[r] = []; for (let c = 0; c < cols; c++) grid[r][c] = false; }
  const placed = [], left = [];
  function fits(x, y, w, h) {
    if (x < 0 || y < 0 || x + w > cols || y + h > rows) return false;
    for (let i = y; i < y + h; i++) for (let j = x; j < x + w; j++) if (grid[i][j]) return false;
    return true;
  }
  function take(k, x, y, w, h) {
    for (let i = y; i < y + h; i++) for (let j = x; j < x + w; j++) grid[i][j] = true;
    placed.push({ index: k, x: x, y: y, w: w, h: h });
  }
  const free = [];
  tiles.forEach(function (t, k) {
    const w = Math.min(t.w || 1, cols), h = Math.min(t.h || 1, rows);
    if (typeof t.x === 'number' && typeof t.y === 'number' && fits(t.x, t.y, w, h)) take(k, t.x, t.y, w, h);
    else free.push(k);
  });
  free.forEach(function (k) {
    const t = tiles[k];
    const w = Math.min(t.w || 1, cols), h = Math.min(t.h || 1, rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (fits(c, r, w, h)) { take(k, c, r, w, h); return; }
      }
    }
    left.push(k);
  });
  placed.sort(function (a, b) { return a.index - b.index; });
  return { placed: placed, left: left };
}

// Controlla e ripulisce quello che arriva dal pannello. Errore leggibile se qualcosa non va.
function clean(input) {
  const bad = function (m) { return Object.assign(new Error(m), { code: 'BAD_REQUEST' }); };
  input = input || {};
  const columns = clamp(input.columns, LIMITS.minCols, LIMITS.maxCols, 6);
  const rows = clamp(input.rows, LIMITS.minRows, LIMITS.maxRows, 4);
  const known = {};
  catalog().forEach(function (c) { known[c.id] = c; });
  const list = Array.isArray(input.tiles) ? input.tiles : [];
  if (!list.length) throw bad('La HOME deve avere almeno un widget');
  if (list.length > LIMITS.maxTiles) throw bad('Al massimo ' + LIMITS.maxTiles + ' widget nella HOME');
  const tiles = list.map(function (t) {
    // HOME salvate prima delle posizioni: { widget, w, h } (l'id era il nome del widget)
    const c = known[t && (t.id || t.widget)];
    if (!c) throw bad('Widget non disponibile per la HOME: ' + (t && (t.id || t.widget)));
    if (c.minW > columns || c.minH > rows) throw bad(c.label + ' ha bisogno di almeno ' + c.minW + ' colonne e ' + c.minH + ' righe');
    const out = {
      id: c.id,
      w: clamp(t.w, c.minW, columns, Math.min(c.w, columns)),
      h: clamp(t.h, c.minH, rows, Math.min(c.h, rows))
    };
    if (t.x !== undefined && t.y !== undefined && t.x !== null && t.y !== null) {
      out.x = clamp(t.x, 0, columns - out.w, 0);
      out.y = clamp(t.y, 0, rows - out.h, 0);
    }
    return out;
  });
  const p = pack(tiles, columns, rows);
  if (p.left.length) {
    const names = p.left.map(function (i) { return known[tiles[i].id].label; });
    throw bad('Non c\'è spazio per: ' + names.join(', ') + '. Rimpicciolisci qualche widget o aggiungi righe o colonne.');
  }
  // posizioni definitive (anche per chi non l'aveva, e per chi si sovrapponeva)
  p.placed.forEach(function (x) { tiles[x.index].x = x.x; tiles[x.index].y = x.y; });
  return { columns: columns, rows: rows, tiles: tiles };
}

// La HOME salvata nel layout, se valida (altrimenti null: vale la pagina main dei file).
function fromLayout(layout) {
  const h = layout && layout.homePage;
  if (!h || !Array.isArray(h.tiles) || !h.tiles.length) return null;
  // voci tolte dal catalogo (o plugin spenti): si saltano, il resto della HOME resta
  const known = {};
  catalog().forEach(function (c) { known[c.id] = true; });
  const tiles = h.tiles.filter(function (t) { return t && known[t.id || t.widget]; });
  try { return clean(Object.assign({}, h, { tiles: tiles })); } catch (e) { return null; }
}

// Applica la HOME del pannello alla pagina main (prima della normalizzazione).
function apply(page, layout) {
  const h = fromLayout(layout);
  if (!h || !page || page.id !== HOME_ID) return page;
  const known = {};
  catalog().forEach(function (c) { known[c.id] = c; });
  return Object.assign({}, page, {
    columns: h.columns,
    rows: h.rows,
    autoGrid: false,
    tiles: h.tiles.map(function (t, i) {
      const c = known[t.id];
      return Object.assign({}, c.props || {}, { id: 'home-' + (i + 1) + '-' + t.id, widget: c.widget, x: t.x, y: t.y, w: t.w, h: t.h });
    })
  });
}

// Voce del catalogo di una tile della pagina main (per l'editor): id del catalogo o null.
function catalogId(tile) {
  // stesso widget e stesse opzioni (es. viber con "show": "tasks"); un viber senza "show" non c'è nel catalogo
  const hit = catalog().filter(function (c) {
    const props = c.props || {};
    return c.widget === tile.widget && Object.keys(props).every(function (k) { return tile[k] === props[k]; });
  })[0];
  return hit ? hit.id : null;
}

module.exports = { HOME_ID: HOME_ID, CATALOG: CATALOG, LIMITS: LIMITS, catalog: catalog, pack: pack, clean: clean, fromLayout: fromLayout, apply: apply, catalogId: catalogId };
