const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform, home } = require('../utils/platform');
const { walk } = require('../utils/fsWalk');
const { t } = require('../i18n');

const WORLD_WRITABLE_BIT = 0o002;
const WORLD_READABLE_BIT = 0o004;

/**
 * "world-writable" is only a real local-account threat if another local
 * account actually exists to exploit it — the overwhelming majority of
 * personal machines have exactly one. Falls back to treating the system as
 * multi-user (the safer assumption) if the check itself fails for any reason.
 */
async function countRealUserAccounts() {
  try {
    if (platform === 'darwin') {
      const { stdout } = await execFileAsync('dscl', ['.', '-list', '/Users', 'UniqueID']);
      const count = stdout
        .split('\n')
        .map((l) => l.trim().split(/\s+/))
        .filter((parts) => parts.length === 2 && Number(parts[1]) >= 500)
        .length;
      return count;
    }
    // linux
    const fs = require('fs');
    const passwd = await fs.promises.readFile('/etc/passwd', 'utf8');
    const count = passwd
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split(':'))
      .filter((f) => Number(f[2]) >= 1000 && !/nologin|false$/.test(f[6] || ''))
      .length;
    return count;
  } catch {
    return 2; // unknown — assume multi-user, don't understate risk
  }
}

/**
 * Looks for world-writable files/directories under the user's home folder.
 * Unix-only (Windows ACLs don't map to the same mode bits); scoped to the
 * home directory to keep this fast and to avoid needing root to walk /.
 *
 * Two things that would otherwise be constant noise on a real machine:
 *  - write-only-for-others entries (no read bit) are the deliberate macOS
 *    "Drop Box" sharing pattern (~/Public/Drop Box ships like this by
 *    default) — that's the folder working as designed, not a leak, so it's
 *    skipped rather than reported.
 *  - on a single-user machine there is no other local account that could
 *    actually exploit a world-writable file (a very common, benign case:
 *    third-party installers/zip extractors routinely leave their own
 *    extracted files world-writable), so findings are downgraded to 'low'
 *    instead of 'medium' — still worth a look, not an alarm.
 */
async function scanFilePermissions(ctx) {
  if (platform === 'win32') {
    return [
      {
        id: 'perms_unsupported_windows',
        type: 'file_permissions',
        severity: 'info',
        title: t(ctx.locale, 'perms.unsupported_windows_title'),
        detail: t(ctx.locale, 'perms.unsupported_windows_detail'),
      },
    ];
  }

  const realUserCount = await countRealUserAccounts();
  const singleUserSystem = realUserCount <= 1;

  const findings = [];
  let scanned = 0;
  const MAX_ITEMS = 20000; // safety cap so a huge home dir can't make this run forever

  for await (const entry of walk(home, { cancelToken: ctx.cancelToken, maxDepth: 6 })) {
    if (scanned++ > MAX_ITEMS) break;
    const mode = entry.stats.mode & 0o777;
    const worldWritable = mode & WORLD_WRITABLE_BIT;
    const worldReadable = mode & WORLD_READABLE_BIT;

    if (worldWritable && worldReadable) {
      const severity = singleUserSystem ? 'low' : entry.isDirectory ? 'medium' : 'low';
      findings.push({
        id: `perm_${entry.fullPath}`,
        type: 'file_permissions',
        severity,
        title: entry.isDirectory
          ? t(ctx.locale, 'perms.title_dir', { name: entry.name })
          : t(ctx.locale, 'perms.title_file', { name: entry.name }),
        detail: `${entry.fullPath} (mode ${mode.toString(8)})${singleUserSystem ? t(ctx.locale, 'perms.single_user_suffix') : ''}`,
      });
    }
    // else: either not world-writable at all, or write-only-for-others
    // (mode like 733) — the deliberate "Drop Box" pattern, not reported.

    ctx.onProgress?.({ category: 'file_permissions', scanned, current: entry.fullPath });
  }

  return findings;
}

module.exports = { scanFilePermissions };
