const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  backgroundScanEnabled: false,
  hasShownTrayHideNotice: false,
};

function settingsPath(userDataDir) {
  return path.join(userDataDir, 'settings.json');
}

function readSettings(userDataDir) {
  try {
    const raw = fs.readFileSync(settingsPath(userDataDir), 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeSettings(userDataDir, partial) {
  const current = readSettings(userDataDir);
  const next = { ...current, ...partial };
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(settingsPath(userDataDir), JSON.stringify(next, null, 2), 'utf8');
  } catch {
    /* best-effort — a failed write just means the toggle resets next launch */
  }
  return next;
}

module.exports = { readSettings, writeSettings };
