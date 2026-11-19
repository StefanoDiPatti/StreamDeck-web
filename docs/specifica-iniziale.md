# Android 4 Vibe Deck — Specification for Gwen 3.5

## 0. Obiettivo

Realizzare un'applicazione locale che trasformi un vecchio tablet Android 4.x in una **Stream Deck touch / command dock wireless per Windows**.

Il tablet NON deve eseguire logica pesante e NON deve richiedere un APK moderno. La soluzione principale deve essere una **web app ultra-compatibile con browser Android 4**, servita dal PC sulla LAN.

Architettura:

```text
┌─────────────────────────────┐
│       OLD ANDROID 4         │
│                             │
│  Browser fullscreen         │
│  Vibe Deck UI            │
└──────────────┬──────────────┘
               │ HTTP / LAN
               ▼
┌─────────────────────────────┐
│        WINDOWS PC           │
│                             │
│  Node.js Dock Server        │
│  ├─ system monitor          │
│  ├─ media controls          │
│  ├─ app launcher            │
│  ├─ keyboard/macros         │
│  ├─ GitHub adapter          │
│  ├─ Ollama adapter          │
│  └─ OpenClaw adapter        │
└─────────────────────────────┘
```

L'utente deve poter:

1. avviare il server dal PC;
2. accendere il tablet;
3. aprire la pagina della dock;
4. usare i pulsanti via Wi-Fi;
5. spegnere il server quando non serve.

NON creare una soluzione che richieda di riscrivere l'app ogni volta che viene aggiunta una funzione.

La configurazione dei pulsanti deve essere **data-driven**: JSON/config + sistema di plugin/adapter.

---

# 1. Decisione architetturale fondamentale

## Frontend

Usare esclusivamente tecnologie compatibili con browser molto vecchi:

- HTML5 semplice;
- CSS3 conservativo;
- JavaScript ES5/ES6 solo dove strettamente necessario;
- nessun framework moderno obbligatorio;
- nessun TypeScript obbligatorio nel bundle finale;
- nessun React/Vue/Svelte;
- niente PWA obbligatoria;
- niente Service Worker;
- niente CSS framework pesante.

La priorità è la compatibilità con:

- Android 4.0;
- Android 4.1;
- Android 4.2;
- Android 4.3;
- Android 4.4.

Il frontend deve funzionare anche se il browser ha un motore JavaScript molto vecchio.

Preferire:

```js
var xhr = new XMLHttpRequest();
```

a:

```js
fetch(...)
```

Preferire eventi DOM tradizionali e codice semplice.

Non usare API moderne se non indispensabili.

---

# 2. Stack PC

Usare:

- Node.js;
- Express;
- `child_process`;
- `fs`;
- `os`;
- `http`;
- SQLite opzionale.

Non utilizzare Docker come requisito.

Non richiedere un database server esterno.

Il server deve poter partire con:

```powershell
npm install
npm start
```

e rimanere completamente locale.

Porta predefinita:

```text
8787
```

URL:

```text
http://PC_IP:8787
```

Esempio:

```text
http://192.168.1.100:8787
```

---

# 3. Struttura progetto

Creare questa struttura:

```text
app/
│
├── package.json
├── README.md
├── .env.example
├── config/
│   ├── dock.json
│   ├── apps.json
│   ├── github.json
│   └── ollama.json
│
├── server/
│   ├── index.js
│   ├── config.js
│   ├── api/
│   │   ├── system.js
│   │   ├── actions.js
│   │   ├── github.js
│   │   ├── ollama.js
│   │   └── openclaw.js
│   │
│   ├── services/
│   │   ├── systemMonitor.js
│   │   ├── processLauncher.js
│   │   ├── mediaController.js
│   │   ├── macroEngine.js
│   │   ├── githubService.js
│   │   ├── ollamaService.js
│   │   └── openclawService.js
│   │
│   └── utils/
│       ├── logger.js
│       ├── security.js
│       └── validation.js
│
├── scripts/
│   ├── start-server.bat
│   ├── stop-server.bat
│   └── send-media-key.ps1
│
└── public/
    ├── index.html
    ├── css/
    │   └── dock.css
    ├── js/
    │   ├── app.js
    │   ├── api.js
    │   ├── renderer.js
    │   └── touch.js
    └── assets/
        ├── icons/
        └── backgrounds/
```

---

# 4. Principio più importante: configurazione separata dal codice

La dock NON deve avere i pulsanti hard-coded nel codice JavaScript.

Esempio:

`config/dock.json`

```json
{
  "pages": [
    {
      "id": "main",
      "title": "COMMAND CENTER",
      "columns": 4,
      "buttons": [
        {
          "id": "blender",
          "label": "BLENDER",
          "icon": "blender.png",
          "action": {
            "type": "launch",
            "target": "blender"
          }
        },
        {
          "id": "music_play",
          "label": "PLAY",
          "icon": "play.png",
          "action": {
            "type": "media",
            "command": "play_pause"
          }
        }
      ]
    }
  ]
}
```

Aggiungere un pulsante deve significare:

1. modificare JSON;
2. eventualmente aggiungere una nuova action/plugin;
3. riavviare il server.

NON modificare il frontend per ogni pulsante.

---

# 5. Sistema di action/plugin

Implementare un dispatcher:

```text
button click
     ↓
action.type
     ↓
┌──────────┬──────────┬──────────┬──────────┐
│ launch   │ hotkey   │ media    │ command  │
├──────────┼──────────┼──────────┼──────────┤
│ github   │ ollama   │ openclaw │ script   │
└──────────┴──────────┴──────────┴──────────┘
```

API interna:

```js
executeAction(action)
```

Supportare inizialmente:

### `launch`

```json
{
  "type": "launch",
  "target": "blender"
}
```

### `hotkey`

```json
{
  "type": "hotkey",
  "keys": ["CTRL", "SHIFT", "P"]
}
```

### `media`

```json
{
  "type": "media",
  "command": "play_pause"
}
```

Comandi:

- `play_pause`
- `next`
- `previous`
- `stop`
- `volume_up`
- `volume_down`
- `mute`

### `open_url`

```json
{
  "type": "open_url",
  "url": "https://github.com"
}
```

### `shell`

Consentire solo comandi definiti nella whitelist/config, NON shell arbitraria proveniente dal browser.

```json
{
  "type": "shell",
  "commandId": "restart_openclaw"
}
```

NON permettere:

```http
POST /api/execute
{
  "command": "qualunque-comando-powershell"
}
```

---

# 6. Sicurezza

La dock funziona sulla LAN domestica.

Implementare comunque un token semplice.

`.env`

```env
PORT=8787
DOCK_TOKEN=change-me
GITHUB_TOKEN=
GITHUB_OWNER=
OLLAMA_URL=http://127.0.0.1:11434
OPENCLAW_URL=
```

Il browser riceve il token tramite una configurazione locale o una sessione iniziale.

Gli endpoint di scrittura devono richiedere:

```http
X-Dock-Token: <token>
```

Le GET possono rimanere protette anch'esse se semplice da implementare.

NON esporre il server su Internet.

---

# 7. Autodetect IP

Il server deve stampare al boot:

```text
Android Vibe Deck
────────────────────
Server: ONLINE
Port: 8787

Open on tablet:
http://192.168.1.100:8787
```

Recuperare l'IPv4 della rete locale tramite Node `os.networkInterfaces()`.

Ignorare:

- loopback;
- IPv6;
- interfacce virtuali quando possibile.

---

# 8. Avvio Windows

Creare:

`scripts/start-server.bat`

```bat
@echo off
cd /d "%~dp0.."
npm start
pause
```

Creare anche una scorciatoia sul desktop:

```text
Android Vibe Deck
```

L'utente deve poter avviare il server con un doppio click.

NON installare inizialmente il server come Windows Service.

---

# 9. System Monitor

Endpoint:

```http
GET /api/system
```

Risposta:

```json
{
  "cpuUsage": 18,
  "ramUsage": 61,
  "ramUsedGb": 9.4,
  "ramTotalGb": 16,
  "gpuUsage": 8,
  "gpuTemp": 43,
  "gpuMemoryUsedGb": 2.8,
  "gpuMemoryTotalGb": 8,
  "cpuTemp": null,
  "networkDownMbps": 24.1,
  "networkUpMbps": 3.8,
  "uptimeSeconds": 13420
}
```

## GPU NVIDIA

Usare `nvidia-smi` quando disponibile.

Comando:

```powershell
nvidia-smi --query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits
```

Gestire correttamente il caso in cui `nvidia-smi` non sia presente.

## CPU / RAM

Usare Node/OS per:

- CPU load;
- memoria;
- uptime.

La temperatura CPU non è garantita dalle API standard Windows.

