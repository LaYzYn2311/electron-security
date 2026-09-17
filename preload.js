const { contextBridge, ipcRenderer } = require('electron');

function onProgress(channel, callback) {
  const listener = (event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('api', {
  scanStart: (locale) => ipcRenderer.invoke('scan:start', locale),
  scanFolder: (folderPath, locale) => ipcRenderer.invoke('scan:folder', folderPath, locale),
  scanCancel: () => ipcRenderer.invoke('scan:cancel'),
  onScanProgress: (cb) => onProgress('scan:progress', cb),
  onScanTargetFolder: (cb) => onProgress('scan:targetFolder', cb),

  contextMenuRegister: (locale) => ipcRenderer.invoke('contextmenu:register', locale),
  contextMenuUnregister: () => ipcRenderer.invoke('contextmenu:unregister'),
  contextMenuStatus: () => ipcRenderer.invoke('contextmenu:status'),

  adminLogin: (username, password) => ipcRenderer.invoke('admin:login', username, password),
  adminDiagnostics: () => ipcRenderer.invoke('admin:diagnostics'),
  adminErrorLog: () => ipcRenderer.invoke('admin:errorLog'),
  adminGithubDownloads: () => ipcRenderer.invoke('admin:githubDownloads'),
  adminOpenUserData: () => ipcRenderer.invoke('admin:openUserData'),
  openSystemProtectionSettings: () => ipcRenderer.invoke('system:openProtectionSettings'),

  updaterCheckNow: () => ipcRenderer.invoke('updater:checkNow'),
  updaterInstallNow: () => ipcRenderer.invoke('updater:installNow'),
  onUpdaterEvent: (cb) => onProgress('updater:event', cb),

  setLocale: (locale) => ipcRenderer.send('locale:set', locale),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getChangelog: (version) => ipcRenderer.invoke('app:getChangelog', version),

  getBackgroundScanEnabled: () => ipcRenderer.invoke('settings:getBackgroundScan'),
  setBackgroundScanEnabled: (enabled) => ipcRenderer.invoke('settings:setBackgroundScan', enabled),
  runBackgroundScanNow: () => ipcRenderer.invoke('scan:runBackgroundNow'),
  getTopProcesses: () => ipcRenderer.invoke('system:topProcesses'),

  getLocalNetworkInfo: () => ipcRenderer.invoke('network:localInfo'),
  getPublicIp: () => ipcRenderer.invoke('network:publicIp'),
  geolocateIps: (ips) => ipcRenderer.invoke('network:geolocateIps', ips),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  onBackgroundScanResult: (cb) => onProgress('scan:backgroundResult', cb),

  securityStart: (locale) => ipcRenderer.invoke('security:start', locale),
  securityCancel: () => ipcRenderer.invoke('security:cancel'),
  onSecurityProgress: (cb) => onProgress('security:progress', cb),

  speedtestStart: () => ipcRenderer.invoke('speedtest:start'),
  speedtestCancel: () => ipcRenderer.invoke('speedtest:cancel'),
  onSpeedtestProgress: (cb) => onProgress('speedtest:progress', cb),

  cleanupRun: (payload) => ipcRenderer.invoke('cleanup:run', payload),
  cleanupLog: () => ipcRenderer.invoke('cleanup:log'),

  quarantineList: () => ipcRenderer.invoke('quarantine:list'),
  quarantineRestore: (batchId, locale) => ipcRenderer.invoke('quarantine:restore', batchId, locale),
  quarantinePurgeNow: (batchId) => ipcRenderer.invoke('quarantine:purgeNow', batchId),
  quarantinePurgeExpired: () => ipcRenderer.invoke('quarantine:purgeExpired'),

  showInFolder: (p) => ipcRenderer.invoke('shell:showInFolder', p),

  reportGenerate: (payload) => ipcRenderer.invoke('report:generate', payload),
  reportExportPdf: (html, locale) => ipcRenderer.invoke('report:exportPdf', html, locale),
  reportExportJson: (payload, locale) => ipcRenderer.invoke('report:exportJson', payload, locale),
  reportExportCsv: (payload, locale) => ipcRenderer.invoke('report:exportCsv', payload, locale),
});
