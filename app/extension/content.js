// Ponte tra la pagina (page.js) e il service worker dell'estensione.
(function () {
  'use strict';
  function onMessage(e) {
    if (e.source !== window || !e.data || e.data.__dockBridge !== 'state') return;
    try {
      chrome.runtime.sendMessage({ type: 'state', state: e.data.state }, function (resp) {
        if (chrome.runtime.lastError || !resp) return;
        (resp.commands || []).forEach(function (c) {
          // chiudere la scheda lo può fare solo l'estensione, non la pagina
          if (c && c.type === 'close_tab') { chrome.runtime.sendMessage({ type: 'close_tab' }); return; }
          window.postMessage({ __dockBridge: 'cmd', cmd: c }, '*');
        });
      });
    } catch (err) {
      // Estensione aggiornata o ricaricata: questo ponte non serve più
      // (quello nuovo viene inserito dall'estensione stessa).
      window.removeEventListener('message', onMessage);
    }
  }
  window.addEventListener('message', onMessage);
})();
