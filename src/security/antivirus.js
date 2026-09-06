const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

/**
 * Checks Windows Security Center for a registered, active antivirus
 * product. Uses root/SecurityCenter2 (not Get-MpComputerStatus) because
 * that reports whichever AV is actually registered with Windows — including
 * third-party products that legitimately disable Windows Defender's own
 * real-time module when they take over, which Get-MpComputerStatus alone
 * would misreport as "protection off".
 *
 * productState is a packed value Windows itself doesn't document; the
 * decode below (the second hex byte: 11/01 = on, 10/00 = off) is the
 * commonly-used community decode, not an official API — when it doesn't
 * match a known pattern we report the product name without claiming a
 * status, rather than guessing.
 */
async function scanAntivirus(ctx) {
  if (platform !== 'win32') {
    return [
      {
        id: 'antivirus_unsupported',
        type: 'antivirus_status',
        severity: 'info',
        title: t(ctx.locale, 'av.unsupported_title'),
        detail: t(ctx.locale, 'av.unsupported_detail'),
      },
    ];
  }

  try {
    const { stdout } = await execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct | Select-Object displayName, productState | ConvertTo-Json -Compress',
      ],
      { timeout: 10000 }
    );

    const trimmed = stdout.trim();
    if (!trimmed) return [noAvFinding(ctx.locale)];

    const parsed = JSON.parse(trimmed);
    const products = Array.isArray(parsed) ? parsed : [parsed];
    if (products.length === 0) return [noAvFinding(ctx.locale)];

    return products.map((p, idx) => decodeProduct(p, idx, ctx.locale));
  } catch (err) {
    return [
      {
        id: 'antivirus_check_failed',
        type: 'antivirus_status',
        severity: 'info',
        title: t(ctx.locale, 'av.failed_title'),
        detail: err.message,
      },
    ];
  }
}

function decodeProduct(p, idx, locale) {
  const name = p.displayName || 'Unknown';
  const state = Number(p.productState);
  let enabled = null;
  if (Number.isFinite(state)) {
    const hex = state.toString(16).padStart(6, '0');
    const enabledByte = hex.substring(2, 4);
    if (enabledByte === '11' || enabledByte === '01') enabled = true;
    else if (enabledByte === '10' || enabledByte === '00') enabled = false;
  }

  if (enabled === true) {
    return { id: `av_${idx}`, type: 'antivirus_status', severity: 'ok', title: t(locale, 'av.enabled_title', { name }), detail: '' };
  }
  if (enabled === false) {
    return {
      id: `av_${idx}`,
      type: 'antivirus_status',
      severity: 'high',
      title: t(locale, 'av.disabled_title', { name }),
      detail: t(locale, 'av.disabled_detail'),
    };
  }
  return { id: `av_${idx}`, type: 'antivirus_status', severity: 'info', title: t(locale, 'av.unknown_title', { name }), detail: t(locale, 'av.unknown_detail') };
}

function noAvFinding(locale) {
  return {
    id: 'antivirus_none',
    type: 'antivirus_status',
    severity: 'critical',
    title: t(locale, 'av.none_title'),
    detail: t(locale, 'av.none_detail'),
  };
}

module.exports = { scanAntivirus };
