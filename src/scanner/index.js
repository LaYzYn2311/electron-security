const path = require('path');
const { home, getLocations } = require('../utils/platform');
const { pathExists } = require('../utils/fsWalk');
const junk = require('./junkFiles');
const { scanDuplicates } = require('./duplicates');
const { scanLargeOldFiles } = require('./largeOldFiles');
const { t } = require('../i18n');

const CATEGORY_KEYS = ['temp', 'logs', 'browser_cache', 'app_cache', 'trash', 'orphan_installer', 'empty_folder', 'duplicates', 'large_old'];
function categoryLabel(key, locale) {
  return t(locale, `category.${key}`);
}

const SCAN_STEPS = [
  ['temp', junk.scanTempFiles],
  ['logs', junk.scanLogFiles],
  ['browser_cache', junk.scanBrowserCache],
  ['app_cache', junk.scanAppCaches],
  ['trash', junk.scanTrash],
  ['orphan_installer', junk.scanOrphanInstallers],
  ['empty_folder', junk.scanEmptyFolders],
];

async function candidateUserDirs() {
  const names = ['Documents', 'Downloads', 'Desktop', 'Pictures', 'Movies', 'Music'];
  const dirs = [];
  for (const n of names) {
    const p = path.join(home, n);
    if (await pathExists(p)) dirs.push(p);
  }
  return dirs;
}

/**
 * Runs the full junk/duplicate/large-file scan. Emits progress via
 * ctx.onProgress({ phase, category, scanned, total, current }).
 * Returns { categories: { [key]: { label, items, totalSize } }, totalFreeable }.
 */
async function runFullScan(ctx) {
  const categories = {};
  let totalFreeable = 0;

  for (const [key, fn] of SCAN_STEPS) {
    if (ctx.cancelToken.cancelled) break;
    const label = categoryLabel(key, ctx.locale);
    ctx.onProgress?.({ phase: 'scanning', category: key, label, stage: 'start' });
    const items = await fn(ctx);
    const totalSize = items.reduce((s, i) => s + i.size, 0);
    categories[key] = { label, items, totalSize };
    totalFreeable += totalSize;
    ctx.onProgress?.({ phase: 'scanning', category: key, label, stage: 'done', count: items.length, totalSize });
  }

  if (!ctx.cancelToken.cancelled) {
    const dirs = await candidateUserDirs();

    const dupLabel = categoryLabel('duplicates', ctx.locale);
    ctx.onProgress?.({ phase: 'scanning', category: 'duplicates', label: dupLabel, stage: 'start' });
    const dupGroups = await scanDuplicates(dirs, ctx);
    const dupItems = dupGroups.flatMap((g) =>
      g.files.map((f, idx) => ({
        id: `dup_${g.hash}_${idx}`,
        category: 'duplicates',
        path: f,
        size: g.size,
        groupHash: g.hash,
        groupSize: g.files.length,
        keepSuggested: idx === 0, // first one found is suggested to keep
        reason: t(ctx.locale, 'duplicates.reason', { count: g.files.length }),
      }))
    );
    const dupFreeable = dupGroups.reduce((s, g) => s + g.size * (g.files.length - 1), 0);
    categories.duplicates = { label: dupLabel, items: dupItems, totalSize: dupFreeable, groups: dupGroups.length };
    totalFreeable += dupFreeable;
    ctx.onProgress?.({ phase: 'scanning', category: 'duplicates', label: dupLabel, stage: 'done', count: dupItems.length, totalSize: dupFreeable });

    const largeOldLabel = categoryLabel('large_old', ctx.locale);
    ctx.onProgress?.({ phase: 'scanning', category: 'large_old', label: largeOldLabel, stage: 'start' });
    const largeOld = await scanLargeOldFiles(dirs, ctx);
    const largeOldSize = largeOld.reduce((s, i) => s + i.size, 0);
    categories.large_old = { label: largeOldLabel, items: largeOld, totalSize: largeOldSize };
    totalFreeable += largeOldSize;
    ctx.onProgress?.({ phase: 'scanning', category: 'large_old', label: largeOldLabel, stage: 'done', count: largeOld.length, totalSize: largeOldSize });
  }

  return { categories, totalFreeable, cancelled: ctx.cancelToken.cancelled };
}

/**
 * Scans a single, user-chosen folder (e.g. via the Explorer "Scan this
 * folder" right-click entry) instead of the well-known system locations.
 * Only duplicates/large-files/empty-folders apply here — temp/cache/logs
 * are meaningless for an arbitrary folder. Thresholds are loosened versus
 * the background scan (10MB / any age instead of 100MB / 180 days) since
 * the user deliberately picked this folder to check right now, not to
 * surface stuff they forgot about.
 */
async function runFolderScan(folderPath, ctx) {
  const categories = {};
  let totalFreeable = 0;

  const dupLabel = categoryLabel('duplicates', ctx.locale);
  const dupGroups = await scanDuplicates([folderPath], ctx);
  const dupItems = dupGroups.flatMap((g) =>
    g.files.map((f, idx) => ({
      id: `dup_${g.hash}_${idx}`,
      category: 'duplicates',
      path: f,
      size: g.size,
      groupHash: g.hash,
      groupSize: g.files.length,
      keepSuggested: idx === 0,
      reason: t(ctx.locale, 'duplicates.reason', { count: g.files.length }),
    }))
  );
  const dupFreeable = dupGroups.reduce((s, g) => s + g.size * (g.files.length - 1), 0);
  categories.duplicates = { label: dupLabel, items: dupItems, totalSize: dupFreeable, groups: dupGroups.length };
  totalFreeable += dupFreeable;

  const largeOldLabel = categoryLabel('large_old', ctx.locale);
  const largeOld = await scanLargeOldFiles([folderPath], ctx, { minSize: 10 * 1024 * 1024, staleDays: 0 });
  const largeOldSize = largeOld.reduce((s, i) => s + i.size, 0);
  categories.large_old = { label: largeOldLabel, items: largeOld, totalSize: largeOldSize };
  totalFreeable += largeOldSize;

  const emptyLabel = categoryLabel('empty_folder', ctx.locale);
  const emptyItems = await junk.scanEmptyFoldersUnder(folderPath, ctx);
  const emptySize = emptyItems.reduce((s, i) => s + i.size, 0);
  categories.empty_folder = { label: emptyLabel, items: emptyItems, totalSize: emptySize };
  totalFreeable += emptySize;

  return { categories, totalFreeable, cancelled: ctx.cancelToken.cancelled, scopedTo: folderPath };
}

module.exports = { runFullScan, runFolderScan, CATEGORY_KEYS, categoryLabel };
