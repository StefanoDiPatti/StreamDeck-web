# Command Dock

Trasforma un vecchio tablet Android 4.x in una **Stream Deck wireless** per il PC.
Il PC (Windows o Linux) fa girare un piccolo server Node.js. Il tablet apre una pagina web dal browser: niente app da installare.

- Pulsanti configurabili da JSON: avvio app, scorciatoie, testo, macro, comandi.
- **Now Playing** con copertina e controlli (Apple Music, Spotify, browser…).
- Monitor PC: CPU, RAM, GPU NVIDIA (uso, temperatura, VRAM), rete.
- Chat con **Ollama** (locale) e **Claude** (Claude Code o API).
- Riepilogo **GitHub**: PR, issue, stato CI, ultimo commit.
- Todo list e orologio.
- Profili Blender e DaVinci Resolve, che mettono in primo piano il programma prima di premere i tasti.

## Avvio rapido

**Windows:** doppio click su `start.bat`.
**Linux:** `./start.sh` (oppure `bash start.sh`).

Al primo avvio lo script fa tutto da solo:

1. se manca Node.js propone di installarlo (winget su Windows, il gestore pacchetti su Linux);
2. installa le dipendenze (`npm ci`);
3. crea `.env` con un **codice di accesso** casuale e la tua configurazione in `config/`;
4. chiede se aprire la porta nel firewall, creare il collegamento sul desktop e attivare l'avvio automatico;
5. avvia il server e lo riavvia da solo se va in crash.

Dagli avvii successivi parte subito. Per ripetere le domande: `start.bat --setup` (o `./start.sh --setup`).

Nella finestra del server trovi l'indirizzo da aprire sul tablet e il codice:

```text
  Apri sul tablet:  http://192.168.1.196:8787   (Wi-Fi)
  Codice di accesso: Q5Y8BZ3G
  Link diretto (salva il codice):  http://192.168.1.196:8787/?t=Q5Y8BZ3G
```

## Sul tablet

1. Apri il **link diretto**: il codice viene salvato e non te lo chiede più. In alternativa apri l'indirizzo e scrivi il codice.
2. Chrome: menu > *Aggiungi a schermata Home*. Dall'icona la dock si apre a schermo intero.
3. Per tenere lo schermo acceso: *Opzioni sviluppatore > Rimani attivo* (con il tablet in carica).
4. Tocca l'orologio in alto a destra per il fullscreen, se il browser lo supporta.
5. Per aprire direttamente una pagina: `http://IP:8787/#blender`.

Pulsanti con la barra arancione in basso (es. BLOCCA): vanno **tenuti premuti** circa 1 secondo.
I pulsanti volume e annulla si ripetono se tieni premuto.

## Configurazione

Tutti i file accettano commenti `//`. **Salva e il tablet si aggiorna da solo**, senza riavviare.

| File | Cosa contiene |
|---|---|
| `config/dock.json` | pagine, pulsanti e widget |
| `config/apps.json` | programmi avviabili (percorsi per Windows e Linux) |
| `config/commands.json` | comandi consentiti (whitelist) |
| `config/services.json` | GitHub, Ollama, Claude, monitor di sistema |
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

Nei percorsi puoi usare `%LOCALAPPDATA%`, `~`, `$HOME` e `*` per la versione (`Blender *\blender.exe`).
Le app dello Store di Windows si avviano con `shell:AppsFolder\<AppID>`; l'AppID lo trovi in PowerShell con `Get-StartApps`.

### Tipi di azione

| Azione | Esempio |
|---|---|
| Avvia app | `{ "type": "launch", "app": "vscode" }` |
| Scorciatoia | `{ "type": "hotkey", "keys": ["CTRL", "SHIFT", "P"], "focus": "Code" }` |
| Tasto singolo | `{ "type": "key", "key": "F12", "repeat": 1 }` |
| Scrivi testo | `{ "type": "text", "value": "Ciao!\n" }` |
| Musica | `{ "type": "media", "command": "play_pause" }` (anche `next`, `previous`, `stop`, `volume_up`, `volume_down`, `mute`) |
| Apri URL sul PC | `{ "type": "open_url", "url": "https://github.com" }` |
| Apri cartella o file | `{ "type": "open_path", "path": "~/Documents" }` |
| Comando | `{ "type": "command", "id": "lock_pc" }` → `commands.json` |
| Cambia pagina | `{ "type": "page", "page": "blender" }` |
| Macro | `{ "type": "macro", "steps": [ {…}, { "type": "wait", "ms": 300 }, {…} ] }` |

`focus` (opzionale) porta in primo piano il programma prima di premere i tasti. Il valore è il nome del processo: `blender`, `Resolve`, `Code`.

Opzioni del pulsante: `"sub"` (seconda riga), `"color"`, `"repeat": true` (ripete tenendo premuto), `"confirm": true` (va tenuto premuto), `"w"`/`"h"` (celle occupate).

**Tasti:** `CTRL SHIFT ALT WIN`, `A`–`Z`, `0`–`9`, `F1`–`F24`, `ENTER ESC TAB SPACE BACKSPACE DELETE INSERT HOME END PAGEUP PAGEDOWN UP DOWN LEFT RIGHT`, `NUM0`–`NUM9`, `PRINTSCREEN MINUS EQUALS COMMA PERIOD SLASH BACKQUOTE`, `MEDIA_PLAY_PAUSE VOLUME_UP`…

**Widget:** `system`, `nowplaying`, `github`, `todo`, `clock`, `chat` (con `"provider": "ollama"` o `"claude"`).

**Icone:** `home music apps code github chat sparkle check cube film lock play pause stop next prev volup voldown mute folder terminal cpu camera desktop robot refresh save keyboard undo redo fullscreen cut flag back add close send trash power bolt mic link`.

### Claude

La pagina CLAUDE funziona in due modi (`config/services.json` → `claude.backend`):

- **Claude Code** (`"cli"`): usa il comando `claude` già installato e il tuo abbonamento. È il modo predefinito se non c'è una chiave API.
- **Claude API** (`"api"`): metti `ANTHROPIC_API_KEY=...` nel `.env`. Modello predefinito `claude-opus-5-5`.

La conversazione resta sul PC finché il server è acceso. **NUOVA** ne inizia un'altra.

### GitHub

Metti un token personale (fine-grained, sola lettura) in `GITHUB_TOKEN` nel `.env`. In alternativa installa GitHub CLI e fai `gh auth login`: il token viene preso da lì.
Senza `repositories` in `services.json` vengono mostrati i 6 repository aggiornati più di recente.
Tocca un repository per aprirlo sul PC; tocca i badge PR, ISSUE o CI per aprire quella sezione.

### Ollama

Basta che Ollama sia acceso sul PC. Il tablet non parla mai direttamente con Ollama: passa sempre dal server.

## Linux

Funziona tutto tranne le parti che dipendono da Windows, sostituite da strumenti standard:

```bash
sudo apt install playerctl xdotool wtype pulseaudio-utils   # Debian/Ubuntu
```

- **playerctl**: Now Playing e controlli musica (qualsiasi player MPRIS: Spotify, Firefox, VLC…).
- **wpctl / pactl / amixer**: volume.
- **xdotool** (X11) o **wtype** (Wayland con KDE/Sway/Hyprland): scorciatoie e testo. Su GNOME Wayland le scorciatoie simulate non sono permesse dal sistema.
- La temperatura CPU si legge da `/sys/class/hwmon`; le GPU AMD da sysfs.
- Firewall: `sudo ufw allow 8787/tcp`.

## Sicurezza

- Il server accetta solo connessioni dalla rete locale.
- Ogni API richiede il codice di accesso (cookie o header `X-Dock-Token`).
- Il tablet invia solo "ho premuto il pulsante X della pagina Y": l'azione la legge il server da `dock.json`. Dal tablet non si possono lanciare comandi arbitrari.
- Token GitHub, chiave API di Claude e Ollama restano sul PC.
- Sotto Windows la regola firewall vale solo per le reti **private**. Se la tua rete è "Pubblica", il tablet non si collega: impostala come privata.

## Problemi comuni

| Problema | Soluzione |
|---|---|
| Il tablet non si collega | PC e tablet sulla stessa Wi-Fi? Rete Windows impostata come *Privata*? Firewall: `start.bat --setup` |
| Scorciatoie ignorate in un programma | Windows blocca i tasti simulati verso programmi avviati come amministratore |
| "App non trovata" | Correggi il percorso in `config/apps.json` |
| Now Playing vuoto | Su Windows serve un player che si integra con i controlli multimediali (Apple Music, Spotify, browser) |
| Temperatura CPU N/D su Windows | Avvia LibreHardwareMonitor con *Remote Web Server* e imposta `libreHardwareMonitorUrl` |
| Porta occupata | Cambia `PORT` nel `.env` |

## Sviluppo

```bash
npm install     # anche le dipendenze di sviluppo
npm test        # test di server, azioni, configurazione e compatibilità ES5 del client
npm run server  # avvia solo il server, senza lo script di primo avvio
```

```text
server/
  index.js            API Express
  config.js           lettura JSON con commenti e ricarica a caldo
  auth.js             solo rete locale + codice di accesso
  actions/            motore delle azioni e macro
  platform/           windows.js (+ windows-helper.ps1), linux.js, keys.js
  services/           system, media, github, ollama, claude, todo
public/               client per il tablet (ES5, niente framework)
config/defaults/      configurazione predefinita
scripts/bootstrap.js  avvio automatico (uguale su Windows e Linux)
```

**Aggiungere un tipo di azione:** aggiungi una funzione a `HANDLERS` in `server/actions/index.js`. Se serve il sistema operativo, aggiungi il metodo sia in `server/platform/windows.js` sia in `server/platform/linux.js`.

Il client deve restare ES5 e senza flexbox/grid: `tests/client-es5.test.js` lo controlla.
