const fs = require('fs');
const path = require('path');
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

/**
 * Reads the OS hosts file and flags the classic malware pattern: redirecting
 * a security-vendor domain to localhost so the machine can no longer reach
 * it for updates/definitions. Anything else non-default is reported at
 * 'medium' so the user can eyeball it — hosts overrides are common for
 * legitimate reasons (local dev, ad-blocking lists) too, so this can't
 * responsibly claim more than "worth a look" for the general case.
 */
const SECURITY_VENDOR_DOMAINS = [
  'windowsupdate.com', 'update.microsoft.com', 'microsoft.com',
  'avast.com', 'avg.com', 'malwarebytes.com', 'norton.com', 'nortonlifelock.com',
  'mcafee.com', 'kaspersky.com', 'eset.com', 'bitdefender.com', 'sophos.com',
  'trendmicro.com', 'virustotal.com', 'symantec.com', 'avira.com', 'f-secure.com',
  'windowsdefender.com', 'security.microsoft.com',
];

function hostsFilePath() {
  if (platform === 'win32') {
    const winDir = process.env.WINDIR || 'C:\\Windows';
    return path.join(winDir, 'System32', 'drivers', 'etc', 'hosts');
  }
  return '/etc/hosts';
}

function isLoopback(ip) {
  return ip === '127.0.0.1' || ip === '0.0.0.0' || ip === '::1';
}

function parseHosts(content) {
  const entries = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const ip = parts[0];
    for (const hostname of parts.slice(1)) {
      if (hostname.startsWith('#')) break;
      entries.push({ ip, hostname: hostname.toLowerCase() });
    }
  }
  return entries;
}

async function scanHostsFile(ctx) {
  const filePath = hostsFilePath();
  let content;
  try {
    content = await fs.promises.readFile(filePath, 'utf8');
  } catch (err) {
    return [{
      id: 'hosts_unavailable',
      type: 'hosts_file',
      severity: 'info',
      title: t(ctx.locale, 'hosts.unavailable_title'),
      detail: err.message,
    }];
  }

  const entries = parseHosts(content);
  const findings = [];

  for (const e of entries) {
    const vendor = SECURITY_VENDOR_DOMAINS.find((d) => e.hostname === d || e.hostname.endsWith('.' + d));
    if (vendor && isLoopback(e.ip)) {
      findings.push({
        id: `hosts_block_${e.hostname}`,
        type: 'hosts_file',
        severity: 'critical',
        title: t(ctx.locale, 'hosts.blocked_vendor_title', { host: e.hostname }),
        detail: t(ctx.locale, 'hosts.blocked_vendor_detail', { ip: e.ip }),
      });
    } else if (!isLoopback(e.ip)) {
      findings.push({
        id: `hosts_redirect_${e.hostname}`,
        type: 'hosts_file',
        severity: 'medium',
        title: t(ctx.locale, 'hosts.redirect_title', { host: e.hostname, ip: e.ip }),
        detail: t(ctx.locale, 'hosts.redirect_detail'),
      });
    }
  }

  if (findings.length === 0) {
    findings.push({ id: 'hosts_clean', type: 'hosts_file', severity: 'ok', title: t(ctx.locale, 'hosts.clean_title'), detail: '' });
  }
  return findings;
}

module.exports = { scanHostsFile };
