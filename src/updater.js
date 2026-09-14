const { autoUpdater } = require('electron-updater');

/**
 * Auto-update via electron-updater, reading straight from this project's
 * GitHub Releases (see package.json "build.publish") — no separate update
 * server needed. This is the third and last network exception in the app
 * (alongside the speed test and the admin panel's download-count check):
 * a background check runs a few seconds after launch and, if a newer
 * release exists, downloads it silently and installs it the next time the
 * app quits — matching how most desktop apps auto-update. The renderer is
 * still told about it via toast (see 'updater:event' below) so nothing
 * happens invisibly to the user, and they can trigger an install
 * immediately instead of waiting for the next quit if they want to.
 *
 * Only meaningful in a packaged build — a dev run (`npm start` / `electron .`)
 * has no installed-app version metadata for electron-updater to compare
 * against, so this is a no-op there.
 */
function setupAutoUpdater(getMainWindow) {
  if (!require('electron').app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (payload) => getMainWindow()?.webContents.send('updater:event', payload);

  autoUpdater.on('update-available', (info) => send({ type: 'available', version: info.version }));
  autoUpdater.on('update-downloaded', (info) => send({ type: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => send({ type: 'error', message: err.message }));
  // 'update-not-available' is the common case — intentionally silent, no toast for "you're already current".

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => { /* network hiccup — try again on next launch, not fatal */ });
  }, 8000);
}

function checkForUpdatesNow() {
  if (!require('electron').app.isPackaged) return Promise.resolve({ skipped: true, reason: 'not-packaged' });
  return autoUpdater.checkForUpdates().then(() => ({ skipped: false })).catch((err) => ({ skipped: true, reason: err.message }));
}

function installUpdateNow() {
  autoUpdater.quitAndInstall();
}

module.exports = { setupAutoUpdater, checkForUpdatesNow, installUpdateNow };
