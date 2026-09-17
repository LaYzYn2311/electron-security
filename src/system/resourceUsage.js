const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');

const SAMPLE_INTERVAL_MS = 700;
const TOP_N = 8;

/**
 * Snapshot of the top CPU/RAM-consuming processes right now — a real "why is
 * my PC slow" answer, distinct from junk-file cleanup (which frees disk
 * space, not live resource usage). CPU% is computed by sampling `Get-Process`
 * twice a short interval apart and diffing the *cumulative* .CPU time (a
 * .NET API property, not a named performance counter) — Windows performance
 * counter *names* are localized per display language (e.g. "% Processor
 * Time" doesn't resolve as-is on a Greek-language Windows install), so this
 * sampling approach is what stays reliable across locales. Both samples are
 * taken inside one PowerShell process to avoid the overhead of two separate
 * process launches.
 */
const SCRIPT = `
$cores = [Environment]::ProcessorCount
$s1 = Get-Process | Select-Object Id, ProcessName, CPU, WorkingSet64
Start-Sleep -Milliseconds ${SAMPLE_INTERVAL_MS}
$s2 = Get-Process | Select-Object Id, ProcessName, CPU, WorkingSet64
$map1 = @{}
foreach ($p in $s1) { $map1[$p.Id] = $p.CPU }
$elapsed = ${SAMPLE_INTERVAL_MS} / 1000.0
$results = foreach ($p in $s2) {
  $prevCpu = $map1[$p.Id]
  $cpuPct = 0
  if ($null -ne $prevCpu -and $null -ne $p.CPU) {
    $cpuPct = [Math]::Round((($p.CPU - $prevCpu) / $elapsed / $cores) * 100, 1)
  }
  [PSCustomObject]@{ Name = $p.ProcessName; Pid = $p.Id; CpuPct = $cpuPct; MemBytes = $p.WorkingSet64 }
}
$topCpu = $results | Sort-Object CpuPct -Descending | Select-Object -First ${TOP_N}
$topMem = $results | Sort-Object MemBytes -Descending | Select-Object -First ${TOP_N}
[PSCustomObject]@{ topCpu = @($topCpu); topMem = @($topMem); cores = $cores } | ConvertTo-Json -Compress -Depth 4
`;

async function getTopProcesses() {
  if (platform !== 'win32') return { supported: false };
  const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
  const data = JSON.parse(stdout.trim());
  return { supported: true, cores: data.cores, topCpu: data.topCpu || [], topMem: data.topMem || [] };
}

module.exports = { getTopProcesses };
