# Command Dock

Trasforma un vecchio tablet Android 4.x in una **Stream Deck wireless** per il PC.
Il PC (Windows o Linux) fa girare un piccolo server Node.js. Il tablet apre una pagina web dal browser: niente app da installare.

- Pulsanti configurabili da JSON: avvio app, scorciatoie, testo, macro, comandi.
- **Musica**: copertina, coda dei brani, salto a un punto del brano, shuffle e ripeti, volume dell'app (non di sistema). Funziona con Apple Music web e YouTube tramite un'estensione del browser, e con le app desktop (Spotify, VLC, ...). Giochi e launcher (es. Riot Client) vengono ignorati.
- **Claude**: chat della dock e sessioni di Claude Code del PC, continuabili dal tablet, con dettatura vocale. Il tablet può anche fare da tastiera remota e scrivere nella finestra scelta sul PC.
- Monitor PC: CPU, RAM, GPU NVIDIA (uso, temperatura, VRAM), rete.
- Ollama, riepilogo GitHub, todo list, orologio.
- Profili Blender e DaVinci Resolve, che mettono in primo piano il programma prima di premere i tasti.

## Avvio rapido

**Windows:** doppio click su `start.bat` (o sul collegamento "Command Dock" sul desktop).
**Linux:** `./start.sh` (oppure `bash start.sh`).

Al primo avvio lo script fa tutto da solo:

1. se manca Node.js propone di installarlo (winget su Windows, il gestore pacchetti su Linux);
2. installa le dipendenze (`npm ci`);
3. crea `.env` con un **codice di accesso** casuale e la tua configurazione in `config/`;
4. chiede se aprire la porta nel firewall, creare il collegamento sul desktop e attivare l'avvio automatico;
5. avvia il server e lo riavvia da solo se va in crash.

Per ripetere le domande: `start.bat --setup` (o `./start.sh --setup`).

### Windows: in background, con l'icona vicino all'orologio

Su Windows la dock gira **in background**, senza finestre aperte. La trovi come icona (quattro quadratini blu) nell'area di notifica, sotto la freccetta vicino all'orologio. Dal menu dell'icona puoi:

