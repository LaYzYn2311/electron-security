const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

const SCRIPT = `
$p = Get-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -ErrorAction SilentlyContinue
[PSCustomObject]@{ Active = $p.ScreenSaveActive; Secure = $p.ScreenSaverIsSecure; Timeout = $p.ScreenSaveTimeOut } | ConvertTo-Json -Compress
`;

/**
 * Reads the classic screensaver-based lock mechanism only. Modern Windows
 * can also enforce a lock via Settings > Accounts > Sign-in options, which
 * isn't in these registry values — so this check is honestly scoped as one
 * signal, not a definitive "is this PC secure when idle" answer.
 */
async function scanScreenLock(ctx) {
  if (platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { timeout: 10000 });
    const data = JSON.parse(stdout.trim());
    if (data.Active !== '1') {
      return [{ id: 'screenlock_off', type: 'screen_lock', severity: 'low', title: t(ctx.locale, 'screenlock.off_title'), detail: t(ctx.locale, 'screenlock.off_detail') }];
    }
    if (data.Secure !== '1') {
      return [{ id: 'screenlock_insecure', type: 'screen_lock', severity: 'low', title: t(ctx.locale, 'screenlock.insecure_title'), detail: t(ctx.locale, 'screenlock.insecure_detail') }];
    }
    return [{ id: 'screenlock_ok', type: 'screen_lock', severity: 'ok', title: t(ctx.locale, 'screenlock.ok_title', { minutes: Math.round((Number(data.Timeout) || 0) / 60) }), detail: '' }];
  } catch (err) {
    return [{ id: 'screenlock_unavailable', type: 'screen_lock', severity: 'info', title: t(ctx.locale, 'screenlock.unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanScreenLock };
