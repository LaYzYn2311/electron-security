const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

/**
 * Reads two well-documented, stable Windows privacy switches straight from
 * the registry — no PowerShell privacy/telemetry module needed. Both are
 * per-user or machine policy values that have kept the same name/location
 * since Windows 10 and are still honored on 11:
 *  - Advertising ID (HKCU AdvertisingInfo\Enabled)
 *  - Diagnostic data level (HKLM Policies\DataCollection\AllowTelemetry)
 * Deliberately doesn't attempt Activity History / Timeline — the reliable
 * registry location for that varies enough across Windows builds that a
 * wrong answer would be worse than not checking it at all.
 */
async function readRegistryDword(hive, keyPath, valueName) {
  const { stdout } = await execFileAsync('reg', ['query', `${hive}\\${keyPath}`, '/v', valueName]);
  const match = stdout.match(/0x([0-9a-fA-F]+)/);
  if (!match) return null;
  return parseInt(match[1], 16);
}

async function scanPrivacySettings(ctx) {
  if (platform !== 'win32') {
    return [{ id: 'privacy_unsupported', type: 'privacy_settings', severity: 'info', title: t(ctx.locale, 'privacy.unsupported_title'), detail: '' }];
  }

  const findings = [];

  try {
    const value = await readRegistryDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', 'Enabled');
    if (value === null) {
      findings.push({ id: 'privacy_adid_unknown', type: 'privacy_settings', severity: 'info', title: t(ctx.locale, 'privacy.adid_unknown_title'), detail: '' });
    } else if (value === 0) {
      findings.push({ id: 'privacy_adid_off', type: 'privacy_settings', severity: 'ok', title: t(ctx.locale, 'privacy.adid_off_title'), detail: '' });
    } else {
      findings.push({ id: 'privacy_adid_on', type: 'privacy_settings', severity: 'low', title: t(ctx.locale, 'privacy.adid_on_title'), detail: t(ctx.locale, 'privacy.adid_on_detail') });
    }
  } catch {
    findings.push({ id: 'privacy_adid_unknown', type: 'privacy_settings', severity: 'info', title: t(ctx.locale, 'privacy.adid_unknown_title'), detail: '' });
  }

  try {
    const value = await readRegistryDword('HKLM', 'Software\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry');
    if (value === null) throw new Error('not set');
    // 0 = Security/Off (Enterprise only), 1 = Basic/Required, 2 = Enhanced, 3 = Full/Optional
    if (value <= 1) {
      findings.push({ id: 'privacy_telemetry_low', type: 'privacy_settings', severity: 'ok', title: t(ctx.locale, 'privacy.telemetry_low_title'), detail: '' });
    } else {
      findings.push({ id: 'privacy_telemetry_high', type: 'privacy_settings', severity: 'low', title: t(ctx.locale, 'privacy.telemetry_high_title', { level: value }), detail: t(ctx.locale, 'privacy.telemetry_high_detail') });
    }
  } catch {
    // Not set = Windows default (Diagnostic Data Off / Required diagnostic data on Win11) — informational only, not a policy violation.
    findings.push({ id: 'privacy_telemetry_default', type: 'privacy_settings', severity: 'info', title: t(ctx.locale, 'privacy.telemetry_default_title'), detail: '' });
  }

  return findings;
}

module.exports = { scanPrivacySettings };
