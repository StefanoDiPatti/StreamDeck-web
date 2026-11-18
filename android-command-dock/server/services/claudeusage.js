'use strict';
// Consumi di Claude (abbonamento): sessione di 5 ore, settimana e limiti per modello.
// Come fa Viber: usa l'accesso di Claude Code già fatto su questo PC
// (~/.claude/.credentials.json, o CLAUDE_CONFIG_DIR) e chiede ad Anthropic
// https://api.anthropic.com/api/oauth/usage. Il token resta sul PC: non viene
// mai mandato al tablet, scritto nei log o salvato altrove.
// Risposta tenuta in memoria per 60 s, per non chiedere troppo spesso.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const log = require('../log');

const CACHE_MS = 60000;
let cache = null;

function credentialsPath() {
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(dir, '.credentials.json');
}

function readToken() {
  let j;
  try { j = JSON.parse(fs.readFileSync(credentialsPath(), 'utf8')); } catch (e) { return { error: 'Claude Code non ha fatto l\'accesso su questo PC (manca ~/.claude/.credentials.json)' }; }
  const o = j && j.claudeAiOauth;
  if (!o || !o.accessToken) return { error: 'Accesso di Claude Code non trovato: apri Claude Code e fai login' };
  if (o.expiresAt && o.expiresAt < Date.now()) return { error: 'Accesso di Claude Code scaduto: apri Claude Code sul PC per rinnovarlo' };
  if (Array.isArray(o.scopes) && o.scopes.length && o.scopes.indexOf('user:profile') < 0) {
    return { error: 'L\'accesso di Claude Code non permette di leggere i consumi: rifai login in Claude Code' };
  }
  return { token: o.accessToken };
}

function getJson(url, token) {
  return new Promise(function (resolve, reject) {
    const req = https.get(url, {
      headers: { Authorization: 'Bearer ' + token, 'anthropic-beta': 'oauth-2025-04-20', 'User-Agent': 'command-dock' },
      timeout: 10000
    }, function (res) {
      let b = '';
      res.on('data', function (c) { b += c; });
      res.on('end', function () {
        if (res.statusCode >= 400) return reject(new Error('Anthropic ha risposto ' + res.statusCode));
        try { resolve(JSON.parse(b)); } catch (e) { reject(new Error('Risposta non valida da Anthropic')); }
      });
    });
    req.on('timeout', function () { req.destroy(); reject(new Error('Anthropic non risponde')); });
    req.on('error', function (e) { reject(new Error('Rete: ' + e.message)); });
  });
}

function win(w) {
  if (!w || typeof w.utilization !== 'number') return null;
  return { percent: Math.max(0, Math.min(100, Math.round(w.utilization))), resetsAt: w.resets_at || null };
}

// Risposta di Anthropic -> dati per il tablet.
function normalize(d) {
  d = d || {};
  const models = [];
  // limiti settimanali per modello: chiavi seven_day_<modello> (account vecchi) o array "limits"
  [['seven_day_opus', 'Opus'], ['seven_day_sonnet', 'Sonnet']].forEach(function (k) {
    const w = win(d[k[0]]);
    if (w) models.push(Object.assign({ name: k[1] }, w));
  });
  (Array.isArray(d.limits) ? d.limits : []).forEach(function (l) {
    const m = l && l.scope && l.scope.model;
    if (!m || typeof l.percent !== 'number') return;
    const name = m.display_name || m.id || 'Modello';
    if (models.some(function (x) { return x.name === name; })) return;
    models.push({ name: name, percent: Math.max(0, Math.min(100, Math.round(l.percent))), resetsAt: l.resets_at || null });
  });
  return { ok: true, fiveHour: win(d.five_hour), sevenDay: win(d.seven_day), models: models, at: Date.now() };
}

async function usage(force) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache;
  const t = readToken();
  if (t.error) return { ok: false, error: t.error, at: Date.now() };
  try {
    cache = normalize(await getJson('https://api.anthropic.com/api/oauth/usage', t.token));
    return cache;
  } catch (e) {
    log.debug('claude', 'consumi: ' + e.message);
    // meglio i dati di poco fa che niente
    if (cache) return Object.assign({}, cache, { stale: true, error: e.message });
    return { ok: false, error: e.message, at: Date.now() };
  }
}

module.exports = { usage: usage, _normalize: normalize };
