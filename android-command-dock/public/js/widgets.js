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

  // Dettatura in un campo di testo, usata da Claude e TODO.
  // Ordine: riconoscimento vocale del browser > audio trascritto sul PC
  // (services.json -> voice) > microfono della tastiera di Android.
  // opts: { mic, input, app, serverVoice: function () -> bool, onText: function (testo) }
  function dictation(opts) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var mic = opts.mic, input = opts.input, app = opts.app, rec = null, listening = false;
    var fileIn = el('input', 'voice-file');
    fileIn.type = 'file';
    fileIn.setAttribute('accept', 'audio/*');
    fileIn.setAttribute('capture', 'microphone');
    mic.parentNode.appendChild(fileIn);

    function append(t) {
      t = String(t || '').replace(/^\s+|\s+$/g, '');
      if (!t) return;
      input.value = (input.value ? input.value.replace(/\s+$/, '') + ' ' : '') + t;
      if (opts.onText) opts.onText(t);
    }
    function stop() {
      if (rec && listening) { try { rec.stop(); } catch (e) { /* già fermo */ } }
      listening = false;
      D.removeClass(mic, 'on');
    }
    function startBrowser() {
      if (!rec) {
        rec = new SR();
        rec.lang = 'it-IT';
        rec.continuous = false;
        rec.interimResults = false;
        rec.onresult = function (e) {
          var t = '';
          for (var i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
          append(t);
        };
        rec.onerror = function (e) {
          stop();
          app.toast(e.error === 'not-allowed' ? 'Microfono non consentito dal browser' : 'Dettatura non riuscita: usa il microfono della tastiera', 'err');
        };
        rec.onend = function () { listening = false; D.removeClass(mic, 'on'); };
      }
      try { rec.start(); listening = true; D.addClass(mic, 'on'); } catch (e) { stop(); }
    }
    function upload(file) {
      var xhr = new XMLHttpRequest();
      D.addClass(mic, 'on');
      app.toast('Trascrivo sul PC…', 'info');
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        D.removeClass(mic, 'on');
        var d = null;
        try { d = JSON.parse(xhr.responseText); } catch (e) { d = null; }
        if (d && d.ok) append(d.data.text);
        else app.toast((d && d.error && d.error.message) || 'Trascrizione non riuscita', 'err');
      };
      xhr.open('POST', '/api/voice', true);
      var token = D.store.get('token', '');
      if (token) xhr.setRequestHeader('X-Dock-Token', token);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.send(file);
    }
    fileIn.addEventListener('change', function () {
      if (fileIn.files && fileIn.files[0]) upload(fileIn.files[0]);
      fileIn.value = '';
    }, false);
    D.bindTap(mic, {
      onTap: function () {
        if (listening) { stop(); return; }
        if (SR) { startBrowser(); return; }
        if (opts.serverVoice && opts.serverVoice()) { fileIn.click(); return; }
        input.focus();
        app.toast('Tocca il microfono sulla tastiera di Android per dettare', 'info');
      }
    });
    return { stop: stop };
  }

  // ------------------------------------------------------------ SYSTEM
  // Una riga per voce (etichetta, barra, valore): le 4 voci stanno anche in
  // un riquadro basso. Il testo si adatta all'altezza disponibile.
  function system(root) {
    D.addClass(root, 'w-system');
    var title = header(root, 'PC');
    var list = el('div', 'm-list');
    root.appendChild(list);
    var rows = {};
    var KEYS = ['cpu', 'gpu', 'ram', 'vram'];
    function row(key, label) {
      var r = el('div', 'metric' + (key === 'net' ? ' m-nobar' : ''));
      var l = el('span', 'm-label', label);
      var bar = el('div', 'bar');
      var fill = el('i', '');
      bar.appendChild(fill);
      var v = el('span', 'm-val', '—');
      r.appendChild(l); r.appendChild(bar); r.appendChild(v);
      list.appendChild(r);
      rows[key] = { row: r, val: v, fill: fill, bar: bar };
    }
    // la rete è nella barra in alto
    row('cpu', 'CPU'); row('gpu', 'GPU'); row('ram', 'RAM'); row('vram', 'VRAM');

    function set(key, value, pct, lvl) {
      var r = rows[key];
      setText(r.val, value);
      r.fill.style.width = (pct === null || pct === undefined ? 0 : Math.max(2, Math.min(100, pct))) + '%';
      r.bar.className = 'bar ' + (lvl || '');
    }
    function deg(t) { return t === null || t === undefined ? '' : ' · ' + t + '°'; }

    return {
      update: function (s) {
        var sys = s && s.system;
        if (!sys) return;
        setText(title, 'PC · ' + sys.hostname);
        var c = sys.cpu;
        set('cpu', (c.usage === null ? '…' : c.usage + '%') + deg(c.temp), c.usage, level(Math.max(c.usage || 0, c.temp ? c.temp - 15 : 0), 60, 85));
        var g = sys.gpu;
        if (g) {
          set('gpu', (g.usage === null ? 'N/D' : g.usage + '%') + deg(g.temp), g.usage, level(Math.max(g.usage || 0, g.temp ? g.temp - 10 : 0), 65, 85));
          var vpct = g.memUsedGb !== null && g.memTotalGb ? Math.round((g.memUsedGb / g.memTotalGb) * 100) : null;
          set('vram', g.memUsedGb !== null ? g.memUsedGb + '/' + g.memTotalGb + ' GB' : 'N/D', vpct, level(vpct, 75, 92));
        } else {
          set('gpu', 'N/D', null, '');
          set('vram', 'N/D', null, '');
        }
        set('ram', sys.ram.usage + '% · ' + sys.ram.usedGb + '/' + sys.ram.totalGb + ' GB', sys.ram.usage, level(sys.ram.usage, 75, 90));
      },
      resize: function (w, h) {
        // altezza di una riga = spazio disponibile / 5 (tra 24 e 56 px)
        var rh = Math.max(24, Math.min(56, Math.floor((h - 46) / KEYS.length)));
        var fs = Math.max(12, Math.min(18, Math.round(rh * 0.5)));
        list.style.fontSize = fs + 'px';
        var visible = Math.max(1, Math.min(KEYS.length, Math.floor((h - 46) / rh)));
        for (var i = 0; i < KEYS.length; i++) {
          rows[KEYS[i]].row.style.height = rows[KEYS[i]].row.style.lineHeight = rh + 'px';
          rows[KEYS[i]].row.style.display = i < visible ? '' : 'none';
        }
      },
      destroy: function () {}
    };
  }

  // ------------------------------------------------------------ NOW PLAYING
  // I comandi vanno all'app musicale attiva (Apple Music, YouTube, Spotify...),
  // il volume è quello dell'app, non di sistema.
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
    var seek = el('div', 'np-seek');
    var prog = el('div', 'np-prog'); var progFill = el('i', ''); prog.appendChild(progFill);
    seek.appendChild(prog);
    var times = el('div', 'np-times', '');
    var ctr = el('div', 'np-ctr');
    var ctr2 = el('div', 'np-ctr2');
    info.appendChild(src); info.appendChild(title); info.appendChild(artist);
    info.appendChild(seek); info.appendChild(times); info.appendChild(ctr2); info.appendChild(ctr);
    root.appendChild(art); root.appendChild(info);

    var cur = null, artKey = null, offset = 0, receivedAt = 0, timer = null, optimisticUntil = 0;
    img.onload = function () { img.style.display = 'block'; artPh.style.display = 'none'; };
    img.onerror = function () { img.style.display = 'none'; artPh.style.display = 'block'; };

    function send(c, value) {
      D.api.post('/api/media', { command: c, value: value }, function (err, r) {
        if (err) return app.toast(err.message, 'err');
        if (r && typeof r.volume === 'number' && cur) { cur.volume = r.volume; paintStatus(); }
      });
    }
    function cmd(c) {
      return function () {
        if (!cur) { app.toast('Nessun player musicale attivo', 'err'); return; }
        if (c === 'play_pause') {
          cur.position = position();
          receivedAt = new Date().getTime();
          cur.status = cur.status === 'playing' ? 'paused' : 'playing';
          optimisticUntil = receivedAt + 2500;
          paintStatus();
        }
        if ((c === 'shuffle' && !cur.canShuffle) || (c === 'repeat' && !cur.canRepeat)) {
          app.toast('Non disponibile per ' + (cur.appName || 'questa app'), 'err');
          return;
        }
        send(c);
      };
    }
    function ctrlBtn(parent, icon, c, cls, repeat, label) {
      var b = el('div', 'np-btn ' + (cls || ''));
      b.innerHTML = (Icons.html(icon) || D.esc(icon)) + (label ? '<span>' + D.esc(label) + '</span>' : '');
      D.bindTap(b, { onTap: cmd(c), repeat: !!repeat });
      parent.appendChild(b);
      return b;
    }
    var volDown = ctrlBtn(ctr, 'voldown', 'volume_down', 'np-vol', true);
    ctrlBtn(ctr, 'prev', 'previous');
    var playBtn = ctrlBtn(ctr, 'play', 'play_pause', 'np-play');
    ctrlBtn(ctr, 'next', 'next');
    var volUp = ctrlBtn(ctr, 'volup', 'volume_up', 'np-vol', true);
    var shufBtn = ctrlBtn(ctr2, 'shuffle', 'shuffle', 'np-opt', false, 'SHUFFLE');
    var repBtn = ctrlBtn(ctr2, 'repeat', 'repeat', 'np-opt', false, 'RIPETI');
    var muteBtn = ctrlBtn(ctr2, 'mute', 'mute', 'np-opt', false, 'MUTO');
    var volLabel = el('div', 'np-vollabel', '');
    ctr2.appendChild(volLabel);

    // Tocco sulla barra = salta a quel punto del brano
    D.bindTap(seek, {
      onTap: function (target, x) {
        if (!cur || !cur.canSeek || !cur.duration) return;
        var r = prog.getBoundingClientRect();
        var ratio = Math.max(0, Math.min(1, (x - r.left) / r.width));
        var t = Math.round(ratio * cur.duration);
        cur.position = t;
        receivedAt = new Date().getTime();
        paintProgress();
        send('seek', t);
      }
    });

    function position() {
      if (!cur || !cur.duration) return 0;
      var p = cur.position;
      if (cur.status === 'playing') p += Math.max(0, (new Date().getTime() - receivedAt) / 1000);
      return Math.min(p, cur.duration);
    }
    function paintProgress() {
      if (!cur || !cur.duration) { seek.style.visibility = 'hidden'; setText(times, ''); return; }
      seek.style.visibility = 'visible';
      D.toggleClass(seek, 'can', !!cur.canSeek);
      var p = position();
      progFill.style.width = (p / cur.duration * 100) + '%';
      setText(times, D.duration(p) + ' / ' + D.duration(cur.duration));
    }
    function paintStatus() {
      var playing = cur && cur.status === 'playing';
      playBtn.innerHTML = Icons.html(playing ? 'pause' : 'play') || (playing ? '||' : '>');
      var label = cur ? (cur.appName || '') + (cur.status === 'paused' ? ' · IN PAUSA' : cur.status === 'playing' ? ' · IN RIPRODUZIONE' : '') : '';
      setText(src, label.toUpperCase());
      var vol = cur && typeof cur.volume === 'number' ? Math.round(cur.volume * 100) : null;
      setText(volLabel, vol === null ? '' : (cur.muted ? 'MUTO' : 'VOL ' + vol + '%'));
      D.toggleClass(shufBtn, 'on', !!(cur && cur.shuffle));
      D.toggleClass(shufBtn, 'off', !(cur && cur.canShuffle));
      D.toggleClass(repBtn, 'on', !!(cur && cur.repeat && cur.repeat !== 'none'));
      D.toggleClass(repBtn, 'off', !(cur && cur.canRepeat));
      setText(repBtn.querySelector('span'), cur && cur.repeat === 'one' ? 'RIPETI 1' : 'RIPETI');
      D.toggleClass(muteBtn, 'on', !!(cur && cur.muted));
      var noVol = !(cur && cur.canVolume);
      D.toggleClass(volDown, 'off', noVol); D.toggleClass(volUp, 'off', noVol); D.toggleClass(muteBtn, 'off', noVol);
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
          setText(artist, m.bridge ? 'Avvia Apple Music, YouTube o Spotify sul PC' : 'Avvia la musica sul PC (per Apple Music web serve l\'estensione)');
        } else {
          var keep = cur && new Date().getTime() < optimisticUntil ? cur.status : null;
          cur = m;
          receivedAt = new Date().getTime();
          if (keep) cur.status = keep;
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
        var showArt = w > h * 1.15 && h > 110;
        var tall = h > 330;
        var size = showArt ? Math.min(h - pad * 2, w * 0.42) : 0;
        // In verticale servono ~280px sotto la copertina per testo e due file di tasti
        if (tall && showArt) size = Math.max(90, Math.min(w - pad * 2, h - 290));
        art.style.display = showArt ? 'block' : 'none';
        art.style.width = size + 'px'; art.style.height = size + 'px';
        // Pagina musica (alta): copertina sopra, testo sotto. Altrove: copertina a sinistra.
        if (tall && showArt) {
          art.style.left = Math.round((w - size) / 2) + 'px'; art.style.top = pad + 'px';
          info.style.left = pad + 'px'; info.style.top = (size + pad * 2) + 'px';
        } else {
          art.style.left = pad + 'px'; art.style.top = Math.round((h - size) / 2) + 'px';
          info.style.left = (showArt ? size + pad * 2 : pad) + 'px'; info.style.top = pad + 'px';
        }
        info.style.right = pad + 'px';
        D.toggleClass(root, 'np-tall', tall);
        D.toggleClass(root, 'np-compact', h <= 170);
        // shuffle / ripeti / muto solo dove c'è spazio (pagina MUSICA)
        ctr2.style.display = tall || (!showArt && h > 260) ? '' : 'none';
        var infoW = w - (showArt && !tall ? size + pad * 3 : pad * 2);
        volDown.style.display = volUp.style.display = infoW > 300 ? '' : 'none';
      },
      destroy: function () { clearInterval(timer); }
    };
  }

  // ------------------------------------------------------------ CODA / PLAYLIST
  function queue(root, tile, app) {
    D.addClass(root, 'w-queue');
    var title = header(root, 'IN CODA');
    var list = el('div', 'w-list scroll');
    root.appendChild(list);
    var lastKey = 'none', loading = false;

    function hint(text) {
      list.innerHTML = '';
      list.appendChild(el('div', 'empty', text));
    }
    function render(d) {
      list.innerHTML = '';
      if (!d.available || !d.items.length) {
        hint('La coda è disponibile per Apple Music, YouTube e YouTube Music nel browser, con l\'estensione Command Dock Bridge (vedi README).');
        return;
      }
      setText(title, 'IN CODA · ' + d.appName.toUpperCase());
      var currentRow = null;
      for (var i = 0; i < d.items.length; i++) (function (q) {
        var row = el('div', 'q-row' + (q.current ? ' current' : ''));
        row.innerHTML = '<div class="q-title">' + (q.current ? (Icons.html('play') || '> ') : '') + D.esc(q.title || '—') + '</div>' +
          '<div class="q-artist">' + D.esc(q.artist || '') + '</div>';
        D.bindTap(row, {
          scrollable: true,
          onTap: function () {
            if (q.current) return;
            D.addClass(row, 'busy');
            D.api.post('/api/media', { command: 'queue_play', value: q.index }, function (err) {
              D.removeClass(row, 'busy');
              if (err) app.toast(err.message, 'err');
              else lastKey = 'force';
            });
          }
        });
        list.appendChild(row);
        if (q.current) currentRow = row;
      })(d.items[i]);
      if (currentRow) list.scrollTop = Math.max(0, currentRow.offsetTop - 50);
    }
    function load() {
      if (loading) return;
      loading = true;
      D.api.get('/api/media/queue', function (err, d) {
        loading = false;
        if (err) return;
        render(d);
      });
    }
    return {
      update: function (s) {
        var m = s && s.media;
        var key = m && m.active && m.canQueue ? m.queueKey : null;
        if (key === lastKey) return;
        lastKey = key;
        if (!key) {
          setText(title, 'IN CODA');
          hint(m && m.active
            ? (m.appName || 'Questa app') + ' non espone la coda. È disponibile per Apple Music e YouTube nel browser con l\'estensione Command Dock Bridge.'
            : 'Niente in riproduzione.');
          return;
        }
        load();
      },
      resize: function () {},
      destroy: function () {}
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
  // Con le Memo di Windows ogni modifica chiude e riapre l'app Memo sul PC:
  // la risposta arriva dopo 1-2 secondi, intanto la riga si aggiorna subito.
  function todo(root, tile, app) {
    D.addClass(root, 'w-todo');
    var clearBtn = smallBtn('PULISCI', 'trash', function () {
      send('/api/todo/clear', {}, function (r) {
        app.toast(r.removed ? r.removed + ' completate rimosse' : 'Nessuna completata', 'ok');
      });
    });
    var title = header(root, 'TODO', clearBtn);
    var form = el('div', 'todo-form');
    var mic = el('div', 'todo-mic');
    mic.innerHTML = Icons.html('mic');
    var input = el('input', 'todo-input');
    input.type = 'text';
    input.placeholder = 'Nuova attività…';
    input.setAttribute('maxlength', '200');
    var addBtn = el('div', 'todo-add');
    addBtn.innerHTML = Icons.html('add') || '+';
    form.appendChild(mic); form.appendChild(input); form.appendChild(addBtn);
    var list = el('div', 'w-list scroll');
    root.appendChild(form); root.appendChild(list);
    var state = { items: [], notes: [], source: 'local', voiceServer: false };
    var target = D.store.get('todo:note', '');
    var busy = 0;

    dictation({ mic: mic, input: input, app: app, serverVoice: function () { return state.voiceServer; } });

    function targetNote() {
      for (var i = 0; i < state.notes.length; i++) if (state.notes[i].id === target) return state.notes[i];
      return state.notes[0] || null;
    }
    function render() {
      list.innerHTML = '';
      var open = 0, group = null, memo = state.source === 'memo';
      var tn = targetNote();
      var groups = memo && state.notes.length > 0;
      for (var i = 0; i < state.items.length; i++) {
        var it = state.items[i];
        if (!it.done) open++;
        if (groups && it.note !== group) {
          group = it.note;
          list.appendChild(groupRow(it.note, it.group, tn && tn.id === it.note));
        }
        var row = el('div', 'todo-row' + (it.done ? ' done' : '') + (it.priority === 'high' ? ' high' : ''));
        var text = D.esc(it.text);
        if (it.label && it.text.indexOf(it.label) === 0) text = '<b>' + D.esc(it.label) + '</b>' + D.esc(it.text.slice(it.label.length));
        row.innerHTML = '<span class="todo-box">' + (it.done ? Icons.html('check') || 'x' : '') + '</span>' +
          '<span class="todo-text">' + text + '</span>' +
          '<span class="todo-del">' + (Icons.html('close') || 'x') + '</span>';
        bindRow(row, it);
        list.appendChild(row);
      }
      // memo senza righe: mostra comunque il titolo per poterla scegliere
      if (groups) for (var n = 0; n < state.notes.length; n++) {
        var has = false;
        for (var j = 0; j < state.items.length; j++) if (state.items[j].note === state.notes[n].id) { has = true; break; }
        if (!has) list.appendChild(groupRow(state.notes[n].id, state.notes[n].title, tn && tn.id === state.notes[n].id));
      }
      setText(title, 'TODO' + (memo ? ' · MEMO' : '') + ' · ' + open + ' da fare');
      input.placeholder = memo && tn ? 'Aggiungi a ' + tn.title + '…' : 'Nuova attività…';
      if (!state.items.length && !groups) list.appendChild(el('div', 'empty', 'Nessuna attività'));
    }
    function groupRow(id, label, isTarget) {
      var g = el('div', 'todo-group' + (isTarget ? ' target' : ''));
      // con più memo il titolo evidenziato è quella in cui finiscono le nuove righe
      g.innerHTML = '<span>' + D.esc(label || 'Memo') + '</span>' + (isTarget && state.notes.length > 1 ? '<i>+ qui</i>' : '');
      if (state.notes.length > 1) {
        D.bindTap(g, {
          scrollable: true,
          onTap: function () { target = id; D.store.set('todo:note', id); render(); }
        });
      }
      return g;
    }
    function bindRow(row, it) {
      D.bindTap(row, {
        scrollable: true,
        onTap: function (t) {
          var del = D.closestClass(t, 'todo-del', row);
          if (del) { D.addClass(row, 'busy'); send('/api/todo/remove', { id: it.id }); return; }
          it.done = !it.done; // subito sul tablet, poi conferma dal PC
          D.toggleClass(row, 'done', it.done);
          D.addClass(row, 'busy');
          send('/api/todo/toggle', { id: it.id });
        }
      });
    }
    // Invia una modifica e ridisegna con la lista aggiornata restituita dal server.
    function send(url, body, done) {
      busy++;
      D.addClass(root, 'todo-busy');
      D.api.post(url, body, function (err, r) {
        busy--;
        if (!busy) D.removeClass(root, 'todo-busy');
        if (err) { app.toast(err.message, 'err'); load(); return; }
        apply(r);
        if (done) done(r);
      }, 20000);
    }
    function apply(d) {
      state.items = d.items || [];
      state.notes = d.notes || [];
      state.source = d.source || 'local';
      state.voiceServer = !!d.voiceServer;
      render();
    }
    function add() {
      var text = input.value.replace(/^\s+|\s+$/g, '');
      if (!text) { input.focus(); return; }
      var tn = targetNote();
      input.value = '';
      input.blur();
      send('/api/todo/add', { text: text, note: tn ? tn.id : '' }, function () {
        app.toast(state.source === 'memo' && tn ? 'Aggiunta a ' + tn.title : 'Aggiunta', 'ok');
      });
    }
    D.bindTap(addBtn, { onTap: add });
    input.addEventListener('keydown', function (e) { if (e.keyCode === 13) { e.preventDefault(); add(); } }, false);
    function load() {
      if (busy) return;
      D.api.get('/api/todo', function (err, d) {
        if (err || busy) return;
        apply(d);
      });
    }
    load();
    // le modifiche fatte sul PC compaiono entro qualche secondo
    var timer = setInterval(load, 10000);
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

  // ------------------------------------------------------------ CLAUDE
  // Elenco chat (della dock e sessioni di Claude Code del PC), conversazione,
  // dettatura vocale e modalità "scrivi sul PC" (tablet come tastiera remota).
  var CL = { mode: D.store.get('cl:mode', 'dock'), sel: D.store.get('cl:sel', null), jobs: {}, info: null };

  function claudeWidget(root, tile, app) {
    D.addClass(root, 'w-claude');
    root.innerHTML =
      '<div class="cl-side">' +
        '<div class="cl-tabs"><div class="cl-tab" data-mode="dock">CHAT</div><div class="cl-tab" data-mode="code">CLAUDE CODE</div></div>' +
        '<div class="cl-new">' + Icons.html('add') + '<span>NUOVA</span></div>' +
        '<div class="cl-list scroll"></div>' +
      '</div>' +
      '<div class="cl-main">' +
        '<div class="cl-head"><div class="cl-title"></div><div class="cl-sub"></div>' +
          '<div class="cl-tools"><div class="sbtn cl-refresh">' + Icons.html('refresh') + '</div><div class="sbtn cl-del">' + Icons.html('trash') + '</div></div></div>' +
        '<div class="cl-log scroll"></div>' +
        '<div class="cl-compose">' +
          '<div class="cl-bar">' +
            '<div class="cl-dest on" data-dest="claude">' + Icons.html('sparkle') + '<span>A CLAUDE</span></div>' +
            '<div class="cl-dest" data-dest="pc">' + Icons.html('keyboard') + '<span>SCRIVI SUL PC</span></div>' +
            '<select class="cl-target"></select>' +
            '<select class="cl-project"></select>' +
            '<div class="cl-enter on">INVIO ↵</div>' +
          '</div>' +
          '<div class="cl-mic">' + Icons.html('mic') + '</div>' +
          '<textarea class="cl-input" rows="2"></textarea>' +
          '<div class="cl-send">' + Icons.html('send') + '</div>' +
        '</div>' +
      '</div>';

    function q(cls) { return root.querySelector('.' + cls); }
    var list = q('cl-list'), log = q('cl-log'), input = q('cl-input'), send = q('cl-send'), mic = q('cl-mic');
    var titleEl = q('cl-title'), subEl = q('cl-sub'), del = q('cl-del'), targetSel = q('cl-target'), projSel = q('cl-project');
    var enterBtn = q('cl-enter');
    var tabs = root.querySelectorAll('.cl-tab'), dests = root.querySelectorAll('.cl-dest');
    var data = null, chat = null, dest = 'claude', sendEnter = true, alive = true, pollTimer = null;

    function persist() { D.store.set('cl:mode', CL.mode); D.store.set('cl:sel', CL.sel); }

    // ---- elenco
    function renderList() {
      for (var t = 0; t < tabs.length; t++) D.toggleClass(tabs[t], 'on', tabs[t].getAttribute('data-mode') === CL.mode);
      list.innerHTML = '';
      if (!data) return;
      var items = CL.mode === 'dock' ? data.dock : data.code;
      if (!items.length) {
        list.appendChild(el('div', 'empty', CL.mode === 'dock' ? 'Nessuna chat. Premi NUOVA.' : 'Nessuna sessione di Claude Code trovata sul PC.'));
      }
      for (var i = 0; i < items.length; i++) (function (it) {
        var row = el('div', 'cl-row' + (CL.sel && CL.sel.id === it.id ? ' on' : '') + (it.busy ? ' busy' : ''));
        row.innerHTML = '<div class="cl-row-t">' + D.esc(it.title) + '</div>' +
          '<div class="cl-row-m">' + D.esc((it.project ? it.project + ' · ' : '') + D.ago(new Date(it.updatedAt).toISOString())) +
          (it.busy ? ' · al lavoro…' : '') + '</div>';
        D.bindTap(row, { scrollable: true, onTap: function () { select({ kind: CL.mode, id: it.id }); } });
        list.appendChild(row);
      })(items[i]);
      // progetti per una nuova sessione di Claude Code
      projSel.innerHTML = '';
      for (var p = 0; p < data.projects.length; p++) {
        var o = el('option', '', data.projects[p].name);
        o.value = data.projects[p].cwd;
        projSel.appendChild(o);
      }
      var lastProj = D.store.get('cl:proj', '');
      for (var k = 0; k < projSel.options.length; k++) if (projSel.options[k].value === lastProj) projSel.selectedIndex = k;
    }
    function loadList() {
      D.api.get('/api/claude/chats', function (err, d) {
        if (err || !alive) return;
        data = d;
        renderList();
      }, 15000);
    }

    // ---- conversazione
    function bubbleHtml(m) {
      if (m.role === 'user') return D.esc(m.text).replace(/\n/g, '<br>');
      return D.richText(m.text).replace(/(^|<br>)\[ ([^\]<]{1,80}) \](?=<br>|$)/g, '$1<span class="tool">$2</span>');
    }
    function renderChat() {
      log.innerHTML = '';
      var isNew = !CL.sel;
      D.toggleClass(root, 'cl-newcode', isNew && CL.mode === 'code' && dest === 'claude');
      if (isNew) {
        setText(titleEl, CL.mode === 'dock' ? 'Nuova chat' : 'Nuova sessione di Claude Code');
        setText(subEl, CL.mode === 'dock'
          ? (CL.info && CL.info.available ? (CL.info.backend === 'api' ? 'Claude API · ' + CL.info.model : 'Claude Code (il tuo abbonamento)') : 'Claude non configurato')
          : 'Scegli il progetto qui sotto: Claude Code lavorerà in quella cartella');
        del.style.display = 'none';
        var pending = CL.jobs[CL.mode + ':new'];
        if (pending && CL.pendingText) {
          var u = el('div', 'msg user');
          u.innerHTML = D.esc(CL.pendingText).replace(/\n/g, '<br>');
          log.appendChild(u);
          var w = el('div', 'msg assistant typing');
          w.innerHTML = '<i></i><i></i><i></i>' + (pending.elapsed ? '<span class="cl-elapsed">' + pending.elapsed + 's</span>' : '');
          log.appendChild(w);
          return;
        }
        log.appendChild(el('div', 'empty', CL.mode === 'dock'
          ? 'Scrivi o detta un messaggio. Con "SCRIVI SUL PC" il testo viene digitato nella finestra scelta, come da una tastiera.'
          : 'Puoi anche aprire una sessione esistente dall\'elenco e continuarla dal tablet.'));
        return;
      }
      if (!chat) { log.appendChild(el('div', 'empty', 'Caricamento…')); return; }
      setText(titleEl, chat.title);
      setText(subEl, chat.subtitle || '');
      del.style.display = chat.kind === 'dock' ? '' : 'none';
      for (var i = 0; i < chat.messages.length; i++) {
        var m = chat.messages[i];
        var b = el('div', 'msg ' + m.role + (m.error ? ' error' : ''));
        b.innerHTML = bubbleHtml(m);
        log.appendChild(b);
      }
      var job = CL.jobs[CL.sel.kind + ':' + CL.sel.id];
      if (chat.busy || job) {
        var t = el('div', 'msg assistant typing');
        t.innerHTML = '<i></i><i></i><i></i>' + (job && job.elapsed ? '<span class="cl-elapsed">' + job.elapsed + 's</span>' : '');
        log.appendChild(t);
      }
      if (chat.kind === 'code' && chat.canSend === false) log.appendChild(el('div', 'empty err', 'La cartella di questa sessione non esiste più: si può solo leggere.'));
      log.scrollTop = log.scrollHeight;
    }
    function loadChat() {
      if (!CL.sel) { chat = null; renderChat(); return; }
      var sel = CL.sel;
      D.api.get('/api/claude/chat?kind=' + encodeURIComponent(sel.kind) + '&id=' + encodeURIComponent(sel.id), function (err, d) {
        if (!alive || CL.sel !== sel) return;
        if (err) { chat = null; CL.sel = null; persist(); renderChat(); app.toast(err.message, 'err'); return; }
        chat = d;
        renderChat();
      }, 15000);
    }
    function select(sel) {
      CL.sel = sel;
      if (sel) CL.mode = sel.kind;
      chat = null;
      persist();
      renderList();
      renderChat();
      loadChat();
    }

    // ---- invio
    function watchJob(key, jobId) {
      CL.jobs[key] = { id: jobId, elapsed: 0 };
      renderChat();
    }
    function poll() {
      var keys = [];
      for (var k in CL.jobs) if (CL.jobs.hasOwnProperty(k)) keys.push(k);
      for (var i = 0; i < keys.length; i++) (function (key) {
        var j = CL.jobs[key];
        D.api.get('/api/claude/job?id=' + j.id, function (err, r) {
          if (!alive) return;
          if (err) { delete CL.jobs[key]; return; }
          j.elapsed = r.elapsed;
          if (r.status === 'running') {
            if (CL.sel ? key === CL.sel.kind + ':' + CL.sel.id : key === CL.mode + ':new') renderChat();
            return;
          }
          delete CL.jobs[key];
          if (r.status === 'error') app.toast(r.error, 'err');
          // Claude Code può restituire un nuovo id di sessione: si passa a quello
          // se l'utente sta ancora guardando quella conversazione.
          var watching = CL.sel ? key === 'code:' + CL.sel.id : (key === 'code:new' && CL.mode === 'code');
          if (r.kind === 'code' && r.chatId && watching) {
            CL.sel = { kind: 'code', id: r.chatId };
            persist();
          }
          if (key === 'code:new') CL.pendingText = null;
          loadList();
          loadChat();
        });
      })(keys[i]);
    }
    function sendToClaude(text) {
      var body = { kind: CL.mode, id: CL.sel ? CL.sel.id : null, text: text };
      if (!CL.sel && CL.mode === 'code') {
        if (!projSel.value) { app.toast('Scegli un progetto', 'err'); return false; }
        body.cwd = projSel.value;
        D.store.set('cl:proj', projSel.value);
      }
      D.addClass(send, 'busy');
      D.api.post('/api/claude/send', body, function (err, r) {
        D.removeClass(send, 'busy');
        if (err) { app.toast(err.message, 'err'); input.value = text; return; }
        var key = r.kind + ':' + (r.chatId || 'new');
        if (!CL.sel || CL.sel.id !== r.chatId) {
          CL.sel = r.chatId ? { kind: r.kind, id: r.chatId } : null;
          persist();
        }
        if (chat && CL.sel) chat.messages.push({ role: 'user', text: text });
        if (!CL.sel) CL.pendingText = text;
        watchJob(key, r.jobId);
        loadList();
        if (CL.sel) loadChat();
      }, 20000);
      return true;
    }
    function sendToPc(text) {
      var focus = targetSel.value;
      D.addClass(send, 'busy');
      D.api.post('/api/remote/type', { text: text, focus: focus, enter: sendEnter }, function (err, r) {
        D.removeClass(send, 'busy');
        if (err) { app.toast(err.message, 'err'); input.value = text; return; }
        app.toast(r.message, 'ok');
      }, 20000);
      return true;
    }
    function submit() {
      var text = input.value.replace(/^\s+|\s+$/g, '');
      if (!text) { input.focus(); return; }
      stopListening();
      input.value = '';
      input.blur();
      if (dest === 'pc') sendToPc(text); else sendToClaude(text);
    }

    // ---- voce
    var voice = dictation({ mic: mic, input: input, app: app, serverVoice: function () { return !!(CL.info && CL.info.voiceServer); } });
    function stopListening() { voice.stop(); }

    // ---- controlli
    for (var t = 0; t < tabs.length; t++) (function (tab) {
      D.bindTap(tab, { onTap: function () { CL.mode = tab.getAttribute('data-mode'); CL.sel = null; chat = null; persist(); renderList(); renderChat(); } });
    })(tabs[t]);
    for (var d2 = 0; d2 < dests.length; d2++) (function (b) {
      D.bindTap(b, {
        onTap: function () {
          dest = b.getAttribute('data-dest');
          for (var i = 0; i < dests.length; i++) D.toggleClass(dests[i], 'on', dests[i] === b);
          D.toggleClass(root, 'cl-pc', dest === 'pc');
          input.placeholder = dest === 'pc' ? 'Testo da scrivere sul PC…' : 'Scrivi o detta a Claude…';
          renderChat();
        }
      });
    })(dests[d2]);
    D.bindTap(enterBtn, { onTap: function () { sendEnter = !sendEnter; D.toggleClass(enterBtn, 'on', sendEnter); } });
    D.bindTap(q('cl-new'), { onTap: function () { select(null); input.focus(); } });
    D.bindTap(q('cl-refresh'), { onTap: function () { loadList(); loadChat(); } });
    D.bindTap(del, {
      hold: 900,
      onTap: function () {
        if (!CL.sel || CL.sel.kind !== 'dock') return;
        D.api.post('/api/claude/delete', { id: CL.sel.id }, function (err) {
          if (err) return app.toast(err.message, 'err');
          app.toast('Chat eliminata', 'ok');
          select(null);
          loadList();
        });
      }
    });
    D.bindTap(send, { onTap: submit });
    input.placeholder = 'Scrivi o detta a Claude…';

    D.api.get('/api/claude/info', function (err, inf) {
      if (err || !alive) return;
      CL.info = inf;
      targetSel.innerHTML = '';
      for (var i = 0; i < inf.remoteTargets.length; i++) {
        var o = el('option', '', inf.remoteTargets[i].label);
        o.value = inf.remoteTargets[i].focus;
        targetSel.appendChild(o);
      }
      if (!CL.sel) renderChat();
    });
    renderList();
    renderChat();
    loadList();
    loadChat();
    pollTimer = setInterval(poll, 2500);
    var listTimer = setInterval(loadList, 30000);

    return {
      update: function () {},
      resize: function () { log.scrollTop = log.scrollHeight; },
      destroy: function () { alive = false; stopListening(); clearInterval(pollTimer); clearInterval(listTimer); }
    };
  }

  var CHAT = {};
  var TYPES = { system: system, nowplaying: nowplaying, queue: queue, github: github, todo: todo, chat: chat, clock: clock, claude: claudeWidget };

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
