/* Widget della dock: system, nowplaying, github, todo, chat, clock. ES5.
 * Ogni widget: create(el, tile, app) -> { update(state), resize(w, h), destroy() } */
var Widgets = (function () {
  'use strict';

  var el = D.el, setText = D.setText;

  function level(v, warn, hot) { return v === null || v === undefined ? '' : v >= hot ? 'hot' : v >= warn ? 'warn' : 'ok'; }

  function header(root, title, right) {
    var h = el('div', 'w-head');
    var t = el('div', 'w-title', title);
    h.appendChild(t);
    if (right) h.appendChild(right);
    root.appendChild(h);
    return t;
  }

  function smallBtn(label, icon, onTap) {
    var b = el('div', 'sbtn');
    b.innerHTML = Icons.html(icon) + (label ? '<span>' + D.esc(label) + '</span>' : '');
    D.bindTap(b, { onTap: onTap });
    return b;
  }

  // ------------------------------------------------------------ SYSTEM
  function system(root) {
    D.addClass(root, 'w-system');
    var title = header(root, 'PC');
    var rows = {};
    function row(key, label) {
      var r = el('div', 'metric');
      var l = el('span', 'm-label', label);
      var v = el('span', 'm-val', '—');
      var x = el('span', 'm-extra', '');
      var bar = el('div', 'bar');
      var fill = el('i', '');
      bar.appendChild(fill);
      r.appendChild(l); r.appendChild(x); r.appendChild(v); r.appendChild(bar);
      root.appendChild(r);
      rows[key] = { row: r, val: v, extra: x, fill: fill, bar: bar };
    }
    // ordine = priorità: se la tile è bassa si vedono solo le prime righe
    row('cpu', 'CPU'); row('gpu', 'GPU'); row('ram', 'RAM'); row('vram', 'VRAM'); row('net', 'RETE');

    function set(key, value, pct, extra, lvl) {
      var r = rows[key];
      setText(r.val, value);
      setText(r.extra, extra || '');
      r.fill.style.width = (pct === null || pct === undefined ? 0 : Math.max(2, Math.min(100, pct))) + '%';
      r.bar.className = 'bar ' + (lvl || '');
      D.toggleClass(r.bar, 'nobar', pct === null || pct === undefined);
    }

    return {
      update: function (s) {
        var sys = s && s.system;
        if (!sys) return;
        setText(title, 'PC · ' + sys.hostname);
        var c = sys.cpu;
        set('cpu', c.usage === null ? '…' : c.usage + '%', c.usage, c.temp !== null ? c.temp + '°C' : '', level(Math.max(c.usage || 0, c.temp ? c.temp - 15 : 0), 60, 85));
        var g = sys.gpu;
        if (g) {
          set('gpu', g.usage === null ? 'N/D' : g.usage + '%', g.usage, g.temp !== null ? g.temp + '°C' : '', level(Math.max(g.usage || 0, g.temp ? g.temp - 10 : 0), 65, 85));
          var vpct = g.memUsedGb !== null && g.memTotalGb ? Math.round((g.memUsedGb / g.memTotalGb) * 100) : null;
          set('vram', g.memUsedGb !== null ? g.memUsedGb + ' / ' + g.memTotalGb + ' GB' : 'N/D', vpct, '', level(vpct, 75, 92));
        } else {
          set('gpu', 'N/D', null, '', '');
          set('vram', 'N/D', null, '', '');
        }
        set('ram', sys.ram.usedGb + ' / ' + sys.ram.totalGb + ' GB', sys.ram.usage, sys.ram.usage + '%', level(sys.ram.usage, 75, 90));
        if (sys.net) set('net', '↓ ' + sys.net.downMbps + '  ↑ ' + sys.net.upMbps, null, 'Mbit/s', '');
        else set('net', '…', null, '', '');
      },
      resize: function (w, h) {
        // Quante righe entrano davvero (dipende dalla dimensione del testo)
        rows.cpu.row.style.display = '';
        var rh = rows.cpu.row.offsetHeight + 6;
        var n = Math.max(1, Math.floor((h - 50) / (rh || 60)));
        var keys = ['cpu', 'gpu', 'ram', 'vram', 'net'];
        for (var i = 0; i < keys.length; i++) rows[keys[i]].row.style.display = i < n ? '' : 'none';
      },
      destroy: function () {}
    };
  }

  // ------------------------------------------------------------ NOW PLAYING
  function nowplaying(root, tile, app) {
    D.addClass(root, 'w-np');
    var art = el('div', 'np-art');
    var img = el('img', '');
    var artPh = el('div', 'np-art-ph');
    artPh.innerHTML = Icons.html('music');
    art.appendChild(artPh); art.appendChild(img);
    var info = el('div', 'np-info');
    var src = el('div', 'np-src', '');
    var title = el('div', 'np-title', 'Niente in riproduzione');
    var artist = el('div', 'np-artist', '');
    var prog = el('div', 'np-prog'); var progFill = el('i', ''); prog.appendChild(progFill);
    var times = el('div', 'np-times', '');
    var ctr = el('div', 'np-ctr');
    info.appendChild(src); info.appendChild(title); info.appendChild(artist);
    info.appendChild(prog); info.appendChild(times); info.appendChild(ctr);
    root.appendChild(art); root.appendChild(info);

    var cur = null, artKey = null, offset = 0, playBtn = null, timer = null, optimisticUntil = 0;
    img.onload = function () { img.style.display = 'block'; artPh.style.display = 'none'; };
    img.onerror = function () { img.style.display = 'none'; artPh.style.display = 'block'; };

    function cmd(c) {
      return function () {
        if (c === 'play_pause' && cur) {
          cur.status = cur.status === 'playing' ? 'paused' : 'playing';
          optimisticUntil = new Date().getTime() + 2500;
          paintStatus();
        }
        D.api.post('/api/media', { command: c }, function (err) { if (err) app.toast(err.message, 'err'); });
      };
    }
    function ctrlBtn(icon, c, cls, repeat) {
      var b = el('div', 'np-btn ' + (cls || ''));
      b.innerHTML = Icons.html(icon) || D.esc(icon);
      D.bindTap(b, { onTap: cmd(c), repeat: !!repeat });
      ctr.appendChild(b);
      return b;
    }
    var volBtns = [ctrlBtn('voldown', 'volume_down', 'np-vol', true)];
    ctrlBtn('prev', 'previous');
    playBtn = ctrlBtn('play', 'play_pause', 'np-play');
    ctrlBtn('next', 'next');
    volBtns.push(ctrlBtn('volup', 'volume_up', 'np-vol', true));

    function position() {
      if (!cur || !cur.duration) return 0;
      var p = cur.position;
      if (cur.status === 'playing') p += Math.max(0, (new Date().getTime() + offset - cur.updatedAt) / 1000);
      return Math.min(p, cur.duration);
    }
    function paintProgress() {
      if (!cur || !cur.duration) { prog.style.visibility = 'hidden'; setText(times, ''); return; }
      prog.style.visibility = 'visible';
      var p = position();
      progFill.style.width = (p / cur.duration * 100) + '%';
      setText(times, D.duration(p) + ' / ' + D.duration(cur.duration));
    }
    function paintStatus() {
      var playing = cur && cur.status === 'playing';
      playBtn.innerHTML = Icons.html(playing ? 'pause' : 'play') || (playing ? '||' : '>');
      var label = cur ? (cur.appName || '') + (cur.status === 'paused' ? ' · IN PAUSA' : cur.status === 'playing' ? ' · IN RIPRODUZIONE' : '') : '';
      setText(src, label.toUpperCase());
    }

    timer = setInterval(paintProgress, 1000);

    return {
      update: function (s) {
        var m = s && s.media;
        if (!m) return;
        if (s.time) offset = s.time - new Date().getTime();
        if (!m.supported) {
          cur = null;
          setText(title, 'Now Playing non disponibile');
          setText(artist, 'Su questo sistema non è supportato');
        } else if (!m.active) {
          cur = null;
          setText(title, 'Niente in riproduzione');
          setText(artist, 'Avvia la musica sul PC');
        } else {
          var keepStatus = cur && new Date().getTime() < optimisticUntil ? cur.status : null;
          cur = m;
          if (keepStatus) cur.status = keepStatus;
          setText(title, m.title || 'Titolo sconosciuto');
          setText(artist, [m.artist, m.album].filter(function (x) { return !!x; }).join(' — '));
        }
        paintStatus();
        paintProgress();
        var key = cur && cur.hasArt ? cur.key : null;
        if (key !== artKey) {
          artKey = key;
          if (key) img.src = '/api/media/art?k=' + key;
          else { img.style.display = 'none'; artPh.style.display = 'block'; }
        }
      },
      resize: function (w, h) {
        var pad = 12;
        var showArt = w > h * 1.3 && h > 110;
        var size = showArt ? Math.min(h - pad * 2, w * 0.42) : 0;
        art.style.display = showArt ? 'block' : 'none';
        art.style.width = size + 'px'; art.style.height = size + 'px';
        art.style.left = pad + 'px'; art.style.top = Math.round((h - size) / 2) + 'px';
        info.style.left = (showArt ? size + pad * 2 : pad) + 'px';
        info.style.right = pad + 'px';
        var tall = h > 170;
        D.toggleClass(root, 'np-compact', !tall);
        var showVol = w - (showArt ? size : 0) > 330;
        for (var i = 0; i < volBtns.length; i++) volBtns[i].style.display = showVol ? '' : 'none';
      },
      destroy: function () { clearInterval(timer); }
    };
  }

  // ------------------------------------------------------------ GITHUB
  function github(root, tile, app) {
    D.addClass(root, 'w-gh');
    var refreshBtn = smallBtn('', 'refresh', function () { load(true); });
    var title = header(root, 'GITHUB', refreshBtn);
    var totals = el('div', 'gh-totals', '');
    var list = el('div', 'w-list scroll');
    root.appendChild(totals); root.appendChild(list);
    var timer = null, data = null;

    function ci(r) {
      if (!r.ci) return '<span class="badge none">CI —</span>';
      if (r.ci.status !== 'completed') return '<span class="badge run">CI …</span>';
      if (r.ci.conclusion === 'success') return '<span class="badge good">CI ✓</span>';
      if (r.ci.conclusion === 'failure') return '<span class="badge bad">CI ✗</span>';
      return '<span class="badge none">CI ' + D.esc(r.ci.conclusion || '?') + '</span>';
    }

    function render() {
      list.innerHTML = '';
      if (!data) return;
      setText(title, 'GITHUB' + (data.authenticated ? '' : ' (senza token)'));
      setText(totals, data.error ? data.error :
        'PR aperte ' + data.totals.prs + '   ·   Issue ' + data.totals.issues + (data.totals.failing ? '   ·   CI falliti ' + data.totals.failing : ''));
      D.toggleClass(totals, 'err', !!data.error);
      for (var i = 0; i < data.repos.length; i++) {
        var r = data.repos[i];
        var row = el('div', 'gh-row');
        if (r.error) {
          row.innerHTML = '<div class="gh-name">' + D.esc(r.full) + '</div><div class="gh-msg err">' + D.esc(r.error) + '</div>';
        } else {
          row.setAttribute('data-repo', r.full);
          row.innerHTML =
            '<div class="gh-badges">' +
              '<span class="badge pr" data-what="pulls">PR ' + r.prs + '</span>' +
              '<span class="badge is" data-what="issues">ISSUE ' + r.issues + '</span>' +
              '<span data-what="actions">' + ci(r) + '</span>' +
            '</div>' +
            '<div class="gh-name">' + D.esc(r.name) + (r.private ? ' <span class="gh-priv">privato</span>' : '') + '</div>' +
            '<div class="gh-msg">' + (r.commit ? D.esc(r.commit.message) + ' <span class="gh-when">· ' + D.esc(D.ago(r.commit.date)) + '</span>' : '') + '</div>';
          bindRow(row, r.full);
        }
        list.appendChild(row);
      }
    }
    function bindRow(row, full) {
      D.bindTap(row, {
        scrollable: true,
        onTap: function (target) {
          var w = D.closestAttr(target, 'data-what', row);
          D.api.post('/api/github/open', { repo: full, what: w ? w.getAttribute('data-what') : 'repo' }, function (err, res) {
            app.toast(err ? err.message : res.message, err ? 'err' : 'ok');
          });
        }
      });
    }
    function load(force) {
      D.addClass(refreshBtn, 'spin');
      D.api.get('/api/github' + (force ? '?refresh=1' : ''), function (err, d) {
        D.removeClass(refreshBtn, 'spin');
        if (err) { setText(totals, err.message); D.addClass(totals, 'err'); return; }
        data = d;
        render();
      }, 30000);
    }
    load(false);
    timer = setInterval(function () { load(false); }, 60000);
    return { update: function () {}, resize: function () {}, destroy: function () { clearInterval(timer); } };
  }

  // ------------------------------------------------------------ TODO
  function todo(root, tile, app) {
    D.addClass(root, 'w-todo');
    var clearBtn = smallBtn('PULISCI', 'trash', function () {
      D.api.post('/api/todo/clear', {}, function (err, r) {
        if (err) return app.toast(err.message, 'err');
        items = r.items; render();
        app.toast(r.removed ? r.removed + ' completate rimosse' : 'Nessuna completata', 'ok');
      });
    });
    var title = header(root, 'TODO', clearBtn);
    var form = el('div', 'todo-form');
    var input = el('input', 'todo-input');
    input.type = 'text';
    input.placeholder = 'Nuova attività…';
    input.setAttribute('maxlength', '200');
    var addBtn = el('div', 'todo-add');
    addBtn.innerHTML = Icons.html('add') || '+';
    form.appendChild(input); form.appendChild(addBtn);
    var list = el('div', 'w-list scroll');
    root.appendChild(form); root.appendChild(list);
    var items = [];

    function render() {
      list.innerHTML = '';
      var open = 0;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.done) open++;
        var row = el('div', 'todo-row' + (it.done ? ' done' : '') + (it.priority === 'high' ? ' high' : ''));
        row.innerHTML = '<span class="todo-box">' + (it.done ? Icons.html('check') || 'x' : '') + '</span>' +
          '<span class="todo-text">' + D.esc(it.text) + '</span>' +
          '<span class="todo-del">' + (Icons.html('close') || 'x') + '</span>';
        bindRow(row, it.id);
        list.appendChild(row);
      }
      setText(title, 'TODO · ' + open + ' da fare');
      if (!items.length) list.appendChild(el('div', 'empty', 'Nessuna attività'));
    }
    function bindRow(row, id) {
      D.bindTap(row, {
        scrollable: true,
        onTap: function (target) {
          var del = D.closestClass(target, 'todo-del', row);
          D.api.post(del ? '/api/todo/remove' : '/api/todo/toggle', { id: id }, function (err) {
            if (err) return app.toast(err.message, 'err');
            load();
          });
        }
      });
    }
    function add() {
      var text = input.value.replace(/^\s+|\s+$/g, '');
      if (!text) { input.focus(); return; }
      D.api.post('/api/todo/add', { text: text }, function (err) {
        if (err) return app.toast(err.message, 'err');
        input.value = '';
        input.blur();
        load();
      });
    }
    D.bindTap(addBtn, { onTap: add });
    input.addEventListener('keydown', function (e) { if (e.keyCode === 13) { e.preventDefault(); add(); } }, false);
    function load() {
      D.api.get('/api/todo', function (err, d) {
        if (err) return;
        items = d.items;
        render();
      });
    }
    load();
    var timer = setInterval(load, 30000);
    return { update: function () {}, resize: function () {}, destroy: function () { clearInterval(timer); } };
  }

  // ------------------------------------------------------------ CHAT (Ollama / Claude)
  function chat(root, tile, app) {
    var provider = tile.provider === 'claude' ? 'claude' : 'ollama';
    D.addClass(root, 'w-chat ' + provider);
    var stKey = 'chat:' + provider;
    // Stato condiviso tra istanze: se cambi pagina mentre aspetti, la risposta non si perde.
    var st = CHAT[provider] || (CHAT[provider] = { saved: D.store.get(stKey, { sessionId: null, messages: [], model: null }), busy: false, render: null });

    var head = el('div', 'w-head');
    var title = el('div', 'w-title', provider === 'claude' ? 'CLAUDE' : 'OLLAMA');
    var select = null;
    var right = el('div', 'chat-tools');
    if (provider === 'ollama') {
      select = el('select', 'chat-model');
      right.appendChild(select);
      select.addEventListener('change', function () { st.saved.model = select.value; persist(); }, false);
    } else {
      select = el('span', 'chat-model-label', '');
      right.appendChild(select);
    }
    right.appendChild(smallBtn('NUOVA', 'add', function () {
      st.saved = { sessionId: null, messages: [], model: st.saved.model };
      persist(); render();
    }));
    head.appendChild(title); head.appendChild(right);
    root.appendChild(head);

    var log = el('div', 'chat-log scroll');
    var form = el('div', 'chat-form');
    var input = el('textarea', 'chat-input');
    input.setAttribute('rows', '2');
    input.placeholder = provider === 'claude' ? 'Scrivi a Claude…' : 'Scrivi al modello…';
    var send = el('div', 'chat-send');
    send.innerHTML = Icons.html('send') || 'INVIA';
    form.appendChild(input); form.appendChild(send);
    root.appendChild(log); root.appendChild(form);

    function persist() {
      if (st.saved.messages.length > 40) st.saved.messages = st.saved.messages.slice(-40);
      D.store.set(stKey, st.saved);
    }

    function bubble(m) {
      var b = el('div', 'msg ' + m.role + (m.error ? ' error' : ''));
      b.innerHTML = m.role === 'user' ? D.esc(m.text).replace(/\n/g, '<br>') : D.richText(m.text);
      return b;
    }
    function render() {
      log.innerHTML = '';
      if (!st.saved.messages.length) {
        log.appendChild(el('div', 'empty', provider === 'claude'
          ? 'Fai una domanda a Claude. La conversazione resta sul PC finché il server è acceso.'
          : 'Scegli un modello e scrivi. Ollama gira sul PC, il tablet mostra solo la risposta.'));
      }
      for (var i = 0; i < st.saved.messages.length; i++) log.appendChild(bubble(st.saved.messages[i]));
      if (st.busy) {
        var t = el('div', 'msg assistant typing');
        t.innerHTML = '<i></i><i></i><i></i>';
        log.appendChild(t);
      }
      log.scrollTop = log.scrollHeight;
      D.toggleClass(send, 'busy', st.busy);
    }

    function submit() {
      var text = input.value.replace(/^\s+|\s+$/g, '');
      if (!text || st.busy) return;
      if (provider === 'ollama' && !(select.value)) { app.toast('Nessun modello Ollama disponibile', 'err'); return; }
      st.busy = true;
      D.addClass(send, 'busy');
      st.saved.messages.push({ role: 'user', text: text });
      input.value = '';
      input.blur();
      persist(); render();
      var body = { sessionId: st.saved.sessionId, text: text };
      if (provider === 'ollama') body.model = select.value;
      D.api.post('/api/' + provider + '/chat', body, function (err, r) {
        st.busy = false;
        D.removeClass(send, 'busy');
        if (err) {
          st.saved.messages.push({ role: 'assistant', text: err.message, error: true });
        } else {
          st.saved.sessionId = r.sessionId;
          st.saved.messages.push({ role: 'assistant', text: r.reply + (r.truncated ? '\n\n(risposta troncata)' : '') });
        }
        persist();
        if (st.render) st.render();
      }, 330000);
    }
    D.bindTap(send, { onTap: submit });

    function loadInfo() {
      if (provider === 'ollama') {
        D.api.get('/api/ollama/models', function (err, d) {
          select.innerHTML = '';
          if (err || !d.running) {
            setText(title, 'OLLAMA · offline');
            var o = el('option', '', 'Ollama non attivo');
            o.value = '';
            select.appendChild(o);
            return;
          }
          setText(title, 'OLLAMA');
          for (var i = 0; i < d.models.length; i++) {
            var opt = el('option', '', d.models[i].name + (d.models[i].sizeGb ? '  (' + d.models[i].sizeGb + ' GB)' : ''));
            opt.value = d.models[i].name;
            select.appendChild(opt);
          }
          var want = st.saved.model || d.defaultModel;
          for (var j = 0; j < select.options.length; j++) if (select.options[j].value === want) select.selectedIndex = j;
        }, 8000);
      } else {
        D.api.get('/api/claude/info', function (err, d) {
          if (err) return;
          setText(select, d.available ? (d.backend === 'cli' ? 'Claude Code' : d.model) : 'non configurato');
          if (!d.available && !st.saved.messages.length) {
            log.innerHTML = '';
            log.appendChild(el('div', 'empty err', d.hint));
          }
        });
      }
    }

    st.render = render;
    D.toggleClass(send, 'busy', st.busy);
    render();
    loadInfo();
    return {
      update: function () {},
      resize: function () { log.scrollTop = log.scrollHeight; },
      destroy: function () { if (st.render === render) st.render = null; }
    };
  }

  // ------------------------------------------------------------ CLOCK
  function clock(root) {
    D.addClass(root, 'w-clock');
    var t = el('div', 'clk-time', '');
    var d = el('div', 'clk-date', '');
    root.appendChild(t); root.appendChild(d);
    var DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
    var MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    function paint() {
      var n = new Date();
      setText(t, D.pad(n.getHours()) + ':' + D.pad(n.getMinutes()));
      setText(d, DAYS[n.getDay()] + ' ' + n.getDate() + ' ' + MONTHS[n.getMonth()]);
    }
    paint();
    var timer = setInterval(paint, 5000);
    return {
      update: function () {},
      resize: function (w, h) { t.style.fontSize = Math.round(Math.min(w / 3.2, h / 2.6)) + 'px'; },
      destroy: function () { clearInterval(timer); }
    };
  }

  var CHAT = {};
  var TYPES = { system: system, nowplaying: nowplaying, github: github, todo: todo, chat: chat, clock: clock };

  function create(type, root, tile, app) {
    var fn = TYPES[type];
    if (!fn) {
      root.appendChild(el('div', 'empty err', 'Widget sconosciuto: ' + type));
      return { update: function () {}, resize: function () {}, destroy: function () {} };
    }
    return fn(root, tile, app);
  }

  return { create: create, types: TYPES };
})();
