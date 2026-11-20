'use strict';
// Registra index.html (animazione web 1080x1920) in un mp4 verticale e in una GIF di anteprima per il README.
//
//   cd docs/video
//   npm install          (puppeteer-core e ffmpeg-static, solo per questa cartella)
//   npm run video        -> vibe-deck-verticale.mp4 + anteprima.gif
//   node render.js --still 2,6,10   -> fotogrammi singoli in stills/ (per controllare)
//
// Usa Edge, Chrome o Chromium già installati (BROWSER=percorso per sceglierne uno).
// Gli screenshot in shots/ vengono dalla demo con dati finti (npm run demo in app/).
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const puppeteer = require('puppeteer-core');
const ffmpeg = require('ffmpeg-static');

const FPS = 30;
const DIR = __dirname;
const MP4 = path.join(DIR, 'vibe-deck-verticale.mp4');
const GIF = path.join(DIR, 'anteprima.gif');

function findBrowser() {
  if (process.env.BROWSER) return process.env.BROWSER;
  const list = process.platform === 'win32' ? [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
  ] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return list.filter(function (p) { return fs.existsSync(p); })[0];
}

async function open() {
  const exe = findBrowser();
  if (!exe) throw new Error('Nessun browser trovato: installa Chrome o Edge, oppure BROWSER=percorso');
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.goto('file:///' + path.join(DIR, 'index.html').replace(/\\/g, '/') + '?render=1', { waitUntil: 'networkidle0' });
  await page.evaluate(async function () {
    await document.fonts.ready;
    await Promise.all(Array.prototype.map.call(document.images, function (i) { return i.decode().catch(function () {}); }));
  });
  return { browser, page, duration: await page.evaluate('window.DURATION') };
}

async function frame(page, t) {
  await page.evaluate(function (x) { window.render(x); }, t);
  return page.screenshot({ type: 'jpeg', quality: 93, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
}

async function stills(times) {
  const { browser, page } = await open();
  const out = path.join(DIR, 'stills');
  fs.mkdirSync(out, { recursive: true });
  for (const t of times) {
    fs.writeFileSync(path.join(out, 't' + String(t).replace('.', '_') + '.jpg'), await frame(page, t));
    console.log('ok  ' + t + 's');
  }
  await browser.close();
}

async function video() {
  const { browser, page, duration } = await open();
  const total = Math.round(duration * FPS);
  const enc = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', MP4], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise(function (ok, ko) { enc.on('close', function (c) { c === 0 ? ok() : ko(new Error('ffmpeg: ' + c)); }); });
  for (let i = 0; i < total; i++) {
    const buf = await frame(page, i / FPS);
    if (!enc.stdin.write(buf)) await new Promise(function (r) { enc.stdin.once('drain', r); });
    if (i % FPS === 0) process.stdout.write('\r' + Math.round(100 * i / total) + '%  ');
  }
  enc.stdin.end();
  await done;
  await browser.close();
  console.log('\rok  ' + path.relative(process.cwd(), MP4));
  // GIF leggera per il README (GitHub non riproduce gli mp4 della repo dentro la pagina)
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', MP4, '-vf',
    'fps=10,scale=300:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', GIF], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('GIF non creata');
  console.log('ok  ' + path.relative(process.cwd(), GIF));
}

const i = process.argv.indexOf('--still');
(i > 0 ? stills(String(process.argv[i + 1] || '2').split(',').map(Number)) : video()).catch(function (e) {
  console.error(e.message || e); process.exit(1);
});
