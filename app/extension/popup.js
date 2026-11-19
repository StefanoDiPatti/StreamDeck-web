const DEFAULT_SERVER = 'http://127.0.0.1:8787';
const input = document.getElementById('server');
const status = document.getElementById('status');
const detail = document.getElementById('detail');

function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? s + ' s fa' : Math.round(s / 60) + ' min fa';
}

async function check() {
  const o = await chrome.storage.local.get(['server', 'lastOk', 'lastError']);
  const url = String(o.server || DEFAULT_SERVER).replace(/\/+$/, '');
  input.value = url;
  try {
    const res = await fetch(url + '/api/health');
    const json = await res.json();
    status.textContent = json.ok ? 'Dock raggiungibile ✓' : 'Risposta inattesa';
    status.className = json.ok ? 'ok' : 'err';
  } catch (e) {
    status.textContent = 'Dock non raggiungibile: è accesa?';
    status.className = 'err';
  }
  const lines = [];
  if (o.lastOk) {
    lines.push('Ultimo invio alla dock: ' + ago(o.lastOk.at));
    lines.push(o.lastOk.title ? 'Sta leggendo: ' + o.lastOk.title : 'Nessun brano in riproduzione');
  } else {
    lines.push('Nessuna scheda di Apple Music o YouTube ha ancora parlato con la dock.');
  }
  if (o.lastError && (!o.lastOk || o.lastError.at > o.lastOk.at)) lines.push('Ultimo errore: ' + o.lastError.message);
  detail.textContent = lines.join('\n');
}

document.getElementById('save').addEventListener('click', async function () {
  const v = input.value.trim();
  await chrome.storage.local.set({ server: v || DEFAULT_SERVER });
  check();
});

check();
