const fs = require('fs');
const path = require('path');

/** Appends one JSON line per action so cleanup history is auditable (never overwritten/rotated automatically). */
async function appendLog(logFilePath, entry) {
  await fs.promises.mkdir(path.dirname(logFilePath), { recursive: true });
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n';
  await fs.promises.appendFile(logFilePath, line, 'utf8');
}

async function readLog(logFilePath, { limit = 500 } = {}) {
  try {
    const raw = await fs.promises.readFile(logFilePath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    return [];
  }
}

module.exports = { appendLog, readLog };
