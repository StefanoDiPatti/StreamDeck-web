// Backend Linux: usa strumenti standard del desktop.
//  media / now playing : playerctl (MPRIS: Spotify, browser, VLC, Rhythmbox...)
//  volume              : wpctl (PipeWire) > pactl (PulseAudio) > amixer (ALSA)
//  tasti / testo       : xdotool (X11) oppure wtype (Wayland wlroots/KDE)
//  focus finestra      : xdotool (solo X11)
//  aprire URL/file     : xdg-open
// Installazione consigliata (Debian/Ubuntu):
//   sudo apt install playerctl xdotool wtype pulseaudio-utils
const fs = require('fs');
const os = require('os');
const path = require('path');
const keys = require('./keys');
const common = require('./common');

const SEP = '\u001f';

function has(cmd) { return !!common.which(cmd); }
function isWayland() { return (process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland' || !!process.env.WAYLAND_DISPLAY; }

function inputTool() {
  if (isWayland() && has('wtype')) return 'wtype';
  if (has('xdotool') && process.env.DISPLAY) return 'xdotool';
  if (has('wtype')) return 'wtype';
  return null;
}

async function mustRun(cmd, args, what) {
  const r = await common.run(cmd, args, { timeout: 8000 });
  if (!r.ok) throw new Error(what + ' non riuscito: ' + (r.stderr.trim() || r.error));
  return r;
}

async function volume(command) {
  if (has('wpctl')) {
    const target = '@DEFAULT_AUDIO_SINK@';
    if (command === 'mute') return mustRun('wpctl', ['set-mute', target, 'toggle'], 'Mute');
    return mustRun('wpctl', ['set-volume', '-l', '1.0', target, command === 'volume_up' ? '5%+' : '5%-'], 'Volume');
  }
  if (has('pactl')) {
    const sink = '@DEFAULT_SINK@';
    if (command === 'mute') return mustRun('pactl', ['set-sink-mute', sink, 'toggle'], 'Mute');
    return mustRun('pactl', ['set-sink-volume', sink, command === 'volume_up' ? '+5%' : '-5%'], 'Volume');
  }
  if (has('amixer')) {
    if (command === 'mute') return mustRun('amixer', ['-q', 'set', 'Master', 'toggle'], 'Mute');
    return mustRun('amixer', ['-q', 'set', 'Master', command === 'volume_up' ? '5%+' : '5%-'], 'Volume');
  }
  throw new Error('Nessuno strumento per il volume (installa pipewire/wpctl o pulseaudio-utils)');
}

async function sendKeysImpl(combo) {
  const tool = inputTool();
  if (tool === 'xdotool') {
    return mustRun('xdotool', ['key', '--clearmodifiers', keys.toX11(combo).join('+')], 'Scorciatoia');
  }
  if (tool === 'wtype') {
    const args = [];
    const mods = [];
    combo.forEach(function (k) {
      const sym = keys.KEYS[k].x11;
      if (keys.isModifier(k)) { const m = sym === 'super' ? 'logo' : sym; mods.push(m); args.push('-M', m); }
      else args.push('-k', sym);
    });
    mods.reverse().forEach(function (m) { args.push('-m', m); });
    return mustRun('wtype', args, 'Scorciatoia');
  }
  throw new Error('Per i tasti installa xdotool (X11) o wtype (Wayland)');
}

const artCache = { url: null, data: null };

module.exports = {
  name: 'linux',

  init: function () { return Promise.resolve(); },

  capabilities: function () {
    const notes = [];
    if (!has('playerctl')) notes.push('playerctl mancante: niente Now Playing');
    if (!inputTool()) notes.push('xdotool/wtype mancanti: niente scorciatoie');
    if (isWayland() && !has('wtype')) notes.push('Wayland: installa wtype per le scorciatoie');
    return {
      media: has('playerctl') || has('xdotool'),
      keys: !!inputTool(),
      text: !!inputTool(),
      focus: has('xdotool') && !!process.env.DISPLAY,
      nowPlaying: has('playerctl'),
      art: has('playerctl'),
      notes: notes
    };
  },

  media: async function (command) {
    if (command === 'volume_up' || command === 'volume_down' || command === 'mute') return volume(command);
    const map = { play_pause: 'play-pause', next: 'next', previous: 'previous', stop: 'stop' };
    if (!map[command]) throw new Error('Comando media sconosciuto: ' + command);
    if (has('playerctl')) return mustRun('playerctl', [map[command]], 'Comando media');
    const sym = { play_pause: 'XF86AudioPlay', next: 'XF86AudioNext', previous: 'XF86AudioPrev', stop: 'XF86AudioStop' };
    if (has('xdotool')) return mustRun('xdotool', ['key', sym[command]], 'Comando media');
    throw new Error('Installa playerctl per i controlli multimediali');
  },

  sendKeys: sendKeysImpl,

  typeText: async function (text) {
    const tool = inputTool();
    if (tool === 'xdotool') return mustRun('xdotool', ['type', '--delay', '8', '--', String(text)], 'Testo');
    if (tool === 'wtype') return mustRun('wtype', ['--', String(text)], 'Testo');
    throw new Error('Per digitare testo installa xdotool (X11) o wtype (Wayland)');
  },

  focus: async function (name) {
    if (!has('xdotool') || !process.env.DISPLAY) throw new Error('Focus finestra disponibile solo su X11 con xdotool');
    const r = await common.run('xdotool', ['search', '--onlyvisible', '--class', String(name), 'windowactivate', '--sync'], { timeout: 4000 });
    if (!r.ok) throw new Error('Finestra "' + name + '" non trovata');
    return r;
  },

  open: function (target) {
    if (!has('xdg-open')) return Promise.reject(new Error('xdg-open non trovato'));
    return common.spawnDetached('xdg-open', [String(target)]);
  },

  launch: function (app) {
    const file = common.resolveWildcard(common.expandPath(app.path));
    const args = (app.args || []).map(common.expandPath);
    const cwd = app.cwd ? common.expandPath(app.cwd) : os.homedir();
    if (/\.desktop$/.test(file)) {
      // File .desktop: lo lancia gtk-launch se presente
      if (has('gtk-launch')) return common.spawnDetached('gtk-launch', [path.basename(file, '.desktop')], cwd);
    }
    if (common.looksLikePath(file) && !fs.existsSync(file)) return Promise.reject(new Error('non trovato in ' + file));
    if (!common.looksLikePath(file) && !has(file)) return Promise.reject(new Error('"' + file + '" non è nel PATH'));
    return common.spawnDetached(file, args, cwd);
  },

  nowPlaying: async function () {
    if (!has('playerctl')) return { supported: false };
    const fmt = ['{{status}}', '{{title}}', '{{artist}}', '{{album}}', '{{mpris:artUrl}}', '{{playerName}}', '{{position}}', '{{mpris:length}}'].join(SEP);
    const r = await common.run('playerctl', ['metadata', '--format', fmt], { timeout: 3000 });
    if (!r.ok || !r.stdout.trim()) { artCache.url = null; return { supported: true, active: false }; }
    const f = r.stdout.replace(/\r?\n$/, '').split(SEP);
    const status = (f[0] || '').toLowerCase();
    artCache.nextUrl = f[4] || null;
    return {
      supported: true,
      active: true,
      title: f[1] || '',
      artist: f[2] || '',
      album: f[3] || '',
      app: f[5] || '',
      status: status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'stopped',
      position: (parseInt(f[6], 10) || 0) / 1e6,
      duration: (parseInt(f[7], 10) || 0) / 1e6,
      updatedAt: Date.now(),
      hasArt: !!f[4]
    };
  },

  art: async function () {
    const url = artCache.nextUrl;
    if (!url) return null;
    if (artCache.url === url && artCache.data) return artCache.data;
    let data = null;
    if (url.indexOf('file://') === 0) {
      const file = decodeURIComponent(url.slice(7));
      if (!fs.existsSync(file)) return null;
      const ext = path.extname(file).toLowerCase();
      data = { mime: ext === '.png' ? 'image/png' : 'image/jpeg', data: fs.readFileSync(file) };
    } else if (/^https?:\/\//.test(url)) {
      const ctrl = new AbortController();
      const t = setTimeout(function () { ctrl.abort(); }, 5000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) return null;
        data = { mime: res.headers.get('content-type') || 'image/jpeg', data: Buffer.from(await res.arrayBuffer()) };
      } catch (e) { return null; } finally { clearTimeout(t); }
    }
    artCache.url = url;
    artCache.data = data;
    return data;
  },

  netBytes: async function () {
    try {
      const text = fs.readFileSync('/proc/net/dev', 'utf8');
      let rx = 0; let tx = 0;
      text.split('\n').slice(2).forEach(function (line) {
        const m = /^\s*([^:]+):\s*(.*)$/.exec(line);
        if (!m) return;
        const name = m[1].trim();
        if (/^(lo|docker|veth|br-|virbr|vmnet|tun|tap)/.test(name)) return;
        const cols = m[2].trim().split(/\s+/);
        rx += parseInt(cols[0], 10) || 0;
        tx += parseInt(cols[8], 10) || 0;
      });
      return { rx: rx, tx: tx };
    } catch (e) { return null; }
  },

  // Temperatura CPU da /sys/class/hwmon (coretemp, k10temp, zenpower...).
  cpuTemp: async function () {
    const base = '/sys/class/hwmon';
    try {
      const dirs = fs.readdirSync(base);
      for (let i = 0; i < dirs.length; i++) {
        const dir = path.join(base, dirs[i]);
        let name = '';
        try { name = fs.readFileSync(path.join(dir, 'name'), 'utf8').trim(); } catch (e) { continue; }
        if (!/^(coretemp|k10temp|zenpower|cpu_thermal|acpitz)$/.test(name)) continue;
        const v = parseInt(fs.readFileSync(path.join(dir, 'temp1_input'), 'utf8'), 10);
        if (!isNaN(v)) return Math.round(v / 1000);
      }
    } catch (e) { /* niente hwmon */ }
    return null;
  },

  // GPU AMD/Intel tramite sysfs, usata se nvidia-smi manca.
  gpuFallback: async function () {
    try {
      const cards = fs.readdirSync('/sys/class/drm').filter(function (n) { return /^card\d+$/.test(n); });
      for (let i = 0; i < cards.length; i++) {
        const dev = path.join('/sys/class/drm', cards[i], 'device');
        const busyFile = path.join(dev, 'gpu_busy_percent');
        if (!fs.existsSync(busyFile)) continue;
        const out = { name: 'GPU', usage: parseInt(fs.readFileSync(busyFile, 'utf8'), 10), temp: null, memUsedMb: null, memTotalMb: null };
        try {
          out.memUsedMb = Math.round(parseInt(fs.readFileSync(path.join(dev, 'mem_info_vram_used'), 'utf8'), 10) / 1048576);
          out.memTotalMb = Math.round(parseInt(fs.readFileSync(path.join(dev, 'mem_info_vram_total'), 'utf8'), 10) / 1048576);
        } catch (e) { /* opzionale */ }
        try {
          const hw = path.join(dev, 'hwmon');
          const h = fs.readdirSync(hw)[0];
          out.temp = Math.round(parseInt(fs.readFileSync(path.join(hw, h, 'temp1_input'), 'utf8'), 10) / 1000);
        } catch (e) { /* opzionale */ }
        return out;
      }
    } catch (e) { /* niente drm */ }
    return null;
  },

  shutdown: function () {}
};
