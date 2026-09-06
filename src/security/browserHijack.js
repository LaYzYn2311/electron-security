const fs = require('fs');
const path = require('path');
const { home, platform } = require('../utils/platform');
const { pathExists } = require('../utils/fsWalk');
const { t } = require('../i18n');

/**
 * Reads Chrome/Edge's own Preferences JSON for the default search engine and
 * startup pages — the two things browser-hijacker adware almost always
 * changes. Search engine is checked against a known-good allowlist (medium
 * severity if it points somewhere unrecognized — the single most reliable
 * hijack signal there is, since hijackers use obscure domains, not spoofed
 * major ones). Homepage/startup URLs are reported informationally only:
 * there's no reliable way to tell "user's own choice" from "hijacked"
 * without a live reputation feed, and this app doesn't do live lookups.
 * Firefox isn't covered — its prefs.js/search config aren't JSON, and the
 * two Chromium browsers already cover most Windows users.
 */
const KNOWN_SEARCH_DOMAINS = [
  'google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com', 'ecosia.org',
  'search.brave.com', 'startpage.com', 'qwant.com',
];

function envPath(name, fallback) {
  return process.env[name] || fallback;
}

function chromiumPreferencesPaths() {
  if (platform !== 'win32') return [];
  const localAppData = envPath('LOCALAPPDATA', path.join(home, 'AppData/Local'));
  return [
    { browser: 'Chrome', file: path.join(localAppData, 'Google/Chrome/User Data/Default/Preferences') },
    { browser: 'Edge', file: path.join(localAppData, 'Microsoft/Edge/User Data/Default/Preferences') },
  ];
}

async function readJsonSafe(p) {
  try {
    return JSON.parse(await fs.promises.readFile(p, 'utf8'));
  } catch {
    return null;
  }
}

function domainOf(url) {
  const m = String(url || '').match(/^https?:\/\/([^/]+)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : null;
}

async function scanBrowserHijack(ctx) {
  const findings = [];

  for (const { browser, file } of chromiumPreferencesPaths()) {
    if (!(await pathExists(file))) continue;
    const prefs = await readJsonSafe(file);
    if (!prefs) continue;

    const providerData = prefs.default_search_provider_data || {};
    const searchData = providerData.template_url_data || providerData.mirrored_template_url_data;
    if (searchData && searchData.url) {
      const domain = domainOf(searchData.url);
      const known = domain && KNOWN_SEARCH_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d));
      const name = searchData.short_name || domain || '?';
      findings.push(known
        ? { id: `search_${browser}`, type: 'browser_hijack', severity: 'ok', title: t(ctx.locale, 'hijack.search_ok_title', { browser, name }), detail: '' }
        : { id: `search_${browser}`, type: 'browser_hijack', severity: 'medium', title: t(ctx.locale, 'hijack.search_unknown_title', { browser, name }), detail: t(ctx.locale, 'hijack.search_unknown_detail', { url: searchData.url }) });
    } else {
      // no override recorded at all — the browser is using its own built-in default, which is safe
      findings.push({ id: `search_${browser}`, type: 'browser_hijack', severity: 'ok', title: t(ctx.locale, 'hijack.search_ok_title', { browser, name: t(ctx.locale, 'hijack.default_provider') }), detail: '' });
    }

    const session = prefs.session || {};
    if (session.restore_on_startup === 4 && Array.isArray(session.startup_urls) && session.startup_urls.length) {
      findings.push({ id: `startup_${browser}`, type: 'browser_hijack', severity: 'info', title: t(ctx.locale, 'hijack.startup_title', { browser }), detail: session.startup_urls.join(', ') });
    } else if (prefs.homepage && prefs.homepage_is_newtabpage === false) {
      findings.push({ id: `homepage_${browser}`, type: 'browser_hijack', severity: 'info', title: t(ctx.locale, 'hijack.homepage_title', { browser }), detail: prefs.homepage });
    }
  }

  if (findings.length === 0) {
    findings.push({ id: 'hijack_unavailable', type: 'browser_hijack', severity: 'info', title: t(ctx.locale, 'hijack.unavailable_title'), detail: '' });
  }
  return findings;
}

module.exports = { scanBrowserHijack };
