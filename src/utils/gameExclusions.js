'use strict';

/**
 * Folder-name keywords (case-insensitive substring match against the full
 * path) that identify a game install / launcher directory. Junk/large-file/
 * duplicate scanners must never suggest deleting anything under these —
 * only their own cache-labeled subfolders (see CACHE_KEYWORDS) stay eligible.
 * Deleting the wrong file inside a game or launcher install is exactly the
 * kind of "shouldn't have touched that" mistake this list exists to prevent.
 */
const GAME_LAUNCHER_KEYWORDS = [
  'steam', 'steamapps', 'steamlibrary',
  'epic games', 'epicgameslauncher',
  'origin', 'ea games', 'ea desktop', 'the ea app', 'ea sports',
  'ubisoft game launcher', 'ubisoft', 'uplay',
  'gog galaxy', 'gog games', 'goggalaxy',
  'battle.net', 'battlenet',
  'riot games', 'league of legends', 'valorant',
  'rockstar games', 'social club',
  'itch', 'itch.io',
  'xboxgames', 'windowsapps',
  'bethesda.net launcher', 'bethesda softworks',
  'wargaming.net', 'playstation', 'psplus',
  '2k games', 'ea play',
  'minecraft launcher', 'curseforge', 'multimc', 'prismlauncher',
  'amazon games', 'blizzard',
];

/**
 * Path segments that mark a genuine cache/temp/log location. If a path
 * matches a game/launcher keyword AND one of these, it's still fair game
 * for the junk scanner (e.g. Steam's own shader/download cache).
 */
const CACHE_KEYWORDS = [
  'cache', 'caches', 'temp', 'tmp', 'logs', 'log',
  'crashdumps', 'dumps', 'dump', 'downloading',
  'shadercache', 'shader_cache', 'shader cache',
  'gpucache', 'httpcache', 'webcache',
];

function pathMatchesAny(fullPath, keywords) {
  const lower = fullPath.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/**
 * True if this path belongs to a game/launcher install and is NOT a
 * cache-type subpath — i.e. scanners should leave it alone entirely.
 */
function isProtectedGamePath(fullPath) {
  if (!pathMatchesAny(fullPath, GAME_LAUNCHER_KEYWORDS)) return false;
  return !pathMatchesAny(fullPath, CACHE_KEYWORDS);
}

module.exports = { isProtectedGamePath, GAME_LAUNCHER_KEYWORDS, CACHE_KEYWORDS };
