// HOME configurabile dal pannello di controllo: quali widget, con che misura e in che ordine.
// Le scelte stanno in config/layout.json ("homePage": { columns, rows, tiles }) e vincono
// sulla pagina "main" (config/defaults/pages/main.json o la tua copia in config/pages/).
// I widget si dispongono come sul tablet: in ordine, nella prima cella libera (pack).

const HOME_ID = 'main';

// Widget che stanno bene anche nella HOME, presi dalle altre pagine.
// w/h = misura proposta, minW/minH = più piccolo di così non si legge.
const CATALOG = [
  { widget: 'nowplaying', label: 'Musica', icon: 'music', description: 'Brano in riproduzione, copertina e comandi', w: 3, h: 2, minW: 2, minH: 2 },
  { widget: 'todo', label: 'Note e TODO', icon: 'check', description: 'Le attività (Memo di Windows o lista della dock), con dettatura', w: 3, h: 4, minW: 2, minH: 2 },
  { widget: 'system', label: 'PC', icon: 'cpu', description: 'CPU, GPU e RAM con le temperature', w: 3, h: 2, minW: 2, minH: 2 },
  { widget: 'claudeusage', label: 'Consumi di Claude', icon: 'sparkle', description: 'Sessione di 5 ore e settimana, dalla pagina CLAUDE', w: 2, h: 2, minW: 2, minH: 1 },
  { widget: 'github', label: 'GitHub', icon: 'github', description: 'I tuoi repository con CI e pull request, dalla pagina GITHUB', w: 3, h: 2, minW: 2, minH: 2 },
  { widget: 'mail', label: 'Email', icon: 'mail', description: 'Messaggi non letti da Thunderbird, dalla pagina EMAIL', w: 3, h: 2, minW: 2, minH: 2 },
  { widget: 'clock', label: 'Orologio', icon: 'target', description: 'Ora e data grandi', w: 2, h: 1, minW: 1, minH: 1 },
  { widget: 'queue', label: 'Coda della musica', icon: 'music', description: 'I prossimi brani, dalla pagina MUSICA', w: 2, h: 2, minW: 2, minH: 2 },
  { widget: 'audio', label: 'Audio', icon: 'volup', description: 'Uscita, microfono e volume delle app, dalla pagina AUDIO', w: 3, h: 3, minW: 3, minH: 2 },
  { widget: 'discord', label: 'Discord', icon: 'headset', description: 'Server, canali e stanza vocale, dalla pagina DISCORD', w: 6, h: 4, minW: 4, minH: 3 }
];

const LIMITS = { minCols: 3, maxCols: 8, minRows: 2, maxRows: 6, maxTiles: 12 };

function clamp(v, min, max, def) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

// Catalogo completo: quelli del progetto più i widget dei plugin (misura proposta 2x2).
function catalog() {
  const out = CATALOG.map(function (c) { return Object.assign({ plugin: '' }, c); });
  let fromPlugins = {};
  try { fromPlugins = require('./plugins').widgets(); } catch (e) { fromPlugins = {}; }
  Object.keys(fromPlugins).forEach(function (w) {
    if (out.some(function (c) { return c.widget === w; })) return;
    out.push({ widget: w, label: w.toUpperCase(), icon: 'apps', description: 'Widget del plugin ' + fromPlugins[w], w: 2, h: 2, minW: 1, minH: 1, plugin: fromPlugins[w] });
  });
  return out;
}

// Dispone i widget nella griglia come il tablet (public/js/app.js -> pack): ritorna
// quelli che entrano con la loro posizione e quelli che non trovano posto.
function pack(tiles, cols, rows) {
  const grid = [];
  for (let r = 0; r < rows; r++) { grid[r] = []; for (let c = 0; c < cols; c++) grid[r][c] = false; }
  const placed = [], left = [];
  function fits(x, y, w, h) {
    if (x + w > cols || y + h > rows) return false;
    for (let i = y; i < y + h; i++) for (let j = x; j < x + w; j++) if (grid[i][j]) return false;
    return true;
  }
  tiles.forEach(function (t, k) {
    const w = Math.min(t.w || 1, cols), h = Math.min(t.h || 1, rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (fits(c, r, w, h)) {
          for (let i = r; i < r + h; i++) for (let j = c; j < c + w; j++) grid[i][j] = true;
          placed.push({ index: k, x: c, y: r, w: w, h: h });
          return;
        }
      }
    }
    left.push(k);
  });
  return { placed: placed, left: left };
}

// Controlla e ripulisce quello che arriva dal pannello. Errore leggibile se qualcosa non va.
function clean(input) {
  const bad = function (m) { return Object.assign(new Error(m), { code: 'BAD_REQUEST' }); };
  input = input || {};
  const columns = clamp(input.columns, LIMITS.minCols, LIMITS.maxCols, 6);
  const rows = clamp(input.rows, LIMITS.minRows, LIMITS.maxRows, 4);
  const known = {};
  catalog().forEach(function (c) { known[c.widget] = c; });
  const list = Array.isArray(input.tiles) ? input.tiles : [];
  if (!list.length) throw bad('La HOME deve avere almeno un widget');
  if (list.length > LIMITS.maxTiles) throw bad('Al massimo ' + LIMITS.maxTiles + ' widget nella HOME');
  const tiles = list.map(function (t) {
    const c = known[t && t.widget];
    if (!c) throw bad('Widget non disponibile per la HOME: ' + (t && t.widget));
    if (c.minW > columns || c.minH > rows) throw bad(c.label + ' ha bisogno di almeno ' + c.minW + ' colonne e ' + c.minH + ' righe');
    return {
      widget: c.widget,
      w: clamp(t.w, c.minW, columns, Math.min(c.w, columns)),
      h: clamp(t.h, c.minH, rows, Math.min(c.h, rows))
    };
  });
  const p = pack(tiles, columns, rows);
  if (p.left.length) {
    const names = p.left.map(function (i) { return known[tiles[i].widget].label; });
    throw bad('Non c\'è spazio per: ' + names.join(', ') + '. Rimpicciolisci qualche widget o aggiungi righe o colonne.');
  }
  return { columns: columns, rows: rows, tiles: tiles };
}

// La HOME salvata nel layout, se valida (altrimenti null: vale la pagina main dei file).
function fromLayout(layout) {
  const h = layout && layout.homePage;
  if (!h || !Array.isArray(h.tiles) || !h.tiles.length) return null;
  try { return clean(h); } catch (e) { return null; }
}

// Applica la HOME del pannello alla pagina main (prima della normalizzazione).
function apply(page, layout) {
  const h = fromLayout(layout);
  if (!h || !page || page.id !== HOME_ID) return page;
  return Object.assign({}, page, {
    columns: h.columns,
    rows: h.rows,
    autoGrid: false,
    tiles: h.tiles.map(function (t, i) { return { id: 'home-' + (i + 1) + '-' + t.widget, widget: t.widget, w: t.w, h: t.h }; })
  });
}

module.exports = { HOME_ID: HOME_ID, CATALOG: CATALOG, LIMITS: LIMITS, catalog: catalog, pack: pack, clean: clean, fromLayout: fromLayout, apply: apply };
