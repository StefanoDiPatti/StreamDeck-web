// Pannello di controllo di Command Dock (solo su questo PC).
// Pagine del tablet: ordine, visibilità e pagina iniziale -> config/layout.json.
// Discord: credenziali dell'applicazione personale e autorizzazione.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const icon = (name) => (window.Icons && Icons.html(name)) || '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let info = null;          // ultimo stato dal server
  let tabs = [];            // pagine nella barra, in ordine
  let home = '';
  let saved = '';           // per capire se ci sono modifiche
  let drag = null;          // { id }

  async function api(method, url, body) {
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'X-Dock-Control': '1' },
      body: body ? JSON.stringify(body) : undefined
    });
    let d = null;
    try { d = await res.json(); } catch (e) { d = null; }
    if (!d || !d.ok) throw new Error((d && d.error && d.error.message) || 'Errore ' + res.status);
    return d.data;
  }

  let toastTimer = null;
  function toast(msg, kind) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, kind === 'err' ? 5000 : 2600);
  }

  const snapshot = () => JSON.stringify({ tabs: tabs, home: home });
  const dirty = () => snapshot() !== saved;
  const page = (id) => info.pages.find((p) => p.id === id);

  // ------------------------------------------------------------ pagine

  function render() {
    renderPreview();
    renderList($('on'), tabs.map(page).filter(Boolean), true);
    renderList($('off'), info.pages.filter((p) => tabs.indexOf(p.id) < 0), false);
    $('count').textContent = tabs.length;
    $('savebar').classList.toggle('show', dirty());
  }

  function renderPreview() {
    const bar = $('preview');
    bar.innerHTML = tabs.map((id) => {
      const p = page(id);
      return p ? '<div class="pt' + (id === home ? ' home' : '') + '" title="' + esc(p.title) + '">' + icon(p.icon) + esc(p.title) + '</div>' : '';
    }).join('');
    let warn = bar.parentNode.querySelector('.preview-warn');
    if (!warn) { warn = document.createElement('div'); warn.className = 'preview-warn'; bar.parentNode.appendChild(warn); }
    warn.textContent = tabs.length > 8 ? 'Con più di 8 pagine i nomi sul tablet diventano stretti.' : '';
  }

  function renderList(list, pages, on) {
    list.innerHTML = '';
    if (!pages.length) {
      list.innerHTML = '<li class="empty">' + (on ? 'Trascina qui le pagine da mostrare' : 'Tutte le pagine sono nella barra') + '</li>';
      return;
    }
    pages.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'item';
      li.dataset.id = p.id;
      const tags = (on && p.id === home ? '<span class="tag">INIZIALE</span>' : '') +
        (!on && p.id === 'discord' ? '<span class="tag new">NUOVA</span>' : '');
      li.innerHTML =
        '<span class="grip" aria-hidden="true">' + icon('drag') + '</span>' +
        '<span class="ico">' + icon(p.icon) + '</span>' +
        '<span class="txt"><span class="name">' + esc(p.title) + tags + '</span>' +
        '<span class="desc" title="' + esc(p.description) + '">' + esc(p.description || '—') + '</span></span>' +
        (on
          ? '<span class="updown">' +
              '<button class="ibtn" data-act="up" title="Su" aria-label="Sposta su"' + (i === 0 ? ' disabled' : '') + '>' + icon('up') + '</button>' +
              '<button class="ibtn" data-act="down" title="Giù" aria-label="Sposta giù"' + (i === pages.length - 1 ? ' disabled' : '') + '>' + icon('down') + '</button>' +
            '</span>' +
            '<button class="ibtn star' + (p.id === home ? ' on' : '') + '" data-act="home" title="Pagina iniziale" aria-label="Pagina iniziale">' + icon('star') + '</button>' +
            '<button class="ibtn rm" data-act="remove" title="Togli dalla barra" aria-label="Togli dalla barra">' + icon('close') + '</button>'
          : '<button class="ibtn add" data-act="add" title="Aggiungi alla barra" aria-label="Aggiungi alla barra">' + icon('add') + '</button>');
      list.appendChild(li);
    });
  }

  function move(id, toList, index) {
    const from = tabs.indexOf(id);
    if (toList === 'off') {
      if (from < 0) return;
      if (tabs.length === 1) { toast('Serve almeno una pagina nella barra', 'err'); return; }
      tabs.splice(from, 1);
      if (home === id) home = tabs[0];
    } else {
      if (from >= 0) { tabs.splice(from, 1); if (from < index) index--; }
      if (tabs.length >= 10 && from < 0) { toast('Al massimo 10 pagine nella barra', 'err'); return; }
      tabs.splice(Math.max(0, Math.min(index, tabs.length)), 0, id);
    }
    render();
  }

  // Clic sui pulsanti delle righe
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.ibtn[data-act]');
    if (!b || b.disabled) return;
    const id = b.closest('.item').dataset.id;
    const i = tabs.indexOf(id);
    switch (b.dataset.act) {
      case 'up': move(id, 'on', i - 1); break;
      case 'down': move(id, 'on', i + 2); break;
      case 'home': home = id; render(); break;
      case 'remove': move(id, 'off'); break;
      case 'add': move(id, 'on', tabs.length); break;
    }
  });

  // ---- trascinamento (eventi del puntatore: mouse, penna e tocco)
  // La riga segue il puntatore; un segnaposto mostra dove cadrà.
  function clearDrop() {
    document.querySelectorAll('.list.drop').forEach((l) => l.classList.remove('drop'));
    const g = document.querySelector('.ghost-gap');
    if (g) g.remove();
  }
  function listAt(x, y) {
    for (const name of ['on', 'off']) {
      const r = $(name).getBoundingClientRect();
      if (x >= r.left - 24 && x <= r.right + 24 && y >= r.top - 24 && y <= r.bottom + 24) return name;
    }
    return null;
  }
  function slotAt(list, y) {
    const items = Array.from(list.querySelectorAll('.item:not(.dragging):not(.ghost-gap)'));
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return { index: i, ref: items[i] };
    }
    return { index: items.length, ref: null };
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const li = e.target.closest('.item');
    if (!li || e.target.closest('button')) return;
    drag = { id: li.dataset.id, li: li, x0: e.clientX, y0: e.clientY, started: false, target: null, index: 0, pid: e.pointerId };
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.started) {
      if (Math.abs(dx) + Math.abs(dy) < 6) return;
      drag.started = true;
      const r = drag.li.getBoundingClientRect();
      const float = drag.li.cloneNode(true);
      float.className = 'item floating';
      float.style.width = r.width + 'px';
      float.style.left = r.left + 'px';
      float.style.top = r.top + 'px';
      document.body.appendChild(float);
      drag.float = float;
      drag.ox = r.left; drag.oy = r.top;
      drag.li.classList.add('dragging');
      document.body.classList.add('is-dragging');
    }
    e.preventDefault();
    drag.float.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    const target = listAt(e.clientX, e.clientY);
    document.querySelectorAll('.list').forEach((l) => l.classList.toggle('drop', l.id === target));
    let g = document.querySelector('.ghost-gap');
    if (target === 'on') {
      const list = $('on');
      const slot = slotAt(list, e.clientY);
      if (!g) { g = document.createElement('li'); g.className = 'item ghost-gap'; }
      if (g.parentNode !== list || g.nextSibling !== slot.ref) list.insertBefore(g, slot.ref);
      const empty = list.querySelector('.empty');
      if (empty) empty.style.display = 'none';
      drag.index = slot.index;
    } else if (g) g.remove();
    drag.target = target;
  });

  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.pid)) return;
    const d = drag;
    drag = null;
    if (!d.started) return;
    if (d.float) d.float.remove();
    d.li.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    clearDrop();
    if (e && e.type === 'pointercancel') { render(); return; }
    if (d.target === 'on') {
      // posizione tra le pagine in barra, senza quella trascinata
      if (tabs.indexOf(d.id) < 0 && tabs.length >= 10) { toast('Al massimo 10 pagine nella barra', 'err'); render(); return; }
      tabs = tabs.filter((t) => t !== d.id);
      tabs.splice(Math.max(0, Math.min(d.index, tabs.length)), 0, d.id);
      render();
    } else if (d.target === 'off') move(d.id, 'off');
    else render();
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag && drag.started) endDrag({ type: 'pointercancel', pointerId: drag.pid }); });

  // ---- salvataggio
  $('save').addEventListener('click', async () => {
    const b = $('save');
    b.disabled = true;
    try {
      info = await api('POST', '/api/control/layout', { tabs: tabs, home: home });
      adopt(true);
      toast('Salvato: il tablet si aggiorna da solo', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    b.disabled = false;
  });
  $('undo').addEventListener('click', () => { adopt(true); });
  $('reset').addEventListener('click', async () => {
    if (!confirm('Tornare alle pagine predefinite di dock.json?')) return;
    try {
      info = await api('POST', '/api/control/layout/reset');
      adopt(true);
      toast('Ripristinate le pagine predefinite', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  });
  window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

  // Prende lo stato del server (senza perdere modifiche non salvate, salvo force)
  let loaded = false;
  function adopt(force) {
    if (force || !loaded || !dirty()) {
      loaded = true;
      tabs = info.tabs.slice();
      home = info.home;
      saved = snapshot();
    }
    const urls = info.tablet || [];
    $('tablet').innerHTML = urls.length ? 'Tablet: <b>' + esc(urls[0]) + '</b>' : '';
    $('sub').textContent = 'Pannello di controllo · v' + info.version;
    render();
    renderDiscord();
  }

  // ------------------------------------------------------------ Discord

  let dcKey = '';
  let editing = false;
  function renderDiscord() {
    const d = info.discord;
    const pill = $('dc-status');
    const body = $('dc-body');
    const map = {
      ready: ['COLLEGATO', 'ok'], setup: ['DA CONFIGURARE', ''], unauthorized: ['DA AUTORIZZARE', 'warn'],
      offline: ['DISCORD CHIUSO', 'bad'], connecting: ['IN ATTESA…', 'warn']
    };
    const st = map[d.status] || [d.status, ''];
    pill.textContent = st[0];
    pill.className = 'pill ' + st[1];
    // ridisegna solo se qualcosa cambia: non cancellare quello che stai incollando
    const key = [d.status, d.configured, d.message, d.authError, d.media, d.user && d.user.id, editing].join('|');
    if (key === dcKey) return;
    dcKey = key;
    if (editing) { renderSetup(true); return; }

    if (d.status === 'ready') {
      body.innerHTML =
        '<div class="me">' + (d.user && d.user.avatar ? '<img alt="" src="' + esc(d.user.avatar) + '">' : '') +
        '<div><div class="who">' + esc(d.user ? d.user.name : '') + '</div><div class="hint">Il tablet può vedere i tuoi server e gestire la voce' + (d.media ? ', la webcam e il Go Live.' : '.') + '</div></div></div>' +
        (d.media ? '' : '<div class="err-box warn-box">Per i pulsanti <b>CAM</b> e <b>LIVE</b> serve un permesso in più: premi <b>Riautorizza</b> e conferma su Discord.</div>') +
        '<div class="row-actions">' +
          (d.media ? '' : '<button class="btn discord" id="dc-reauth" type="button">Riautorizza</button>') +
          '<button class="btn ghost" id="dc-logout" type="button">Scollega</button></div>';
      if ($('dc-reauth')) $('dc-reauth').onclick = () => run('/api/control/discord/authorize');
      $('dc-logout').onclick = async () => {
        if (!confirm('Scollegare Discord dalla dock?')) return;
        info = await api('POST', '/api/control/discord/logout'); adopt();
      };
      return;
    }
    if (d.configured && (d.status === 'unauthorized' || d.status === 'offline' || d.status === 'connecting')) {
      const msg = d.status === 'offline'
        ? 'Apri Discord su questo PC: la dock si collega da sola.'
        : d.status === 'connecting'
          ? 'Guarda la finestra di Discord: c\'è una richiesta da <b>autorizzare</b>.'
          : 'Manca l\'autorizzazione: premi il pulsante e conferma nella finestra di Discord.';
      body.innerHTML = '<p class="hint">' + msg + '</p>' +
        (d.authError || (d.status === 'offline' && d.message) ? '<div class="err-box">' + esc(d.authError || d.message) + '</div>' : '') +
        '<div class="row-actions">' +
          (d.status !== 'connecting' ? '<button class="btn discord" id="dc-auth" type="button">Autorizza su Discord</button>' : '') +
          '<button class="btn ghost" id="dc-edit" type="button">Cambia credenziali</button>' +
        '</div>';
      if ($('dc-auth')) $('dc-auth').onclick = () => run('/api/control/discord/authorize');
      $('dc-edit').onclick = () => { editing = true; renderDiscord(); };
      return;
    }
    renderSetup(false);
  }

  function renderSetup(editing) {
    const d = info.discord;
    $('dc-body').innerHTML =
      '<ol class="steps">' +
        '<li>Apri il <a href="https://discord.com/developers/applications" target="_blank" rel="noopener">Developer Portal di Discord</a> e premi <b>New Application</b> (nome a piacere, es. "Command Dock").</li>' +
        '<li>Vai in <b>OAuth2</b>: copia il <b>Client ID</b> e premi <b>Reset Secret</b> per avere il <b>Client Secret</b>.</li>' +
        '<li>Sempre in OAuth2, sotto <b>Redirects</b> premi <b>Add Redirect</b>, scrivi <code>' + esc(d.redirect) + '</code> (esatto, senza barra finale) e premi <b>Save Changes</b> in basso. Senza questo Discord risponde "missing redirect_uri".</li>' +
        '<li>Incolla qui sotto e premi <b>Collega</b>: Discord ti chiede di autorizzare la dock.</li>' +
      '</ol>' +
      '<div class="form">' +
        '<div><label for="dc-id">Client ID</label><input id="dc-id" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" value="' + esc(d.clientId) + '"></div>' +
        '<div><label for="dc-secret">Client Secret</label><input id="dc-secret" type="password" autocomplete="off" spellcheck="false" placeholder="' + (d.hasSecret && !editing ? 'già salvato' : '') + (d.hasSecret && editing ? 'lascia vuoto per tenere quello salvato' : '') + '"></div>' +
        '<button class="btn discord" id="dc-go" type="button">Collega</button>' +
      '</div>' +
      '<p class="hint small">Le credenziali restano su questo PC, in <code>data/discord.json</code>.</p>' +
      ((d.authError || d.message) && d.status !== 'setup' ? '<div class="err-box">' + esc(d.authError || d.message) + '</div>' : '');
    $('dc-go').onclick = () => run('/api/control/discord', { clientId: $('dc-id').value, clientSecret: $('dc-secret').value });
  }

  async function run(url, body) {
    const btns = document.querySelectorAll('#dc-body .btn');
    btns.forEach((b) => { b.disabled = true; });
    info.discord.status = 'connecting';
    $('dc-status').textContent = 'IN ATTESA…';
    $('dc-status').className = 'pill warn';
    toast('Conferma la richiesta nella finestra di Discord', '');
    try {
      info = await api('POST', url, body);
      editing = false;
      dcKey = '';
      adopt();
      toast('Discord collegato', 'ok');
    } catch (e) {
      toast(e.message, 'err');
      btns.forEach((b) => { b.disabled = false; });
      dcKey = '';
      refresh();
    }
  }

  // ------------------------------------------------------------ avvio e aggiornamenti

  async function refresh() {
    try {
      info = await api('GET', '/api/control/info');
      adopt(false);
    } catch (e) {
      $('sub').textContent = 'Server non raggiungibile: la dock è avviata?';
    }
  }
  refresh();
  setInterval(() => { if (!document.hidden && !drag) refresh(); }, 5000);
})();
