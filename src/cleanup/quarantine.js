const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { t } = require('../i18n');

function newBatchId() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `${ts}_${crypto.randomBytes(3).toString('hex')}`;
}

async function ensureDir(p) {
  await fs.promises.mkdir(p, { recursive: true });
}

async function pathExists(p) {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Moves the given items into a timestamped quarantine batch instead of
 * deleting them, and writes a manifest.json so they can be restored later
 * (or purged once the retention window passes). This is what makes cleanup
 * reversible for `retentionDays`.
 */
async function moveToQuarantine({ items, quarantineRoot, retentionDays = 30, locale = 'el' }) {
  const batchId = newBatchId();
  const batchDir = path.join(quarantineRoot, batchId);
  const dataDir = path.join(batchDir, 'data');
  await ensureDir(dataDir);

  const manifestEntries = [];
  const errors = [];
  let totalSize = 0;

  let idx = 0;
  for (const item of items) {
    idx += 1;
    const safeName = `${idx}__${path.basename(item.path).replace(/[/\\]/g, '_')}`;
    const dest = path.join(dataDir, safeName);
    try {
      if (!(await pathExists(item.path))) {
        errors.push({ item, error: t(locale, 'quarantine.not_found') });
        continue;
      }
      await fs.promises.rename(item.path, dest);
      manifestEntries.push({
        id: item.id,
        category: item.category,
        originalPath: item.path,
        quarantinedPath: dest,
        size: item.size || 0,
        isDirectory: !!item.isDirectory,
        movedAt: new Date().toISOString(),
      });
      totalSize += item.size || 0;
    } catch (err) {
      // cross-device rename can fail (EXDEV) — fall back to copy+delete
      if (err.code === 'EXDEV') {
        try {
          await copyRecursive(item.path, dest);
          await fs.promises.rm(item.path, { recursive: true, force: true });
          manifestEntries.push({
            id: item.id,
            category: item.category,
            originalPath: item.path,
            quarantinedPath: dest,
            size: item.size || 0,
            isDirectory: !!item.isDirectory,
            movedAt: new Date().toISOString(),
          });
          totalSize += item.size || 0;
          continue;
        } catch (err2) {
          errors.push({ item, error: err2.message });
          continue;
        }
      }
      errors.push({ item, error: err.message });
    }
  }

  const manifest = {
    batchId,
    createdAt: new Date().toISOString(),
    retentionDays,
    expiresAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString(),
    items: manifestEntries,
  };
  await fs.promises.writeFile(path.join(batchDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  return { batchId, moved: manifestEntries, errors, totalSize };
}

async function copyRecursive(src, dest) {
  const stat = await fs.promises.lstat(src);
  if (stat.isDirectory()) {
    await ensureDir(dest);
    const entries = await fs.promises.readdir(src);
    for (const e of entries) {
      await copyRecursive(path.join(src, e), path.join(dest, e));
    }
  } else {
    await fs.promises.copyFile(src, dest);
  }
}

async function listBatches({ quarantineRoot }) {
  if (!(await pathExists(quarantineRoot))) return [];
  const dirs = await fs.promises.readdir(quarantineRoot);
  const batches = [];
  for (const d of dirs) {
    const manifestPath = path.join(quarantineRoot, d, 'manifest.json');
    if (!(await pathExists(manifestPath))) continue;
    try {
      const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
      const totalSize = manifest.items.reduce((s, i) => s + (i.size || 0), 0);
      batches.push({ ...manifest, totalSize, itemCount: manifest.items.length });
    } catch {
      /* corrupted manifest, skip */
    }
  }
  return batches.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function restoreBatch({ quarantineRoot, batchId, locale = 'el' }) {
  const batchDir = path.join(quarantineRoot, batchId);
  const manifestPath = path.join(batchDir, 'manifest.json');
  if (!(await pathExists(manifestPath))) throw new Error(t(locale, 'quarantine.unknown_batch'));
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));

  const restored = [];
  const errors = [];
  const remaining = [];

  for (const entry of manifest.items) {
    try {
      await ensureDir(path.dirname(entry.originalPath));
      if (await pathExists(entry.originalPath)) {
        errors.push({ entry, error: t(locale, 'quarantine.already_exists') });
        remaining.push(entry);
        continue;
      }
      await fs.promises.rename(entry.quarantinedPath, entry.originalPath);
      restored.push(entry);
    } catch (err) {
      errors.push({ entry, error: err.message });
      remaining.push(entry);
    }
  }

  if (remaining.length === 0) {
    await fs.promises.rm(batchDir, { recursive: true, force: true });
  } else {
    manifest.items = remaining;
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  }

  return { restored, errors };
}

async function purgeExpiredBatches({ quarantineRoot }) {
  const batches = await listBatches({ quarantineRoot });
  const purged = [];
  const now = Date.now();
  for (const batch of batches) {
    if (new Date(batch.expiresAt).getTime() <= now) {
      await fs.promises.rm(path.join(quarantineRoot, batch.batchId), { recursive: true, force: true });
      purged.push(batch.batchId);
    }
  }
  return purged;
}

async function purgeBatchNow({ quarantineRoot, batchId }) {
  await fs.promises.rm(path.join(quarantineRoot, batchId), { recursive: true, force: true });
}

/** Direct, permanent delete — used only when the user explicitly opts out of quarantine. */
async function permanentlyDelete({ items }) {
  const deleted = [];
  const errors = [];
  for (const item of items) {
    try {
      await fs.promises.rm(item.path, { recursive: true, force: true });
      deleted.push(item);
    } catch (err) {
      errors.push({ item, error: err.message });
    }
  }
  return { deleted, errors };
}

module.exports = {
  moveToQuarantine,
  listBatches,
  restoreBatch,
  purgeExpiredBatches,
  purgeBatchNow,
  permanentlyDelete,
};
