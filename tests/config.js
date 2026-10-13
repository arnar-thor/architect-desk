// Shared test settings. Override with environment variables.
const path = require('path'); const os = require('os');
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.AD_BASE || 'http://localhost:8601/';
module.exports = {
  ROOT, BASE, ORIGIN: new URL(BASE).origin,
  CHROME: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  OUT: process.env.AD_OUT || path.join(__dirname, 'output'),
  ELECTRON_EXE: process.env.AD_ELECTRON || path.join(ROOT, 'mac', 'out', "Architect's Desk-linux-x64", 'architects-desk'),
  TMP: os.tmpdir(),
};
