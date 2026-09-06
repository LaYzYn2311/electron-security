const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

async function scanFirewall(ctx) {
  try {
    if (platform === 'darwin') {
      const { stdout } = await execFileAsync('/usr/libexec/ApplicationFirewall/socketfilterfw', ['--getglobalstate']);
      const enabled = /enabled/i.test(stdout) && !/disabled/i.test(stdout);
      return [firewallFinding(enabled, ctx.locale)];
    }

    if (platform === 'win32') {
      const { stdout } = await execFileAsync('netsh', ['advfirewall', 'show', 'allprofiles', 'state']);
      const enabled = /State\s+ON/i.test(stdout);
      const anyOff = /State\s+OFF/i.test(stdout);
      return [firewallFinding(enabled && !anyOff, ctx.locale)];
    }

    // linux: try ufw first, then firewalld
    try {
      const { stdout } = await execFileAsync('ufw', ['status']);
      const enabled = /Status:\s*active/i.test(stdout);
      return [firewallFinding(enabled, ctx.locale)];
    } catch {
      try {
        const { stdout } = await execFileAsync('firewall-cmd', ['--state']);
        const enabled = /running/i.test(stdout);
        return [firewallFinding(enabled, ctx.locale)];
      } catch {
        return [
          {
            id: 'firewall_unknown',
            type: 'firewall',
            severity: 'info',
            title: t(ctx.locale, 'firewall.unknown_title'),
            detail: t(ctx.locale, 'firewall.unknown_detail'),
          },
        ];
      }
    }
  } catch (err) {
    return [
      {
        id: 'firewall_check_failed',
        type: 'firewall',
        severity: 'info',
        title: t(ctx.locale, 'firewall.failed_title'),
        detail: err.message,
      },
    ];
  }
}

function firewallFinding(enabled, locale) {
  return enabled
    ? {
        id: 'firewall_status',
        type: 'firewall',
        severity: 'ok',
        title: t(locale, 'firewall.enabled_title'),
        detail: '',
      }
    : {
        id: 'firewall_status',
        type: 'firewall',
        severity: 'high',
        title: t(locale, 'firewall.disabled_title'),
        detail: t(locale, 'firewall.disabled_detail'),
      };
}

module.exports = { scanFirewall };
