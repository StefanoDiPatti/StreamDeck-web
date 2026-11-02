// Backend Windows: tutto passa da due helper PowerShell persistenti.
//  - "input": tasti, testo, avvio app, focus (deve rispondere subito)
//  - "query": now playing, copertina, rete (può essere più lento)
const fs = require('fs');
const os = require('os');
const PsHelper = require('./pshelper');
const keys = require('./keys');
const common = require('./common');

const input = new PsHelper('input');
const query = new PsHelper('query');

const MEDIA_VK = {
  play_pause: 0xB3, next: 0xB0, previous: 0xB1, stop: 0xB2,
  volume_up: 0xAF, volume_down: 0xAE, mute: 0xAD
};

function checkSent(result, what) {
  if (!result || !result.sent) {
    throw new Error(what + ' bloccato da Windows (la finestra attiva è forse avviata come amministratore?)');
  }
  return result;
}

module.exports = {
  name: 'windows',

  init: function () {
    return Promise.all([input.start(), query.start()]);
  },

  capabilities: function () {
    return {
      media: true,
      keys: true,
      text: true,
      focus: true,
      nowPlaying: !!query.info.winrt,
      art: !!query.info.winrt,
      appVolume: !!input.info.appAudio,
      notes: query.info.winrt === false ? ['API WinRT non disponibili: niente "Now Playing"'] : []
    };
  },

  media: function (command) {
    const vk = MEDIA_VK[command];
    if (!vk) return Promise.reject(new Error('Comando media sconosciuto: ' + command));
    return input.call('keys', { vks: [vk] }).then(function (r) { return checkSent(r, 'Tasto media'); });
  },

  sendKeys: function (combo) {
    return input.call('keys', { vks: keys.toWin(combo) }).then(function (r) { return checkSent(r, 'Scorciatoia'); });
  },

  typeText: function (text) {
    return input.call('text', { text: String(text) }, 15000).then(function (r) { return checkSent(r, 'Testo'); });
  },

  focus: function (processName) {
    const name = String(processName).replace(/\.exe$/i, '');
    return input.call('focus', { name: name }).then(function (r) {
      if (!r.focused) throw new Error('Finestra "' + name + '" non trovata');
      return r;
    });
  },

  open: function (target) {
    return input.call('open', { file: String(target) });
  },

  // app: { path, args: [], cwd }
  launch: function (app) {
    const file = common.resolveWildcard(common.expandPath(app.path));
    const args = (app.args || []).map(common.expandPath);
    const cwd = app.cwd ? common.expandPath(app.cwd) : os.homedir();
    if (/^shell:/i.test(file)) {
      // App dello Store (es. Apple Music): shell:AppsFolder\<AUMID>
      return input.call('open', { file: 'explorer.exe', args: common.quoteWinArg(file), cwd: cwd });
    }
    if (common.looksLikePath(file) && !fs.existsSync(file)) {
      return Promise.reject(new Error('non trovato in ' + file));
    }
    if (!common.looksLikePath(file) && !common.which(file)) {
      return Promise.reject(new Error('"' + file + '" non è nel PATH'));
    }
    return input.call('open', {
      file: common.looksLikePath(file) ? file : common.which(file),
      args: args.map(common.quoteWinArg).join(' '),
      cwd: cwd
    });
  },

  // Tutte le sessioni multimediali di Windows, in formato neutro.
  // position/duration sono relative all'inizio del brano (EndTime - StartTime).
  sessions: function () {
    return query.call('sessions', {}, 8000).then(function (d) {
      if (!d || !d.supported) return { supported: false, sessions: [] };
      return {
        supported: true,
        sessions: (d.sessions || []).map(function (s) {
          const status = String(s.status || '').toLowerCase();
          const start = s.start || 0;
          return {
            id: s.app,
            app: s.app || '',
            current: !!s.current,
            title: s.title || '',
            artist: s.artist || '',
            album: s.album || '',
            status: status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'stopped',
            position: Math.max(0, (s.position || 0) - start),
            duration: Math.max(0, (s.end || 0) - start),
            start: start,
            updatedAt: s.updatedAt || 0,
            hasArt: !!s.hasArt,
            canSeek: !!s.canSeek,
            canShuffle: !!s.canShuffle,
            shuffle: !!s.shuffle
          };
        })
      };
    });
  },

  // Comando a una sessione precisa: play_pause, next, previous, stop, seek, shuffle
  control: function (session, action, extra) {
    const args = { app: session.app, action: action };
    if (action === 'seek') args.position = (session.start || 0) + Number(extra || 0);
    if (action === 'shuffle') args.value = !!extra;
    return input.call('control', args, 6000).then(function (r) {
      if (!r.done) throw new Error('L\'app non ha accettato il comando');
      return r;
    });
  },

  art: function (session) {
    return query.call('art', { app: session.app }, 8000).then(function (d) {
      if (!d || !d.ok) return null;
      return { mime: d.mime || 'image/jpeg', data: Buffer.from(d.data, 'base64') };
    });
  },

  // Volume dell'app (non di sistema): names = nomi dei processi, delta = ±0.05, mute 2 = inverti
  appVolume: function (names, delta, mute) {
    return input.call('appvolume', { names: names, delta: delta || 0, mute: mute === undefined ? -1 : mute }, 6000)
      .then(function (r) { return r.level; });
  },

  audioProcesses: function () {
    return query.call('audiosessions', {}, 6000).then(function (r) { return r.processes || []; });
  },

  netBytes: function () {
    return query.call('net', {}, 4000).catch(function () { return null; });
  },

  // Rete attiva: { type: 'wifi'|'ethernet'|'none', name, signal }
  netInfo: function () {
    return query.call('netinfo', {}, 6000).catch(function () { return null; });
  },

  // Finestre visibili: [{ process, title }]
  windows: function () {
    return query.call('windows', {}, 5000).then(function (r) {
      return (r.list || []).map(function (l) {
        const i = String(l).indexOf('\t');
        return { process: String(l).slice(0, i), title: String(l).slice(i + 1) };
      });
    });
  },

  // Chiude le finestre di un processo (come la X): ritorna quante
  closeWindows: function (processName, titlePattern) {
    return input.call('closewin', { process: String(processName), title: titlePattern || '' }, 5000)
      .then(function (r) { return r.closed; });
  },

  cpuTemp: function () { return Promise.resolve(null); },
  gpuFallback: function () { return Promise.resolve(null); },

  shutdown: function () { input.stop(); query.stop(); }
};
