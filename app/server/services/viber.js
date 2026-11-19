'use strict';
// Viber (l'IDE con terminale, git, browser e chat): pagina VIBER del tablet.
// Viber apre un'API locale per i suoi strumenti MCP: porta e token stanno in
// ~/.viber/browser-mcp.json (Windows e Linux), si parla solo con 127.0.0.1.
// Senza "callerWorktree" i comandi valgono per la finestra di Viber in primo piano
// (o la principale): quella che hai davanti.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const platform = require('../platform');
const log = require('../log');

const PANELS = ['terminal', 'git', 'browser', 'chat', 'tasks', 'files'];
// Viste della finestra (scorciatoie di Viber: Ctrl+Alt+1/2/3). La barra degli agenti
// non ha un comando nell'API (toggle-sidebar apre/chiude solo la colonnina dei worktree).
const VIEWS = { tabs: '1', agents: '2', focus: '3' };
// nomi dei pannelli nel layout -> pulsanti del tablet
const ALIAS = { 'git-diff': 'git', 'git-graph': 'git', todos: 'tasks' };
function panelId(p) { const id = String(p).split(':')[0]; return ALIAS[id] || id; }

function configPath() {
  return process.env.VIBER_MCP_ENDPOINT || path.join(os.homedir(), '.viber', 'browser-mcp.json');
}
function readConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return typeof c.port === 'number' && typeof c.token === 'string' ? c : null;
  } catch (e) { return null; }
}

function err(msg, code) { return Object.assign(new Error(msg), { code: code || 'UNAVAILABLE' }); }

function friendly(msg) {
  if (/is not open in this layout/i.test(msg)) return 'Questo pannello non è tra le schede aperte in Viber';
  if (/is hidden for this project/i.test(msg)) return 'Questo pannello è nascosto in Viber per questo progetto';
  return 'Viber: ' + msg;
}

function call(endpoint, body, timeout) {
  const cfg = readConfig();
  if (!cfg) return Promise.reject(err('Viber non è aperto (o non ha mai avviato i suoi strumenti) su questo PC'));
  return new Promise(function (resolve, reject) {
    const data = body !== undefined ? JSON.stringify(body) : '';
    const req = http.request({
      host: '127.0.0.1', port: cfg.port, path: endpoint, method: body !== undefined ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: timeout || 8000
    }, function (res) {
      let b = '';
      res.on('data', function (c) { b += c; });
      res.on('end', function () {
        let j = null;
        try { j = JSON.parse(b); } catch (e) { /* risposta non JSON */ }
        if (res.statusCode >= 400 || !j) return reject(err('Viber: ' + ((j && j.error) || ('errore ' + res.statusCode))));
        // Viber risponde 200 anche quando il comando non riesce, con { error }
        if (j.error) return reject(err(friendly(String(j.error))));
        resolve(j);
      });
    });
    req.on('timeout', function () { req.destroy(); reject(err('Viber non risponde')); });
    req.on('error', function (e) {
      reject(err(e.code === 'ECONNREFUSED' ? 'Viber non è aperto su questo PC' : 'Viber: ' + e.message));
    });
    req.end(data);
  });
}

// Pannello attivo e pannelli aperti, dal layout della finestra.
function summarize(st) {
  const leaves = (st && st.layout && st.layout.leaves) || [];
  const open = {};
  let active = '';
  leaves.forEach(function (l) {
    (l.panels || []).forEach(function (p) { open[panelId(p)] = true; });
    if (!active && l.activePanel) active = panelId(l.activePanel);
  });
  return {
    project: st && st.worktree ? st.worktree.path : '',
    name: st && st.worktree ? path.basename(String(st.worktree.path).replace(/[\\/]+$/, '')) : '',
    active: active,
    open: Object.keys(open)
  };
}

async function state() {
  try {
    const st = await call('/viber/state');
    return Object.assign({ online: true, panels: PANELS }, summarize(st));
  } catch (e) {
    return { online: false, message: e.message, panels: PANELS };
  }
}

// Porta Viber davanti (se è dietro altre finestre), senza fermarsi se non riesce.
async function bringFront() {
  try { await platform.focus('Viber'); } catch (e) { log.debug('viber', 'primo piano: ' + e.message); }
}

async function focusPanel(panel) {
  if (PANELS.indexOf(panel) < 0) throw err('Pannello non valido', 'BAD_REQUEST');
  await call('/viber/focus-panel', { panel: panel });
  await bringFront();
  return state();
}

// Cambia vista (schede, agenti, focus) con la scorciatoia di Viber: serve Viber in
// primo piano, altrimenti i tasti finirebbero in un'altra finestra.
async function view(mode) {
  if (!Object.prototype.hasOwnProperty.call(VIEWS, mode)) throw err('Vista non valida', 'BAD_REQUEST');
  const st = await state();
  if (!st.online) throw err(st.message);
  try { await platform.focus('Viber'); } catch (e) { throw err('Non riesco a portare Viber in primo piano'); }
  await platform.sendKeys(['CTRL', 'ALT', VIEWS[mode]]);
  return st;
}

// Task del progetto aperto in Viber (non chiuse), con le sottotask sotto la loro task.
async function tasks() {
  const st = summarize(await call('/viber/state'));
  if (!st.project) return { project: '', tasks: [] };
  // il progetto è la cartella principale: una worktree sta dentro o accanto
  let project = st.project;
  try {
    const p = await call('/tasks/projects', {});
    const list = (p && p.projects) || [];
    const norm = function (s) { return String(s).replace(/[\\/]+$/, '').toLowerCase(); };
    const exact = list.filter(function (x) { return norm(x) === norm(st.project); })[0];
    const inside = list.filter(function (x) { return norm(st.project).indexOf(norm(x) + path.sep.toLowerCase()) === 0; })[0];
    project = exact || inside || project;
  } catch (e) { /* si prova con la cartella della finestra */ }
  const r = await call('/tasks/list', { projectPath: project, includeDone: false });
  const all = (r && r.tasks) || [];
  const byParent = {};
  all.forEach(function (t) { if (t.parentId) (byParent[t.parentId] = byParent[t.parentId] || []).push(t); });
  const out = all.filter(function (t) { return !t.parentId; }).map(function (t) {
    return {
      id: t.id, text: t.text, status: t.status,
      branch: t.assignee ? t.assignee.branch || '' : '',
      steps: (byParent[t.id] || []).map(function (s) { return { id: s.id, text: s.text, status: s.status }; })
    };
  });
  // prima quelle in corso, poi le aperte
  out.sort(function (a, b) { return (a.status === 'in_progress' ? 0 : 1) - (b.status === 'in_progress' ? 0 : 1); });
  return { project: path.basename(project), tasks: out };
}

module.exports = { state: state, focusPanel: focusPanel, view: view, VIEWS: VIEWS, tasks: tasks, PANELS: PANELS, _summarize: summarize };
