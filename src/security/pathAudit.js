const fs = require('fs');
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

/**
 * Flags PATH entries pointing at a directory that doesn't exist. Scoped
 * narrowly to this one signal on purpose: judging PATH entries as
 * "suspicious" by location is unreliable (dev tools legitimately add PATH
 * entries in all sorts of places — AppData, ProgramData\chocolatey, a user's
 * home folder, etc.), so that would be a false-positive machine. A
 * non-existent directory is different: it's either stale cruft from an
 * uninstalled tool, or a pre-staged "PATH hijack" location waiting for a
 * malicious binary to be dropped there under a common command name —
 * either way, worth a look, and there's no legitimate reason for it.
 */
async function scanPathAudit(ctx) {
  if (platform !== 'win32') return [];
  const raw = process.env.PATH || process.env.Path || '';
  const entries = raw.split(';').map((e) => e.trim()).filter(Boolean);

  const findings = [];
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.toLowerCase())) continue;
    seen.add(entry.toLowerCase());
    try {
      const stat = await fs.promises.stat(entry);
      if (!stat.isDirectory()) throw new Error('not a directory');
    } catch {
      findings.push({
        id: `path_missing_${entry}`,
        type: 'path_audit',
        severity: 'low',
        title: t(ctx.locale, 'pathaudit.missing_title', { path: entry }),
        detail: t(ctx.locale, 'pathaudit.missing_detail'),
      });
    }
  }

  if (findings.length === 0) {
    findings.push({ id: 'path_clean', type: 'path_audit', severity: 'ok', title: t(ctx.locale, 'pathaudit.clean_title'), detail: '' });
  }
  return findings;
}

module.exports = { scanPathAudit };
