const { walk } = require('../utils/fsWalk');
const { isProtectedGamePath } = require('../utils/gameExclusions');
const { t } = require('../i18n');

const DEFAULT_MIN_SIZE = 100 * 1024 * 1024; // 100 MB
const DEFAULT_STALE_DAYS = 180;

/**
 * Finds files at or above `minSize` whose last-accessed (falling back to
 * last-modified, since atime tracking is disabled on many systems) is older
 * than `staleDays`.
 */
async function scanLargeOldFiles(rootDirs, ctx, { minSize = DEFAULT_MIN_SIZE, staleDays = DEFAULT_STALE_DAYS } = {}) {
  const items = [];
  const staleMs = staleDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const root of rootDirs) {
    if (ctx.cancelToken.cancelled) break;
    for await (const entry of walk(root, { cancelToken: ctx.cancelToken })) {
      if (entry.isDirectory) continue;
      if (isProtectedGamePath(entry.fullPath)) continue;
      if (entry.stats.size < minSize) continue;

      const lastTouched = Math.max(entry.stats.atimeMs || 0, entry.stats.mtimeMs || 0);
      const age = now - lastTouched;
      if (age < staleMs) continue;

      items.push({
        id: `lo${items.length}_${Date.now()}`,
        category: 'large_old',
        path: entry.fullPath,
        size: entry.stats.size,
        mtime: entry.stats.mtime.toISOString(),
        lastAccessed: new Date(lastTouched).toISOString(),
        ageDays: Math.round(age / (24 * 60 * 60 * 1000)),
        reason: t(ctx.locale, 'largeold.reason', {
          mb: Math.round(entry.stats.size / (1024 * 1024)),
          days: Math.round(age / (24 * 60 * 60 * 1000)),
        }),
      });
      ctx.onProgress?.({ category: 'large_old', scanned: items.length, current: entry.fullPath });
    }
  }

  return items;
}

module.exports = { scanLargeOldFiles, DEFAULT_MIN_SIZE, DEFAULT_STALE_DAYS };
