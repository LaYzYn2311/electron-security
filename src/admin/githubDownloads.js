const https = require('https');
const { GITHUB_REPO } = require('./config');

/**
 * Reads release download counts from GitHub's public REST API — no auth
 * needed for a public repo, and GitHub does the counting, so this app
 * never needs its own telemetry/backend for "how many people downloaded
 * it". This is the one admin-panel feature that touches the network; it
 * only ever runs when an admin opens the Downloads section, never for
 * regular users.
 */
function httpsGetJson(hostname, urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      { hostname, path: urlPath, headers: { 'User-Agent': 'electron-security-admin-panel', Accept: 'application/vnd.github+json' }, timeout: 10000 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub API HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

async function fetchDownloadStats() {
  const { owner, name } = GITHUB_REPO;
  if (!owner || !name) {
    return { configured: false };
  }

  const releases = await httpsGetJson('api.github.com', `/repos/${owner}/${name}/releases`);
  if (!Array.isArray(releases)) {
    throw new Error('Unexpected GitHub API response');
  }

  let totalDownloads = 0;
  const perRelease = releases.map((r) => {
    const assets = (r.assets || []).map((a) => ({ name: a.name, downloadCount: a.download_count, sizeBytes: a.size }));
    const releaseTotal = assets.reduce((s, a) => s + a.downloadCount, 0);
    totalDownloads += releaseTotal;
    return { tag: r.tag_name, name: r.name, publishedAt: r.published_at, url: r.html_url, downloads: releaseTotal, assets };
  });

  return {
    configured: true,
    repo: `${owner}/${name}`,
    totalDownloads,
    releases: perRelease,
  };
}

module.exports = { fetchDownloadStats };
