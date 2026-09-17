const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { listProcessNames } = require('../utils/processList');
const { t } = require('../i18n');

const SCRIPT = `
$accounts = Get-ChildItem "HKCU:\\Software\\Microsoft\\OneDrive\\Accounts" -ErrorAction SilentlyContinue
$configured = foreach ($a in $accounts) {
  $p = Get-ItemProperty -Path $a.PSPath -ErrorAction SilentlyContinue
  if ($p.UserFolder) { [PSCustomObject]@{ Name = $a.PSChildName; Folder = $p.UserFolder } }
}
@($configured) | ConvertTo-Json -Compress
`;

/**
 * Scoped to what's honestly checkable without parsing OneDrive's own
 * (fragile, version-dependent) sync-diagnostics log: whether an account is
 * configured at all, and whether the OneDrive process is actually running.
 * "Configured but not running" is exactly the false-sense-of-security case
 * worth flagging — files assumed backed up that haven't synced in a while.
 * Can't reliably tell "configured + running" apart from "configured +
 * running but paused", so that combination is reported as 'ok' rather than
 * a stronger claim this check can't actually verify.
 */
async function scanOnedriveSync(ctx) {
  if (platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { timeout: 10000, maxBuffer: 512 * 1024 });
    const trimmed = stdout.trim();
    let accounts = trimmed ? JSON.parse(trimmed) : [];
    if (!Array.isArray(accounts)) accounts = [accounts];

    if (accounts.length === 0) {
      return [{ id: 'onedrive_not_configured', type: 'onedrive_sync', severity: 'info', title: t(ctx.locale, 'onedrive.not_configured_title'), detail: '' }];
    }

    const names = await listProcessNames();
    const running = names.some((n) => /^onedrive/i.test(n));

    if (!running) {
      return [{ id: 'onedrive_not_running', type: 'onedrive_sync', severity: 'medium', title: t(ctx.locale, 'onedrive.not_running_title'), detail: t(ctx.locale, 'onedrive.not_running_detail') }];
    }
    return [{ id: 'onedrive_running', type: 'onedrive_sync', severity: 'ok', title: t(ctx.locale, 'onedrive.running_title', { count: accounts.length }), detail: '' }];
  } catch (err) {
    return [{ id: 'onedrive_unavailable', type: 'onedrive_sync', severity: 'info', title: t(ctx.locale, 'onedrive.unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanOnedriveSync };
