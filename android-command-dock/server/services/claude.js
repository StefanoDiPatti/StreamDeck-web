// Chat con Claude. Due modi, scelti da services.json -> claude.backend:
//  "api" : Claude API con ANTHROPIC_API_KEY (SDK ufficiale @anthropic-ai/sdk)
//  "cli" : Claude Code installato sul PC (`claude -p`), usa il tuo abbonamento
//  "auto": api se c'è la chiave, altrimenti cli se `claude` è installato
const os = require('os');
const { spawn } = require('child_process');
const config = require('../config');
const common = require('../platform/common');
const chats = require('./chats');
const log = require('../log');

const MAX_MESSAGES = 60;
let client = null;
let AnthropicMod = null;

function settings() {
  const s = (config.get('services').claude) || {};
  return {
    backend: s.backend || 'auto',
    model: s.model || 'claude-opus-5-5',
    effort: s.effort || 'low',
    maxTokens: s.maxTokens || 16000,
    system: s.system || 'Rispondi in italiano, in modo conciso: il testo viene letto su un tablet piccolo. Evita tabelle larghe.',
    cliModel: s.cliModel || '',
    cliCwd: s.cliCwd || '~',
    cliTimeoutMs: s.cliTimeoutMs || 300000
  };
}

function resolveBackend() {
  const s = settings();
  const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const hasCli = !!common.which('claude');
  if (s.backend === 'api') return hasKey ? 'api' : null;
  if (s.backend === 'cli') return hasCli ? 'cli' : null;
  if (hasKey) return 'api';
  if (hasCli) return 'cli';
  return null;
}

function info() {
  const s = settings();
  const backend = resolveBackend();
  return {
    available: !!backend,
    backend: backend,
    model: backend === 'api' ? s.model : (s.cliModel || 'predefinito di Claude Code'),
    hint: backend ? null : 'Imposta ANTHROPIC_API_KEY nel .env oppure installa Claude Code (comando "claude")'
  };
}

function sdk() {
  if (!AnthropicMod) {
    const mod = require('@anthropic-ai/sdk');
    AnthropicMod = mod.Anthropic || mod.default || mod;
  }
  if (!client) client = new AnthropicMod();
  return client;
}

function apiErrorMessage(e) {
  const A = AnthropicMod;
  if (A && e instanceof A.AuthenticationError) return 'Chiave API non valida (ANTHROPIC_API_KEY)';
  if (A && e instanceof A.PermissionDeniedError) return 'La chiave API non ha accesso a questo modello';
  if (A && e instanceof A.NotFoundError) return 'Modello non trovato: controlla services.json';
  if (A && e instanceof A.RateLimitError) return 'Limite di richieste raggiunto, riprova tra poco';
  if (A && e instanceof A.BadRequestError) return 'Richiesta rifiutata: ' + e.message;
  if (A && e instanceof A.APIConnectionError) return 'Impossibile raggiungere l\'API di Claude (connessione Internet?)';
  if (A && e instanceof A.APIError) return 'Errore API ' + (e.status || '') + ': ' + e.message;
  return e.message;
}

async function chatApi(session, text) {
  const s = settings();
  session.messages.push({ role: 'user', content: String(text) });
  try {
    // Fallback lato server: se un classificatore rifiuta, l'API ritenta da sola
    // sul modello consigliato per quella categoria.
    const resp = await sdk().beta.messages.create({
      model: s.model,
      max_tokens: s.maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: s.effort },
      system: s.system,
      messages: session.messages
    });
    if (resp.stop_reason === 'refusal') {
      session.messages.pop();
      throw Object.assign(new Error('Claude ha rifiutato questa richiesta'), { code: 'REFUSED' });
    }
    // La risposta completa (anche i blocchi di thinking) resta nella storia:
    // le API vogliono la cronologia invariata.
    session.messages.push({ role: 'assistant', content: resp.content });
    const reply = resp.content.filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; }).join('\n').trim();
    return { reply: reply || '(risposta vuota)', model: resp.model, truncated: resp.stop_reason === 'max_tokens' };
  } catch (e) {
    if (session.messages.length && session.messages[session.messages.length - 1].role === 'user') session.messages.pop();
    if (e.code === 'REFUSED') throw e;
    log.warn('claude', e.message);
    throw new Error(apiErrorMessage(e));
  }
}

function chatCli(session, text) {
  const s = settings();
  const args = ['-p', '--output-format', 'json', '--append-system-prompt', s.system];
  if (s.cliModel) args.push('--model', s.cliModel);
  if (session.cliSessionId) args.push('--resume', session.cliSessionId);
  return new Promise(function (resolve, reject) {
    const proc = spawn(common.which('claude'), args, {
      cwd: common.expandPath(s.cliCwd) || os.homedir(),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let out = ''; let err = '';
    const timer = setTimeout(function () { proc.kill(); reject(new Error('Claude Code ci sta mettendo troppo')); }, s.cliTimeoutMs);
    proc.stdout.on('data', function (d) { out += d; });
    proc.stderr.on('data', function (d) { err += d; });
    proc.on('error', function (e) { clearTimeout(timer); reject(new Error('Impossibile avviare Claude Code: ' + e.message)); });
    proc.on('close', function () {
      clearTimeout(timer);
      let data = null;
      try { data = JSON.parse(out.trim().split('\n').pop()); } catch (e) { data = null; }
      if (!data) {
        log.warn('claude', 'risposta CLI non valida: ' + common.stripAnsi(err || out).slice(0, 300));
        return reject(new Error('Claude Code non ha risposto: ' + (common.stripAnsi(err).trim().split('\n')[0] || 'output vuoto')));
      }
      if (data.session_id) session.cliSessionId = data.session_id;
      if (data.is_error) return reject(new Error(String(data.result || 'Errore di Claude Code')));
      session.messages.push({ role: 'user' }, { role: 'assistant' }); // solo per il conteggio
      resolve({ reply: String(data.result || '').trim() || '(risposta vuota)', model: 'Claude Code' });
    });
    proc.stdin.end(String(text));
  });
}

async function chat(sessionId, text) {
  const backend = resolveBackend();
  if (!backend) throw Object.assign(new Error(info().hint), { code: 'UNAVAILABLE' });
  let session = chats.get('claude', sessionId);
  if (!session || session.backend !== backend) session = chats.create('claude', { backend: backend });
  if (session.busy) throw Object.assign(new Error('Sto ancora rispondendo al messaggio precedente'), { code: 'BUSY' });
  if (session.messages.length >= MAX_MESSAGES) {
    throw Object.assign(new Error('Conversazione troppo lunga: premi NUOVA'), { code: 'TOO_LONG' });
  }
  session.busy = true;
  try {
    const r = backend === 'api' ? await chatApi(session, text) : await chatCli(session, text);
    return Object.assign({ sessionId: session.id, backend: backend }, r);
  } finally {
    session.busy = false;
  }
}

module.exports = { info: info, chat: chat };
