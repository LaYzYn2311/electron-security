const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('./platform');

/**
 * Adds/removes an Explorer right-click "Scan this folder" entry, entirely
 * under HKEY_CURRENT_USER — never HKLM/HKCR — so it needs no elevation and
 * only affects the current user, and is trivially reversible. Registered
 * twice: on a folder itself (Directory\shell, gets the folder via %1) and
 * on empty space inside a folder (Directory\Background\shell, gets the
 * currently-open folder via %V).
 */
const KEY_NAME = 'ElectronSecurityScan';
const ROOTS = [
  `HKCU\\Software\\Classes\\Directory\\shell\\${KEY_NAME}`,
  `HKCU\\Software\\Classes\\Directory\\Background\\shell\\${KEY_NAME}`,
];
const ARG_TOKEN = { folder: '%1', background: '%V' };
// reg.exe receives argv through a legacy code-page round-trip in this environment,
// which mangles non-ASCII text (Greek came out as mojibake) — the command itself
// still worked, only the menu label was garbled. Keep this label ASCII-only.
const SAFE_ASCII_LABEL = 'Scan with Electron Security';

function commandLine(exePath, extraArgs, argToken) {
  const args = extraArgs.length ? extraArgs.map((a) => `"${a}"`).join(' ') + ' ' : '';
  return `"${exePath}" ${args}--scan-folder "${argToken}"`;
}

async function isSupported() {
  return platform === 'win32';
}

async function registerContextMenu({ exePath, extraArgs = [] }) {
  if (!(await isSupported())) return { ok: false, reason: 'unsupported-platform' };
  try {
    for (const root of ROOTS) {
      const isBackground = root.includes('Background');
      await execFileAsync('reg', ['add', root, '/ve', '/d', SAFE_ASCII_LABEL, '/f']);
      await execFileAsync('reg', ['add', root, '/v', 'Icon', '/d', exePath, '/f']);
      await execFileAsync('reg', ['add', `${root}\\command`, '/ve', '/d', commandLine(exePath, extraArgs, isBackground ? ARG_TOKEN.background : ARG_TOKEN.folder), '/f']);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function unregisterContextMenu() {
  if (!(await isSupported())) return { ok: false, reason: 'unsupported-platform' };
  try {
    for (const root of ROOTS) {
      try {
        await execFileAsync('reg', ['delete', root, '/f']);
      } catch {
        /* already absent — fine */
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function contextMenuStatus() {
  if (!(await isSupported())) return { registered: false, supported: false };
  try {
    await execFileAsync('reg', ['query', ROOTS[0]]);
    return { registered: true, supported: true };
  } catch {
    return { registered: false, supported: true };
  }
}

module.exports = { registerContextMenu, unregisterContextMenu, contextMenuStatus };
