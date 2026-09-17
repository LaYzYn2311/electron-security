const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

/**
 * Windows requires kernel drivers to carry a valid digital signature by
 * default (driver signature enforcement) — a currently-*running* driver
 * whose signature is missing/invalid/tampered is a genuinely notable event:
 * either test-signing mode is on, or something loaded a driver through a
 * bypass. This is the same technique ("bring your own vulnerable driver")
 * used both by real malware/rootkits and by the more sophisticated class of
 * game cheats that need kernel access to hide from anti-cheat — so this
 * check is deliberately general rather than cheat-specific, and stays
 * useful regardless of what any particular cheat product is named this
 * month. See cheatDetection.js for the narrower, name-based companion check.
 */
const SCRIPT = `
$drivers = Get-CimInstance Win32_SystemDriver -ErrorAction Stop | Where-Object { $_.State -eq 'Running' -and $_.PathName }
$results = foreach ($d in $drivers) {
  $path = $d.PathName
  if ($path.StartsWith('\\SystemRoot\\')) { $path = Join-Path $env:SystemRoot $path.Substring(12) }
  elseif ($path.StartsWith('\\??\\')) { $path = $path.Substring(4) }
  $status = 'Unknown'
  try {
    $sig = Get-AuthenticodeSignature -LiteralPath $path -ErrorAction Stop
    $status = $sig.Status.ToString()
  } catch { $status = 'CheckFailed' }
  if ($status -ne 'Valid') {
    [PSCustomObject]@{ Name = $d.Name; DisplayName = $d.DisplayName; Path = $path; Status = $status }
  }
}
$results | ConvertTo-Json -Compress
`;

async function scanDriverInventory(ctx) {
  if (platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { timeout: 45000, maxBuffer: 4 * 1024 * 1024 });
    const trimmed = stdout.trim();
    if (!trimmed) {
      return [{ id: 'drivers_clean', type: 'driver_inventory', severity: 'ok', title: t(ctx.locale, 'drivers.clean_title'), detail: '' }];
    }
    let parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) parsed = [parsed];
    return parsed.map((d) => ({
      id: `driver_${d.Name}`,
      type: 'driver_inventory',
      severity: 'high',
      title: t(ctx.locale, 'drivers.unsigned_title', { name: d.DisplayName || d.Name }),
      detail: t(ctx.locale, 'drivers.unsigned_detail', { path: d.Path, status: d.Status }),
    }));
  } catch (err) {
    return [{ id: 'drivers_unavailable', type: 'driver_inventory', severity: 'info', title: t(ctx.locale, 'drivers.unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanDriverInventory };
