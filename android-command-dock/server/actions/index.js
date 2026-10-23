// Motore delle azioni. Il tablet non manda MAI comandi: manda solo
// { page, tile } e il server cerca l'azione in dock.json.
// Per aggiungere un tipo di azione: aggiungi una voce a HANDLERS.
const { spawn } = require('child_process');
const os = require('os');
const config = require('../config');
const platform = require('../platform');
const keys = require('../platform/keys');
const common = require('../platform/common');
const media = require('../services/media');
const log = require('../log');

const MAX_MACRO_STEPS = 50;
const MAX_WAIT_MS = 10000;

function fail(message, code) {
  const e = new Error(message);
  e.code = code || 'ACTION_FAILED';
  return e;
}

function appLabel(id, app) { return (app && app.label) || id; }

// Sceglie la variante per il sistema corrente: { windows: {...}, linux: {...} } oppure campi diretti.
function forPlatform(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const key = process.platform === 'win32' ? 'windows' : process.platform;
  const specific = entry[key];
  if (specific && typeof specific === 'object') return Object.assign({}, entry, specific);
  if (entry.windows || entry.linux) {
    // Definita solo per altri sistemi
    if (!entry.path && !entry.cmd) return null;
  }
  return entry;
}

function normalizeArgs(args) {
  if (Array.isArray(args)) return args.map(String);
  if (typeof args === 'string' && args.trim()) return args.trim().split(/\s+/);
  return [];
}

// Esegue un comando della whitelist (config/commands.json) e cattura l'output.
function runCommand(id) {
  const all = (config.get('commands').commands) || {};
  const def = forPlatform(all[id]);
  if (!all[id]) return Promise.reject(fail('Comando "' + id + '" non definito in commands.json', 'NOT_FOUND'));
  if (!def || !def.cmd) return Promise.reject(fail('Comando "' + id + '" non disponibile su questo sistema', 'UNSUPPORTED'));
  const args = normalizeArgs(def.args).map(common.expandPath);
  const cmd = common.expandPath(def.cmd);
  const timeout = Math.min(def.timeoutMs || 20000, 120000);
  return new Promise(function (resolve, reject) {
    let proc;
    // Su Windows molti comandi sono script .cmd (npm): serve la shell.
    // Comando e argomenti vengono SOLO dal file di config, mai dal tablet.
    if (process.platform === 'win32') {
      const line = [common.quoteWinArg(cmd)].concat(args.map(common.quoteWinArg)).join(' ');
      proc = spawn(line, { shell: true, cwd: def.cwd ? common.expandPath(def.cwd) : os.homedir(), windowsHide: true });
    } else {
      proc = spawn(cmd, args, { cwd: def.cwd ? common.expandPath(def.cwd) : os.homedir() });
    }
    let out = '';
    const append = function (d) { if (out.length < 8000) out += d; };
    proc.stdout.on('data', append);
    proc.stderr.on('data', append);
    const timer = setTimeout(function () { proc.kill(); }, timeout);
    proc.on('error', function (e) { clearTimeout(timer); reject(fail('Impossibile eseguire ' + cmd + ': ' + e.message)); });
    proc.on('close', function (code) {
      clearTimeout(timer);
      const text = common.stripAnsi(out).trim();
      if (code !== 0) return reject(fail((def.label || id) + ' fallito (codice ' + code + ')' + (text ? ': ' + text.split('\n').slice(-1)[0] : '')));
      resolve({ message: (def.label || id) + ': fatto', output: def.showOutput ? text.slice(0, 4000) : undefined });
    });
  });
}

const HANDLERS = {
  launch: async function (a) {
    const id = a.app || a.target;
    const apps = (config.get('apps').apps) || {};
    const app = forPlatform(apps[id]);
    if (!apps[id]) throw fail('App "' + id + '" non definita in apps.json', 'NOT_FOUND');
    if (!app || !app.path) throw fail(appLabel(id, apps[id]) + ' non configurata per questo sistema', 'UNSUPPORTED');
    try {
      await platform.launch({ path: app.path, args: normalizeArgs(app.args), cwd: app.cwd });
    } catch (e) {
      throw fail(appLabel(id, app) + ': ' + e.message, 'NOT_FOUND');
    }
    return { message: appLabel(id, app) + ' avviata' };
  },

  media: async function (a) {
    await media.command(a.command);
    return { message: null };
  },

  hotkey: async function (a) {
    const combo = keys.parseCombo(a.keys);
    if (a.focus) await platform.focus(a.focus);
    await platform.sendKeys(combo);
    return { message: null };
  },

  key: async function (a) {
    const combo = keys.parseCombo([a.key]);
    if (a.focus) await platform.focus(a.focus);
    const times = Math.max(1, Math.min(parseInt(a.repeat, 10) || 1, 50));
    for (let i = 0; i < times; i++) await platform.sendKeys(combo);
    return { message: null };
  },

  text: async function (a) {
    if (typeof a.value !== 'string' || !a.value) throw fail('Testo mancante', 'BAD_CONFIG');
    if (a.focus) await platform.focus(a.focus);
    await platform.typeText(a.value);
    return { message: null };
  },

  focus: async function (a) {
    await platform.focus(a.app || a.process);
    return { message: null };
  },

  open_url: async function (a) {
    if (!/^(https?|mailto|steam|spotify|vscode|obsidian|discord):/i.test(String(a.url || ''))) {
      throw fail('URL non valido o protocollo non consentito: ' + a.url, 'BAD_CONFIG');
    }
    await platform.open(a.url);
    return { message: 'Aperto sul PC' };
  },

  open_path: async function (a) {
    if (!a.path) throw fail('Percorso mancante', 'BAD_CONFIG');
    await platform.open(common.expandPath(a.path));
    return { message: 'Aperto sul PC' };
  },

  command: async function (a) {
    return runCommand(a.id || a.commandId);
  },

  wait: async function (a) {
    const ms = Math.max(0, Math.min(parseInt(a.ms, 10) || 0, MAX_WAIT_MS));
    await new Promise(function (r) { setTimeout(r, ms); });
    return { message: null };
  },

  macro: async function (a) {
    const steps = Array.isArray(a.steps) ? a.steps : [];
    if (!steps.length) throw fail('Macro senza passi', 'BAD_CONFIG');
    if (steps.length > MAX_MACRO_STEPS) throw fail('Macro troppo lunga (max ' + MAX_MACRO_STEPS + ' passi)', 'BAD_CONFIG');
    let last = { message: null };
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i] || steps[i].type === 'macro') throw fail('Passo ' + (i + 1) + ' non valido', 'BAD_CONFIG');
      try {
        last = await execute(steps[i]);
      } catch (e) {
        throw fail('Macro interrotta al passo ' + (i + 1) + ': ' + e.message, e.code);
      }
    }
    return { message: a.doneMessage || last.message || 'Macro completata', output: last.output };
  }
};

// Alias per compatibilità con la vecchia configurazione
HANDLERS.shell = HANDLERS.command;

async function execute(action) {
  if (!action || typeof action !== 'object') throw fail('Azione mancante', 'BAD_CONFIG');
  const handler = HANDLERS[action.type];
  if (!handler) throw fail('Tipo di azione sconosciuto: ' + action.type, 'UNKNOWN_ACTION');
  return handler(action);
}

// Punto d'ingresso dal tablet.
async function press(pageId, tileId) {
  const tile = config.findTile(pageId, tileId);
  if (!tile) throw fail('Pulsante non trovato (configurazione cambiata?)', 'CONFIG_CHANGED');
  if (!tile.action) throw fail('Questo pulsante non ha un\'azione', 'BAD_CONFIG');
  if (tile.action.type === 'page') return { message: null };
  const started = Date.now();
  const result = await execute(tile.action);
  log.info('action', (tile.label || tile.id) + ' -> ok (' + (Date.now() - started) + 'ms)');
  return result;
}

module.exports = { execute: execute, press: press, HANDLERS: HANDLERS, forPlatform: forPlatform };
