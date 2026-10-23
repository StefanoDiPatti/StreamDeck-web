// Percorsi del progetto, in un solo posto.
const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  ROOT: ROOT,
  CONFIG_DIR: path.join(ROOT, 'config'),
  DEFAULTS_DIR: path.join(ROOT, 'config', 'defaults'),
  DATA_DIR: path.join(ROOT, 'data'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  ENV_FILE: path.join(ROOT, '.env'),
  ENV_EXAMPLE: path.join(ROOT, '.env.example')
};
