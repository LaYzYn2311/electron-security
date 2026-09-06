const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');

/**
 * Creates a Windows System Restore point as an extra safety net on top of
 * the Safety Bin before a cleanup runs. Best-effort: Windows only allows one
 * restore point per 24h by default (SystemRestorePointCreationFrequency),
 * and it needs System Protection enabled on the system drive — both are
 * outside this app's control, so failures here are reported, never fatal to
 * the cleanup itself. The app doesn't request elevation by design (see
 * README), so this can also fail on a non-elevated run in some
 * configurations; that's surfaced honestly rather than silently retried.
 */
async function createRestorePoint(description) {
  if (platform !== 'win32') {
    return { created: false, reason: 'unsupported-platform' };
  }
  try {
    await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', `Checkpoint-Computer -Description ${JSON.stringify(description)} -RestorePointType "MODIFY_SETTINGS"`],
      { timeout: 30000 }
    );
    return { created: true };
  } catch (err) {
    return { created: false, reason: extractReason(err.message) };
  }
}

/** PowerShell errors come back as a multi-line dump; surface just the actual message. */
function extractReason(message) {
  const marker = message.indexOf('Checkpoint-Computer :');
  const tail = marker >= 0 ? message.slice(marker + 'Checkpoint-Computer :'.length) : message;
  const firstLine = tail.split(/\r?\n/).find((l) => l.trim().length > 0);
  return (firstLine || message).trim();
}

module.exports = { createRestorePoint };
