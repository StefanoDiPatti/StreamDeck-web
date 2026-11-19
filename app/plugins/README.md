# Plugin di Vibe Deck

Ogni cartella qui dentro è un plugin, caricato da solo all'avvio della dock.
Per crearne uno pronto da modificare:

```bash
npm run new:widget -- meteo
```

```text
plugins/meteo/
  index.js           server: azioni ("meteo.saluta") e rotte (/api/plugins/meteo/...)
  pages/*.json       pagine (le attivi dal pannello di controllo)
  apps/*.json        app       commands/*.json   comandi consentiti
  public/*.js        tablet (ES5): Widgets.register(...), Icons.register(...)
  public/*.css       stile dei widget (niente flexbox)
  home.json          il widget nel catalogo della HOME (nome, icona, misure)
```

- Una cartella che inizia con `_` o `.` viene ignorata: rinomina `meteo` in `_meteo` per spegnere un plugin.
- Dopo una modifica a `index.js` riavvia la dock. Pagine, app, comandi e file in `public/` si ricaricano da soli.
- Gli errori dei plugin (codice che non parte, widget o icone sconosciuti) compaiono nel pannello di controllo e nel log.

La guida completa è nel README principale: *Guida per sviluppatori > Plugin*.
