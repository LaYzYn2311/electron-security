const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { listBatches } = require('../cleanup/quarantine');
const { readLog } = require('../cleanup/cleanupLog');

const appStartedAt = Date.now();

async function dirSize(dir) {
  let total = 0;
  let count = 0;
  async function walk(d) {
    let entries;
    try {
      entries = await fs.promises.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else {
        try {
          const stat = await fs.promises.lstat(full);
          total += stat.size;
          count += 1;
        } catch { /* gone mid-walk */ }
      }
    }
  }
  await walk(dir);
  return { bytes: total, count };
}

async function freeDiskSpace() {
  try {
    if (platform === 'win32') {
      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        "Get-PSDrive -Name (Get-Location).Drive.Name | Select-Object Used,Free | ConvertTo-Json -Compress",
      ]);
      const data = JSON.parse(stdout.trim());
      return { freeBytes: data.Free, usedBytes: data.Used };
    }
  } catch {
    /* best-effort only */
  }
  return null;
}

/**
 * Local, on-this-machine app health — version info, resource usage, and
 * a snapshot of what the app itself has accumulated (quarantine, logs).
 * Nothing here ever leaves the machine.
 */
async function collectDiagnostics({ app, userDataPaths }) {
  const { quarantineRoot, logFile } = userDataPaths();

  const [batches, log, quarantineDirSize, diskSpace] = await Promise.all([
    listBatches({ quarantineRoot }).catch(() => []),
    readLog(logFile).catch(() => []),
    dirSize(quarantineRoot).catch(() => ({ bytes: 0, count: 0 })),
    freeDiskSpace(),
  ]);

  let logFileSize = 0;
  try {
    logFileSize = (await fs.promises.stat(logFile)).size;
  } catch { /* not created yet */ }

  return {
    app: {
      version: app.getVersion(),
      name: app.getName(),
      isPackaged: app.isPackaged,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      uptimeMs: Date.now() - appStartedAt,
    },
    system: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      totalMemBytes: os.totalmem(),
      freeMemBytes: os.freemem(),
      cpuModel: os.cpus()[0]?.model || 'unknown',
      cpuCount: os.cpus().length,
    },
    paths: {
      userData: app.getPath('userData'),
      quarantineRoot,
      logFile,
    },
    quarantine: {
      batchCount: batches.length,
      pendingItemCount: batches.reduce((s, b) => s + b.itemCount, 0),
      diskBytes: quarantineDirSize.bytes,
      diskFileCount: quarantineDirSize.count,
    },
    cleanupLog: {
      entryCount: log.length,
      fileSizeBytes: logFileSize,
      lastEntryAt: log.length ? log[0].timestamp : null,
    },
    disk: diskSpace,
  };
}

module.exports = { collectDiagnostics };
