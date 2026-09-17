const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

// Only two signals, both deliberately narrow to avoid false positives:
// 1. Broken target (the app was removed but the shortcut wasn't) — cosmetic
//    clutter, informational only.
// 2. Target+arguments matching a well-known malicious-LNK pattern: launching
//    a script interpreter with an encoded/hidden/bypass command. Legitimate
//    shortcuts essentially never look like this, so it's high-confidence.
const SUSPICIOUS_INTERPRETER_RE = /\\(powershell|pwsh|cmd|wscript|cscript|mshta)(\.exe)?$/i;
const SUSPICIOUS_ARGS_RE = /-enc(odedcommand)?\b|-windowstyle\s+hidden|-ep\s+bypass|-executionpolicy\s+bypass|\biex\s*\(/i;

const SCRIPT = `
$shell = New-Object -ComObject WScript.Shell
$roots = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory'),
  [Environment]::GetFolderPath('StartMenu'),
  [Environment]::GetFolderPath('CommonStartMenu')
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
$results = foreach ($root in $roots) {
  Get-ChildItem -Path $root -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $sc = $shell.CreateShortcut($_.FullName)
      [PSCustomObject]@{ Name = $_.Name; LnkPath = $_.FullName; Target = $sc.TargetPath; Args = $sc.Arguments }
    } catch {}
  }
}
$results | ConvertTo-Json -Compress -Depth 3
`;

async function scanShortcutIntegrity(ctx) {
  if (platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    const trimmed = stdout.trim();
    let shortcuts = trimmed ? JSON.parse(trimmed) : [];
    if (!Array.isArray(shortcuts)) shortcuts = [shortcuts];

    const fs = require('fs');
    const findings = [];
    for (const s of shortcuts) {
      if (!s.Target) continue;
      if (SUSPICIOUS_INTERPRETER_RE.test(s.Target) && SUSPICIOUS_ARGS_RE.test(s.Args || '')) {
        findings.push({
          id: `shortcut_suspicious_${s.LnkPath}`,
          type: 'shortcut_integrity',
          severity: 'critical',
          title: t(ctx.locale, 'shortcut.suspicious_title', { name: s.Name }),
          detail: t(ctx.locale, 'shortcut.suspicious_detail', { target: s.Target, args: s.Args }),
          path: s.LnkPath,
          isDirectory: false,
        });
        continue;
      }
      try {
        await fs.promises.access(s.Target);
      } catch {
        findings.push({
          id: `shortcut_broken_${s.LnkPath}`,
          type: 'shortcut_integrity',
          severity: 'low',
          title: t(ctx.locale, 'shortcut.broken_title', { name: s.Name }),
          detail: t(ctx.locale, 'shortcut.broken_detail', { target: s.Target }),
        });
      }
    }
    if (findings.length === 0) {
      findings.push({ id: 'shortcut_clean', type: 'shortcut_integrity', severity: 'ok', title: t(ctx.locale, 'shortcut.clean_title'), detail: '' });
    }
    return findings;
  } catch (err) {
    return [{ id: 'shortcut_unavailable', type: 'shortcut_integrity', severity: 'info', title: t(ctx.locale, 'shortcut.unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanShortcutIntegrity };
