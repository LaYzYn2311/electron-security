const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform, home } = require('../utils/platform');
const { walk, pathExists } = require('../utils/fsWalk');
const { isProtectedGamePath } = require('../utils/gameExclusions');
const { t } = require('../i18n');

// A folder's own mtime only changes when its direct entry list changes (a
// file added/removed) — not when a file already inside it gets rewritten in
// place. Plenty of live, actively-used app-support folders (game launchers
// writing to the same log/config files for months) look "untouched" by that
// measure alone while being modified daily one level down. So age is decided
// by the newest file found anywhere inside, not the folder's own mtime — and
// this same walk doubles as the size estimate, so it's one pass, not two.
// Capped so one huge folder can't stall the scan.
const WALK_CAP = 20000;

async function estimateFolderStats(folderPath, cancelToken) {
  let size = 0;
  let newestMtimeMs = 0;
  let count = 0;
  for await (const entry of walk(folderPath, { cancelToken })) {
    if (!entry.isDirectory) {
      size += entry.stats.size;
      if (entry.stats.mtimeMs > newestMtimeMs) newestMtimeMs = entry.stats.mtimeMs;
    }
    count += 1;
    if (count >= WALK_CAP) break;
  }
  return { size, newestMtimeMs };
}

// Vendor/system folder names that must never be flagged, even if they don't
// fuzzy-match a currently-installed program — these are shared framework,
// driver, OS-internal, or per-machine anti-cheat/antivirus folders, not
// residue from one specific uninstalled app. Flagging one of these would be
// a genuinely bad, confusing suggestion. Matched as a substring (see
// isNeverFlagged below) so compound names ("Windows Kits", "Microsoft SDKs")
// are caught by their shorter vendor keyword automatically — short/common
// keywords (below the length cutoff) still require an exact match so they
// can't accidentally swallow unrelated folders.
const NEVER_FLAG = new Set([
  'microsoft', 'windows', 'windowsapps', 'packages', 'common files',
  'google', 'mozilla', 'apple', 'intel', 'nvidia', 'realtek', 'qualcomm',
  'broadcom', 'dell', 'lenovo', 'asus', 'internet explorer', 'windowspowershell',
  'connecteddevicesplatform', 'packagecache', 'crashdumps', 'temp',
  '.dotnet', '.nuget', '.vscode', '.android', 'vcredist', 'msbuild', 'dotnet',
  'virtualstore', 'inethistory', 'elevateddiagnostics', 'uninstall information',
  'installshield installation information',
  // Anti-cheat / DRM middleware — used by many unrelated games, never tied to
  // one specific "installed program" a user would recognize by name.
  'easyanticheat', 'battleye', 'vanguard',
  // Antivirus/security vendors — flagging one of these would be a
  // particularly bad look coming from a security tool.
  'norton', 'symantec', 'mcafee', 'kaspersky', 'bitdefender', 'avast', 'avg',
  'malwarebytes', 'eset', 'windows defender',
  // Large publishers/vendors whose per-user support folder rarely shares any
  // substring with how their games/apps register in the uninstall list (e.g.
  // "Electronic Arts" vs. a game's own registry DisplayName) — confirmed as
  // false positives (folders actively written to, despite the top-level
  // mtime looking stale) during testing on a real gaming machine.
  'ea', 'electronic arts', 'activision', 'blizzard entertainment',
  'ow-electron', 'overwolf', 'logitech', 'lghub', 'finalwire',
]);

// Keywords shorter than this only match a folder name exactly (a 2-3 letter
// keyword like "ea" would otherwise match as a substring of unrelated words).
const SUBSTRING_MIN_LEN = 4;

function isNeverFlagged(folderName) {
  const lower = folderName.toLowerCase();
  if (NEVER_FLAG.has(lower)) return true;
  for (const kw of NEVER_FLAG) {
    if (kw.length >= SUBSTRING_MIN_LEN && lower.includes(kw)) return true;
  }
  return false;
}

const MIN_AGE_DAYS = 180;

async function listInstalledProgramNames() {
  const script = `
    $keys = @(
      'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    )
    Get-ItemProperty -Path $keys -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName } |
      Select-Object -ExpandProperty DisplayName -Unique
  `;
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function matchesAnyInstalledProgram(folderName, installedNormalized) {
  const norm = normalize(folderName);
  if (!norm) return true; // nothing to compare — don't flag
  return installedNormalized.some((p) => p.includes(norm) || norm.includes(p));
}

async function candidateResidueRoots() {
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData/Local');
  const appData = process.env.APPDATA || path.join(home, 'AppData/Roaming');
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  return [appData, localAppData, programFiles, programFilesX86];
}

/**
 * Heuristic-only: flags top-level vendor/app folders under AppData and
 * Program Files whose name doesn't fuzzy-match any currently-installed
 * program AND haven't been touched in a long time. This can't know what
 * WAS installed before (no historical snapshot exists on first run), so
 * it necessarily has false positives — portable tools, manually-placed
 * files, apps installed outside the standard uninstall registry all look
 * identical to genuine leftovers. Findings are always 'low' severity,
 * never included in "select safe", and the detail text says so explicitly.
 */
async function scanUninstallResidue(ctx) {
  if (platform !== 'win32') return [];

  const installedNames = await listInstalledProgramNames();
  const installedNormalized = installedNames.map(normalize).filter(Boolean);
  const roots = await candidateResidueRoots();
  const findings = [];
  const cutoff = Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000;

  for (const root of roots) {
    if (ctx.cancelToken.cancelled) break;
    if (!(await pathExists(root))) continue;
    let entries;
    try {
      entries = await fs.promises.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (ctx.cancelToken.cancelled) break;
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(root, entry.name);
      if (isProtectedGamePath(fullPath)) continue;
      if (isNeverFlagged(entry.name)) continue;
      if (matchesAnyInstalledProgram(entry.name, installedNormalized)) continue;

      let stats;
      try {
        stats = await fs.promises.stat(fullPath);
      } catch {
        continue;
      }
      // Cheap pre-filter: if the folder's own entry list changed recently,
      // it's obviously active — skip without walking its contents.
      if (stats.mtimeMs > cutoff) continue;

      const { size, newestMtimeMs } = await estimateFolderStats(fullPath, ctx.cancelToken);
      const effectiveMtimeMs = Math.max(stats.mtimeMs, newestMtimeMs);
      if (effectiveMtimeMs > cutoff) continue; // something inside is still being written to — not residue

      findings.push({
        id: `residue_${fullPath}`,
        category: 'uninstall_residue',
        path: fullPath,
        size,
        mtime: new Date(effectiveMtimeMs).toISOString(),
        isDirectory: true,
        reason: t(ctx.locale, 'junk.uninstall_residue_reason'),
      });
      ctx.onProgress?.({ category: 'uninstall_residue', scanned: findings.length, current: fullPath });
    }
  }

  return findings;
}

module.exports = { scanUninstallResidue };
