const fs = require('fs');
const path = require('path');

/**
 * Async-generator directory walk. Tolerant of permission errors (skips them),
 * avoids following symlinks (prevents cycles), and honors a shared
 * cancelToken ({ cancelled: boolean }) so scans can be aborted from the UI.
 *
 * Yields { fullPath, name, stats, isDirectory }.
 */
async function* walk(rootDir, { cancelToken, maxDepth = Infinity } = {}) {
  const stack = [{ dir: rootDir, depth: 0 }];

  while (stack.length) {
    if (cancelToken && cancelToken.cancelled) return;
    const { dir, depth } = stack.pop();

    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // permission denied / gone / not a dir — skip silently
    }

    for (const entry of entries) {
      if (cancelToken && cancelToken.cancelled) return;
      const fullPath = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) continue;

      let stats;
      try {
        stats = await fs.promises.lstat(fullPath);
      } catch {
        continue;
      }

      const isDirectory = entry.isDirectory();
      yield { fullPath, name: entry.name, stats, isDirectory };

      if (isDirectory && depth < maxDepth) {
        stack.push({ dir: fullPath, depth: depth + 1 });
      }
    }
  }
}

async function pathExists(p) {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

async function safeStat(p) {
  try {
    return await fs.promises.lstat(p);
  } catch {
    return null;
  }
}

module.exports = { walk, pathExists, safeStat };
