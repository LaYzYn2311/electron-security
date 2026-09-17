const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const path = require('path');
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

// Critical Windows system processes and where they're legitimately allowed to
// run from. A process bearing one of these exact names but running from
// anywhere else is a classic malware-disguise technique.
const EXPECTED = {
  'svchost.exe': ['c:\\windows\\system32', 'c:\\windows\\syswow64'],
  'csrss.exe': ['c:\\windows\\system32'],
  'lsass.exe': ['c:\\windows\\system32'],
  'winlogon.exe': ['c:\\windows\\system32'],
  'services.exe': ['c:\\windows\\system32'],
  'smss.exe': ['c:\\windows\\system32'],
  'wininit.exe': ['c:\\windows\\system32'],
  'spoolsv.exe': ['c:\\windows\\system32'],
  'dwm.exe': ['c:\\windows\\system32'],
  'explorer.exe': ['c:\\windows'],
};

const PS_NAME_LIST = Object.keys(EXPECTED).map((n) => `'${n.replace(/\.exe$/, '')}'`).join(',');
const SCRIPT = `
$names = @(${PS_NAME_LIST})
$results = foreach ($n in $names) {
  Get-Process -Name $n -ErrorAction SilentlyContinue | Select-Object Name, Id, Path
}
$results | ConvertTo-Json -Compress
`;

/**
 * Get-Process can only read .Path for processes the current (non-elevated)
 * user has access to — most protected system processes return an empty path
 * due to normal Windows access control, not because anything is wrong.
 * Confirmed on a real machine: dozens of legitimate svchost instances showed
 * a blank path, only a handful were readable (all correctly in System32).
 * So this only judges what it can actually verify — a blank path is treated
 * as "unverifiable", never as suspicious, to avoid a false-positive machine.
 */
async function scanProcessMasquerade(ctx) {
  if (platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { timeout: 15000, maxBuffer: 1024 * 1024 });
    const trimmed = stdout.trim();
    let procs = trimmed ? JSON.parse(trimmed) : [];
    if (!Array.isArray(procs)) procs = [procs];

    const findings = [];
    let verified = 0;
    let unverifiable = 0;
    for (const p of procs) {
      const exeName = `${p.Name}.exe`.toLowerCase();
      const allowedDirs = EXPECTED[exeName];
      if (!p.Path) { unverifiable += 1; continue; }
      const dir = path.dirname(p.Path).toLowerCase();
      if (allowedDirs?.includes(dir)) { verified += 1; continue; }
      findings.push({
        id: `masquerade_${p.Name}_${p.Id}`,
        type: 'process_masquerade',
        severity: 'critical',
        title: t(ctx.locale, 'masquerade.found_title', { name: `${p.Name}.exe`, pid: p.Id }),
        detail: t(ctx.locale, 'masquerade.found_detail', { path: p.Path }),
      });
    }

    findings.push({
      id: 'masquerade_scope_note',
      type: 'process_masquerade',
      severity: findings.length ? 'info' : 'ok',
      title: t(ctx.locale, findings.length ? 'masquerade.scope_note_title' : 'masquerade.clean_title', { verified, unverifiable }),
      detail: t(ctx.locale, 'masquerade.scope_note_detail', { verified, unverifiable }),
    });
    return findings;
  } catch (err) {
    return [{ id: 'masquerade_unavailable', type: 'process_masquerade', severity: 'info', title: t(ctx.locale, 'masquerade.unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanProcessMasquerade };
