const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

// An app that has LastUsedTimeStart set but no LastUsedTimeStop (or 0) is
// currently holding the device open — same ConsentStore mechanism as the
// historical access-log check (privacyAccessLog.js), just reading "in
// progress" entries instead of completed ones.
const SCRIPT = `
function Get-ActiveUsers($device) {
  $base = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\$device"
  $out = @()
  if (Test-Path $base) {
    Get-ChildItem -Path $base -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.PSChildName -eq 'NonPackaged') { return }
      $p = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue
      if ($p -and $p.LastUsedTimeStart -and (-not $p.LastUsedTimeStop -or $p.LastUsedTimeStop -eq 0)) {
        $out += $_.PSChildName
      }
    }
  }
  return ,$out
}
[PSCustomObject]@{ webcam = @(Get-ActiveUsers 'webcam'); microphone = @(Get-ActiveUsers 'microphone') } | ConvertTo-Json -Compress -Depth 4
`;

function appLabel(rawKey) {
  const withSlashes = rawKey.includes('#') ? rawKey.replace(/#/g, '\\') : rawKey;
  return withSlashes.split('\\').pop() || rawKey;
}

async function scanLiveAccess(ctx) {
  if (platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { timeout: 10000, maxBuffer: 512 * 1024 });
    const data = JSON.parse(stdout.trim() || '{}');
    const findings = [];
    for (const device of ['webcam', 'microphone']) {
      const raw = data[device];
      const entries = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : Array.isArray(raw) ? raw : [];
      if (entries.length === 0) {
        findings.push({ id: `live_${device}_clean`, type: 'live_access', severity: 'ok', title: t(ctx.locale, `live.${device}_clean_title`), detail: '' });
        continue;
      }
      for (const raw2 of entries) {
        findings.push({
          id: `live_${device}_${raw2}`,
          type: 'live_access',
          severity: 'medium',
          title: t(ctx.locale, `live.${device}_active_title`, { app: appLabel(raw2) }),
          detail: t(ctx.locale, 'live.active_detail'),
        });
      }
    }
    return findings;
  } catch (err) {
    return [{ id: 'live_unavailable', type: 'live_access', severity: 'info', title: t(ctx.locale, 'live.unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanLiveAccess };
