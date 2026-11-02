// Utility condivise dai backend Windows e Linux.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

const MEDIA_COMMANDS = ['play_pause', 'next', 'previous', 'stop', 'volume_up', 'volume_down', 'mute'];

// Espande %VAR% (Windows), $VAR / ${VAR} (Linux) e ~ iniziale.
function expandPath(p) {
  if (typeof p !== 'string') return p;
  let out = p.replace(/%([^%]+)%/g, function (m, name) {
    return process.env[name] !== undefined ? process.env[name] : m;
  });
  out = out.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, function (m, a, b) {
    const v = process.env[a || b];
    return v !== undefined ? v : m;
  });
  if (out === '~' || out.indexOf('~/') === 0 || out.indexOf('~\\') === 0) out = os.homedir() + out.slice(1);
  return out;
}

function looksLikePath(p) { return /[\\/]/.test(p); }

// Risolve "*" nei percorsi (es. "Blender *\blender.exe"): sceglie la cartella
// più recente in ordine alfabetico/numerico, così un aggiornamento non rompe il pulsante.
function resolveWildcard(p) {
  if (typeof p !== 'string' || p.indexOf('*') < 0) return p;
  const sep = p.indexOf('\\') >= 0 ? '\\' : '/';
  const parts = p.split(/[\\/]/);
  let current = [parts[0] === '' ? sep : parts[0] + (/^[A-Za-z]:$/.test(parts[0]) ? sep : '')];
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg) continue;
    const next = [];
    current.forEach(function (dir) {
      if (seg.indexOf('*') < 0) { next.push(path.join(dir, seg)); return; }
      const re = new RegExp('^' + seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
      let entries = [];
      try { entries = fs.readdirSync(dir); } catch (e) { return; }
      entries.filter(function (n) { return re.test(n); })
        .sort(function (a, b) { return b.localeCompare(a, undefined, { numeric: true }); })
        .forEach(function (n) { next.push(path.join(dir, n)); });
    });
    current = next;
    if (!current.length) return p;
  }
  for (let j = 0; j < current.length; j++) if (fs.existsSync(current[j])) return current[j];
  return p;
}

const whichCache = {};
const dirCache = {};
function listDir(dir) {
  if (!dirCache[dir]) {
    try { dirCache[dir] = fs.readdirSync(dir).map(function (n) { return n.toLowerCase(); }); } catch (e) { dirCache[dir] = []; }
  }
  return dirCache[dir];
}
// Cerca un eseguibile nel PATH (con PATHEXT su Windows). Ritorna il percorso o null.
function which(cmd) {
  if (whichCache[cmd] !== undefined) return whichCache[cmd];
  let found = null;
  if (looksLikePath(cmd)) {
    found = fs.existsSync(cmd) ? cmd : null;
  } else {
    const exts = process.platform === 'win32'
      ? [''].concat((process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').toLowerCase().split(';'))
      : [''];
    const dirs = (process.env.PATH || '').split(path.delimiter);
    outer:
    for (let i = 0; i < dirs.length; i++) {
      if (!dirs[i]) continue;
      for (let j = 0; j < exts.length; j++) {
        const candidate = path.join(dirs[i], cmd + exts[j]);
        try {
          const st = fs.statSync(candidate);
          if (st.isFile()) { found = candidate; break outer; }
        } catch (e) {
          // Gli alias delle app di Windows (WindowsApps\wt.exe, ...) sono reparse
          // point che Node non apre: esistono se compaiono nell'elenco della cartella.
          if (process.platform === 'win32' && listDir(dirs[i]).indexOf((cmd + exts[j]).toLowerCase()) >= 0) {
            found = candidate;
            break outer;
          }
        }
      }
    }
  }
  whichCache[cmd] = found;
  return found;
}

// Esegue un programma senza shell e raccoglie l'output (max 64KB).
function run(cmd, args, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    execFile(cmd, args || [], {
      timeout: opts.timeout || 5000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
      cwd: opts.cwd,
      env: opts.env || process.env,
      encoding: 'utf8'
    }, function (err, stdout, stderr) {
      resolve({
        ok: !err,
        code: err ? (typeof err.code === 'number' ? err.code : -1) : 0,
        notFound: !!(err && err.code === 'ENOENT'),
        stdout: stdout || '',
        stderr: stderr || '',
        error: err ? err.message : null
      });
    });
  });
}

// Avvia un programma staccato dal server (continua a vivere se il server si chiude).
function spawnDetached(cmd, args, cwd) {
  return new Promise(function (resolve, reject) {
    let child;
    try {
      child = spawn(cmd, args || [], { cwd: cwd || os.homedir(), detached: true, stdio: 'ignore', windowsHide: false });
    } catch (e) { return reject(e); }
    let settled = false;
    child.once('error', function (e) { if (!settled) { settled = true; reject(e); } });
    child.once('spawn', function () { if (!settled) { settled = true; child.unref(); resolve(); } });
  });
}

// Quoting degli argomenti secondo le regole di CommandLineToArgvW.
function quoteWinArg(arg) {
  arg = String(arg);
  if (arg && !/[\s"]/.test(arg)) return arg;
  return '"' + arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"';
}

async function fetchJson(url, opts) {
  opts = opts || {};
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, opts.timeout || 5000);
  try {
    const res = await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    return { ok: res.ok, status: res.status, data: data, text: text, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

function stripAnsi(s) {
  return String(s || '').replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '').replace(/\u001b\][^\u0007]*\u0007/g, '');
}

module.exports = {
  MEDIA_COMMANDS: MEDIA_COMMANDS,
  expandPath: expandPath,
  looksLikePath: looksLikePath,
  resolveWildcard: resolveWildcard,
  which: which,
  run: run,
  spawnDetached: spawnDetached,
  quoteWinArg: quoteWinArg,
  fetchJson: fetchJson,
  stripAnsi: stripAnsi
};