Implementare un provider opzionale:

```text
TemperatureProvider
├── NVIDIA
├── LibreHardwareMonitor (optional)
└── unavailable
```

Se una temperatura non è disponibile:

```text
CPU TEMP
N/A
```

NON inventare dati.

Aggiornamento frontend:

```text
ogni 2 secondi
```

Usare polling HTTP, NON WebSocket come requisito.

Il polling è più compatibile e più facile da debuggare su Android 4.

---

# 10. Apple Music / controlli multimediali

Obiettivo:

```text
PLAY/PAUSE
NEXT
PREVIOUS
STOP
VOLUME +
VOLUME -
MUTE
```

Non implementare una integrazione Apple Music proprietaria.

Usare i **Windows media keys**, che il sistema operativo può inoltrare all'app multimediale attiva.

Implementare `scripts/send-media-key.ps1`.

I virtual key code Windows importanti sono:

```text
VK_VOLUME_MUTE       = 0xAD
VK_VOLUME_DOWN       = 0xAE
VK_VOLUME_UP         = 0xAF
VK_MEDIA_NEXT_TRACK  = 0xB0
VK_MEDIA_PREV_TRACK  = 0xB1
VK_MEDIA_STOP        = 0xB2
VK_MEDIA_PLAY_PAUSE  = 0xB3
```

Usare Windows `SendInput` tramite un piccolo helper PowerShell/C# per simulare la pressione dei tasti.

NON affidarsi a scorciatoie specifiche di Apple Music se non indispensabile.

Endpoint:

```http
POST /api/actions/media
```

Body:

```json
{
  "command": "play_pause"
}
```

---

# 11. Launch applicazioni

`config/apps.json`

Esempio:

```json
{
  "apps": {
    "blender": {
      "path": "C:\\Program Files\\Blender Foundation\\Blender 4.x\\blender.exe"
    },
    "davinci": {
      "path": "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\Resolve.exe"
    },
    "vscode": {
      "path": "C:\\Users\\USER\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"
    },
    "unreal": {
      "path": "C:\\Program Files\\Epic Games\\UE_5.x\\Engine\\Binaries\\Win64\\UnrealEditor.exe"
    }
  }
}
```

Il sistema deve usare:

```js
child_process.spawn()
```

o `execFile()`.

Mai costruire un comando shell concatenando input ricevuto dal tablet.

Endpoint:

```http
POST /api/actions/launch
```

Body:

```json
{
  "target": "blender"
}
```

---

# 12. Hotkeys e macro

Implementare macro configurabili.

Esempio:

```json
{
  "id": "blender_save",
  "label": "SAVE",
  "action": {
    "type": "hotkey",
    "keys": ["CTRL", "S"]
  }
}
```

Macro sequenziale:

```json
{
  "type": "macro",
  "steps": [
    {
      "type": "hotkey",
      "keys": ["SHIFT", "F4"]
    },
    {
      "type": "wait",
      "ms": 300
    },
    {
      "type": "text",
      "value": "render"
    },
    {
      "type": "key",
      "key": "ENTER"
    }
  ]
}
```

Il macro engine deve supportare:

- hotkey;
- singolo key;
- testo;
- wait;
- launch;
- commandId.

I macro devono essere configurati in JSON.

---

# 13. GitHub

Creare un adapter server-side.

NON mettere il GitHub token nel browser/tablet.

Configurazione:

```env
GITHUB_TOKEN=...
GITHUB_OWNER=...
```

Endpoint:

```http
GET /api/github/summary
```

Restituire almeno:

```json
{
  "repositories": [],
  "openPullRequests": 3,
  "openIssues": 5,
  "recentCommits": []
}
```

Supportare inizialmente un numero piccolo di repository configurati.

`config/github.json`

```json
{
  "repositories": [
    {
      "owner": "YOUR_USER",
      "repo": "project-one"
    },
    {
      "owner": "YOUR_USER",
      "repo": "project-two"
    }
  ]
}
```

Cache server-side:

```text
GitHub refresh: 60 seconds
```

NON fare una chiamata GitHub ogni volta che il tablet ridisegna la pagina.

---

# 14. Ollama

Assumere Ollama locale sul PC:

```text
http://127.0.0.1:11434
```

Il tablet parla con il Dock Server.

Il Dock Server parla con Ollama.

NON esporre direttamente Ollama al Wi-Fi.

Implementare:

```http
GET /api/ollama/models
GET /api/ollama/status
POST /api/ollama/generate
```

Per la lista modelli usare l'API locale di Ollama.

Mostrare:

```text
OLLAMA
────────────────
qwen3-vl:8b
gemma4:12b
qwen3.5:9b
qwen3:14b
```

Pagina dedicata:

```text
┌─────────────────────────────┐
│ OLLAMA                      │
│                             │
│ Model: [qwen3.5:9b ▼]      │
│                             │
│ Prompt:                     │
│ ┌─────────────────────────┐ │
│ │                         │ │
│ └─────────────────────────┘ │
│                             │
│          [ SEND ]            │
└─────────────────────────────┘
```

La chat deve essere minimale e funzionare senza JavaScript moderno obbligatorio.

Per la prima versione la risposta può essere non-streaming.

---

# 15. OpenClaw

NON assumere endpoint non documentati.

Implementare un adapter isolato:

```text
openclawService.js
```

Configurazione:

```json
{
  "enabled": true,
  "mode": "cli",
  "command": "openclaw",
  "workingDirectory": ""
}
```

Il modulo deve supportare:

```text
status
restart
start
stop
```

ma l'implementazione concreta deve dipendere da come OpenClaw è installato sul PC.

Preferire:

1. CLI ufficiale/documentata;
2. API locale documentata;
3. script locali definiti dall'utente.

NON permettere al browser di inviare comandi OpenClaw arbitrari.

La UI può mostrare:

```text
OPENCLAW

Gateway: ONLINE

[ STATUS ]
[ RESTART ]
[ OPEN DASHBOARD ]
```

---

# 16. UI principale

Il tablet sarà usato in **landscape**.

Target indicativo:

```text
800x480
1024x600
1280x800
```

Non assumere una risoluzione specifica nel layout.

Usare CSS responsive.

## Principi UI

- scuro;
- alto contrasto;
- pulsanti grandi;
- niente testo piccolo;
- niente hover come unica forma di feedback;
- touch target almeno ~64 px;
- feedback visivo immediato al tap;
- massimo 4 colonne su schermi molto piccoli;
- evitare animazioni pesanti.

La home deve sembrare una Stream Deck, NON un sito web classico.

Esempio:

```text
┌────────────────────────────────────────────────┐
│ COMMAND CENTER                      19:52       │
├──────────────────┬─────────────────────────────┤
│ PC               │ MUSIC                       │
│                  │                             │
│ CPU    18%  48°C │ Daft Punk                   │
│ GPU     8%  43°C │ Instant Crush               │
│ RAM    61%       │                             │
│                  │  PREV   PLAY   NEXT         │
├──────────────────┼─────────────────────────────┤
│ GITHUB           │ TODO                        │
│                  │                             │
│ PR       3       │ □ GPU Computing             │
│ ISSUES   5       │ □ CV Project                │
│ CI       OK      │ □ Blender Experiment        │
├──────────────────┴─────────────────────────────┤
│ OLLAMA │ OPENCLAW │ BLENDER │ DAVINCI │ MORE  │
└────────────────────────────────────────────────┘
```

---

# 17. Pagine

Supportare pagine multiple.

Pagine iniziali:

### MAIN

- PC monitor
- Music
- GitHub
- Todo
- shortcuts principali

### MEDIA

- Play
- Pause
- Next
- Previous
- Volume
- Mute

### BLENDER

Placeholder iniziale:

```text
OPEN
SAVE
UNDO
REDO
PLAY
RENDER
CAMERA
FULLSCREEN
```

### DAVINCI

Placeholder:

```text
OPEN
SAVE
PLAY
STOP
MARK IN
MARK OUT
RENDER
```

### DEV

```text
VS CODE
TERMINAL
GIT
GITHUB
OLLAMA
OPENCLAW
```

---

# 18. Todo

Per V1 non integrare servizi cloud.

Usare JSON:

`config/todo.json`

```json
{
  "items": [
    {
      "id": "1",
      "text": "GPU Computing",
      "done": false
    },
    {
      "id": "2",
      "text": "Computer Vision",
      "done": false
    }
  ]
}
```

Endpoint:

```http
GET /api/todo
POST /api/todo/toggle
POST /api/todo/add
```

Scrivere il file in modo sicuro e semplice.

In futuro lasciare pronto un adapter per Notion/Todoist/etc.

---

# 19. Funzionamento senza configurazione complessa sul tablet

Il tablet deve richiedere solo:

1. Wi-Fi;
2. browser;
3. URL del server.

Esempio:

```text
http://192.168.1.100:8787
```

Creare una modalità "kiosk-like":

- fullscreen;
- niente header inutili;
- pulsante home;
- prevenire accidental navigation;
- mantenere la pagina attiva;
- refresh automatico in caso di errore di connessione.

Se il browser Android supporta un bookmark/home shortcut, usarlo.

NON richiedere app Android nativa per la prima versione.

---

# 20. Stato connessione

In alto:

```text
● PC ONLINE
```

oppure:

```text
● OFFLINE
```

Se il server non risponde:

```text
CONNECTION LOST

Retrying...
```

Usare retry progressivo:

```text
2s
4s
8s
max 15s
```

Non bloccare la UI.

---

# 21. API principali

Definire una REST API piccola e coerente.

```text
GET  /api/health

GET  /api/config
GET  /api/system
GET  /api/todo

GET  /api/github/summary

GET  /api/ollama/models
GET  /api/ollama/status
POST /api/ollama/generate

POST /api/actions/launch
POST /api/actions/hotkey
POST /api/actions/media
POST /api/actions/macro

GET  /api/openclaw/status
POST /api/openclaw/restart
```

Risposta standard:

```json
{
  "ok": true,
  "data": {}
}
```

Errore:

```json
{
  "ok": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "..."
  }
}
```

---

# 22. Gestione errori

Il tablet deve SEMPRE ricevere una risposta comprensibile.

Esempio:

```text
BLENDER

[ OPEN ]

→ Blender avviato
```

oppure:

```text
→ Blender non trovato
```

Non mostrare stack trace nel browser.

Log completi solo nella console server.

---

# 23. Prestazioni

Target server:

- RAM bassa;
- CPU praticamente nulla quando inattivo;
- polling system ogni 2 s;
- GitHub ogni 60 s;
- niente WebSocket obbligatorio;
- niente Electron;
- niente Chromium embedded;
- niente Docker;
- niente database pesante.

Il frontend deve essere estremamente leggero.

---

# 24. Comandi di installazione

PowerShell:

```powershell
mkdir app
cd app

npm init -y
npm install express dotenv
```

Eventuali dipendenze aggiuntive solo se realmente necessarie.

Aggiungere:

```json
{
  "scripts": {
    "start": "node server/index.js",
    "dev": "node server/index.js"
  }
}
```

---

# 25. Windows Firewall

Fornire un comando PowerShell opzionale per la rete privata:

```powershell
New-NetFirewallRule `
  -DisplayName "Android Vibe Deck" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 8787 `
  -Action Allow `
  -Profile Private
```

Spiegare che il profilo deve essere `Private`, NON aprire pubblicamente il servizio.

---

# 26. Primo MVP obbligatorio

NON implementare tutto contemporaneamente.

Prima realizzare:

## MVP-1

```text
Server
+
HTML UI
+
Health check
+
PC CPU/RAM
+
GPU NVIDIA
+
Launch application
+
Media keys
```

Demo minima:

```text
[ BLENDER ]
[ DAVINCI ]
[ VSCODE ]

[ PLAY/PAUSE ]
[ NEXT ]
[ PREVIOUS ]

CPU: 20%
GPU: 43°C
RAM: 61%
```

Il tablet deve riuscire a comandare il PC via Wi-Fi.

---

# 27. MVP-2

Aggiungere:

```text
GitHub
Todo
Ollama
OpenClaw
```

---

# 28. MVP-3

Aggiungere:

```text
Pages
Profiles
Macros
Blender profile
DaVinci profile
Unreal profile
Developer profile
```

---

# 29. Sistema profili

Il sistema deve essere progettato per consentire:

```text
PROFILE
├── Main
├── Media
├── Blender
├── DaVinci
├── Unreal
└── Developer
```

Un profilo è solo configurazione.

Esempio:

```json
{
  "id": "blender",
  "title": "BLENDER",
  "buttons": []
}
```

Non duplicare logica frontend.

---

# 30. Configurabilità futura

Il progetto deve essere semplice da estendere.

Aggiungere una nuova funzione deve idealmente richiedere:

```text
1. aggiungere un adapter/service
2. aggiungere una action type se serve
3. aggiungere JSON/config
4. aggiungere icona
```

NON:

```text
riscrivere frontend
riscrivere backend
cambiare architettura
```

---

# 31. Esempio futura action Blender

```json
{
  "id": "blender_render",
  "label": "RENDER",
  "icon": "render.png",
  "action": {
    "type": "macro",
    "steps": [
      {
        "type": "hotkey",
        "keys": ["F12"]
      }
    ]
  }
}
```

Futura action DaVinci:

```json
{
  "id": "davinci_open",
  "label": "DAVINCI",
  "action": {
    "type": "launch",
    "target": "davinci"
  }
}
```

---

# 32. Non fare

NON:

- creare APK Android obbligatorio;
- usare React come requisito;
- usare WebSockets come requisito;
- dipendere da servizi cloud;
- esporre Ollama direttamente in LAN;
- mettere token GitHub nel frontend;
- permettere shell arbitraria;
- hard-codare i pulsanti;
- installare Docker;
- installare un database server;
- creare un sistema troppo complesso;
- introdurre TypeScript se rende il client vecchio incompatibile.

---

# 33. Test

Creare almeno:

```text
tests/
├── validation.test.js
├── config.test.js
├── actions.test.js
└── github.test.js
```

Testare almeno:

- configurazione valida;
- target app inesistente;
- action non riconosciuta;
- token mancante;
- nvidia-smi assente;
- GitHub non raggiungibile;
- Ollama non attivo;
- OpenClaw non attivo.

---

# 34. README richiesto

Il progetto deve includere un README con:

## Installazione

```powershell
npm install
```

## Avvio

```powershell
npm start
```

## Tablet

```text
http://IP_DEL_PC:8787
```

## Configurazione

Spiegare:

```text
config/apps.json
config/dock.json
config/github.json
config/todo.json
.env
```

## Aggiungere un pulsante

Spiegare con un esempio completo.

## Aggiungere una nuova action

Spiegare dove creare il service/adapter e come registrarlo.

---

# 35. Criteri di accettazione

Il progetto è considerato riuscito quando:

### PC

```text
npm start
```

avvia il server senza errori.

### Tablet

Da browser Android 4:

```text
http://PC_IP:8787
```

mostra la dock.

### Touch

Il tap sui pulsanti funziona senza hover.

### Wireless

Il tablet controlla il PC senza cavo dati.

### System

Mostra almeno:

```text
CPU
RAM
GPU usage
GPU temperature
```

quando disponibili.

### Media

I pulsanti:

```text
Play/Pause
Next
Previous
Volume
```

funzionano.

### Launch

Almeno:

```text
Blender
VS Code
DaVinci Resolve
```

possono essere configurati come pulsanti.

### Extensibility

Aggiungere un pulsante tramite JSON NON richiede modifiche al codice frontend.

---

# 36. Priorità assoluta

Ordine di sviluppo:

```text
1. server Express
2. pagina HTML compatibile Android 4
3. health check
4. action system
5. app launcher
6. media keys
7. system monitoring
8. config-driven buttons
9. GitHub
10. Todo
11. Ollama
12. OpenClaw
13. profiles
14. macro engine
15. Blender / DaVinci / Unreal shortcuts
```

Ogni fase deve lasciare il progetto funzionante.

NON procedere implementando 15 feature contemporaneamente.

---

# 37. Output che Gwen deve produrre

Gwen deve:

1. creare l'intero progetto;
2. creare tutti i file;
3. creare `package.json`;
4. creare il server;
5. creare il frontend;
6. creare configurazioni di esempio;
7. creare gli script `.bat` e `.ps1`;
8. creare README;
9. creare test minimi;
10. spiegare esattamente come avviarlo.

Quando una feature dipende dall'ambiente locale dell'utente, creare un adapter/configurazione modificabile invece di inventare valori.

Per applicazioni installate in percorsi diversi da quelli di esempio, usare `config/apps.json`.

---

# 38. Filosofia del progetto

Questo progetto NON vuole competere con una Stream Deck hardware.

Vuole essere:

> **un vecchio tablet trasformato in una Stream Deck wireless altamente configurabile per il mio PC Windows.**

La UI deve essere:

- semplice;
- leggibile;
- touch-friendly;
- scura;
- landscape;
- reattiva;
- compatibile con hardware molto vecchio.

L'architettura deve essere:

- locale;
- modulare;
- configurabile;
- estendibile;
- facile da modificare da un developer;
- facile da mantenere e da far evolvere con un coding agent.

Il risultato finale deve sembrare un **control surface personale**, non una pagina web amatoriale.

