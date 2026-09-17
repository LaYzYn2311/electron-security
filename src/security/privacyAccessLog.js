const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

const RECENT_DAYS = 30;
const MAX_PER_DEVICE = 5;

// Windows itself already tracks this (visible in Settings > Privacy > Camera/
// Microphone history) — this just surfaces it inside the app instead of
// making the user go find it. Per-app entries live under ...\ConsentStore\
// <device>\NonPackaged\<app path with \ replaced by #>, each with a
// LastUsedTimeStop FILETIME if it was ever actually used (not just granted
// permission) — packaged (Store) apps are direct children instead, same shape.
const SCRIPT = `
function Get-AccessLog($device) {
  $base = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\$device"
  $out = @()
  if (Test-Path $base) {
    Get-ChildItem -Path $base -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.PSChildName -eq 'NonPackaged') { return }
      $p = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue
      if ($p -and $p.LastUsedTimeStop -and $p.LastUsedTimeStop -gt 0) {
        $out += [PSCustomObject]@{ App = $_.PSChildName; StopUtc = [DateTime]::FromFileTimeUtc([Int64]$p.LastUsedTimeStop).ToString('o') }
      }
    }
  }
  return ,$out
}
[PSCustomObject]@{ webcam = @(Get-AccessLog 'webcam'); microphone = @(Get-AccessLog 'microphone') } | ConvertTo-Json -Compress -Depth 6
`;

function appLabel(rawKey) {
  // NonPackaged children are the exe path with \ replaced by # (e.g.
  // "C:#Users#me#...#App.exe") — packaged (Store) apps use their package
  // family name directly and have no # to replace.
  const withSlashes = rawKey.includes('#') ? rawKey.replace(/#/g, '\\') : rawKey;
  const base = withSlashes.split('\\').pop();
  return base || rawKey;
}

async function scanPrivacyAccessLog(ctx) {
  if (platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    const data = JSON.parse(stdout.trim() || '{}');
    const findings = [];
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    const dateLocale = ctx.locale === 'el' ? 'el-GR' : 'en-US';

    for (const device of ['webcam', 'microphone']) {
      // PowerShell's `,$out` array-construction operator always wraps the
      // result in one extra level ([[...]]) regardless of how many entries
      // $out itself has — unwrap that single known level here.
      const raw = data[device];
      const entries = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : Array.isArray(raw) ? raw : [];
      const recent = entries
        .map((e) => ({ app: appLabel(e.App), stopMs: new Date(e.StopUtc).getTime() }))
        .filter((e) => Number.isFinite(e.stopMs) && e.stopMs > cutoff)
        .sort((a, b) => b.stopMs - a.stopMs)
        .slice(0, MAX_PER_DEVICE);

      if (recent.length === 0) {
        findings.push({ id: `privacy_${device}_clean`, type: 'privacy_access_log', severity: 'ok', title: t(ctx.locale, `privacy.${device}_clean_title`), detail: '' });
        continue;
      }
      for (const e of recent) {
        findings.push({
          id: `privacy_${device}_${e.app}_${e.stopMs}`,
          type: 'privacy_access_log',
          severity: 'info',
          title: t(ctx.locale, `privacy.${device}_used_title`, { app: e.app, date: new Date(e.stopMs).toLocaleString(dateLocale) }),
          detail: '',
        });
      }
    }
    return findings;
  } catch (err) {
    return [{ id: 'privacy_access_log_unavailable', type: 'privacy_access_log', severity: 'info', title: t(ctx.locale, 'privacy.access_log_unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanPrivacyAccessLog };
