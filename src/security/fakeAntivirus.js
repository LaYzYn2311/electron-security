const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

// Well-documented, unambiguous historical scareware/fake-AV product names
// only — deliberately excludes anything that could plausibly be a real
// product name, to avoid a false accusation against legitimate software.
const KNOWN_FAKE_AV = [
  /antivirus\s?(2009|2010|2011|360)/i,
  /\bwinfixer\b/i,
  /\bspysheriff\b/i,
  /\bmsantivirus\b/i,
  /\bregistry cleaner xp\b/i,
  /\bsmart fortress\b/i,
  /\blive security platform\b/i,
  /\bsystem guard 2009\b/i,
  /\bsecurity tool\b/i,
  /\bantimalware doctor\b/i,
  /\bwin ?7 antivirus\b/i,
  /\bxp antivirus\b/i,
];

const SCRIPT = `
$keys = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
Get-ItemProperty -Path $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object -ExpandProperty DisplayName -Unique
`;

async function scanFakeAntivirus(ctx) {
  if (platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
    const names = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

    const findings = [];
    for (const name of names) {
      if (KNOWN_FAKE_AV.some((re) => re.test(name))) {
        findings.push({ id: `fakeav_${name}`, type: 'fake_antivirus', severity: 'critical', title: t(ctx.locale, 'fakeav.found_title', { name }), detail: t(ctx.locale, 'fakeav.found_detail') });
      }
    }
    if (findings.length === 0) {
      findings.push({ id: 'fakeav_clean', type: 'fake_antivirus', severity: 'ok', title: t(ctx.locale, 'fakeav.clean_title'), detail: '' });
    }
    return findings;
  } catch (err) {
    return [{ id: 'fakeav_unavailable', type: 'fake_antivirus', severity: 'info', title: t(ctx.locale, 'fakeav.unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanFakeAntivirus };
