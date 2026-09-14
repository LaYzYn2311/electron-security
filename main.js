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
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

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

ipcMain.handle('system:openProtectionSettings', async () => {
  if (process.platform !== 'win32') return { ok: false, reason: 'unsupported-platform' };
  try {
    execFile('SystemPropertiesProtection.exe');
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
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

// ---- Report ----
ipcMain.handle('report:generate', async (event, { scanResult, securityResult, locale }) => {
  return computeReport({ scanResult, securityResult, locale: locale || 'el' });
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
