const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

async function readRegValue(keyPath, valueName) {
  const { stdout } = await execFileAsync('reg', ['query', keyPath, '/v', valueName]);
  const dword = stdout.match(/0x([0-9a-fA-F]+)/);
  if (dword) return parseInt(dword[1], 16);
  const str = stdout.match(new RegExp(`${valueName}\\s+REG_SZ\\s+(.+)`));
  return str ? str[1].trim() : null;
}

async function scanProxyHijack(ctx) {
  if (platform !== 'win32') return [];
  const keyPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
  try {
    const enabled = await readRegValue(keyPath, 'ProxyEnable');
    if (!enabled) return [{ id: 'proxy_off', type: 'proxy_hijack', severity: 'ok', title: t(ctx.locale, 'proxy.off_title'), detail: '' }];
    let server = null;
    try { server = await readRegValue(keyPath, 'ProxyServer'); } catch { /* not set */ }
    return [{ id: 'proxy_on', type: 'proxy_hijack', severity: 'medium', title: t(ctx.locale, 'proxy.on_title'), detail: t(ctx.locale, 'proxy.on_detail', { server: server || '?' }) }];
  } catch (err) {
    return [{ id: 'proxy_unavailable', type: 'proxy_hijack', severity: 'info', title: t(ctx.locale, 'proxy.unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanProxyHijack };
