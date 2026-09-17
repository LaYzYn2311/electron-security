const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

async function readDword(hive, keyPath, valueName) {
  const { stdout } = await execFileAsync('reg', ['query', `${hive}\\${keyPath}`, '/v', valueName]);
  const match = stdout.match(/0x([0-9a-fA-F]+)/);
  return match ? parseInt(match[1], 16) : null;
}

async function scanRdp(ctx) {
  if (platform !== 'win32') return [];
  try {
    // fDenyTSConnections: 1 = RDP disabled (default, secure), 0 = RDP enabled.
    const value = await readDword('HKLM', 'System\\CurrentControlSet\\Control\\Terminal Server', 'fDenyTSConnections');
    if (value === 1) return [{ id: 'rdp_off', type: 'rdp', severity: 'ok', title: t(ctx.locale, 'rdp.off_title'), detail: '' }];
    if (value === 0) return [{ id: 'rdp_on', type: 'rdp', severity: 'medium', title: t(ctx.locale, 'rdp.on_title'), detail: t(ctx.locale, 'rdp.on_detail') }];
    return [{ id: 'rdp_unknown', type: 'rdp', severity: 'info', title: t(ctx.locale, 'rdp.unknown_title'), detail: '' }];
  } catch (err) {
    return [{ id: 'rdp_unavailable', type: 'rdp', severity: 'info', title: t(ctx.locale, 'rdp.unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanRdp };
