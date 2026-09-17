const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

// Two independent process-enumeration paths (the Win32 toolhelp-based
// Get-Process, and WMI's own separate query engine). A process visible to
// one but not the other is the classic "cross-view" rootkit-detection
// technique — legitimate processes show up in both, since there's no
// ordinary reason for the two to disagree.
const SCRIPT = `
$viaProcess = @(Get-Process | Select-Object -ExpandProperty Id | Sort-Object -Unique)
$viaWmi = @(Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object -ExpandProperty ProcessId | Sort-Object -Unique)
$onlyInProcess = @($viaProcess | Where-Object { $viaWmi -notcontains $_ })
[PSCustomObject]@{ onlyInProcess = $onlyInProcess; countProcess = $viaProcess.Count; countWmi = $viaWmi.Count } | ConvertTo-Json -Compress
`;

async function scanRootkitCrossView(ctx) {
  if (platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { timeout: 15000, maxBuffer: 1024 * 1024 });
    const data = JSON.parse(stdout.trim());
    let hidden = data.onlyInProcess;
    if (hidden == null) hidden = [];
    if (!Array.isArray(hidden)) hidden = [hidden];

    if (hidden.length === 0) {
      return [{ id: 'crossview_clean', type: 'rootkit_cross_view', severity: 'ok', title: t(ctx.locale, 'crossview.clean_title'), detail: '' }];
    }
    return hidden.map((pid) => ({
      id: `crossview_${pid}`,
      type: 'rootkit_cross_view',
      severity: 'high',
      title: t(ctx.locale, 'crossview.found_title', { pid }),
      detail: t(ctx.locale, 'crossview.found_detail'),
    }));
  } catch (err) {
    return [{ id: 'crossview_unavailable', type: 'rootkit_cross_view', severity: 'info', title: t(ctx.locale, 'crossview.unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanRootkitCrossView };
