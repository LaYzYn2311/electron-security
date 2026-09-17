const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const { runFullScan, runFolderScan } = require('./src/scanner');
const { runSecurityScan } = require('./src/security');
const { runSpeedTest } = require('./src/speedtest');
const { moveToQuarantine, listBatches, restoreBatch, purgeExpiredBatches, purgeBatchNow, permanentlyDelete } = require('./src/cleanup/quarantine');
const { createRestorePoint } = require('./src/cleanup/restorePoint');
const { appendLog, readLog } = require('./src/cleanup/cleanupLog');
const { computeReport } = require('./src/report/healthScore');
const { registerContextMenu, unregisterContextMenu, contextMenuStatus } = require('./src/utils/contextMenu');
const { ADMIN_USERNAME, ADMIN_PASSWORD } = require('./src/admin/config');
const { collectDiagnostics } = require('./src/admin/diagnostics');
const { installErrorLogger, readErrorLog } = require('./src/admin/errorLog');
const { fetchDownloadStats } = require('./src/admin/githubDownloads');
const { setupAutoUpdater, checkForUpdatesNow, installUpdateNow } = require('./src/updater');
const { createTray, destroyTray, setBackgroundScanEnabled, runBackgroundScan } = require('./src/tray');
const { readSettings, writeSettings } = require('./src/settings');
const { getChangelogFor } = require('./src/changelog');
const { getTopProcesses } = require('./src/system/resourceUsage');
const { getPublicIpInfo, geolocateIps, getLocalNetworkInfo } = require('./src/network/ipInfo');
const { t } = require('./src/i18n');

function extractScanFolderArg(argv) {
  const idx = argv.indexOf('--scan-folder');
  return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : null;
}

function getContextMenuTarget() {
  if (app.isPackaged) return { exePath: process.execPath, extraArgs: [] };
  return { exePath: process.execPath, extraArgs: [__dirname] };
}

let mainWindow;
let scanCancelToken = { cancelled: false };
let securityCancelToken = { cancelled: false };
let speedtestCancelToken = { cancelled: false };
let isQuitting = false;
let currentLocale = 'el';

function userDataPaths() {
  const root = app.getPath('userData');
  return {
    quarantineRoot: path.join(root, 'Quarantine'),
    logFile: path.join(root, 'cleanup-log.jsonl'),
  };
}

// Packaged builds pick up the platform icon (icon.icns/.ico) automatically
// from the app bundle itself; `build/` isn't shipped inside app.asar, so this
// file path only resolves — and is only needed — in `npm start` dev mode,
// where macOS/Windows would otherwise show the generic Electron icon.
const devIconPath = !app.isPackaged ? path.join(__dirname, 'build', 'icon.png') : undefined;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    title: 'Electron Security V2',
    autoHideMenuBar: true,
    ...(devIconPath ? { icon: devIconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Windows: closing the window hides it to the tray instead of quitting, so
  // the scheduled background scan (if enabled) keeps running. Only "Έξοδος"
  // from the tray menu, or an actual app quit, sets isQuitting first.
  if (process.platform === 'win32') {
    mainWindow.on('close', (event) => {
      if (isQuitting) return;
      event.preventDefault();
      mainWindow.hide();
      const settings = readSettings(app.getPath('userData'));
      if (!settings.hasShownTrayHideNotice && Notification.isSupported()) {
        new Notification({
          title: t(currentLocale, 'tray.hide_notice_title'),
          body: t(currentLocale, 'tray.hide_notice_body'),
        }).show();
      }
      writeSettings(app.getPath('userData'), { hasShownTrayHideNotice: true });
    });
  }
}

// Single-instance: a second launch (e.g. right-clicking another folder while
// the app is already open) should route into the existing window instead of
// opening a confusing second one.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    // Closing to tray hides the window (not the same state as "minimized"),
    // so a re-launch (double-clicking the shortcut again while already
    // running) needs its own show() or the window silently stays hidden.
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    const folder = extractScanFolderArg(argv);
    if (folder) mainWindow.webContents.send('scan:targetFolder', folder);
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    installErrorLogger(app.getPath('userData'));
    if (devIconPath && process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(devIconPath);
    }
    createWindow();
    setupAutoUpdater(() => mainWindow);
    const initialFolder = extractScanFolderArg(process.argv);
    if (initialFolder) {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('scan:targetFolder', initialFolder);
      });
    }
    createTray({
      getMainWindow: () => mainWindow,
      userDataDir: app.getPath('userData'),
      getLocale: () => currentLocale,
      onQuit: () => { isQuitting = true; app.quit(); },
    });
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else { mainWindow.show(); mainWindow.focus(); }
    });
  });

  app.on('before-quit', () => { isQuitting = true; });
  app.on('will-quit', () => destroyTray());

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// ---- Admin panel ----
// The credential check happens here, in the main process, so the actual
// password value never has to ship inside the renderer bundle — it's still
// readable from this file inside app.asar by anyone who downloads the app
// (see src/admin/config.js), just not the first place someone would look.
ipcMain.handle('admin:login', async (event, username, password) => {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
});

ipcMain.handle('admin:diagnostics', async () => {
  return collectDiagnostics({ app, userDataPaths });
});

ipcMain.handle('admin:errorLog', async () => {
  return readErrorLog(app.getPath('userData'));
});

ipcMain.handle('admin:githubDownloads', async () => {
  try {
    return await fetchDownloadStats();
  } catch (err) {
    return { configured: true, error: err.message };
  }
});

ipcMain.handle('admin:openUserData', async () => {
  shell.openPath(app.getPath('userData'));
  return true;
});

// ---- Scan ----
ipcMain.handle('scan:start', async (event, locale) => {
  scanCancelToken = { cancelled: false };
  const ctx = {
    cancelToken: scanCancelToken,
    locale: locale || 'el',
    onProgress: (data) => mainWindow?.webContents.send('scan:progress', data),
  };
  const result = await runFullScan(ctx);
  return result;
});

ipcMain.handle('scan:folder', async (event, folderPath, locale) => {
  scanCancelToken = { cancelled: false };
  const ctx = {
    cancelToken: scanCancelToken,
    locale: locale || 'el',
    onProgress: (data) => mainWindow?.webContents.send('scan:progress', data),
  };
  return runFolderScan(folderPath, ctx);
});

// ---- Explorer context menu ----
ipcMain.handle('contextmenu:register', async () => {
  const { exePath, extraArgs } = getContextMenuTarget();
  return registerContextMenu({ exePath, extraArgs });
});

ipcMain.handle('contextmenu:unregister', async () => unregisterContextMenu());

ipcMain.handle('contextmenu:status', async () => contextMenuStatus());

ipcMain.handle('scan:cancel', async () => {
  scanCancelToken.cancelled = true;
  return true;
});

// ---- Security ----
ipcMain.handle('security:start', async (event, locale) => {
  securityCancelToken = { cancelled: false };
  const ctx = {
    cancelToken: securityCancelToken,
    locale: locale || 'el',
    onProgress: (data) => mainWindow?.webContents.send('security:progress', data),
  };
  const result = await runSecurityScan(ctx);
  return result;
});

ipcMain.handle('security:cancel', async () => {
  securityCancelToken.cancelled = true;
  return true;
});

// ---- Speed test ----
ipcMain.handle('speedtest:start', async (event) => {
  speedtestCancelToken = { cancelled: false };
  const ctx = {
    cancelToken: speedtestCancelToken,
    onProgress: (data) => mainWindow?.webContents.send('speedtest:progress', data),
  };
  try {
    return await runSpeedTest(ctx);
  } catch (err) {
    return { error: err.message || String(err) };
  }
});

ipcMain.handle('speedtest:cancel', async () => {
  speedtestCancelToken.cancelled = true;
  return true;
});

// ---- Cleanup ----
ipcMain.handle('cleanup:run', async (event, { items, useQuarantine, retentionDays, locale, createRestorePointFirst }) => {
  const { quarantineRoot, logFile } = userDataPaths();
  let restorePointResult = null;
  if (createRestorePointFirst) {
    restorePointResult = await createRestorePoint('Electron Security cleanup');
    if (!restorePointResult.created && Notification.isSupported()) {
      new Notification({
        title: t(locale || 'el', 'notif.restore_point_failed_title'),
        body: t(locale || 'el', 'notif.restore_point_failed_body', { reason: restorePointResult.reason || '?' }),
      }).show();
    }
  }
  let result;
  if (useQuarantine) {
    result = await moveToQuarantine({ items, quarantineRoot, retentionDays: retentionDays || 30, locale: locale || 'el' });
    await appendLog(logFile, {
      action: 'quarantine',
      batchId: result.batchId,
      itemCount: result.moved.length,
      totalSize: result.totalSize,
      errorCount: result.errors.length,
      items: result.moved.map((m) => ({ originalPath: m.originalPath, size: m.size, category: m.category })),
    });
  } else {
    result = await permanentlyDelete({ items });
    await appendLog(logFile, {
      action: 'permanent_delete',
      itemCount: result.deleted.length,
      totalSize: result.deleted.reduce((s, i) => s + (i.size || 0), 0),
      errorCount: result.errors.length,
      items: result.deleted.map((i) => ({ path: i.path, size: i.size, category: i.category })),
    });
  }
  return { ...result, restorePoint: restorePointResult };
});

ipcMain.handle('updater:checkNow', async () => checkForUpdatesNow());
ipcMain.handle('updater:installNow', async () => { installUpdateNow(); return true; });

// ---- Locale (needed by the tray menu / native notifications, which live outside the renderer) ----
ipcMain.on('locale:set', (event, locale) => { currentLocale = locale || 'el'; });

// ---- App version / changelog (for the "What's New" screen) ----
ipcMain.handle('app:getVersion', async () => app.getVersion());
ipcMain.handle('app:getChangelog', async (event, version) => getChangelogFor(version));

// ---- Background scan setting (tray) ----
ipcMain.handle('settings:getBackgroundScan', async () => {
  const settings = readSettings(app.getPath('userData'));
  return !!settings.backgroundScanEnabled;
});
ipcMain.handle('settings:setBackgroundScan', async (event, enabled) => {
  setBackgroundScanEnabled(!!enabled, {
    getMainWindow: () => mainWindow,
    userDataDir: app.getPath('userData'),
    getLocale: () => currentLocale,
    onQuit: () => { isQuitting = true; app.quit(); },
  });
  return true;
});
ipcMain.handle('network:localInfo', async () => {
  try {
    return await getLocalNetworkInfo();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('network:publicIp', async () => {
  try {
    return await getPublicIpInfo();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('network:geolocateIps', async (event, ips) => {
  try {
    return await geolocateIps(ips);
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('system:topProcesses', async () => {
  try {
    return await getTopProcesses();
  } catch (err) {
    return { supported: false, error: err.message };
  }
});

ipcMain.handle('scan:runBackgroundNow', async () => {
  await runBackgroundScan({
    getMainWindow: () => mainWindow,
    userDataDir: app.getPath('userData'),
    locale: currentLocale,
    manual: true,
  });
  return true;
});

ipcMain.handle('system:openProtectionSettings', async () => {
  if (process.platform !== 'win32') return { ok: false, reason: 'unsupported-platform' };
  return new Promise((resolve) => {
    // SystemPropertiesProtection.exe needs to go through ShellExecute (what
    // `cmd /c start` triggers) — spawning it directly via execFile/spawn
    // fails with EACCES on this kind of system utility, and execFile without
    // a callback swallows that failure silently (the 'error' event fires on
    // the returned ChildProcess, which nothing was listening to), so the old
    // code always reported success even when nothing opened.
    const child = execFile('cmd.exe', ['/c', 'start', '""', 'SystemPropertiesProtection.exe'], { windowsHide: true });
    child.on('error', (err) => resolve({ ok: false, reason: err.message }));
    child.on('exit', (code) => resolve(code === 0 ? { ok: true } : { ok: false, reason: `exit code ${code}` }));
  });
});

ipcMain.handle('quarantine:list', async () => {
  const { quarantineRoot } = userDataPaths();
  return listBatches({ quarantineRoot });
});

ipcMain.handle('quarantine:restore', async (event, batchId, locale) => {
  const { quarantineRoot, logFile } = userDataPaths();
  const result = await restoreBatch({ quarantineRoot, batchId, locale: locale || 'el' });
  await appendLog(logFile, {
    action: 'restore',
    batchId,
    itemCount: result.restored.length,
    errorCount: result.errors.length,
  });
  return result;
});

ipcMain.handle('quarantine:purgeNow', async (event, batchId) => {
  const { quarantineRoot, logFile } = userDataPaths();
  await purgeBatchNow({ quarantineRoot, batchId });
  await appendLog(logFile, { action: 'purge', batchId });
  return true;
});

ipcMain.handle('quarantine:purgeExpired', async () => {
  const { quarantineRoot, logFile } = userDataPaths();
  const purged = await purgeExpiredBatches({ quarantineRoot });
  if (purged.length) await appendLog(logFile, { action: 'purge_expired', batchIds: purged });
  return purged;
});

ipcMain.handle('cleanup:log', async () => {
  const { logFile } = userDataPaths();
  return readLog(logFile);
});

ipcMain.handle('shell:showInFolder', async (event, targetPath) => {
  shell.showItemInFolder(targetPath);
  return true;
});

// Only ever opens a small, hardcoded allowlist of trusted URLs this app
// constructs itself (never an arbitrary renderer-supplied string) — see the
// haveibeenpwned button, the only caller.
const EXTERNAL_URL_ALLOWLIST = ['https://haveibeenpwned.com/'];
ipcMain.handle('shell:openExternal', async (event, url) => {
  if (!EXTERNAL_URL_ALLOWLIST.includes(url)) return { ok: false, reason: 'not-allowlisted' };
  await shell.openExternal(url);
  return { ok: true };
});

// ---- Report ----
ipcMain.handle('report:generate', async (event, { scanResult, securityResult, locale }) => {
  return computeReport({ scanResult, securityResult, locale: locale || 'el' });
});

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

ipcMain.handle('report:exportJson', async (event, payload, locale) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: t(locale || 'el', 'dialog.export_json_title'),
    defaultPath: path.join(app.getPath('documents'), `system-report-${Date.now()}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { canceled: false, filePath };
});

ipcMain.handle('report:exportCsv', async (event, { scanResult, securityResult }, locale) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: t(locale || 'el', 'dialog.export_csv_title'),
    defaultPath: path.join(app.getPath('documents'), `system-report-${Date.now()}.csv`),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (canceled || !filePath) return { canceled: true };

  const rows = [['section', 'type', 'severity_or_size', 'title_or_path', 'detail']];
  for (const [key, cat] of Object.entries(scanResult?.categories || {})) {
    for (const item of cat.items) rows.push(['scan', key, String(item.size), item.path, item.reason || '']);
  }
  for (const f of securityResult?.allFindings || []) {
    rows.push(['security', f.type, f.severity, f.title, f.detail || '']);
  }
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  await fs.promises.writeFile(filePath, csv, 'utf8');
  return { canceled: false, filePath };
});

ipcMain.handle('report:exportPdf', async (event, reportHtml, locale) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: t(locale || 'el', 'dialog.export_pdf_title'),
    defaultPath: path.join(app.getPath('documents'), `system-report-${Date.now()}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { canceled: true };

  const pdfWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await pdfWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(reportHtml));
    const pdfBuffer = await pdfWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    await fs.promises.writeFile(filePath, pdfBuffer);
    return { canceled: false, filePath };
  } finally {
    pdfWindow.destroy();
  }
});
