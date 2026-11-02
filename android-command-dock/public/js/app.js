/* Command Dock - applicazione principale del tablet. ES5. */
(function () {
  'use strict';

  var TOP_H = 44;   // uguali a #topbar e #tabs in dock.css
  var TABS_H = 58;
  var BACKOFF = [2000, 4000, 8000, 15000];

  var app = {
    cfg: null,
    version: null,
    page: null,
    tiles: [],      // { el, tile, x, y, w, h, widget }
    state: null,
    failures: 0,
    pollTimer: null,
    online: false,
    inflight: {}
  };

  var stage = D.$('stage'), tabs = D.$('tabs'), banner = D.$('banner');

  // Versione del codice caricato (messa dal server nella pagina)
  var buildMeta = document.querySelector('meta[name="dock-build"]');
  var BUILD = buildMeta ? buildMeta.getAttribute('content') : '';
  function reloadPage() {
    // al massimo un ricaricamento al minuto, per non entrare in un ciclo
    var last = D.store.get('reloadAt', 0);
    if (new Date().getTime() - last < 60000) return;
    D.store.set('reloadAt', new Date().getTime());
    window.location.reload(true);
  }

  // ------------------------------------------------------------ feedback
  var toastTimer = null;
  app.toast = function (msg, kind) {
    if (!msg) return;
    var t = D.$('toast');
    D.setText(t, msg);
    t.className = 'show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, kind === 'err' ? 4000 : 2200);
  };

  function showModal(title, body) {
    var m = D.$('modal');
    D.setText(m.querySelector('.modal-title'), title);
    D.setText(m.querySelector('.modal-body'), body || '(nessun output)');
    D.removeClass(m, 'hidden');
  }
  D.bindTap(D.$('modal-close'), { onTap: function () { D.addClass(D.$('modal'), 'hidden'); } });

  // ------------------------------------------------------------ layout
  function viewport() {
    return { w: window.innerWidth || document.documentElement.clientWidth, h: window.innerHeight || document.documentElement.clientHeight };
  }

  // Dispone le tile nella griglia: da sinistra a destra, prima cella libera.
  function pack(tiles, cols, rows) {
    var grid = [], out = [], r, c;
    for (r = 0; r < rows; r++) { grid[r] = []; for (c = 0; c < cols; c++) grid[r][c] = false; }
    function fits(x, y, w, h) {
      if (x + w > cols || y + h > rows) return false;
      for (var i = y; i < y + h; i++) for (var j = x; j < x + w; j++) if (grid[i][j]) return false;
      return true;
    }
    for (var k = 0; k < tiles.length; k++) {
      var t = tiles[k], w = Math.min(t.w || 1, cols), h = Math.min(t.h || 1, rows), placed = false;
      for (r = 0; r < rows && !placed; r++) {
        for (c = 0; c < cols && !placed; c++) {
          if (fits(c, r, w, h)) {
            for (var i = r; i < r + h; i++) for (var j = c; j < c + w; j++) grid[i][j] = true;
            out.push({ tile: t, x: c, y: r, w: w, h: h });
            placed = true;
          }
        }
      }
      if (!placed && window.console) console.warn('Tile senza spazio:', t.label || t.widget);
    }
    return out;
  }

  function layout() {
    var v = viewport();
    var focused = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    // Tastiera aperta (schermo molto basso): nasconde barre per fare spazio
    var kb = focused && v.h < 380;
    D.toggleClass(document.body, 'kb-open', kb);
    if (!app.page) return;
    var cols = app.page.columns, rows = app.page.rows;
    var gap = v.w < 900 ? 6 : 8;
    var sw = stage.clientWidth || v.w;
    var sh = Math.max(100, stage.clientHeight || (v.h - (kb ? 0 : TOP_H + TABS_H)));
    var cw = (sw - gap * (cols + 1)) / cols;
    var ch = (sh - gap * (rows + 1)) / rows;
    app.lastSize = sw + 'x' + sh;
    stage.style.fontSize = Math.round(Math.max(12, Math.min(19, Math.min(cw * 0.12, ch * 0.15)))) + 'px';
    for (var i = 0; i < app.tiles.length; i++) {
      var p = app.tiles[i];
      var left = Math.round(gap + p.x * (cw + gap));
      var topPx = Math.round(gap + p.y * (ch + gap));
      var w = Math.round(p.w * cw + (p.w - 1) * gap);
      var h = Math.round(p.h * ch + (p.h - 1) * gap);
      p.el.style.left = left + 'px';
      p.el.style.top = topPx + 'px';
      p.el.style.width = w + 'px';
      p.el.style.height = h + 'px';
      D.toggleClass(p.el, 'short', h < 95);
      if (p.widget) p.widget.resize(w, h);
    }
  }

  // ------------------------------------------------------------ pagine
  function findPage(id) {
    var pages = app.cfg.dock.pages;
    for (var i = 0; i < pages.length; i++) if (pages[i].id === id) return pages[i];
    return null;
  }

  function buildTabs() {
    tabs.innerHTML = '';
    var pages = app.cfg.dock.pages, list = [];
    for (var i = 0; i < pages.length; i++) if (pages[i].tab) list.push(pages[i]);
    for (var j = 0; j < list.length; j++) (function (p) {
      var t = D.el('div', 'tab');
      t.setAttribute('data-page', p.id);
      t.style.width = (100 / list.length) + '%';
      t.innerHTML = Icons.html(p.icon) + '<span>' + D.esc(p.title) + '</span>';
      D.bindTap(t, { onTap: function () { showPage(p.id); } });
      tabs.appendChild(t);
    })(list[j]);
    D.toggleClass(document.body, 'no-tabs', !list.length);
  }

  function markTab() {
    var all = tabs.childNodes;
    for (var i = 0; i < all.length; i++) D.toggleClass(all[i], 'active', all[i].getAttribute('data-page') === app.page.id);
  }

  function destroyTiles() {
    for (var i = 0; i < app.tiles.length; i++) if (app.tiles[i].widget) app.tiles[i].widget.destroy();
    app.tiles = [];
    stage.innerHTML = '';
  }

  function showPage(id) {
    var page = findPage(id) || findPage(app.cfg.dock.home) || app.cfg.dock.pages[0];
    destroyTiles();
    app.page = page;
    D.store.set('page', page.id);
    D.setText(D.$('page-title'), page.title);
    var placed = pack(page.tiles, page.columns, page.rows);
    for (var i = 0; i < placed.length; i++) {
      var p = placed[i];
      p.el = p.tile.widget ? makeWidget(p) : makeButton(p.tile);
      stage.appendChild(p.el);
      app.tiles.push(p);
    }
    if (!placed.length) stage.appendChild(D.el('div', 'empty', 'Pagina vuota: aggiungi tile in config/dock.json'));
    markTab();
    layout();
    if (app.state) for (var j = 0; j < app.tiles.length; j++) if (app.tiles[j].widget) app.tiles[j].widget.update(app.state);
  }

  function makeWidget(p) {
    // widget sconosciuto = codice vecchio in cache: si ricarica la pagina
    if (!Widgets.types[p.tile.widget]) reloadPage();
    var root = D.el('div', 'tile widget');
    p.widget = Widgets.create(p.tile.widget, root, p.tile, app);
    return root;
  }

  function makeButton(tile) {
    var b = D.el('div', 'tile btn' + (tile.confirm ? ' confirm' : ''));
    if (tile.color) b.style.backgroundColor = tile.color;
    var icon = Icons.html(tile.icon);
    if (!icon) D.addClass(b, 'no-icon');
    b.innerHTML = (icon ? '<div class="t-icon">' + icon + '</div>' : '') +
      '<div class="t-label">' + D.esc(tile.label || '') + '</div>' +
      (tile.sub ? '<div class="t-sub">' + D.esc(tile.sub) + '</div>' : '') +
      (tile.confirm ? '<div class="t-hold"><i></i></div>' : '');
    D.bindTap(b, {
      hold: tile.confirm ? 900 : 0,
      repeat: !!tile.repeat,
      onTap: function () { press(tile, b); }
    });
    return b;
  }

  function flash(node, cls) {
    D.removeClass(node, 'ok'); D.removeClass(node, 'err');
    D.addClass(node, cls);
    setTimeout(function () { D.removeClass(node, cls); }, 450);
  }

  function press(tile, node) {
    var a = tile.action || {};
    if (a.type === 'page') { showPage(a.page || a.pageId); return; }
    if (app.inflight[tile.id]) return; // niente coda mentre il PC risponde
    app.inflight[tile.id] = true;
    D.addClass(node, 'busy');
    D.api.post('/api/press', { page: app.page.id, tile: tile.id, version: app.version }, function (err, r) {
      app.inflight[tile.id] = false;
      D.removeClass(node, 'busy');
      if (err) {
        flash(node, 'err');
        if (err.code === 'CONFIG_CHANGED') { app.toast('Configurazione aggiornata', 'info'); loadConfig(); return; }
        app.toast(err.message, 'err');
        return;
      }
      flash(node, 'ok');
      if (r && r.output !== undefined) showModal(tile.label || 'Output', r.output);
      else if (r && r.message) app.toast(r.message, 'ok');
    }, 125000);
  }

  // ------------------------------------------------------------ stato e polling
  function fmtTop(s) {
    var sys = s.system;
    if (!sys) return '';
    var parts = [];
    if (sys.cpu.usage !== null) parts.push('CPU ' + sys.cpu.usage + '%');
    if (sys.gpu && sys.gpu.usage !== null) parts.push('GPU ' + sys.gpu.usage + '%' + (sys.gpu.temp !== null ? ' ' + sys.gpu.temp + '°' : ''));
    parts.push('RAM ' + sys.ram.usage + '%');
    return parts.join('   ');
  }

  function setOnline(on, retryMs) {
    app.online = on;
    D.toggleClass(D.$('status-dot'), 'on', on);
    D.setText(D.$('host'), on ? (app.cfg ? app.cfg.hostname : 'PC') : 'OFFLINE');
    if (on) { D.addClass(banner, 'hidden'); return; }
    D.removeClass(banner, 'hidden');
    D.setText(banner, 'CONNESSIONE PERSA  ·  nuovo tentativo tra ' + Math.round(retryMs / 1000) + 's');
  }

  function poll() {
    clearTimeout(app.pollTimer);
    D.api.get('/api/state', function (err, s) {
      if (err) {
        if (err.status === 401) return;
        var wait = BACKOFF[Math.min(app.failures, BACKOFF.length - 1)];
        app.failures++;
        if (app.failures >= 2) setOnline(false, wait);
        app.pollTimer = setTimeout(poll, wait);
        return;
      }
      app.failures = 0;
      app.state = s;
      setOnline(true);
      D.setText(D.$('mini'), fmtTop(s));
      // La dock sul PC è stata aggiornata: ricarica la pagina per avere il codice nuovo
      if (s.build && BUILD && s.build !== BUILD) { reloadPage(); return; }
      if (s.version !== app.version) { loadConfig(); return; }
      // Alcuni browser cambiano viewport senza evento resize (barra indirizzi, fullscreen)
      if (app.page && stage.clientWidth + 'x' + stage.clientHeight !== app.lastSize) layout();
      for (var i = 0; i < app.tiles.length; i++) if (app.tiles[i].widget) app.tiles[i].widget.update(s);
      app.pollTimer = setTimeout(poll, 2000);
    }, 6000);
  }

  function loadConfig() {
    D.api.get('/api/config', function (err, cfg) {
      D.addClass(D.$('boot'), 'hidden');
      if (err) {
        if (err.status === 401) return;
        setOnline(false, 4000);
        setTimeout(loadConfig, 4000);
        return;
      }
      var first = !app.cfg;
      app.cfg = cfg;
      app.version = cfg.version;
      document.title = cfg.dock.title;
      buildTabs();
      var fromHash = window.location.hash ? window.location.hash.replace(/^#\/?/, '') : '';
      showPage(app.page ? app.page.id : (fromHash && findPage(fromHash) ? fromHash : D.store.get('page', cfg.dock.home)));
      setOnline(true);
      if (cfg.errors && cfg.errors.length) app.toast(cfg.errors[0], 'err');
      if (first) poll(); else { clearTimeout(app.pollTimer); app.pollTimer = setTimeout(poll, 500); }
    }, 10000);
  }

  // ------------------------------------------------------------ abbinamento
  function showPair(msg) {
    clearTimeout(app.pollTimer);
    D.addClass(D.$('boot'), 'hidden');
    D.removeClass(D.$('pair'), 'hidden');
    if (msg) D.setText(D.$('pair-msg'), msg);
  }
  D.setUnauthorizedHandler(function () { showPair('Codice non più valido: inseriscilo di nuovo'); });

  function submitPair() {
    var input = D.$('pair-code');
    var code = input.value.replace(/\s+/g, '').toUpperCase();
    if (!code) return;
    D.api.post('/api/pair', { token: code }, function (err) {
      if (err) { D.setText(D.$('pair-msg'), err.message); return; }
      D.store.set('token', code);
      window.location.reload();
    });
  }
  D.bindTap(D.$('pair-go'), { onTap: submitPair });
  D.$('pair-code').addEventListener('keydown', function (e) { if (e.keyCode === 13) submitPair(); }, false);

  // ------------------------------------------------------------ orologio, fullscreen
  function clock() {
    var n = new Date();
    D.setText(D.$('clock'), D.pad(n.getHours()) + ':' + D.pad(n.getMinutes()));
  }
  setInterval(clock, 10000);
  clock();

  D.bindTap(D.$('clock'), {
    onTap: function () {
      var de = document.documentElement;
      var req = de.requestFullscreen || de.webkitRequestFullscreen || de.webkitRequestFullScreen;
      if (req) req.call(de);
      else window.scrollTo(0, 1);
    }
  });
  D.bindTap(D.$('home-btn'), { onTap: function () { if (app.cfg) showPage(app.cfg.dock.home); } });

  // Blocca lo scroll/rimbalzo della pagina, tranne dentro le liste
  document.addEventListener('touchmove', function (e) {
    if (!D.closestClass(e.target, 'scroll') && !/TEXTAREA|SELECT|INPUT/.test(e.target.tagName)) e.preventDefault();
  }, false);

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    layout(); // subito, e di nuovo quando il ridimensionamento si stabilizza
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 150);
  }, false);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 300); }, false);
  document.addEventListener('focusin', function () { setTimeout(layout, 350); }, false);
  document.addEventListener('focusout', function () { setTimeout(layout, 350); }, false);

  // Se il browser sospende la pagina (schermo spento), riprende subito al ritorno
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && app.cfg) { app.failures = 0; poll(); }
  }, false);

  // ------------------------------------------------------------ avvio
  function boot() {
    layout();
    D.api.get('/api/health', function (err, h) {
      if (err) {
        D.setText(D.$('boot-msg'), 'Il PC non risponde. Nuovo tentativo…');
        setTimeout(boot, 3000);
        return;
      }
      if (!h.paired) { showPair(); return; }
      loadConfig();
    }, 6000);
  }
  boot();
})();
