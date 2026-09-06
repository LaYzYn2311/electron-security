const fs = require('fs');
const crypto = require('crypto');
const { walk } = require('../utils/fsWalk');
const { isProtectedGamePath } = require('../utils/gameExclusions');

const MIN_SIZE = 4 * 1024; // ignore tiny files, too many false positives / not worth it

async function hashFile(fullPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(fullPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Finds duplicate files (identical content) under the given root directories.
 * Strategy: group candidates by size first (cheap), then only hash files that
 * share a size with at least one other file (expensive step, minimized).
 * Returns groups: [{ hash, size, files: [fullPath, ...] }], each group's
 * "savable" size = size * (files.length - 1) since one copy must be kept.
 */
async function scanDuplicates(rootDirs, ctx) {
  const bySize = new Map(); // size -> [fullPath]

  for (const root of rootDirs) {
    if (ctx.cancelToken.cancelled) break;
    for await (const entry of walk(root, { cancelToken: ctx.cancelToken })) {
      if (entry.isDirectory) continue;
      if (isProtectedGamePath(entry.fullPath)) continue;
      if (entry.stats.size < MIN_SIZE) continue;
      const arr = bySize.get(entry.stats.size) || [];
      arr.push(entry.fullPath);
      bySize.set(entry.stats.size, arr);
      ctx.onProgress?.({ category: 'duplicates_scan', current: entry.fullPath });
    }
  }

  const candidates = [];
  for (const [size, files] of bySize.entries()) {
    if (files.length > 1) candidates.push({ size, files });
  }

  const groups = [];
  let hashed = 0;
  const totalToHash = candidates.reduce((n, c) => n + c.files.length, 0);

  for (const { size, files } of candidates) {
    if (ctx.cancelToken.cancelled) break;
    const byHash = new Map();
    for (const f of files) {
      if (ctx.cancelToken.cancelled) break;
      let h;
      try {
        h = await hashFile(f);
      } catch {
        continue; // unreadable, skip
      }
      hashed++;
      ctx.onProgress?.({ category: 'duplicates_hash', scanned: hashed, total: totalToHash, current: f });
      const arr = byHash.get(h) || [];
      arr.push(f);
      byHash.set(h, arr);
    }
    for (const [hash, matchedFiles] of byHash.entries()) {
      if (matchedFiles.length > 1) {
        groups.push({ hash, size, files: matchedFiles });
      }
    }
  }

  return groups;
}

module.exports = { scanDuplicates };
