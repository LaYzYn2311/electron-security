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
