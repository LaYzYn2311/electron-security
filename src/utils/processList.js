const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('./platform');

/** { name, pid } for every currently-running process, cross-platform. */
async function listProcesses() {
  if (platform === 'win32') {
    const { stdout } = await execFileAsync('tasklist', ['/fo', 'csv', '/nh']);
    return stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const cols = line.split('","').map((c) => c.replace(/^"|"$/g, ''));
        return { name: cols[0], pid: Number(cols[1]) };
      });
  }
  const { stdout } = await execFileAsync('ps', ['-A', '-o', 'pid=,comm=']);
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\d+)\s+(.*)$/);
      return m ? { pid: Number(m[1]), name: m[2] } : null;
    })
    .filter(Boolean);
}

/** Plain list of currently-running process names (no PID/path), cross-platform. */
async function listProcessNames() {
  return (await listProcesses()).map((p) => p.name);
}

module.exports = { listProcessNames, listProcesses };
