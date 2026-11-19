// Pannello di controllo di Vibe Deck (solo su questo PC).
// Pagine del tablet: ordine, visibilità e pagina iniziale -> config/layout.json.
// Pulsanti delle pagine: quali mostrare e in che ordine -> config/layout.json (tiles).
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
  let buttons = {};         // pagina -> { show: [id in ordine], hide: [id] }
  let touched = {};         // pagine dei pulsanti modificate (solo queste vanno salvate)
  let btPage = 'apps';      // pagina dei pulsanti mostrata
  let tdrag = null;         // trascinamento di un pulsante
  let pairSel = 0;          // rete scelta per il QR
  let mlKey = '';           // per ridisegnare la sezione email solo se cambia
  let pairShown = '';       // link del QR mostrato

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

  const snapshot = () => JSON.stringify({ tabs: tabs, home: home, buttons: buttons });
  const dirty = () => snapshot() !== saved;
  const page = (id) => info.pages.find((p) => p.id === id);

  // ------------------------------------------------------------ pagine

  function render() {
    renderPreview();
    renderList($('on'), tabs.map(page).filter(Boolean), true);
    renderList($('off'), info.pages.filter((p) => tabs.indexOf(p.id) < 0), false);
    $('count').textContent = tabs.length;
    renderButtons();
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

  // ------------------------------------------------------------ pulsanti delle pagine

  const bpage = (id) => (info.buttons || []).find((b) => b.id === id);

  // Stessa regola del server (config.js -> autoGrid): niente buchi inutili,
  // celle di forma comoda sul tablet orizzontale.
  function autoGrid(tiles) {
    let cells = 0, minCols = 1, minRows = 1;
    tiles.forEach((t) => { cells += (t.w || 1) * (t.h || 1); minCols = Math.max(minCols, t.w || 1); minRows = Math.max(minRows, t.h || 1); });
    cells = Math.max(1, cells);
    let best = null;
    for (let r = minRows; r <= 6; r++) {
      const c = Math.max(minCols, Math.ceil(cells / r));
      if (c > 8) continue;
      const score = (c * r - cells) + 3 * Math.abs(Math.log((c / r) / 1.7));
      if (!best || score < best.score - 1e-9) best = { columns: c, rows: r, score: score };
    }
    return best || { columns: 8, rows: 6 };
  }

  // Stessa regola del tablet (app.js -> layout, "buttonGrid"): pulsanti nella parte sinistra,
  // celle di forma comoda e pochi buchi. Tablet: area tile circa 1280 x 698.
  function sideGrid(n, widgetWidth) {
    const W = 1280 * (1 - widgetWidth), H = 698, gap = 8;
    let best = null;
    for (let c = 1; c <= Math.max(1, n); c++) {
      const r = Math.ceil(Math.max(1, n) / c);
      const cw = (W - gap * (c + 1)) / c, ch = (H - gap * (r + 1)) / r;
      const score = Math.abs(Math.log((cw / ch) / 1.25)) + 0.35 * (c * r - n);
      if (!best || score < best.score) best = { columns: c, rows: r, score: score };
    }
    return { columns: best.columns, rows: best.rows };
  }

  function tileHtml(t, on) {
    return '<div class="btile" data-id="' + esc(t.id) + '" style="--c:' + esc(t.color || '#1d2835') + (on && t.w > 1 ? ';grid-column:span ' + t.w : '') + (on && t.h > 1 ? ';grid-row:span ' + t.h : '') + '" title="' + esc(t.label + (t.sub ? ' · ' + t.sub : '')) + '">' +
      (t.icon ? '<span class="bi">' + icon(t.icon) + '</span>' : '') +
      '<span class="bl">' + esc(t.label || t.id) + '</span>' +
      (t.sub ? '<span class="bs">' + esc(t.sub) + '</span>' : '') +
      '<button class="tbtn" type="button" data-tact="' + (on ? 'hide' : 'show') + '" aria-label="' + (on ? 'Nascondi ' : 'Mostra ') + esc(t.label) + '" title="' + (on ? 'Nascondi' : 'Mostra sul tablet') + '">' + icon(on ? 'close' : 'add') + '</button>' +
      '</div>';
  }

  function renderButtons() {
    const list = info.buttons || [];
    $('buttons-card').hidden = !list.length;
    const os = info.platform === 'win32' || info.platform === 'windows' ? 'Windows' : info.platform === 'linux' ? 'Linux' : info.platform;
    $('os-pill').textContent = os ? 'PULSANTI PER ' + String(os).toUpperCase() : '';
    if (!list.length) return;
    if (!bpage(btPage)) btPage = list[0].id;
    $('bt-pages').innerHTML = list.map((b) => '<button class="chip' + (b.id === btPage ? ' on' : '') + '" type="button" role="tab" aria-selected="' + (b.id === btPage) + '" data-bpage="' + esc(b.id) + '">' + icon(b.icon) + esc(b.title) + (touched[b.id] ? ' •' : '') + '</button>').join('');
    const b = bpage(btPage);
    const st = buttons[btPage];
    const byId = {};
    b.all.forEach((t) => { byId[t.id] = t; });
    const shown = st.show.map((id) => byId[id]).filter(Boolean);
    // pagina VIBER ("buttonGrid"): pulsanti a sinistra, riquadro a destra
    const fixed = b.fixed || [];
    const g = b.grid ? sideGrid(shown.length, b.widgetWidth || 0.5) : autoGrid(shown);
    const grid = $('bt-on');
    grid.style.gridTemplateColumns = 'repeat(' + g.columns + ', minmax(0, 1fr))' + (b.grid ? ' minmax(0, ' + (g.columns * (b.widgetWidth || 0.5) / (1 - (b.widgetWidth || 0.5))).toFixed(2) + 'fr)' : '');
    grid.style.gridTemplateRows = 'repeat(' + g.rows + ', minmax(0, 1fr))';
    let cells = 0;
    shown.forEach((t) => { cells += (t.w || 1) * (t.h || 1); });
    // riquadro fisso (non si sposta), poi i pulsanti
    let html = b.grid ? fixed.map((f) => '<div class="bfixed" style="grid-column:' + (g.columns + 1) + ';grid-row:1 / span ' + g.rows + '">' + esc(f.label) + '<small>fisso · sul tablet i pannelli che non sono aperti in Viber escono dalla griglia da soli</small></div>').join('') : '';
    html += shown.map((t) => tileHtml(t, true)).join('');
    for (let i = cells; i < g.columns * g.rows; i++) html += '<div class="bcell" aria-hidden="true"></div>';
    grid.innerHTML = html;
    $('bt-size').textContent = shown.length + (shown.length === 1 ? ' pulsante' : ' pulsanti') + ' · griglia ' + g.columns + ' × ' + g.rows;
    const hidden = st.hide.map((id) => byId[id]).filter(Boolean);
    $('bt-off').innerHTML = hidden.length
      ? hidden.map((t) => tileHtml(t, false)).join('')
      : '<div class="empty">Nessun pulsante nascosto: trascina qui quelli che non usi</div>';
    $('bt-all').disabled = !hidden.length && st.show.join() === b.all.map((t) => t.id).join();
  }

  // Sposta un pulsante in "show" o "hide" alla posizione index
  function moveTile(id, to, index) {
    const st = buttons[btPage];
    if (to === 'hide' && st.show.length === 1 && st.show[0] === id) { toast('Serve almeno un pulsante sulla pagina', 'err'); renderButtons(); return; }
    st.show = st.show.filter((x) => x !== id);
    st.hide = st.hide.filter((x) => x !== id);
    const list = to === 'show' ? st.show : st.hide;
    list.splice(Math.max(0, Math.min(index == null ? list.length : index, list.length)), 0, id);
    touched[btPage] = true;
    render();
  }

  document.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-bpage]');
    if (chip) { btPage = chip.dataset.bpage; renderButtons(); return; }
    const tb = e.target.closest('.tbtn[data-tact]');
    if (tb) { moveTile(tb.closest('.btile').dataset.id, tb.dataset.tact === 'hide' ? 'hide' : 'show'); }
  });
  $('bt-all').addEventListener('click', () => {
    const b = bpage(btPage);
    buttons[btPage] = { show: b.all.map((t) => t.id), hide: [] };
    touched[btPage] = true;
    render();
  });

  // ---- trascinamento dei pulsanti (griglia del tablet <-> nascosti)
  function tileListAt(x, y) {
    for (const id of ['bt-on', 'bt-off']) {
      const r = $(id).getBoundingClientRect();
      if (x >= r.left - 20 && x <= r.right + 20 && y >= r.top - 20 && y <= r.bottom + 20) return $(id);
    }
    return null;
  }
  // Posizione d'arrivo: il primo pulsante che sta "dopo" il puntatore (per righe)
  function tileSlot(box, x, y) {
    const items = Array.from(box.querySelectorAll('.btile:not(.dragging):not(.ghost)'));
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (y < r.top) return { index: i, ref: items[i] };
      if (y <= r.bottom && x < r.left + r.width / 2) return { index: i, ref: items[i] };
    }
    return { index: items.length, ref: box.querySelector('.bcell') || null };
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest('.btile');
    if (!el || e.target.closest('button') || el.classList.contains('ghost')) return;
    tdrag = { id: el.dataset.id, el: el, x0: e.clientX, y0: e.clientY, started: false, box: null, index: 0, pid: e.pointerId };
  });

  document.addEventListener('pointermove', (e) => {
    if (!tdrag || e.pointerId !== tdrag.pid) return;
    const dx = e.clientX - tdrag.x0, dy = e.clientY - tdrag.y0;
    if (!tdrag.started) {
      if (Math.abs(dx) + Math.abs(dy) < 6) return;
      tdrag.started = true;
      const r = tdrag.el.getBoundingClientRect();
      const float = tdrag.el.cloneNode(true);
      float.classList.add('floating');
      float.style.width = r.width + 'px';
      float.style.height = r.height + 'px';
      float.style.left = r.left + 'px';
      float.style.top = r.top + 'px';
      document.body.appendChild(float);
      tdrag.float = float;
      tdrag.ghost = document.createElement('div');
      tdrag.ghost.className = 'btile ghost';
      tdrag.el.parentNode.insertBefore(tdrag.ghost, tdrag.el);
      tdrag.el.classList.add('dragging');
      document.body.classList.add('is-dragging');
    }
    e.preventDefault();
    tdrag.float.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    const box = tileListAt(e.clientX, e.clientY);
    $('bt-on').classList.toggle('drop', box === $('bt-on'));
    $('bt-off').classList.toggle('drop', box === $('bt-off'));
    if (box) {
      const empty = box.querySelector('.empty');
      if (empty) empty.style.display = 'none';
      const slot = tileSlot(box, e.clientX, e.clientY);
      if (tdrag.ghost.parentNode !== box || tdrag.ghost.nextSibling !== slot.ref) box.insertBefore(tdrag.ghost, slot.ref);
      tdrag.index = slot.index;
    }
    tdrag.box = box;
  });

  function endTileDrag(e) {
    if (!tdrag || (e && e.pointerId !== tdrag.pid)) return;
    const d = tdrag;
    tdrag = null;
    if (!d.started) return;
    if (d.float) d.float.remove();
    document.body.classList.remove('is-dragging');
    $('bt-on').classList.remove('drop');
    $('bt-off').classList.remove('drop');
    if ((e && e.type === 'pointercancel') || !d.box) { renderButtons(); return; }
    moveTile(d.id, d.box === $('bt-on') ? 'show' : 'hide', d.index);
  }
  document.addEventListener('pointerup', endTileDrag);
  document.addEventListener('pointercancel', endTileDrag);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tdrag && tdrag.started) endTileDrag({ type: 'pointercancel', pointerId: tdrag.pid }); });

  // ---- salvataggio
  $('save').addEventListener('click', async () => {
    const b = $('save');
    b.disabled = true;
    try {
      const tiles = {};
      Object.keys(touched).forEach((id) => { if (buttons[id]) tiles[id] = buttons[id]; });
      info = await api('POST', '/api/control/layout', { tabs: tabs, home: home, tiles: tiles });
      adopt(true);
      toast('Salvato: il tablet si aggiorna da solo', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    b.disabled = false;
  });
  $('undo').addEventListener('click', () => { adopt(true); });
  $('reset').addEventListener('click', async () => {
    if (!confirm('Tornare alle pagine e ai pulsanti predefiniti di dock.json?')) return;
    try {
      info = await api('POST', '/api/control/layout/reset');
      adopt(true);
      toast('Ripristinate pagine e pulsanti predefiniti', 'ok');
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
      buttons = {};
      touched = {};
      (info.buttons || []).forEach((b) => {
        buttons[b.id] = { show: b.shown.slice(), hide: b.all.map((t) => t.id).filter((id) => b.shown.indexOf(id) < 0) };
      });
      saved = snapshot();
    }
    const urls = info.tablet || [];
    $('tablet').innerHTML = urls.length ? 'Tablet: <b>' + esc(urls[0]) + '</b>' : '';
    const os = info.platform === 'windows' ? 'Windows' : info.platform === 'linux' ? 'Linux' : info.platform;
    $('sub').textContent = 'Pannello di controllo · v' + info.version + (os ? ' · ' + os : '');
    render();
    renderDiscord();
    renderPairing();
    renderMail();
  }

  // ------------------------------------------------------------ Email (da Thunderbird)

  // Passaggi per collegare la posta: tutto passa da Thunderbird, che fa l'accesso con i metodi
  // ufficiali (anche Gmail con la conferma sul telefono e le mail di università e aziende).
  function mailSteps(m) {
    return '<ol class="steps ml-steps">' +
      '<li>' + (m.installed ? '<b>Thunderbird è installato.</b>' : '<b>Scarica e installa Thunderbird</b> (gratis, open source, di Mozilla): ' +
        '<a href="' + esc(m.download) + '" target="_blank" rel="noopener">thunderbird.net</a>') + '</li>' +
      '<li>Aprilo e aggiungi il tuo account: <b>Account email esistente</b>, scrivi nome, indirizzo e lascia vuota la password se è Gmail o Microsoft. ' +
        'Si apre la pagina di accesso del tuo servizio: entri come sempre (con la conferma sul telefono se ce l\'hai). Funziona anche con le mail di <b>università e aziende</b>, se l\'organizzazione permette Thunderbird.</li>' +
      '<li>Lascia attivo <b>"Conserva i messaggi di questo account sul computer"</b> (è già così: impostazioni dell\'account → Sincronizzazione e archiviazione). Serve per leggere il testo dal tablet.</li>' +
      '<li>Aspetta che Thunderbird scarichi la posta: l\'account compare qui da solo. Thunderbird deve restare aperto (anche ridotto a icona) per ricevere le email nuove.</li>' +
    '</ol>';
  }
  function renderMail() {
    const m = info.mail;
    if (!m) return;
    const shown = m.accounts.filter((a) => a.shown).length;
    $('ml-count').textContent = m.accounts.length ? shown + ' SUL TABLET' : (m.installed ? 'NESSUN ACCOUNT' : 'THUNDERBIRD NON INSTALLATO');
    $('ml-count').className = 'pill' + (shown ? ' ok' : '');
    // stato di Thunderbird, sempre visibile, con "Controlla di nuovo" (e "Apri Thunderbird" se c'è)
    const st = !m.installed ? 'Thunderbird non è installato su questo PC.'
      : !m.profile ? 'Thunderbird è installato ma non è ancora stato aperto: aprilo e aggiungi il tuo account.'
      : !m.accounts.length ? 'Thunderbird è collegato, ma non ha account di posta: aggiungili in Thunderbird.'
      : 'Thunderbird è collegato: ' + m.accounts.length + (m.accounts.length === 1 ? ' account trovato.' : ' account trovati.');
    $('ml-status').innerHTML = '<span class="dot' + (m.accounts.length ? ' ok' : '') + '"></span><span class="txt">' + esc(st) + '</span>' +
      (m.exe ? '<button class="btn ghost small-btn" type="button" data-mlact="open">Apri Thunderbird</button>' : '') +
      '<button class="btn ghost small-btn" type="button" data-mlact="check">Controlla di nuovo</button>';
    const accDesc = (a) => a.status === 'error' ? a.error
      : a.unread != null ? a.unread + ' da leggere' + (a.offline ? '' : ' · il testo delle email non è sul PC: attiva "Conserva i messaggi sul computer"')
      : 'lettura della posta in corso…';
    $('ml-accounts').innerHTML = m.accounts.map((a) =>
      '<div class="ml-acc' + (a.shown ? '' : ' off') + '" data-acc="' + esc(a.id) + '">' +
        '<span class="ico">' + icon('mail') + '</span>' +
        '<span class="txt"><span class="name">' + esc(a.label) + '</span> <span class="hint">' + esc(a.email) + '</span>' +
          '<span class="desc' + (a.status === 'error' ? ' err' : '') + '">' + esc(accDesc(a)) + '</span></span>' +
        '<button class="chip' + (a.shown ? ' on' : '') + '" type="button" data-mlact="' + (a.shown ? 'hide' : 'show') + '">' + (a.shown ? 'Sul tablet' : 'Nascosto') + '</button>' +
      '</div>'
    ).join('');
    // i passaggi si ridisegnano solo se cambia qualcosa (non far saltare la pagina ogni 5 secondi)
    const key = m.installed + '|' + m.profile + '|' + m.accounts.length;
    if (key === mlKey) return;
    mlKey = key;
    $('ml-add').innerHTML = (m.accounts.length
      ? '<details class="ml-more"><summary>Aggiungere un altro account</summary>' + mailSteps(m) + '</details>'
      : mailSteps(m)) +
      '<p class="hint small">Riservatezza: la dock non chiede e non salva password. Legge in sola lettura i file che Thunderbird tiene su questo PC e manda le email solo al tuo tablet, sulla rete di casa. ' +
      'I file della posta non sono cifrati: proteggi l\'account del PC con una password (e, se puoi, la cifratura del disco).</p>';
  }

  async function mailAction(act, id, btn) {
    if (btn) btn.disabled = true;
    try {
      if (act === 'check') {
        toast('Cerco Thunderbird e leggo la posta…', '');
        info = await api('POST', '/api/control/mail/check', {});
        adopt();
        const n = info.mail.accounts.length;
        toast(n ? 'Thunderbird collegato: ' + n + (n === 1 ? ' account' : ' account') : (info.mail.profile ? 'Nessun account in Thunderbird' : 'Thunderbird non trovato'), n ? 'ok' : 'err');
        if (btn) btn.disabled = false;
        return;
      }
      if (act === 'open') {
        await api('POST', '/api/control/mail/open', {});
        toast('Thunderbird aperto', 'ok');
        if (btn) btn.disabled = false;
        return;
      }
      info = await api('POST', '/api/control/mail/show', { id: id, shown: act === 'show' });
      adopt();
      if (act === 'show') toast('Account sul tablet: aggiungi la pagina EMAIL alla barra se non c\'è', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    if (btn) btn.disabled = false;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mlact]');
    if (!b) return;
    const row = b.closest('[data-acc]');
    mailAction(b.dataset.mlact, row ? row.dataset.acc : '', b);
  });

  // ------------------------------------------------------------ collegamento con QR

  function renderPairing() {
    const list = info.pairing || [];
    $('pair-card').hidden = !list.length;
    if (!list.length) return;
    if (pairSel >= list.length) pairSel = 0;
    const p = list[pairSel];
    $('pair-nets').innerHTML = list.length > 1
      ? list.map((l, i) => '<button class="chip' + (i === pairSel ? ' on' : '') + '" type="button" data-pair="' + i + '">' + esc(netName(l.name)) + ' · ' + esc(l.url.replace(/^http:\/\//, '')) + '</button>').join('')
      : '';
    $('pair-link').textContent = p.link;
    const m = /[?&]t=([^&]+)/.exec(p.link);
    $('pair-code').textContent = m ? decodeURIComponent(m[1]) : 'nessuno (DOCK_TOKEN vuoto)';
    if (pairShown === p.link) return;
    pairShown = p.link;
    api('GET', '/api/control/qr?link=' + encodeURIComponent(p.link))
      .then((d) => { if (pairShown === d.link) $('pair-qr').innerHTML = d.svg; })
      .catch((e) => { $('pair-qr').textContent = e.message; });
  }
  function netName(n) {
    if (/^(wl|wlan|wi-?fi)/i.test(n)) return 'Wi-Fi';
    if (/^(en|eth|ethernet)/i.test(n)) return 'Cavo';
    return n;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pair]');
    if (b) { pairSel = parseInt(b.dataset.pair, 10) || 0; renderPairing(); }
  });

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
        '<li>Apri il <a href="https://discord.com/developers/applications" target="_blank" rel="noopener">Developer Portal di Discord</a> e premi <b>New Application</b> (nome a piacere, es. "Vibe Deck").</li>' +
        '<li>Vai in <b>OAuth2</b>: copia il <b>Client ID</b> e premi <b>Reset Secret</b> per avere il <b>Client Secret</b>.</li>' +
        '<li>Sempre in OAuth2, sotto <b>Redirects</b> premi <b>Add Redirect</b>, scrivi <code>' + esc(d.redirect) + '</code> (esatto, senza barra finale) e premi <b>Save Changes</b> in basso. Senza questo Discord risponde "missing redirect_uri".</li>' +
        '<li>Incolla qui sotto e premi <b>Collega</b>: Discord ti chiede di autorizzare la dock.</li>' +
      '</ol>' +
      '<div class="form">' +
        '<div><label for="dc-id">Client ID</label><input id="dc-id" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" value="' + esc(d.clientId) + '"></div>' +
        '<div><label for="dc-secret">Client Secret</label><input id="dc-secret" type="password" autocomplete="off" spellcheck="false" placeholder="' + (d.hasSecret && !editing ? 'già salvato' : '') + (d.hasSecret && editing ? 'lascia vuoto per tenere quello salvato' : '') + '"></div>' +
        '<button class="btn discord" id="dc-go" type="button">Collega</button>' +
      '</div>' +
      '<p class="hint small">Le credenziali restano su questo PC, cifrate in <code>data/discord.json</code>.</p>' +
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
  setInterval(() => { if (!document.hidden && !drag && !tdrag) refresh(); }, 5000);
})();
