// "Now Playing": cosa sta suonando sul PC (Apple Music, Spotify, browser...).
const crypto = require('crypto');
const platform = require('../platform');
const common = require('../platform/common');
const log = require('../log');

let cache = { at: 0, data: null, pending: null };
let art = { key: null, data: null, pending: null };
let lastError = null;

// Nomi leggibili per gli identificativi delle app (AUMID su Windows, MPRIS su Linux).
function prettyApp(id) {
  const s = String(id || '');
  const known = [
    [/AppleMusic/i, 'Apple Music'], [/spotify/i, 'Spotify'], [/chrome/i, 'Chrome'],
    [/brave/i, 'Brave'], [/msedge|edge/i, 'Edge'], [/firefox/i, 'Firefox'], [/vlc/i, 'VLC'],
    [/ZuneMusic|Media\.Player|Microsoft\.Media/i, 'Lettore multimediale'], [/tidal/i, 'TIDAL'],
    [/deezer/i, 'Deezer'], [/youtube/i, 'YouTube Music'], [/opera/i, 'Opera'], [/rhythmbox/i, 'Rhythmbox']
  ];
  for (let i = 0; i < known.length; i++) if (known[i][0].test(s)) return known[i][1];
  return s.replace(/\.exe$/i, '').replace(/_[a-z0-9]{10,}!.*$/i, '').split(/[.!\\/]/).pop() || s;
}

function trackKey(d) {
  return crypto.createHash('sha1').update([d.app, d.title, d.artist, d.album].join('|')).digest('hex').slice(0, 12);
}

async function fetchNow() {
  try {
    const d = await platform.nowPlaying();
    lastError = null;
    if (!d.supported || !d.active) return { supported: !!d.supported, active: false };
    return Object.assign({}, d, { appName: prettyApp(d.app), key: trackKey(d) });
  } catch (e) {
    if (lastError !== e.message) log.warn('media', 'now playing: ' + e.message);
    lastError = e.message;
    return { supported: true, active: false, error: 'Lettura non riuscita' };
  }
}

// Cache di 1s: più tablet o widget non moltiplicano le chiamate.
function nowPlaying() {
  if (Date.now() - cache.at < 1000 && cache.data) return Promise.resolve(cache.data);
  if (cache.pending) return cache.pending;
  cache.pending = fetchNow().then(function (d) {
    cache = { at: Date.now(), data: d, pending: null };
    return d;
  });
  return cache.pending;
}

async function artwork() {
  const now = await nowPlaying();
  if (!now.active || !now.hasArt) return null;
  if (art.key === now.key && art.data) return art.data;
  if (art.pending) return art.pending;
  art.pending = platform.art().then(function (data) {
    art = { key: now.key, data: data, pending: null };
    return data;
  }).catch(function (e) {
    log.warn('media', 'copertina: ' + e.message);
    art.pending = null;
    return null;
  });
  return art.pending;
}

async function command(cmd) {
  if (common.MEDIA_COMMANDS.indexOf(cmd) < 0) {
    throw Object.assign(new Error('Comando media sconosciuto: ' + cmd), { code: 'BAD_REQUEST' });
  }
  await platform.media(cmd);
  cache.at = 0; // il prossimo stato riflette subito il cambio
  return { done: cmd };
}

module.exports = { nowPlaying: nowPlaying, artwork: artwork, command: command, prettyApp: prettyApp };
