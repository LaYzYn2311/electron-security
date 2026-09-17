const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

// Get-SmbServerConfiguration works without elevation (unlike
// Get-WindowsOptionalFeature, which needs admin) — confirmed on a real test machine.
const SCRIPT = `(Get-SmbServerConfiguration -ErrorAction Stop).EnableSMB1Protocol`;

async function scanSmbv1(ctx) {
  if (platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { timeout: 10000 });
    const enabled = stdout.trim().toLowerCase() === 'true';
    if (enabled) return [{ id: 'smbv1_on', type: 'smbv1', severity: 'high', title: t(ctx.locale, 'smbv1.on_title'), detail: t(ctx.locale, 'smbv1.on_detail') }];
    return [{ id: 'smbv1_off', type: 'smbv1', severity: 'ok', title: t(ctx.locale, 'smbv1.off_title'), detail: '' }];
  } catch (err) {
    return [{ id: 'smbv1_unavailable', type: 'smbv1', severity: 'info', title: t(ctx.locale, 'smbv1.unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanSmbv1 };
