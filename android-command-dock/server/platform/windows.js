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

  nowPlaying: function () {
    return query.call('nowplaying', {}, 6000).then(function (d) {
      if (!d.supported) return { supported: false };
      if (!d.active) return { supported: true, active: false };
      const status = String(d.status || '').toLowerCase();
      return {
        supported: true,
        active: true,
        app: d.app || '',
        title: d.title || '',
        artist: d.artist || '',
        album: d.album || '',
        status: status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'stopped',
        position: d.position || 0,
        duration: d.duration || 0,
        updatedAt: d.updatedAt || Date.now(),
        hasArt: !!d.hasArt
      };
    });
  },

  art: function () {
    return query.call('art', {}, 8000).then(function (d) {
      if (!d || !d.ok) return null;
      return { mime: d.mime || 'image/jpeg', data: Buffer.from(d.data, 'base64') };
    });
  },

  netBytes: function () {
    return query.call('net', {}, 4000).catch(function () { return null; });
  },

  cpuTemp: function () { return Promise.resolve(null); },
  gpuFallback: function () { return Promise.resolve(null); },

  shutdown: function () { input.stop(); query.stop(); }
};