- aprire la dock su questo PC (anche con doppio click sull'icona);
- vedere indirizzo e codice per il tablet (vengono anche copiati negli appunti);
- aprire il log (`data/dock.log`);
- riavviarla;
- chiuderla.

L'icona grigia indica che la dock è ferma: il motivo è scritto nel log.
Per vedere i messaggi in una finestra: `start.bat --console`.

> Non è un "servizio" di Windows in senso stretto apposta: i servizi girano in una sessione separata e non potrebbero premere tasti né leggere la musica dell'utente. L'icona parte con il tuo account, come le altre app.

### L'indirizzo per il tablet

Lo trovi dal menu dell'icona (Windows) o nella finestra del server (Linux / `--console`):

```text
  Apri sul tablet:  http://192.168.1.50:8787   (Ethernet)
  Codice di accesso: ABCD2345
  Link diretto (salva il codice):  http://192.168.1.50:8787/?t=ABCD2345
```

## Sul tablet

1. Apri il **link diretto**: il codice viene salvato e non te lo chiede più. In alternativa apri l'indirizzo e scrivi il codice.
2. Chrome: menu > *Aggiungi a schermata Home*. Dall'icona la dock si apre a schermo intero.
3. Per tenere lo schermo acceso: *Opzioni sviluppatore > Rimani attivo* (con il tablet in carica).
4. Tocca l'orologio in alto a destra per il fullscreen, se il browser lo supporta.
5. Per aprire direttamente una pagina aggiungi il suo id all'indirizzo: `http://IP:8787/#media`, `#claude`, `#blender`.

Pulsanti con la barra arancione in basso (es. BLOCCA): vanno **tenuti premuti** circa 1 secondo.
I pulsanti volume e annulla si ripetono se tieni premuto.

## Pagine predefinite

| Pagina | Contenuto |
|---|---|
| HOME | musica (comandi base), stato del PC, todo |
| MUSICA | lettore completo (seek, shuffle, ripeti, volume dell'app) e coda dei brani |
| APP | programmi, PowerShell, screenshot, blocco PC, **volume di sistema**, profili Blender e DaVinci |
| DEV | VS Code, Claude Code, PowerShell, OpenClaw, scorciatoie di VS Code |
| GITHUB | PR, issue, CI e ultimo commit dei tuoi repository |
| OLLAMA | chat con i modelli locali |
| CLAUDE | chat, sessioni di Claude Code, dettatura, scrittura sul PC |

## Musica

### Estensione per Apple Music web e YouTube (consigliata)

Apple Music è una web app, e Windows dà pochissime informazioni sulle schede del browser: niente coda, niente volume della scheda e durate a volte sbagliate. La piccola estensione nella cartella `extension/` legge direttamente il player del sito e lo comanda.

Installazione (una volta sola, in Brave, Chrome o Edge):

1. Apri `brave://extensions` (o `chrome://extensions`, `edge://extensions`).
2. Attiva **Modalità sviluppatore** (in alto a destra).
3. **Carica estensione non pacchettizzata** e scegli la cartella `extension` di questo progetto.
4. Ricarica le schede di Apple Music / YouTube già aperte.

Cliccando l'icona dell'estensione vedi se è collegata alla dock. Funziona con `music.apple.com`, `music.youtube.com` e `www.youtube.com`. L'estensione parla solo con la dock sullo stesso PC (`127.0.0.1`).

Con l'estensione:

- **Coda**: nella pagina MUSICA tocchi un brano per farlo partire. Su YouTube la coda è quella della playlist aperta.
- **Volume dell'app**: i tasti volume del lettore regolano Apple Music o YouTube, non il volume di Windows.
- **Durata e posizione esatte**, e tocco sulla barra per spostarti nel brano.
- **Shuffle e ripeti** (Apple Music).

### App desktop

Spotify, VLC, Tidal, Deezer, MusicBee e simili si comandano con i controlli multimediali del sistema, ognuno direttamente, senza passare dall'app che Windows considera "attiva". Il volume dei tasti del lettore è quello della singola app (mixer di Windows).
Sono accettate solo app musicali: l'elenco si personalizza in `config/services.json` → `media` (`allowApps`, `blockApps`).

Il volume **di sistema** sta nella pagina APP (VOL -, MUTE, VOL +).

## Claude

La pagina CLAUDE ha due elenchi:

- **CHAT**: conversazioni create dalla dock. Usano Claude Code (il tuo abbonamento) oppure la Claude API se metti `ANTHROPIC_API_KEY` nel `.env`. Restano salvate in `data/claude-chats.json`. Per eliminarne una tieni premuto il cestino.
- **CLAUDE CODE**: le sessioni di Claude Code salvate sul PC (anche quelle avviate dal terminale o dall'app). Le apri, le leggi e le continui dal tablet. Con **NUOVA** ne avvii una in una cartella di progetto.

Le risposte possono richiedere minuti: puoi cambiare pagina, la risposta arriva lo stesso.
Per far modificare file a Claude Code dal tablet senza conferme imposta `cliPermissionMode: "acceptEdits"` in `config/services.json`. Di default gli strumenti che chiedono conferma vengono negati.

### Dettatura vocale

Il pulsante 🎤 accanto al campo di testo:

1. usa il riconoscimento vocale del browser, se presente;
2. altrimenti, se hai configurato una trascrizione sul PC (`services.json` → `voice`, ad esempio whisper.cpp), apre il registratore di Android e il PC trascrive l'audio;
3. altrimenti apre la tastiera: tocca il microfono della tastiera di Android (Google voice typing), che è il modo più affidabile su Android 4.

### Tablet come tastiera remota

Con **SCRIVI SUL PC** il testo (scritto o dettato) viene digitato nella finestra scelta: finestra attiva, app Claude, VS Code, Terminale o PowerShell. Con **INVIO ↵** attivo, dopo il testo preme anche Invio. Così puoi dettare un messaggio a Claude Code aperto in un terminale, o a qualsiasi chat sul PC. L'elenco delle finestre si modifica in `services.json` → `claude.remoteTargets`.

## Configurazione

Tutti i file accettano commenti `//`. **Salva e il tablet si aggiorna da solo**, senza riavviare.

| File | Cosa contiene |
|---|---|
| `config/dock.json` | pagine, pulsanti e widget |
| `config/apps.json` | programmi avviabili (percorsi per Windows e Linux) |
| `config/commands.json` | comandi consentiti (whitelist) |
| `config/services.json` | musica, Claude, voce, GitHub, Ollama, monitor di sistema |
| `.env` | porta, codice di accesso, token e chiavi API |

I file in `config/` sono tuoi e non vanno su git. I default stanno in `config/defaults/`: cancella un file da `config/` per ripristinarlo.

### Aggiungere un pulsante

In `config/dock.json`, dentro `tiles` della pagina:

```json
{ "label": "OBS", "icon": "camera", "color": "#5b3fa0", "action": { "type": "launch", "app": "obs" } }
```

e in `config/apps.json`:

```json
"obs": {
  "label": "OBS Studio",
  "windows": { "path": "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe", "cwd": "C:\\Program Files\\obs-studio\\bin\\64bit" },
  "linux": { "path": "obs" }
}
```

Nei percorsi puoi usare `%USERPROFILE%`, `%LOCALAPPDATA%`, `~`, `$HOME` e `*` per la versione (`Blender *\blender.exe`). Funzionano anche i collegamenti `.lnk` (così si apre Apple Music dal collegamento sul desktop).
Le app dello Store di Windows si avviano con `shell:AppsFolder\<AppID>`; l'AppID lo trovi in PowerShell con `Get-StartApps`.

### Tipi di azione

| Azione | Esempio |
|---|---|
| Avvia app | `{ "type": "launch", "app": "vscode" }` |
| Scorciatoia | `{ "type": "hotkey", "keys": ["CTRL", "SHIFT", "P"], "focus": "Code" }` |
| Tasto singolo | `{ "type": "key", "key": "F12", "repeat": 1 }` |
| Scrivi testo | `{ "type": "text", "value": "Ciao!\n" }` |
| Musica (app attiva) | `{ "type": "media", "command": "play_pause" }` (anche `next`, `previous`, `stop`) |
| Volume dell'app musicale | `{ "type": "media", "command": "app_volume_up" }` (anche `app_volume_down`, `app_mute`) |
| Volume di sistema | `{ "type": "media", "command": "volume_up" }` (anche `volume_down`, `mute`) |
| Apri URL sul PC | `{ "type": "open_url", "url": "https://github.com" }` |
| Apri cartella o file | `{ "type": "open_path", "path": "~/Documents" }` |
| Comando | `{ "type": "command", "id": "lock_pc" }` → `commands.json` |
| Cambia pagina | `{ "type": "page", "page": "blender" }` |
| Macro | `{ "type": "macro", "steps": [ {…}, { "type": "wait", "ms": 300 }, {…} ] }` |

`focus` (opzionale) porta in primo piano il programma prima di premere i tasti. Il valore è il nome del processo: `blender`, `Resolve`, `Code`.

Opzioni del pulsante: `"sub"` (seconda riga), `"color"`, `"repeat": true` (ripete tenendo premuto), `"confirm": true` (va tenuto premuto), `"w"`/`"h"` (celle occupate). Ogni pagina può avere la sua griglia con `"columns"` e `"rows"`.

**Tasti:** `CTRL SHIFT ALT WIN`, `A`–`Z`, `0`–`9`, `F1`–`F24`, `ENTER ESC TAB SPACE BACKSPACE DELETE INSERT HOME END PAGEUP PAGEDOWN UP DOWN LEFT RIGHT`, `NUM0`–`NUM9`, `PRINTSCREEN MINUS EQUALS COMMA PERIOD SLASH BACKQUOTE`, `MEDIA_PLAY_PAUSE VOLUME_UP`…

**Widget:** `system`, `nowplaying`, `queue`, `github`, `todo`, `clock`, `claude`, `chat` (con `"provider": "ollama"`).

**Icone:** `home music apps code github chat sparkle check cube film lock play pause stop next prev volup voldown mute shuffle repeat folder terminal cpu camera desktop robot refresh save keyboard undo redo fullscreen cut flag back add close send trash power bolt mic link`.

### GitHub

Metti un token personale (fine-grained, sola lettura) in `GITHUB_TOKEN` nel `.env`. In alternativa installa GitHub CLI e fai `gh auth login`: il token viene preso da lì.
Senza `repositories` in `services.json` vengono mostrati i 6 repository aggiornati più di recente.
Tocca un repository per aprirlo sul PC; tocca i badge PR, ISSUE o CI per aprire quella sezione.

### Ollama

Basta che Ollama sia acceso sul PC. Il tablet non parla mai direttamente con Ollama: passa sempre dal server.

## Linux

Funziona tutto tranne le parti che dipendono da Windows, sostituite da strumenti standard:

```bash
sudo apt install playerctl xdotool wtype pulseaudio-utils
```

- **playerctl**: musica, coda esclusa (qualsiasi player MPRIS: Spotify, Firefox, VLC…), compreso il volume della singola app.
- **Estensione del browser**: identica a Windows, per Apple Music web e YouTube.
- **wpctl / pactl / amixer**: volume di sistema.
- **xdotool** (X11) o **wtype** (Wayland con KDE/Sway/Hyprland): scorciatoie, testo e "scrivi sul PC". Su GNOME Wayland le scorciatoie simulate non sono permesse dal sistema.
- La temperatura CPU si legge da `/sys/class/hwmon`; le GPU AMD da sysfs.
- Firewall: `sudo ufw allow 8787/tcp`.
- Su Linux la dock gira nel terminale (`./start.sh`); l'avvio automatico si attiva dalle domande del primo avvio.

## Sicurezza

- Il server accetta solo connessioni dalla rete locale.
- Ogni API richiede il codice di accesso (cookie o header `X-Dock-Token`).
- Il tablet invia solo "ho premuto il pulsante X della pagina Y": l'azione la legge il server da `dock.json`. Dal tablet non si possono lanciare comandi arbitrari.
- **Attenzione:** "scrivi sul PC" e le sessioni di Claude Code danno al tablet la possibilità di scrivere testo sul PC e di far lavorare Claude Code nelle tue cartelle. Per questo il codice di accesso è importante: non condividerlo.
- L'estensione del browser è accettata solo da questo PC (`127.0.0.1`) e con un header che i siti web non possono inviare.
- Token GitHub, chiave API di Claude e Ollama restano sul PC.
- Sotto Windows la regola firewall vale solo per le reti **private**. Se la tua rete è "Pubblica", il tablet potrebbe non collegarsi: impostala come privata.

## Problemi comuni

| Problema | Soluzione |
|---|---|
| Il tablet non si collega | PC e tablet sulla stessa rete? Rete Windows impostata come *Privata*? Firewall: `start.bat --setup` |
| Non vedo l'icona | Cerca sotto la freccetta vicino all'orologio. Se l'icona è grigia, apri il log dal suo menu |
| "Porta già in uso" | La dock è già avviata (icona o un'altra finestra): chiudi l'altra |
| Musica non rilevata | Apple Music web / YouTube: installa l'estensione e ricarica la scheda. App desktop: deve essere un'app musicale (vedi `services.json` → `media`) |
| Coda vuota | La coda c'è solo con l'estensione (Apple Music, YouTube Music, playlist di YouTube) |
| Scorciatoie ignorate in un programma | Windows blocca i tasti simulati verso programmi avviati come amministratore |
| "App non trovata" | Correggi il percorso in `config/apps.json` |
| Claude Code non risponde | Prova `claude -p "ciao"` in un terminale: deve funzionare senza login interattivo |
| Temperatura CPU N/D su Windows | Avvia LibreHardwareMonitor con *Remote Web Server* e imposta `libreHardwareMonitorUrl` |

## Sviluppo

```bash
npm install     # anche le dipendenze di sviluppo
npm test        # test di server, musica, azioni, configurazione e compatibilità ES5 del client
npm run server  # avvia solo il server, senza lo script di avvio
```

```text
server/
  index.js            API Express
  config.js           lettura JSON con commenti e ricarica a caldo
  auth.js             solo rete locale + codice di accesso
  actions/            motore delle azioni e macro
  platform/           windows.js (+ windows-helper.ps1), linux.js, keys.js
  services/           system, media, bridge, claude, claudecode, voice, github, ollama, todo
public/               client per il tablet (ES5, niente framework)
extension/            estensione del browser per Apple Music web e YouTube
config/defaults/      configurazione predefinita
scripts/bootstrap.js  avvio automatico (uguale su Windows e Linux)
scripts/windows/      icona nell'area di notifica e avvio nascosto
```

**Aggiungere un tipo di azione:** aggiungi una funzione a `HANDLERS` in `server/actions/index.js`. Se serve il sistema operativo, aggiungi il metodo sia in `server/platform/windows.js` sia in `server/platform/linux.js`.

Il client deve restare ES5 e senza flexbox/grid: `tests/client-es5.test.js` lo controlla.
