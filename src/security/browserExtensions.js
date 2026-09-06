const fs = require('fs');
const path = require('path');
const { getLocations } = require('../utils/platform');
const { pathExists } = require('../utils/fsWalk');
const { t } = require('../i18n');

const HIGH_RISK_PERMISSIONS = new Set([
  'debugger', 'management', 'proxy', 'nativeMessaging', 'webRequest', 'webRequestBlocking',
  'clipboardRead', 'privacy', 'browsingData', 'declarativeNetRequest',
]);
const MEDIUM_RISK_PERMISSIONS = new Set([
  'tabs', 'cookies', 'history', 'geolocation', 'downloads', 'bookmarks', '<all_urls>', 'webNavigation',
]);

function classifyPermissions(perms = [], hostPerms = []) {
  const all = [...perms, ...hostPerms];
  if (all.some((p) => HIGH_RISK_PERMISSIONS.has(p) || p === '<all_urls>')) return 'medium';
  if (all.some((p) => MEDIUM_RISK_PERMISSIONS.has(p))) return 'low';
  return 'info'; // no risky permissions declared — not a finding, just inventory
}

async function readJsonSafe(p) {
  try {
    const raw = await fs.promises.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function scanChromiumExtensions(dir, browserName, locale) {
  const findings = [];
  if (!(await pathExists(dir))) return findings;
  let extIds;
  try {
    extIds = await fs.promises.readdir(dir);
  } catch {
    return findings;
  }

  for (const extId of extIds) {
    const extDir = path.join(dir, extId);
    let versions;
    try {
      versions = await fs.promises.readdir(extDir);
    } catch {
      continue;
    }
    for (const version of versions) {
      const manifestPath = path.join(extDir, version, 'manifest.json');
      const manifest = await readJsonSafe(manifestPath);
      if (!manifest) continue;
      const perms = manifest.permissions || [];
      const hostPerms = manifest.host_permissions || [];
      const severity = classifyPermissions(perms, hostPerms);
      findings.push({
        id: `ext_${browserName}_${extId}`,
        type: 'browser_extension',
        severity,
        title: `${browserName}: ${manifest.name || extId}`,
        detail: t(locale, 'ext.detail', { version: manifest.version || version, perms: [...perms, ...hostPerms].join(', ') || t(locale, 'ext.no_permissions') }),
      });
    }
  }
  return findings;
}

async function scanFirefoxExtensions(profilesDir, locale) {
  const findings = [];
  if (!(await pathExists(profilesDir))) return findings;
  let profiles;
  try {
    profiles = await fs.promises.readdir(profilesDir);
  } catch {
    return findings;
  }
  for (const profile of profiles) {
    const extJsonPath = path.join(profilesDir, profile, 'extensions.json');
    const data = await readJsonSafe(extJsonPath);
    if (!data || !Array.isArray(data.addons)) continue;
    for (const addon of data.addons) {
      if (addon.type !== 'extension' || !addon.active) continue;
      const perms = (addon.userPermissions && addon.userPermissions.permissions) || [];
      const hostPerms = (addon.userPermissions && addon.userPermissions.origins) || [];
      findings.push({
        id: `ext_firefox_${addon.id}`,
        type: 'browser_extension',
        severity: classifyPermissions(perms, hostPerms),
        title: `Firefox: ${addon.defaultLocale?.name || addon.id}`,
        detail: addon.version
          ? t(locale, 'ext.detail', { version: addon.version, perms: [...perms, ...hostPerms].join(', ') || t(locale, 'ext.no_permissions') })
          : `permissions: ${[...perms, ...hostPerms].join(', ') || t(locale, 'ext.no_permissions')}`,
      });
    }
  }
  return findings;
}

async function scanBrowserExtensions(ctx) {
  const loc = getLocations();
  const all = [];
  for (const entry of loc.browserExtensionDirs || []) {
    if (entry.browser === 'Firefox') {
      all.push(...(await scanFirefoxExtensions(entry.dir, ctx.locale)));
    } else {
      all.push(...(await scanChromiumExtensions(entry.dir, entry.browser, ctx.locale)));
    }
  }
  return all;
}

module.exports = { scanBrowserExtensions };
