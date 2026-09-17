const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

/**
 * Checks whether the system drive is encrypted (BitLocker on Pro/Enterprise,
 * "Device Encryption" on Home — both surface through the same WMI class).
 * Get-BitLockerVolume needs the BitLocker PowerShell module, which isn't
 * present on Windows Home; the WMI fallback (Win32_EncryptableVolume) works
 * on both editions since it's the same underlying mechanism Explorer's own
 * "Manage BitLocker" UI reads from.
 */
async function scanDiskEncryption(ctx) {
  if (platform !== 'win32') {
    return [{ id: 'encryption_unsupported', type: 'disk_encryption', severity: 'info', title: t(ctx.locale, 'encryption.unsupported_title'), detail: '' }];
  }

  const script = `
    $vol = Get-CimInstance -Namespace root/cimv2/security/MicrosoftVolumeEncryption -ClassName Win32_EncryptableVolume -Filter "DriveLetter='C:'" -ErrorAction Stop
    if ($vol) { [PSCustomObject]@{ status = $vol.ProtectionStatus; conversion = $vol.ConversionStatus } | ConvertTo-Json -Compress }
  `;
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10000 });
    const trimmed = stdout.trim();
    if (!trimmed) return [{ id: 'encryption_unavailable', type: 'disk_encryption', severity: 'info', title: t(ctx.locale, 'encryption.unavailable_title'), detail: '' }];
    const data = JSON.parse(trimmed);
    // ProtectionStatus: 0 = Unprotected, 1 = Protected, 2 = Unknown
    if (data.status === 1) {
      return [{ id: 'encryption_on', type: 'disk_encryption', severity: 'ok', title: t(ctx.locale, 'encryption.on_title'), detail: '' }];
    }
    if (data.status === 0) {
      return [{ id: 'encryption_off', type: 'disk_encryption', severity: 'medium', title: t(ctx.locale, 'encryption.off_title'), detail: t(ctx.locale, 'encryption.off_detail') }];
    }
    return [{ id: 'encryption_unknown', type: 'disk_encryption', severity: 'info', title: t(ctx.locale, 'encryption.unknown_title'), detail: '' }];
  } catch (err) {
    // Windows requires an elevated (Administrator) process to query this WMI
    // class at all — a plain user process gets "Access denied" even just to
    // read ProtectionStatus. Since the app deliberately never asks for
    // elevation, this is an expected, common outcome, not a real failure —
    // worth a specific, honest message instead of a generic "could not check".
    const needsAdmin = /access denied|0x80041003/i.test(err.message || '');
    return [{
      id: needsAdmin ? 'encryption_needs_admin' : 'encryption_unavailable',
      type: 'disk_encryption',
      severity: 'info',
      title: t(ctx.locale, needsAdmin ? 'encryption.needs_admin_title' : 'encryption.unavailable_title'),
      detail: needsAdmin ? t(ctx.locale, 'encryption.needs_admin_detail') : err.message,
    }];
  }
}

module.exports = { scanDiskEncryption };
