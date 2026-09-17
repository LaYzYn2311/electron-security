const { scanStartupLocations, scanScheduledTasks } = require('./startupItems');
const { scanOpenPorts } = require('./openPorts');
const { scanFirewall } = require('./firewall');
const { scanAntivirus } = require('./antivirus');
const { scanHostsFile } = require('./hostsFile');
const { scanBrowserHijack } = require('./browserHijack');
const { scanFilePermissions } = require('./filePermissions');
const { scanBrowserExtensions } = require('./browserExtensions');
const { scanMaskedExtensions } = require('./maskedExtensions');
const { scanOutdatedApps } = require('./outdatedApps');
const { scanDiskEncryption } = require('./diskEncryption');
const { scanPrivacySettings } = require('./privacySettings');
const { scanDriverInventory } = require('./driverInventory');
const { scanCheatTools } = require('./cheatDetection');
const { scanRemoteAccessTools } = require('./remoteAccessTools');
const { scanPrivacyAccessLog } = require('./privacyAccessLog');
const { scanAutorun } = require('./autorunCheck');
const { scanRootCertificates } = require('./rootCertificates');
const { scanOutboundConnections } = require('./outboundConnections');
const { scanRdp } = require('./rdpCheck');
const { scanSmbv1 } = require('./smbv1Check');
const { scanLocalAccounts } = require('./localAccounts');
const { scanProxyHijack } = require('./proxyHijack');
const { scanScreenLock } = require('./screenLockCheck');
const { scanPathAudit } = require('./pathAudit');
const { scanProcessMasquerade } = require('./processMasquerade');
const { scanLiveAccess } = require('./liveAccessCheck');
const { scanRootkitCrossView } = require('./rootkitCrossView');
const { scanFakeAntivirus } = require('./fakeAntivirus');
const { scanShortcutIntegrity } = require('./shortcutIntegrity');
const { scanOnedriveSync } = require('./onedriveSync');
const { t } = require('../i18n');

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info', 'ok'];

const CHECKS = [
  ['antivirus', scanAntivirus],
  ['firewall', scanFirewall],
  ['hosts_file', scanHostsFile],
  ['browser_hijack', scanBrowserHijack],
  ['startup_items', scanStartupLocations],
  ['scheduled_tasks', scanScheduledTasks],
  ['open_ports', scanOpenPorts],
  ['file_permissions', scanFilePermissions],
  ['browser_extensions', scanBrowserExtensions],
  ['masked_extensions', scanMaskedExtensions],
  ['outdated_apps', scanOutdatedApps],
  ['disk_encryption', scanDiskEncryption],
  ['privacy_settings', scanPrivacySettings],
  ['driver_inventory', scanDriverInventory],
  ['cheat_tools', scanCheatTools],
  ['remote_access_tools', scanRemoteAccessTools],
  ['privacy_access_log', scanPrivacyAccessLog],
  ['autorun', scanAutorun],
  ['root_certificates', scanRootCertificates],
  ['outbound_connections', scanOutboundConnections],
  ['rdp', scanRdp],
  ['smbv1', scanSmbv1],
  ['local_accounts', scanLocalAccounts],
  ['proxy_hijack', scanProxyHijack],
  ['screen_lock', scanScreenLock],
  ['path_audit', scanPathAudit],
  ['process_masquerade', scanProcessMasquerade],
  ['live_access', scanLiveAccess],
  ['rootkit_cross_view', scanRootkitCrossView],
  ['fake_antivirus', scanFakeAntivirus],
  ['shortcut_integrity', scanShortcutIntegrity],
  ['onedrive_sync', scanOnedriveSync],
];

async function runSecurityScan(ctx) {
  const sections = {};
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, ok: 0 };

  for (const [key, fn] of CHECKS) {
    if (ctx.cancelToken.cancelled) break;
    const label = t(ctx.locale, `security.${key}`);
    ctx.onProgress?.({ phase: 'security', category: key, label, stage: 'start' });
    let findings = [];
    try {
      findings = await fn(ctx);
    } catch (err) {
      findings = [{ id: `${key}_error`, type: key, severity: 'info', title: t(ctx.locale, 'security.check_failed', { label }), detail: err.message }];
    }
    for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
    sections[key] = { label, findings };
    ctx.onProgress?.({ phase: 'security', category: key, label, stage: 'done', count: findings.length });
  }

  const allFindings = Object.values(sections)
    .flatMap((s) => s.findings)
    .filter((f) => f.severity !== 'ok')
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  return { sections, counts, allFindings, cancelled: ctx.cancelToken.cancelled };
}

module.exports = { runSecurityScan, SEVERITY_ORDER };
