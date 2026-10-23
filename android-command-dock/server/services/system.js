// Monitor di sistema. Campiona ogni 2s solo mentre un tablet è collegato
// (nessuna richiesta da 15s = campionamento in pausa, CPU ~0).
const os = require('os');
const platform = require('../platform');
const common = require('../platform/common');
const config = require('../config');
const log = require('../log');

const INTERVAL = 2000;
const IDLE_AFTER = 15000;

let timer = null;
let lastRequest = 0;
let prevCpu = null;
let prevNet = null;
let nvidia = { available: null, retryAt: 0 };
let state = null;
let busy = false;

function cpuTimes() {
  let idle = 0; let total = 0;
  os.cpus().forEach(function (c) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  });
  return { idle: idle, total: total };
}

function cpuUsage() {
  const now = cpuTimes();
  let usage = null;
  if (prevCpu) {
    const dt = now.total - prevCpu.total;
    const di = now.idle - prevCpu.idle;
    if (dt > 0) usage = Math.max(0, Math.min(100, Math.round((1 - di / dt) * 100)));
  }
  prevCpu = now;
  return usage;
}

async function nvidiaGpu() {
  if (nvidia.available === false && Date.now() < nvidia.retryAt) return null;
  const r = await common.run('nvidia-smi', [
    '--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total',
    '--format=csv,noheader,nounits'
  ], { timeout: 3000 });
  if (!r.ok) {
    if (nvidia.available !== false) log.info('system', 'nvidia-smi non disponibile' + (r.notFound ? '' : ': ' + (r.stderr || r.error)));
    nvidia = { available: false, retryAt: Date.now() + 5 * 60000 };
    return null;
  }
  nvidia.available = true;
  const p = r.stdout.split('\n')[0].split(',').map(function (x) { return x.trim(); });
  const num = function (v) { const n = parseFloat(v); return isNaN(n) ? null : n; };
  return { name: p[0] || 'GPU', usage: num(p[1]), temp: num(p[2]) === null ? null : Math.round(num(p[2])), memUsedMb: num(p[3]), memTotalMb: num(p[4]) };
}

// Temperatura CPU da LibreHardwareMonitor (Windows, opzionale) se configurato.
async function lhmCpuTemp(url) {
  try {
    const r = await common.fetchJson(url, { timeout: 1500 });
    if (!r.ok || !r.data) return null;
    let found = null;
    (function walk(node) {
      if (found !== null || !node) return;
      if (/CPU Package|Tctl|Tdie|Core Average|CPU \(Tctl/i.test(node.Text || '') && /°C/.test(node.Value || '')) {
        const v = parseFloat(String(node.Value).replace(',', '.'));
        if (!isNaN(v)) { found = Math.round(v); return; }
      }
      (node.Children || []).forEach(walk);
    })(r.data);
    return found;
  } catch (e) { return null; }
}

async function sample() {
  if (busy) return;
  busy = true;
  try {
    const svc = (config.get('services').system) || {};
    const total = os.totalmem();
    const free = os.freemem();
    const [gpuN, net, temp] = await Promise.all([
      svc.gpu === false ? null : nvidiaGpu(),
      platform.netBytes(),
      svc.libreHardwareMonitorUrl ? lhmCpuTemp(svc.libreHardwareMonitorUrl) : platform.cpuTemp()
    ]);
    let gpu = gpuN;
    if (!gpu && svc.gpu !== false) gpu = await platform.gpuFallback();

    let down = null; let up = null;
    const now = Date.now();
    if (net && prevNet && now > prevNet.at) {
      const sec = (now - prevNet.at) / 1000;
      down = Math.max(0, ((net.rx - prevNet.rx) * 8) / sec / 1e6);
      up = Math.max(0, ((net.tx - prevNet.tx) * 8) / sec / 1e6);
    }
    if (net) prevNet = { rx: net.rx, tx: net.tx, at: now };

    state = {
      hostname: os.hostname(),
      cpu: { usage: cpuUsage(), temp: temp, cores: os.cpus().length, model: (os.cpus()[0] || {}).model || '' },
      ram: {
        usedGb: Math.round(((total - free) / 1073741824) * 10) / 10,
        totalGb: Math.round((total / 1073741824) * 10) / 10,
        usage: Math.round(((total - free) / total) * 100)
      },
      gpu: gpu ? {
        name: gpu.name,
        usage: gpu.usage,
        temp: gpu.temp,
        memUsedGb: gpu.memUsedMb === null ? null : Math.round((gpu.memUsedMb / 1024) * 10) / 10,
        memTotalGb: gpu.memTotalMb === null ? null : Math.round((gpu.memTotalMb / 1024) * 10) / 10
      } : null,
      net: down === null ? null : { downMbps: Math.round(down * 10) / 10, upMbps: Math.round(up * 10) / 10 },
      uptimeSeconds: Math.round(os.uptime()),
      at: now
    };
  } catch (e) {
    log.warn('system', 'campionamento fallito: ' + e.message);
  } finally {
    busy = false;
  }
}

function ensureRunning() {
  lastRequest = Date.now();
  if (timer) return;
  log.debug('system', 'campionamento avviato');
  timer = setInterval(function () {
    if (Date.now() - lastRequest > IDLE_AFTER) {
      clearInterval(timer);
      timer = null;
      prevNet = null;
      log.debug('system', 'campionamento in pausa');
      return;
    }
    sample();
  }, INTERVAL);
  sample();
}

function get() {
  ensureRunning();
  return state;
}

function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { get: get, sample: sample, stop: stop };
