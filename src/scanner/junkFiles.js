const path = require('path');
const { walk, pathExists } = require('../utils/fsWalk');
const { getLocations } = require('../utils/platform');
const { isProtectedGamePath } = require('../utils/gameExclusions');
const { t } = require('../i18n');

let nextId = 1;
function makeItem(category, fullPath, stats, reason) {
  return {
    id: `f${nextId++}`,
    category,
    path: fullPath,
    size: stats.isDirectory() ? 0 : stats.size,
    mtime: stats.mtime.toISOString(),
    isDirectory: stats.isDirectory(),
    reason,
  };
}

/** Walks a list of candidate directories (files only, one level deep of recursion is fine for cache dirs) and reports every file found under them as belonging to `category`. */
async function scanDirsAsCategory(dirs, category, reasonFn, ctx) {
  const items = [];
  for (const dir of dirs) {
    if (ctx.cancelToken.cancelled) break;
    if (!(await pathExists(dir))) continue;
    for await (const entry of walk(dir, { cancelToken: ctx.cancelToken })) {
      if (!entry.isDirectory && !isProtectedGamePath(entry.fullPath)) {
        items.push(makeItem(category, entry.fullPath, entry.stats, reasonFn(entry, ctx.locale)));
      }
      ctx.onProgress?.({ category, scanned: items.length, current: entry.fullPath });
    }
  }
  return items;
}

async function scanTempFiles(ctx) {
  const loc = getLocations();
  return scanDirsAsCategory(loc.tempDirs, 'temp', (e, locale) => t(locale, 'junk.temp_reason'), ctx);
}

async function scanLogFiles(ctx) {
  const loc = getLocations();
  const items = await scanDirsAsCategory(loc.logDirs, 'logs', (e, locale) => t(locale, 'junk.logs_reason'), ctx);
  return items.filter((i) => /\.(log|log\.\d+|old|txt)$/i.test(i.path) || i.path.includes('.log'));
}

async function scanBrowserCache(ctx) {
  const loc = getLocations();
  return scanDirsAsCategory(loc.browserCacheDirs, 'browser_cache', (e, locale) => t(locale, 'junk.browser_cache_reason'), ctx);
}

async function scanAppCaches(ctx) {
  const loc = getLocations();
  return scanDirsAsCategory(loc.appCacheDirs, 'app_cache', (e, locale) => t(locale, 'junk.app_cache_reason', { name: path.basename(e.fullPath) }), ctx);
}

async function scanTrash(ctx) {
  const loc = getLocations();
  if (!loc.trashDirs.length) return [];
  return scanDirsAsCategory(loc.trashDirs, 'trash', (e, locale) => t(locale, 'junk.trash_reason'), ctx);
}

const INSTALLER_EXT = new Set(['.exe', '.msi', '.dmg', '.pkg', '.deb', '.rpm', '.appimage']);
// Browsers create these for downloads that never finished (cancelled, connection
// dropped, etc.) — they're never a usable app, safe to flag regardless of age.
const PARTIAL_DOWNLOAD_EXT = new Set(['.crdownload', '.part', '.partial', '.download']);
// A real installer is essentially never this small — an .exe/.msi/etc. this
// tiny is a failed/truncated download, not an app the user might still want.
const MIN_PLAUSIBLE_INSTALLER_SIZE = 4 * 1024;

/**
 * Flags only genuinely broken leftovers in Downloads: incomplete downloads
 * and installer files too small to actually be a working installer. Does
 * NOT flag ordinary installer files just for being old — an old installer
 * for an app the user still has installed (a game launcher, Discord, an
 * editor) is not junk, and deleting it doesn't uninstall anything, but
 * flagging it by age alone invites exactly that confusion. Real duplicate
 * downloads of the same installer are already caught separately by the
 * content-hash duplicates scanner.
 */
async function scanOrphanInstallers(ctx) {
  const loc = getLocations();
  const items = [];
  if (!(await pathExists(loc.downloadsDir))) return items;
  for await (const entry of walk(loc.downloadsDir, { cancelToken: ctx.cancelToken, maxDepth: 2 })) {
    if (entry.isDirectory) continue;
    if (isProtectedGamePath(entry.fullPath)) continue;
    const ext = path.extname(entry.name).toLowerCase();

    if (PARTIAL_DOWNLOAD_EXT.has(ext)) {
      items.push(makeItem('orphan_installer', entry.fullPath, entry.stats, t(ctx.locale, 'junk.partial_download_reason')));
      ctx.onProgress?.({ category: 'orphan_installer', scanned: items.length, current: entry.fullPath });
      continue;
    }

    if (!INSTALLER_EXT.has(ext)) continue;
    if (entry.stats.size >= MIN_PLAUSIBLE_INSTALLER_SIZE) continue;
    items.push(makeItem('orphan_installer', entry.fullPath, entry.stats, t(ctx.locale, 'junk.corrupted_installer_reason', { ext })));
    ctx.onProgress?.({ category: 'orphan_installer', scanned: items.length, current: entry.fullPath });
  }
  return items;
}

async function scanEmptyFolders(ctx) {
  const loc = getLocations();
  return scanEmptyFoldersUnderRoots([loc.downloadsDir, ...loc.appCacheDirs], ctx);
}

/** Same empty-folder detection, scoped to one arbitrary user-chosen folder (e.g. Explorer "Scan this folder"). */
async function scanEmptyFoldersUnder(folderPath, ctx) {
  return scanEmptyFoldersUnderRoots([folderPath], ctx);
}

async function scanEmptyFoldersUnderRoots(roots, ctx) {
  const items = [];

  for (const root of roots) {
    if (!(await pathExists(root))) continue;
    const dirs = [];
    for await (const entry of walk(root, { cancelToken: ctx.cancelToken })) {
      if (entry.isDirectory) dirs.push(entry.fullPath);
    }
    for (const d of dirs) {
      if (ctx.cancelToken.cancelled) break;
      if (isProtectedGamePath(d)) continue;
      try {
        const fs = require('fs');
        const contents = await fs.promises.readdir(d);
        if (contents.length === 0) {
          const stats = await fs.promises.lstat(d);
          items.push(makeItem('empty_folder', d, stats, t(ctx.locale, 'junk.empty_folder_reason')));
        }
      } catch {
        /* skip */
      }
      ctx.onProgress?.({ category: 'empty_folder', scanned: items.length, current: d });
    }
  }
  return items;
}

module.exports = {
  scanTempFiles,
  scanLogFiles,
  scanBrowserCache,
  scanAppCaches,
  scanTrash,
  scanOrphanInstallers,
  scanEmptyFolders,
  scanEmptyFoldersUnder,
};
