# Istruzioni per assistenti AI (e sviluppatori) che lavorano su Vibe Deck

> **English summary.** Vibe Deck turns an old Android tablet into a wireless Stream Deck for a Windows/Linux PC.
> Node.js/Express server in `app/server`, ES5 web client in `app/public` (it must run on Android 4 browsers),
> control panel in `app/control`. Code, comments and UI text are in **Italian**; the tablet translates UI text to
> English at runtime through `app/public/js/lang-en.js`. Prefer **plugins** (`app/plugins/<name>/`) for new features.
> Run `npm test` in `app/` before every commit. Work on a branch and open a pull request: the owner reviews and merges.
> Everything below applies; ask your user before breaking any rule.

Questo file spiega a un assistente AI (Claude, Copilot, Cursor, Codex…) come aggiungere funzioni a Vibe Deck senza
rompere niente. La guida per le persone è nel [README](README.md), sezione *Guida per sviluppatori*.

## In breve

- **Cos'è**: un vecchio tablet Android (anche 4.x, col suo browser) usato come Stream Deck per il PC. Sul PC gira un
  server Node.js (Windows o Linux); il tablet apre una pagina web. Funziona anche da telefono.
- **Lingua**: codice, commenti, messaggi e testi dell'interfaccia sono in **italiano**. Rispondi all'utente nella sua lingua.
- **Prima di tutto** leggi `README.md` (guida per sviluppatori) e `app/README.md` (riferimento completo).
- **Comandi** (in `app/`): `npm install`, `npm test`, `npm run demo` (dati finti su :8790), `npm run themes`,
  `npm run new:page -- <id>`, `npm run new:widget -- <nome>`, `npm run screenshots`.

## Dove stanno le cose

```text
app/
  server/index.js        API Express e avvio
  server/config.js       JSON con commenti, ricarica a caldo, default + file dell'utente + plugin
  server/actions/        motore delle azioni (HANDLERS): launch, hotkey, key, text, media, command, macro...
  server/plugins.js      caricatore dei plugin
  server/home.js         HOME configurabile dal pannello: catalogo dei widget, posizioni, controlli
  server/check.js        controllo della configurazione (errori mostrati nel pannello e nel log)
  server/platform/       windows.js (+ helper PowerShell), linux.js: tutto ciò che dipende dal sistema
  server/services/       un file per funzione (media, discord, mail, github, screens, mixer, claude...)
  public/js/             client del tablet in ES5: core.js (D), i18n.js + lang-en.js, icons.js, widgets.js, app.js
  public/css/dock.css    stile del tablet; public/css/themes/*.css sono GENERATI
  control/               pannello di controllo del PC (browser moderno, solo da 127.0.0.1)
  config/defaults/       configurazione predefinita (in git): pages/, apps/, commands/, dock.json...
  plugins/<nome>/        plugin: azioni, rotte, pagine, widget, icone, traduzioni
  schema/                schemi JSON per l'editor
  tests/                 node --test
config/ (tranne defaults) e data/ sono personali: mai in git, mai nei commit.
```

## Regole da non rompere

1. **Client del tablet in ES5** (`app/public/js`, script dei plugin in `public/`): `var` e `function`, niente
   `let/const`, frecce, template string, classi, `Promise`, `fetch`, `classList`, `Object.assign`, `Array.find`,
   `.includes`, `.bind`. Usa `D.api`, `D.el`, `D.addClass`... Lo controlla `tests/client-es5.test.js`.
2. **CSS del tablet senza flexbox, grid, `gap`, variabili CSS, `calc()`**: posizioni assolute, float, inline-block.
3. **Temi generati**: dopo ogni modifica a `public/css/dock.css` esegui `npm run themes` (lo controlla un test).
   Lo stile specifico di un tema va in `scripts/themes/<tema>.js`.
4. **Testi del tablet in italiano + traduzione inglese**: ogni testo nuovo visibile sul tablet va scritto in italiano
   e aggiunto a `public/js/lang-en.js` (`'Testo': 'Text'`, senza badare alle maiuscole; per testi con numeri o nomi
   una regola in `I18n.rules`). I testi dell'utente (brani, nomi, messaggi, email) stanno in un elemento con
   `class="notr"`, così non vengono mai tradotti. `tests/i18n.test.js` elenca i testi senza traduzione.
5. **Sicurezza**: il tablet non manda mai comandi liberi. Manda `{ page, tile }` e il server cerca l'azione nella
   configurazione; i comandi di sistema sono solo quelli elencati in `commands` (niente shell libera). Il pannello
   (`/api/control/*`) risponde solo da 127.0.0.1. Non aggirare mai queste regole e non indebolire `auth.js`.
6. **Windows e Linux**: tutto ciò che dipende dal sistema va in `server/platform/windows.js` *e* `linux.js`. App e
   comandi hanno le varianti `"windows"` e `"linux"` (anche liste di alternative). Una funzione solo-Windows deve
   degradare con un messaggio chiaro su Linux.
7. **File di default**: prima di cambiare un JSON in `config/defaults/` che non sia una pagina, aggiungi l'impronta
   della versione precedente in `config/defaults/history.json`. Meglio ancora: aggiungi un file nuovo nelle cartelle
   `config/defaults/pages|apps|commands/`, che non ne ha bisogno.
8. **File PowerShell** in UTF-8 con BOM. Nell'helper (`PsHelper.call`) mai un argomento chiamato `id`.
9. **Test**: `npm test` in `app/` deve passare tutto prima di ogni commit. I test che toccano dati, Discord o
   l'helper di Windows usano `DOCK_DATA_DIR` / `DOCK_CONFIG_DIR` / `DOCK_PLUGINS_DIR` (cartelle temporanee).
   In un ambiente senza Windows i test dell'helper PowerShell possono saltare: dillo all'utente.
10. **Niente dati personali** nel repository, negli screenshot o nei test: usa `npm run demo` (tutto finto).

## Aggiungere un widget

### Il modo consigliato: un plugin

```bash
cd app
npm run new:widget -- meteo
```

Crea `app/plugins/meteo/` già funzionante (widget, azione, rotte, icona, pagina, voce nel catalogo della HOME).
Modifica i file generati:

- **`public/meteo.js`** (tablet, ES5):

  ```js
  (function () {
    'use strict';
    Icons.register('sole', 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z');   // path SVG 24x24
    I18n.add({ 'Temperatura': 'Temperature' });                                          // traduzioni del plugin
    Widgets.register('meteo', function (root, tile, app) {
      var H = Widgets.helpers;                       // el, header, smallBtn, setHtml, level
      H.header(root, tile.title || 'METEO');
      var t = H.el('div', 'pl-meteo', '…');
      root.appendChild(t);
      function load() {
        D.api.get('/api/plugins/meteo/oggi', function (err, d) { D.setText(t, err ? err.message : d.gradi + '°'); });
      }
      load();
      var timer = D.every(60000, 300000, load);      // spesso se il tablet è usato, di rado a riposo (batteria)
      return {
        update: function (state) {},                 // stato del PC (/api/state) ogni pochi secondi
        resize: function (w, h) {},                  // pixel del riquadro: adatta testi e parti
        destroy: function () { D.stop(timer); }      // ferma timer e richieste
      };
    });
  })();
  ```

- **`public/meteo.css`**: stile (niente flexbox), classi con un prefisso del plugin.
- **`index.js`** (server): azioni `"<plugin>.<azione>"` e rotte in `/api/plugins/<plugin>/` (col codice d'accesso).
  `ctx` offre `log`, `config`, `platform`, `paths`, `execute(azione)`, `route(fn)`, `ensureDataDir()`.

  ```js
  module.exports = {
    description: 'Meteo di casa',
    actions: { aggiorna: async function (azione, ctx) { return { message: 'Aggiornato' }; } },
    routes: function (router, ctx) { router.get('/oggi', ctx.route(async function () { return { gradi: 21 }; })); }
  };
  ```

- **`home.json`**: come compare nel catalogo della HOME (nome, icona, descrizione, misura proposta e minima, `props`).
- **`pages/*.json`**: pagine del plugin (come quelle predefinite; l'utente le aggiunge dal pannello).

Dopo una modifica a `index.js` va riavviata la dock; il resto si ricarica da solo.

### Un widget del progetto (solo se serve a tutti)

1. Funzione `function mioWidget(root, tile, app)` in `public/js/widgets.js` che restituisce
   `{ update, resize, destroy }`, registrata nella mappa `TYPES` (il controllo della configurazione la legge da lì).
2. Il suo nome nello schema `schema/page.schema.json` (tile > widget): se manca, un test lo dice.
3. Per la HOME: una riga in `CATALOG` di `server/home.js` (`id, widget, props?, label, icon, page, description, w, h, minW, minH`).
4. Stile in `public/css/dock.css` + `npm run themes`; testi in `lang-en.js`.
5. Dati: da `/api/state` (in `update`) o da una rotta nuova in `server/index.js` con un servizio in `server/services/`.

**Un buon widget**: si adatta a ogni misura (prova griglie 6×4 e 8×4 e il telefono), non mostra "…" nei titoli,
non ridisegna il DOM se i dati non cambiano (`Widgets.helpers.setHtml`), aggiorna con `D.every(attivo, riposo, fn)`,
ferma tutto in `destroy`, mostra un messaggio chiaro quando un servizio manca (non resta su "Caricamento…").

## Altre aggiunte comuni

| Cosa | Dove |
|---|---|
| Pagina di pulsanti | `npm run new:page -- <id>` (utente) o `config/defaults/pages/<id>.json` (progetto, `"tab": false` = tra le disponibili) |
| App avviabile | `config/defaults/apps/<file>.json` (`{ "apps": { "id": { "label", "windows": {"path"}, "linux": {"path"} } } }`) |
| Comando consentito | `config/defaults/commands/<file>.json` (`cmd`, `args`, `showOutput`, varianti per sistema) |
| Tipo di azione | una funzione in `HANDLERS` (`server/actions/index.js`) + schema; o un'azione di un plugin |
| Icona | una riga in `public/js/icons.js` (path SVG 24×24) o `Icons.register` in un plugin |
| Traduzione | `public/js/lang-en.js` (`I18n.add` / `I18n.rules`) |
| Tema | `scripts/themes/<tema>.js` + `npm run themes` |

Pulsante tipo: `{ "id": "salva", "label": "SALVA", "icon": "save", "sub": "Ctrl+S", "color": "#2e7d32",
"action": { "type": "hotkey", "keys": ["CTRL", "S"], "focus": "blender" } }`. Campi utili: `confirm` (va tenuto
premuto), `repeat`, `hidden` (nascosto finché l'utente non lo mostra), `os`, `windows`/`linux` (campi per sistema),
`w`/`h`, `x`/`y`. Tutti i campi sono nello schema: con VS Code i file hanno suggerimenti e controllo.

## Come lavorare

1. Parti da `main` aggiornato e crea un branch con un nome chiaro (`feature/...`, `fix/...`, `docs/...`).
2. Fai la modifica più piccola che risolve il problema, nello stile del codice intorno (commenti brevi in italiano
   che spiegano il *perché*).
3. `npm test` in `app/`; se tocchi l'interfaccia provala con `npm run demo` (anche in inglese e con un tema diverso),
   e se cambia l'aspetto aggiorna le immagini con `npm run screenshots`.
4. Aggiorna la documentazione (README e/o `app/README.md`) quando cambi un comportamento visibile.
5. Commit chiari, push del branch, **pull request** con cosa cambia, come l'hai provato e cosa resta da provare dal vero.
6. **Mai commit diretti su `main` e mai merge da solo**: il proprietario del repository verifica e unisce ogni PR
   (vedi [CONTRIBUTING.md](CONTRIBUTING.md)).
7. Quello che si può provare solo sul PC vero (tablet, Discord, audio, finestre, app desktop) va scritto nella PR.
