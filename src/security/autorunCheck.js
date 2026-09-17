const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

/**
 * Checks whether Windows AutoPlay (the "what do you want to do with this
 * drive?" popup on removable media) is enabled. Deliberately framed as a
 * minor, low-severity note rather than a real vulnerability: the actual
 * historical exploit (autorun.inf silently auto-executing a program the
 * instant a USB drive was plugged in) was fixed OS-wide by a Windows
 * security update back in 2011 — AutoPlay today is just a convenience
 * prompt, it no longer auto-runs anything. Inflating this into a scary
 * finding would be exactly the kind of fake-precision alarmism this app's
 * checks otherwise avoid.
 */
async function readDword(hive, keyPath, valueName) {
  const { stdout } = await execFileAsync('reg', ['query', `${hive}\\${keyPath}`, '/v', valueName]);
  const match = stdout.match(/0x([0-9a-fA-F]+)/);
  return match ? parseInt(match[1], 16) : null;
}

async function scanAutorun(ctx) {
  if (platform !== 'win32') return [];
  try {
    const value = await readDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\AutoplayHandlers', 'DisableAutoplay');
    if (value === 1) {
      return [{ id: 'autoplay_off', type: 'autorun', severity: 'ok', title: t(ctx.locale, 'autorun.off_title'), detail: '' }];
    }
    return [{ id: 'autoplay_on', type: 'autorun', severity: 'low', title: t(ctx.locale, 'autorun.on_title'), detail: t(ctx.locale, 'autorun.on_detail') }];
  } catch {
    // Value not set = Windows default (AutoPlay enabled, but autorun.inf auto-execution has been OS-level disabled since 2011 regardless).
    return [{ id: 'autoplay_default', type: 'autorun', severity: 'info', title: t(ctx.locale, 'autorun.default_title'), detail: t(ctx.locale, 'autorun.default_detail') }];
  }
}

module.exports = { scanAutorun };
