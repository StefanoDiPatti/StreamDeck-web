// Crea un plugin con un widget nuovo, pronto da modificare:
//   npm run new:widget -- meteo
//
//   plugins/meteo/index.js        server: un'azione ("meteo.saluta") e due rotte (/api/plugins/meteo/...)
//   plugins/meteo/public/meteo.js tablet (ES5): il widget "meteo" e un'icona
//   plugins/meteo/public/meteo.css stile del widget
//   plugins/meteo/pages/meteo.json una pagina con il widget e un pulsante (la attivi dal pannello)
//
// Dopo: riavvia la dock (il codice del server dei plugin si carica all'avvio).
const fs = require('fs');
const path = require('path');
const plugins = require('../server/plugins');

// widget del progetto: i nomi non si possono riusare (letti da public/js/widgets.js)
function builtinWidgets() {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'widgets.js'), 'utf8');
  const m = /var TYPES = \{([^}]*)\}/.exec(js);
  return m ? m[1].split(',').map(function (s) { return s.split(':')[0].trim(); }).filter(Boolean) : [];
}

function fill(text, name) {
  return text.replace(/__NOME__/g, name).replace(/__TITOLO__/g, name.toUpperCase());
}

const SERVER = `// Plugin "__NOME__": codice del server. Creato con npm run new:widget.
// Dopo una modifica a questo file riavvia la dock (icona vicino all'orologio > Riavvia).
// ctx: { name, dir, dataDir, ensureDataDir(), config, log, platform, paths, execute(azione), route(fn) }

let tocchi = 0;

module.exports = {
  description: 'Widget di esempio: ora del PC e un contatore',

  // Azioni per i pulsanti: { "type": "__NOME__.saluta", "nome": "Ste" }
  actions: {
    saluta: async function (azione, ctx) {
      ctx.log.info('saluta premuto');
      return { message: 'Ciao' + (azione.nome ? ' ' + azione.nome : '') + ' da __NOME__!' };
    }
  },

  // Rotte, col codice d'accesso del tablet: GET /api/plugins/__NOME__/dati, POST /api/plugins/__NOME__/tocca
  // ctx.route(fn): quello che fn restituisce arriva al tablet (D.api.get/post), un errore diventa un avviso rosso.
  routes: function (router, ctx) {
    router.get('/dati', ctx.route(function () {
      return { ora: new Date().toLocaleTimeString('it-IT'), tocchi: tocchi };
    }));
    router.post('/tocca', ctx.route(function () {
      tocchi++;
      return { tocchi: tocchi };
    }));
  }
};
`;

const CLIENT = `/* Plugin "__NOME__": widget del tablet. Creato con npm run new:widget.
 * ES5 per il browser di Android 4: var e function, niente let/const, frecce, fetch, Promise, classList.
 * Salva e il tablet si ricarica da solo. */
(function () {
  'use strict';

  // icona del plugin: path SVG in un riquadro 24x24 (usala con "icon": "__NOME__")
  Icons.register('__NOME__', 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm1 5h-2v6l5 3 1-1.7-4-2.3V7z');

  // il widget: { "widget": "__NOME__" } in una pagina
  Widgets.register('__NOME__', function (root, tile, app) {
    var H = Widgets.helpers;
    D.addClass(root, 'w-__NOME__');
    H.header(root, tile.title || '__TITOLO__', H.smallBtn('TOCCA', 'add', tocca));
    var ora = H.el('div', 'pl-__NOME__-ora', '…');
    var info = H.el('div', 'pl-__NOME__-info', '');
    root.appendChild(ora);
    root.appendChild(info);

    function load() {
      D.api.get('/api/plugins/__NOME__/dati', function (err, d) {
        if (err) { D.setText(info, err.message); return; }
        D.setText(ora, d.ora);
        D.setText(info, 'Tocchi: ' + d.tocchi);
      });
    }
    function tocca() {
      D.api.post('/api/plugins/__NOME__/tocca', {}, function (err, d) {
        if (err) return app.toast(err.message, 'err');
        app.toast('Tocchi: ' + d.tocchi, 'ok');
        load();
      });
    }

    load();
    // ogni 5 s se il tablet è usato, ogni 30 s a riposo (risparmia batteria)
    var timer = D.every(5000, 30000, load);
    return {
      update: function (state) {},          // stato del PC (/api/state), ogni pochi secondi
      resize: function (w, h) { ora.style.fontSize = Math.round(Math.min(w / 6, h / 3)) + 'px'; },
      destroy: function () { D.stop(timer); }
    };
  });
})();
`;

const STYLE = `/* Plugin "__NOME__": stile del widget. Niente flexbox (browser di Android 4). */
.w-__NOME__ .pl-__NOME__-ora { margin-top: 10px; text-align: center; font-weight: bold; font-size: 40px; }
.w-__NOME__ .pl-__NOME__-info { margin-top: 6px; text-align: center; color: #8b9bab; font-size: 15px; }
`;

const PAGE = `// Pagina del plugin "__NOME__". Compare nel pannello di controllo: aggiungila alla barra da lì.
// Per cambiarla senza toccare il plugin copiala in config/pages/__NOME__.json.
{
  "id": "__NOME__",
  "title": "__TITOLO__",
  "icon": "__NOME__",
  "description": "Pagina del plugin __NOME__",
  "columns": 4,
  "rows": 2,
  "tiles": [
    { "widget": "__NOME__", "w": 2, "h": 2 },
    { "id": "saluta", "label": "SALUTA", "icon": "__NOME__", "color": "#2f6b3a", "action": { "type": "__NOME__.saluta", "nome": "Vibe Deck" } },
    { "id": "home", "label": "HOME", "icon": "home", "action": { "type": "page", "page": "main" } }
  ]
}
`;

function main(argv) {
  const name = String(argv[0] || '').trim().toLowerCase();
  if (!plugins.NAME_RE.test(name)) {
    console.error('Uso: npm run new:widget -- <nome>\n  <nome>: lettere minuscole, numeri, - e _ (es. meteo)');
    return 1;
  }
  if (builtinWidgets().indexOf(name) >= 0) { console.error('"' + name + '" è già un widget di Vibe Deck: scegli un altro nome'); return 1; }
  const dir = path.join(plugins.baseDir(), name);
  if (fs.existsSync(dir)) { console.error('Esiste già: ' + path.relative(process.cwd(), dir)); return 1; }
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'pages'), { recursive: true });
  const files = [
    ['index.js', SERVER],
    [path.join('public', name + '.js'), CLIENT],
    [path.join('public', name + '.css'), STYLE],
    [path.join('pages', name + '.json'), PAGE]
  ];
  files.forEach(function (f) { fs.writeFileSync(path.join(dir, f[0]), fill(f[1], name)); });
  console.log('Creato il plugin ' + path.relative(process.cwd(), dir) + ':');
  files.forEach(function (f) { console.log('  ' + f[0]); });
  console.log('\nRiavvia la dock, poi nel pannello di controllo aggiungi la pagina ' + name.toUpperCase() + ' alla barra.');
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main: main };
