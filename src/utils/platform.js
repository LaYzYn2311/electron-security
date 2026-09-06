const os = require('os');
const path = require('path');

const home = os.homedir();
const platform = process.platform; // 'darwin' | 'win32' | 'linux'

function envPath(name, fallback) {
  return process.env[name] || fallback;
}

/**
 * Central registry of well-known, per-OS locations. Every path here is a
 * *candidate* — callers must check existence before touching anything, since
 * not every path exists on every machine/user account.
 */
function getLocations() {
  if (platform === 'darwin') {
    return {
      tempDirs: [os.tmpdir(), '/private/tmp', path.join(home, 'Library/Caches/TemporaryItems')],
      logDirs: ['/var/log', path.join(home, 'Library/Logs')],
      browserCacheDirs: [
        path.join(home, 'Library/Caches/Google/Chrome'),
        path.join(home, 'Library/Caches/com.apple.Safari'),
        path.join(home, 'Library/Caches/Firefox'),
        path.join(home, 'Library/Caches/com.microsoft.edgemac'),
      ],
      appCacheDirs: [
        path.join(home, 'Library/Caches'),
        path.join(home, '.npm/_cacache'),
        path.join(home, '.cache/pip'),
        path.join(home, 'Library/Developer/Xcode/DerivedData'),
        path.join(home, 'Library/Developer/Xcode/Archives'),
        path.join(home, 'Library/Containers/com.docker.docker/Data/vms'),
      ],
      downloadsDir: path.join(home, 'Downloads'),
      trashDirs: [path.join(home, '.Trash')],
      startupLocations: [
        path.join(home, 'Library/LaunchAgents'),
        '/Library/LaunchAgents',
        '/Library/LaunchDaemons',
        path.join(home, 'Library/Application Support/com.apple.backgroundtaskmanagementagent'),
      ],
      loginItemsPlist: path.join(home, 'Library/Preferences/com.apple.loginitems.plist'),
      browserExtensionDirs: [
        { browser: 'Chrome', dir: path.join(home, 'Library/Application Support/Google/Chrome/Default/Extensions') },
        { browser: 'Edge', dir: path.join(home, 'Library/Application Support/Microsoft Edge/Default/Extensions') },
        { browser: 'Firefox', dir: path.join(home, 'Library/Application Support/Firefox/Profiles') },
      ],
    };
  }

  if (platform === 'win32') {
    const localAppData = envPath('LOCALAPPDATA', path.join(home, 'AppData/Local'));
    const appData = envPath('APPDATA', path.join(home, 'AppData/Roaming'));
    const winDir = envPath('WINDIR', 'C:\\Windows');
    return {
      tempDirs: [os.tmpdir(), path.join(winDir, 'Temp')],
      logDirs: [path.join(winDir, 'Logs')],
      browserCacheDirs: [
        path.join(localAppData, 'Google/Chrome/User Data/Default/Cache'),
        path.join(localAppData, 'Microsoft/Edge/User Data/Default/Cache'),
        path.join(localAppData, 'Mozilla/Firefox/Profiles'),
      ],
      appCacheDirs: [
        path.join(appData, 'npm-cache'),
        path.join(localAppData, 'pip/Cache'),
        path.join(localAppData, 'Docker'),
        path.join(localAppData, 'Temp'),
      ],
      downloadsDir: path.join(home, 'Downloads'),
      trashDirs: [], // Recycle Bin needs Shell API; surfaced separately with a note
      startupLocations: [
        path.join(appData, 'Microsoft/Windows/Start Menu/Programs/Startup'),
        path.join(envPath('PROGRAMDATA', 'C:\\ProgramData'), 'Microsoft/Windows/Start Menu/Programs/StartUp'),
      ],
      browserExtensionDirs: [
        { browser: 'Chrome', dir: path.join(localAppData, 'Google/Chrome/User Data/Default/Extensions') },
        { browser: 'Edge', dir: path.join(localAppData, 'Microsoft/Edge/User Data/Default/Extensions') },
      ],
    };
  }

  // linux
  return {
    tempDirs: [os.tmpdir(), '/var/tmp'],
    logDirs: ['/var/log', path.join(home, '.local/share/xorg')],
    browserCacheDirs: [
      path.join(home, '.cache/google-chrome'),
      path.join(home, '.cache/mozilla/firefox'),
      path.join(home, '.cache/chromium'),
    ],
    appCacheDirs: [
      path.join(home, '.cache'),
      path.join(home, '.npm/_cacache'),
      path.join(home, '.cache/pip'),
      path.join(home, '.local/share/docker'),
    ],
    downloadsDir: path.join(home, 'Downloads'),
    trashDirs: [path.join(home, '.local/share/Trash/files')],
    startupLocations: [
      path.join(home, '.config/autostart'),
      '/etc/xdg/autostart',
    ],
    browserExtensionDirs: [
      { browser: 'Chrome', dir: path.join(home, '.config/google-chrome/Default/Extensions') },
      { browser: 'Chromium', dir: path.join(home, '.config/chromium/Default/Extensions') },
      { browser: 'Firefox', dir: path.join(home, '.mozilla/firefox') },
    ],
  };
}

module.exports = { platform, home, getLocations };
