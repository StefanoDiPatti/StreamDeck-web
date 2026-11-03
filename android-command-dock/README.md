# Command Dock

Trasforma un vecchio tablet Android 4.x in una **Stream Deck wireless** per il PC.
Il PC (Windows o Linux) fa girare un piccolo server Node.js. Il tablet apre una pagina web dal browser: niente app da installare.

- Pulsanti configurabili da JSON: avvio app, scorciatoie, testo, macro, comandi.
- **Musica**: copertina, coda dei brani, salto a un punto del brano, shuffle e ripeti, volume dell'app (non di sistema). Funziona con Apple Music web e YouTube tramite un'estensione del browser, e con le app desktop (Spotify, VLC, ...). Giochi e launcher (es. Riot Client) vengono ignorati.
- **Claude**: chat della dock e sessioni di Claude Code del PC, continuabili dal tablet, con dettatura vocale. Il tablet può anche fare da tastiera remota e scrivere nella finestra scelta sul PC.
- Monitor PC: CPU, RAM, GPU NVIDIA (uso, temperatura, VRAM), rete.
- **Discord**: server, canali vocali, chi c'è in stanza e chi parla, mute e audio, webcam e Go Live.
- **Games**: avvio di Hearthstone, World of Tanks e League of Legends (se il gioco è già aperto lo porta in primo piano).
- **Schermi**: scegli su quale monitor si aprono le app dal tablet e disponi le finestre nelle zone, come Snap di Windows.
- **Pannello di controllo sul PC** per scegliere e ordinare con il trascinamento le pagine del tablet e i pulsanti di ogni pagina.
- **Windows e Linux** riconosciuti da soli: su Linux i pulsanti di Windows diventano i loro equivalenti (PowerShell → Terminale, Task Mgr → Monitor di sistema...).
- Ollama, riepilogo GitHub, TODO sulle Memo di Windows, orologio.
- Pagine di scorciatoie per Blender e DaVinci Resolve (da aggiungere alla barra dal pannello), che mettono in primo piano il programma prima di premere i tasti.

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

