const { Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');
const { runFullScan } = require('./scanner');
const { getTopProcesses } = require('./system/resourceUsage');
const { readSettings, writeSettings } = require('./settings');
const { t } = require('./i18n');

const BG_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const BG_SCAN_FIRST_DELAY_MS = 5 * 60 * 1000; // wait 5 min after launch before the first one
const NOTIFY_THRESHOLD_BYTES = 500 * 1024 * 1024; // only notify if there's real clutter to report
const BUSY_CPU_THRESHOLD_PCT = 40; // a game or other demanding foreground task
const BUSY_RETRY_DELAY_MS = 15 * 60 * 1000; // check back sooner instead of waiting the full interval

/**
 * Skips the *scheduled* background scan (never the manual "Scan now") when
 * something is clearly using a lot of CPU right now — a game, a render, a
 * build. Deliberately a load-based heuristic rather than a list of game
 * process names: names change/rename constantly, while "something is
 * currently hogging the CPU" is a durable, general signal that this is a
 * bad moment to add a disk-scanning background task competing for
 * resources — matches the reasoning already used for driverInventory.js's
 * signature-based (not name-based) cheat detection.
 */
async function isSystemBusy() {
  try {
    const data = await getTopProcesses();
    if (!data.supported || !data.topCpu?.length) return false;
    return data.topCpu[0].CpuPct >= BUSY_CPU_THRESHOLD_PCT;
  } catch {
    return false;
  }
}

let tray = null;
let bgScanTimer = null;
let bgScanInFlight = false;

function trayIconPath() {
  const name = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  return path.join(__dirname, '..', 'build', name);
}

async function runBackgroundScan({ getMainWindow, userDataDir, locale, manual }) {
  if (bgScanInFlight) return;
  bgScanInFlight = true;
  try {
    const ctx = { cancelToken: { cancelled: false }, locale: locale || 'el', onProgress: () => {} };
    const result = await runFullScan(ctx);
    writeSettings(userDataDir, { lastBackgroundScanAt: new Date().toISOString() });
    const win = getMainWindow();
    win?.webContents.send('scan:backgroundResult', result);

    if (manual || result.totalFreeable >= NOTIFY_THRESHOLD_BYTES) {
      if (Notification.isSupported()) {
        const mb = Math.round(result.totalFreeable / (1024 * 1024));
        new Notification({
          title: t(locale || 'el', 'tray.bg_scan_notif_title'),
          body: t(locale || 'el', 'tray.bg_scan_notif_body', { mb }),
        }).show();
      }
    }
  } catch {
    /* background scan is best-effort; a failure here shouldn't surface anywhere disruptive */
  } finally {
    bgScanInFlight = false;
  }
}

function startScheduler(deps) {
  stopScheduler();
  bgScanTimer = setTimeout(async function tick() {
    if (await isSystemBusy()) {
      bgScanTimer = setTimeout(tick, BUSY_RETRY_DELAY_MS);
      return;
    }
    runBackgroundScan(deps);
    bgScanTimer = setTimeout(tick, BG_SCAN_INTERVAL_MS);
  }, BG_SCAN_FIRST_DELAY_MS);
}

function stopScheduler() {
  if (bgScanTimer) clearTimeout(bgScanTimer);
  bgScanTimer = null;
}

function setBackgroundScanEnabled(enabled, deps) {
  writeSettings(deps.userDataDir, { backgroundScanEnabled: enabled });
  if (enabled) startScheduler(deps);
  else stopScheduler();
  rebuildMenu(deps);
}

function rebuildMenu(deps) {
  if (!tray) return;
  const settings = readSettings(deps.userDataDir);
  const locale = deps.getLocale ? deps.getLocale() : 'el';
  const menu = Menu.buildFromTemplate([
    {
      label: t(locale, 'tray.open'),
      click: () => {
        const win = deps.getMainWindow();
        if (!win) return;
        win.show();
        win.focus();
      },
    },
    { label: t(locale, 'tray.scan_now'), click: () => runBackgroundScan({ ...deps, manual: true }) },
    { type: 'separator' },
    {
      label: t(locale, 'tray.bg_scan_toggle'),
      type: 'checkbox',
      checked: !!settings.backgroundScanEnabled,
      click: (item) => setBackgroundScanEnabled(item.checked, deps),
    },
    { type: 'separator' },
    {
      label: t(locale, 'tray.quit'),
      click: () => {
        deps.onQuit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip('Electron Security V2');
}

function createTray(deps) {
  if (tray) return tray;
  try {
    const icon = nativeImage.createFromPath(trayIconPath());
    tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }));
  } catch {
    return null;
  }
  rebuildMenu(deps);
  tray.on('click', () => {
    const win = deps.getMainWindow();
    if (!win) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  const settings = readSettings(deps.userDataDir);
  if (settings.backgroundScanEnabled) startScheduler(deps);

  return tray;
}

function destroyTray() {
  stopScheduler();
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { createTray, destroyTray, setBackgroundScanEnabled, runBackgroundScan, rebuildMenu };
