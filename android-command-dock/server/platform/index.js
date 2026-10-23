// Sceglie il backend in base al sistema operativo. Il resto del server
// usa solo questa interfaccia, quindi è identico su Windows e Linux.
let impl;
if (process.platform === 'win32') impl = require('./windows');
else if (process.platform === 'linux') impl = require('./linux');
else {
  // macOS o altro: solo le funzioni che non dipendono dal sistema.
  const unsupported = function () { return Promise.reject(new Error('Funzione non supportata su ' + process.platform)); };
  impl = {
    name: process.platform,
    init: function () { return Promise.resolve(); },
    capabilities: function () { return { media: false, keys: false, text: false, focus: false, nowPlaying: false, art: false, notes: ['Sistema non supportato'] }; },
    media: unsupported, sendKeys: unsupported, typeText: unsupported, focus: unsupported,
    open: unsupported, launch: unsupported,
    nowPlaying: function () { return Promise.resolve({ supported: false }); },
    art: function () { return Promise.resolve(null); },
    netBytes: function () { return Promise.resolve(null); },
    cpuTemp: function () { return Promise.resolve(null); },
    gpuFallback: function () { return Promise.resolve(null); },
    shutdown: function () {}
  };
}

module.exports = impl;