- aprire il **pannello di controllo** (anche con doppio clic sull'icona, o sul collegamento *Command Dock* del desktop);
- aprire la dock su questo PC;
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
  Pannello di controllo (solo da questo PC):  http://127.0.0.1:8787/control
```

## Sul tablet

1. Apri il **link diretto**: il codice viene salvato e non te lo chiede più. In alternativa apri l'indirizzo e scrivi il codice.
2. Chrome: menu > *Aggiungi a schermata Home*. Dall'icona la dock si apre a schermo intero.
3. Per tenere lo schermo acceso: *Opzioni sviluppatore > Rimani attivo* (con il tablet in carica).
4. Tocca l'orologio in alto a destra per il fullscreen, se il browser lo supporta.
5. Per aprire direttamente una pagina aggiungi il suo id all'indirizzo: `http://IP:8787/#media`, `#claude`, `#blender`.

In alto a destra trovi la rete del PC (nome del Wi-Fi e segnale, oppure Ethernet), la velocità di download/upload e la RAM.

Pulsanti con la barra arancione in basso (es. BLOCCA): vanno **tenuti premuti** circa 1 secondo.
I pulsanti volume e annulla si ripetono se tieni premuto.

## Pagine predefinite

| Pagina | Contenuto |
|---|---|
| HOME | musica (comandi base), stato del PC, todo |
| MUSICA | lettore completo (seek, shuffle, ripeti, volume dell'app) e coda dei brani |
| APP | programmi (pallino verde = già aperto, un altro tocco lo chiude), Claude, PowerShell/Terminale, screenshot, blocco PC, schermo spento, **volume di sistema**, Blender e DaVinci |
| DEV | VS Code, Claude Code, PowerShell, OpenClaw, scorciatoie di VS Code |
| GITHUB | PR, issue, CI e ultimo commit dei tuoi repository |
| OLLAMA | chat con i modelli locali |
| CLAUDE | chat, sessioni di Claude Code, dettatura, scrittura sul PC |
| DISCORD | server, canali vocali con chi c'è dentro, chi parla, mute/audio, webcam, Go Live, mutare una persona |
| GAMES | Hearthstone, World of Tanks, League of Legends (pallino verde se aperti; se già aperto lo porta in primo piano) |
| SCHERMI *(solo Windows)* | monitor del PC, disposizioni delle finestre, monitor su cui aprire le app |
| BLENDER, DAVINCI *(disponibili: aggiungile alla barra dal pannello)* | scorciatoie dei due programmi |

## Pannello di controllo (sul PC)

Doppio clic sull'icona **Command Dock** (desktop o vicino all'orologio): si apre nel browser del PC una pagina per scegliere le pagine del tablet.

- **Trascina** le pagine per cambiare l'ordine della barra in basso, o spostale tra *Nella barra* e *Disponibili*.
- La **stella** sceglie la pagina che si apre all'avvio.
- **Pulsanti delle pagine**: scegli una pagina di soli pulsanti (APP, DEV, GAMES, BLENDER, DAVINCI) e trascina i pulsanti per riordinarli, o spostali tra *Sul tablet* e *Nascosti* (anche con la ✕ e il + su ogni pulsante). La griglia si adatta da sola: con meno pulsanti diventano più grandi. *Mostra tutti* rimette tutti i pulsanti nell'ordine predefinito.
- **Salva sul tablet**: il tablet si aggiorna da solo. *Predefinite* torna alle pagine e ai pulsanti di `dock.json`.

Le scelte finiscono in `config/layout.json`. I pulsanti aggiunti in seguito a `dock.json` compaiono in fondo alla pagina. Il pannello risponde solo da questo PC (`http://127.0.0.1:8787/control`), non dal tablet né dalla rete. Le pagine disponibili si raggiungono solo dai pulsanti che le aprono (`{ "type": "page" }`): per le scorciatoie di Blender e DaVinci aggiungi le loro pagine alla barra. Il contenuto delle pagine si modifica sempre in `config/dock.json`.

### Discord

Usa il collegamento locale dell'app Discord (lo stesso delle Stream Deck): niente bot, funziona con Discord aperto sul PC. Discord lo concede solo alle applicazioni registrate, quindi serve una configurazione, una volta sola, guidata dal pannello:

1. sul [Developer Portal](https://discord.com/developers/applications) crea una *New Application*;
2. in *OAuth2* copia **Client ID** e **Client Secret**; sotto *Redirects* premi *Add Redirect*, scrivi `http://localhost` (senza barra finale) e premi **Save Changes**. Se manca, Discord risponde *"invalid_request: missing redirect_uri"*;
3. incollali nel pannello e premi **Collega**: Discord chiede di autorizzare la dock.

Dal tablet: tocca un server, poi un canale per entrarci; tocca una persona nella tua stanza per mutarla solo per te; **MIC** e **AUDIO** per mutarti o silenziare; **CAM** accende la webcam; **LIVE** avvia il Go Live del gioco aperto (Hearthstone, World of Tanks, LoL, o qualsiasi app con `"game": true`); **ESCI** (tieni premuto) per lasciare la stanza.

Webcam e Go Live usano due comandi di Discord non documentati (`TOGGLE_VIDEO`, `TOGGLE_SCREENSHARE`) e un permesso in più: se avevi già collegato la dock, premi **Riautorizza** nel pannello. Se Discord non concede quel permesso, l'autorizzazione prosegue senza, e CAM e LIVE restano spenti. Senza configurazione MIC e AUDIO funzionano lo stesso, con le scorciatoie predefinite di Discord (Ctrl+Shift+M / Ctrl+Shift+D). Le credenziali stanno in `data/discord.json`, solo su questo PC.

## Musica

### Estensione per Apple Music web e YouTube (consigliata)

Apple Music è una web app, e Windows dà pochissime informazioni sulle schede del browser: niente coda, niente volume della scheda e durate a volte sbagliate. La piccola estensione nella cartella `extension/` legge direttamente il player del sito e lo comanda.

Installazione (una volta sola, in Brave, Chrome o Edge):

1. Apri `brave://extensions` (o `chrome://extensions`, `edge://extensions`).
2. Attiva **Modalità sviluppatore** (in alto a destra).
3. **Carica estensione non pacchettizzata** e scegli la cartella `extension` di questo progetto.
4. Le schede di Apple Music / YouTube già aperte vengono collegate da sole (senza ricaricarle).

Dopo un aggiornamento della dock, in `brave://extensions` premi la freccia circolare sull'estensione per caricare la versione nuova.

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

### TODO e Memo di Windows

Su Windows il TODO mostra le **Memo** (Sticky Notes): ogni riga di una memo è un'attività, una riga barrata è fatta, la prima riga in grassetto è il titolo. Dal tablet puoi aggiungere righe (anche a voce), spuntarle (la riga viene barrata) e toglierle; le modifiche fatte sul PC compaiono sul tablet in pochi secondi.

L'app Memo non vede le modifiche fatte da fuori, quindi a ogni modifica dal tablet la dock la chiude, aggiorna la memo, la mette in coda per la sincronizzazione con il cloud e la riapre (circa un secondo). Più tocchi ravvicinati causano un solo riavvio. La dock non crea e non cancella mai memo intere.

Con più memo, tocca un titolo nel TODO per scegliere dove aggiungere. In `services.json` → `todo`: `"memo"` sceglie la memo predefinita (parte del titolo), `"source": "local"` torna alla lista interna della dock (usata anche su Linux).

### TODO uguali su Windows e Linux (GitHub)

I TODO vengono copiati in `todo.json` sul branch **`dock-todo`** della repo della dock (la tua repo privata), con le stesse credenziali git che usi per il push: niente token da configurare e nessun commit nella cronologia del codice.

- La copia si aggiorna pochi secondi dopo ogni modifica dal tablet e ogni 2 minuti. Così prende anche le modifiche fatte direttamente nelle Memo, e quelle arrivate dall'altro PC.
- Su Windows la fonte restano le Memo: le aggiunte, le spunte e le cancellazioni fatte su Linux vengono scritte nelle Memo (il testo di una riga si cambia solo nell'app Memo). Su Linux la lista locale riceve tutto, divisa per memo come su Windows.
- Se la stessa attività cambia su entrambi i PC tra una sincronizzazione e l'altra, vince il PC che sincronizza.
- Al primo avvio su un PC nuovo la dock adotta la lista che trova su GitHub. Su Linux la lista locale precedente viene salvata in `data/todo.prima-della-sync.json`.
- La nuvoletta **GitHub** nel titolo del TODO è verde quando è tutto sincronizzato e rossa in caso di errore: toccala per sincronizzare subito o leggere l'errore.

Impostazioni in `services.json` → `todo.sync`: `enabled`, `remote` (`origin`), `branch` (`dock-todo`), `intervalSec`.

### Dettatura vocale

Il pulsante 🎤 accanto al campo di testo (Claude e TODO):

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
Se un file in `config/` non l'hai mai modificato, all'avvio passa da solo alla nuova versione predefinita (dopo un `git pull`). Quelli modificati restano come sono.

### Windows e Linux

La dock riconosce il sistema e mostra i pulsanti adatti. In `dock.json`:

```json
{ "id": "viber", "os": "linux", "label": "VIBER", "action": { "type": "launch", "app": "viber" } },
{ "id": "terminal", "label": "POWERSHELL", "linux": { "label": "TERMINALE" }, "action": { "type": "launch", "app": "powershell" } }
```

- `"os": "linux"` (o `"windows"`): il pulsante, o la pagina, c'è solo su quel sistema.
- `"linux": { ... }` (o `"windows"`): i campi che cambiano su quel sistema, anche `action`.
- `"id"`: nome fisso del pulsante, con cui il pannello ricorda ordine e pulsanti nascosti.
- `"autoGrid": true` sulla pagina: colonne e righe scelte in base a quanti pulsanti ci sono.

In `apps.json` e `commands.json` la variante `"linux"` può essere una lista di alternative: vale la prima installata.

```json
"linux": [ { "path": "konsole", "args": ["-e", "claude"] }, { "path": "gnome-terminal", "args": ["--", "claude"] } ]
```

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

## Schermi (Windows)

Nella pagina **SCHERMI** del tablet vedi i monitor come sono disposti sulla scrivania (numerati da sinistra) e le finestre aperte.

- **Disporre le finestre**: tocca un monitor, scegli una disposizione (metà, terzi, 2/3 + 1/3, quarti, ...), tocca una zona e poi una finestra nella lista a destra. La zona successiva si seleziona da sola, come lo Snap Assist di Windows. Sui monitor verticali le colonne diventano righe.
- Senza una zona scelta, toccare una finestra la porta in primo piano. I due pulsanti di ogni riga la riducono a icona o la ingrandiscono.
- **Apri le app su**: AUTO lascia decidere a Windows; con un monitor scelto, le app avviate dal tablet (pulsanti *launch*) vengono spostate lì appena compare la loro finestra, mantenendo dimensioni e posizione relative.

Le finestre dei programmi avviati come amministratore non si possono spostare (limite di Windows). I giochi a schermo intero esclusivo non si spostano. La scelta del monitor sta in `data/screens.json`.

### Giochi

I giochi sono in `config/apps.json` con `"game": true` e `"whenRunning": "focus"`: il pulsante mostra il pallino verde se il gioco è aperto e, in quel caso, lo porta in primo piano invece di riavviarlo. `"path"` può essere una lista di percorsi (vale il primo che esiste), `"process"` una lista di processi (LoL ha client e partita).

### App aperte: pallino verde e chiusura

Le app con `"toggle": true` in `config/apps.json` mostrano un pallino verde quando sono aperte; un altro tocco le chiude come la X della finestra (l'app può chiedere di salvare). È attivo per Blender, DaVinci, VS Code, Unreal, Apple Music, Spotify, Claude e Discord; volutamente no per PowerShell, Esplora file, Gestione attività e Claude Code, per non interrompere lavori in corso.
Apple Music (web) si riconosce tramite l'estensione: "chiudere" chiude la sua scheda. Per un pulsante che non avvia l'app (es. uno che apre la pagina BLENDER) il pallino si ottiene con `"showRunning": "blender"`.
Su Linux serve `wmctrl`.

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
| Discord | `{ "type": "discord", "command": "stream" }` (anche `mute`, `deaf`, `video`) |

`focus` (opzionale) porta in primo piano il programma prima di premere i tasti. Il valore è il nome del processo: `blender`, `Resolve`, `Code`.

Opzioni del pulsante: `"sub"` (seconda riga), `"color"`, `"repeat": true` (ripete tenendo premuto), `"confirm": true` (va tenuto premuto), `"w"`/`"h"` (celle occupate). Ogni pagina può avere la sua griglia con `"columns"` e `"rows"`.

**Tasti:** `CTRL SHIFT ALT WIN`, `A`–`Z`, `0`–`9`, `F1`–`F24`, `ENTER ESC TAB SPACE BACKSPACE DELETE INSERT HOME END PAGEUP PAGEDOWN UP DOWN LEFT RIGHT`, `NUM0`–`NUM9`, `PRINTSCREEN MINUS EQUALS COMMA PERIOD SLASH BACKQUOTE`, `MEDIA_PLAY_PAUSE VOLUME_UP`…

**Widget:** `system`, `nowplaying`, `queue`, `github`, `todo`, `clock`, `claude`, `chat` (con `"provider": "ollama"`), `discord`, `screens`.

**Icone:** `home music apps code github chat sparkle check cube film lock play pause stop next prev volup voldown mute shuffle repeat folder terminal cpu camera desktop robot refresh save keyboard undo redo fullscreen cut flag back add close send trash power bolt mic link headset gamepad cards tank sword layout live camoff window target`.

### GitHub

Metti un token personale (fine-grained, sola lettura) in `GITHUB_TOKEN` nel `.env`. In alternativa installa GitHub CLI e fai `gh auth login`: il token viene preso da lì.
Senza `repositories` in `services.json` vengono mostrati i 6 repository aggiornati più di recente.
Tocca un repository per aprirlo sul PC; tocca i badge PR, ISSUE o CI per aprire quella sezione.

### Ollama

Basta che Ollama sia acceso sul PC. Il tablet non parla mai direttamente con Ollama: passa sempre dal server.

## Linux

Funziona tutto tranne le parti che dipendono da Windows (pagina SCHERMI, Memo), sostituite da strumenti standard.
Nella pagina APP: **TERMINALE** (Konsole, GNOME Terminal, Alacritty...), **MONITOR** di sistema, **SCREENSHOT** di un'area (Spectacle), **DESKTOP** (mostra il desktop di KDE), **CLAUDE** apre la web app di Claude installata da Brave (altrimenti claude.ai), **VIBER** l'app dal desktop. Su CachyOS / Arch:

```bash
sudo pacman -S playerctl wtype
sudo ufw allow 8787/tcp
```

Su Debian/Ubuntu:

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
