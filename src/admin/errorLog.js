const fs = require('fs');
const path = require('path');

let logFilePath = null;

function errorLogPath(userDataDir) {
  return path.join(userDataDir, 'error-log.jsonl');
}

async function appendError(entry) {
  if (!logFilePath) return;
  try {
    await fs.promises.mkdir(path.dirname(logFilePath), { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n';
    await fs.promises.appendFile(logFilePath, line, 'utf8');
  } catch {
    /* logging must never itself crash the app */
  }
}

/**
 * Catches whatever the main process would otherwise crash on (or silently
 * drop, for unhandled promise rejections) and appends it to a local JSONL
 * file — the closest thing this app has to a support/bug-report artifact.
 * Never sent anywhere; only the admin panel's log viewer reads it back.
 */
function installErrorLogger(userDataDir) {
  logFilePath = errorLogPath(userDataDir);
  process.on('uncaughtException', (err) => {
    appendError({ kind: 'uncaughtException', message: err.message, stack: err.stack });
  });
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    appendError({ kind: 'unhandledRejection', message: err.message, stack: err.stack });
  });
}

async function readErrorLog(userDataDir, { limit = 100 } = {}) {
  try {
    const raw = await fs.promises.readFile(errorLogPath(userDataDir), 'utf8');
    return raw.split('\n').filter(Boolean).slice(-limit).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean).reverse();
  } catch {
    return [];
  }
}

module.exports = { installErrorLogger, readErrorLog, appendError };
