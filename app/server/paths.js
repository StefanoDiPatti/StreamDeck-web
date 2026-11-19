// Percorsi del progetto, in un solo posto.
const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  ROOT: ROOT,
  // DOCK_CONFIG_DIR: cartella di configurazione alternativa (prove e test)
  CONFIG_DIR: process.env.DOCK_CONFIG_DIR || path.join(ROOT, 'config'),
  DEFAULTS_DIR: path.join(ROOT, 'config', 'defaults'),
  // DOCK_DATA_DIR: cartella dati alternativa (i test non toccano quella vera)
  DATA_DIR: process.env.DOCK_DATA_DIR || path.join(ROOT, 'data'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  CONTROL_DIR: path.join(ROOT, 'control'),
  ENV_FILE: path.join(ROOT, '.env'),
  ENV_EXAMPLE: path.join(ROOT, '.env.example')
};
