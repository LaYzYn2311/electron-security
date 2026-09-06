const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { t } = require('../i18n');

/**
 * Best-effort, fully local version check for a handful of common runtimes.
 * IMPORTANT: this is a heuristic against hardcoded "reasonably current major
 * version" thresholds, NOT a real CVE/vulnerability database — there is no
 * offline substitute for that. It never contacts the network by default,
 * per the app's privacy-first design; findings are labeled "info" unless a
 * version is old enough to be a plausible, general risk.
 */
const TOOLS = [
  { name: 'Node.js', cmd: 'node', args: ['--version'], parse: (s) => s.trim().replace(/^v/, ''), minOkMajor: 18 },
  { name: 'Python 3', cmd: 'python3', args: ['--version'], parse: (s) => (s.match(/(\d+\.\d+\.\d+)/) || [, ''])[1], minOkMajor: 3 },
  { name: 'Java', cmd: 'java', args: ['-version'], parse: (s) => (s.match(/"(\d+)/) || [, ''])[1], minOkMajor: 11 },
  { name: 'Git', cmd: 'git', args: ['--version'], parse: (s) => (s.match(/(\d+\.\d+\.\d+)/) || [, ''])[1], minOkMajor: 2 },
  { name: 'OpenSSL', cmd: 'openssl', args: ['version'], parse: (s) => (s.match(/(\d+\.\d+\.\d+)/) || [, ''])[1], minOkMajor: 1 },
];

async function scanOutdatedApps(ctx) {
  const findings = [];
  for (const tool of TOOLS) {
    try {
      const { stdout, stderr } = await execFileAsync(tool.cmd, tool.args);
      const raw = (stdout || stderr || '').toString();
      const version = tool.parse(raw);
      if (!version) continue;
      const major = parseInt(version.split('.')[0], 10);
      const isOld = Number.isFinite(major) && major < tool.minOkMajor;
      findings.push({
        id: `outdated_${tool.cmd}`,
        type: 'outdated_app',
        severity: isOld ? 'medium' : 'info',
        title: t(ctx.locale, 'outdated.title', { name: tool.name, version }),
        detail: isOld
          ? t(ctx.locale, 'outdated.old_detail', { minMajor: tool.minOkMajor })
          : t(ctx.locale, 'outdated.current_detail'),
      });
    } catch {
      // tool not installed / not on PATH — nothing to report
    }
  }
  return findings;
}

module.exports = { scanOutdatedApps };
