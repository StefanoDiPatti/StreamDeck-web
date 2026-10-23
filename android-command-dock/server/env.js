// Mini loader per il file .env (evita la dipendenza da dotenv).
// Non sovrascrive variabili già presenti nell'ambiente.
const fs = require('fs');
const paths = require('./paths');

function parseEnv(text) {
  const out = {};
  text.split(/\r?\n/).forEach(function (line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] === '#') return;
    const eq = trimmed.indexOf('=');
    if (eq < 1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value[0] === '"' && value[value.length - 1] === '"') ||
        (value[0] === "'" && value[value.length - 1] === "'")) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  });
  return out;
}

function loadEnv(file) {
  file = file || paths.ENV_FILE;
  if (!fs.existsSync(file)) return {};
  const parsed = parseEnv(fs.readFileSync(file, 'utf8'));
  Object.keys(parsed).forEach(function (key) {
    if (process.env[key] === undefined) process.env[key] = parsed[key];
  });
  return parsed;
}

module.exports = { parseEnv: parseEnv, loadEnv: loadEnv };
