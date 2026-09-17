const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

const SCRIPT = `Get-LocalUser | Select-Object Name, Enabled, PasswordRequired | ConvertTo-Json -Compress`;

async function scanLocalAccounts(ctx) {
  if (platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { timeout: 10000, maxBuffer: 512 * 1024 });
    let users = JSON.parse(stdout.trim());
    if (!Array.isArray(users)) users = [users];

    const findings = [];
    const guest = users.find((u) => u.Name === 'Guest');
    if (guest?.Enabled) {
      findings.push({ id: 'account_guest_enabled', type: 'local_accounts', severity: 'high', title: t(ctx.locale, 'accounts.guest_enabled_title'), detail: t(ctx.locale, 'accounts.guest_enabled_detail') });
    }

    const blankPassword = users.filter((u) => u.Enabled && u.PasswordRequired === false && u.Name !== 'Guest');
    for (const u of blankPassword) {
      findings.push({ id: `account_blank_${u.Name}`, type: 'local_accounts', severity: 'critical', title: t(ctx.locale, 'accounts.blank_password_title', { name: u.Name }), detail: t(ctx.locale, 'accounts.blank_password_detail') });
    }

    if (findings.length === 0) {
      findings.push({ id: 'accounts_clean', type: 'local_accounts', severity: 'ok', title: t(ctx.locale, 'accounts.clean_title'), detail: '' });
    }
    return findings;
  } catch (err) {
    return [{ id: 'accounts_unavailable', type: 'local_accounts', severity: 'info', title: t(ctx.locale, 'accounts.unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanLocalAccounts };
