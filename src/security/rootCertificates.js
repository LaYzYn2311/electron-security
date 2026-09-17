const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { t } = require('../i18n');

const RECENT_YEARS = 2;

// A self-signed certificate freshly added to the trusted-root store is the
// classic MITM/adware technique (Superfish, Komodia, PrivDog all did this to
// intercept HTTPS traffic) — but it's ALSO a common, legitimate pattern for
// desktop apps that serve their own local UI over HTTPS (avoids a browser
// warning for localhost). Confirmed both cases on a real test machine:
// Battle.net and Razer Chroma both install a local root cert this way, next
// to one from an unrecognized publisher. So findings stay 'low' severity and
// the message says this plainly — this is a name-recognition prompt for the
// user, not an accusation.
const KNOWN_LOCAL_APP_CERTS = [/battle\.net/i, /razer chroma/i, /docker desktop/i, /jetbrains/i];

const SCRIPT = `
function Get-RecentSelfSigned($storePath) {
  $cutoff = (Get-Date).AddYears(-${RECENT_YEARS})
  Get-ChildItem -Path $storePath -ErrorAction SilentlyContinue | Where-Object {
    $_.Subject -eq $_.Issuer -and $_.NotBefore -gt $cutoff
  } | Select-Object Subject, NotBefore, Thumbprint
}
$cu = @(Get-RecentSelfSigned 'Cert:\\CurrentUser\\Root')
$lm = @(Get-RecentSelfSigned 'Cert:\\LocalMachine\\Root')
($cu + $lm) | Sort-Object Thumbprint -Unique | ConvertTo-Json -Compress
`;

async function scanRootCertificates(ctx) {
  if (platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
    const trimmed = stdout.trim();
    if (!trimmed) {
      return [{ id: 'root_certs_clean', type: 'root_certificates', severity: 'ok', title: t(ctx.locale, 'rootcert.clean_title'), detail: '' }];
    }
    let parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) parsed = [parsed];

    return parsed.map((c) => {
      const recognized = KNOWN_LOCAL_APP_CERTS.some((re) => re.test(c.Subject));
      return {
        id: `rootcert_${c.Thumbprint}`,
        type: 'root_certificates',
        severity: 'low',
        title: t(ctx.locale, 'rootcert.recent_title', { subject: c.Subject }),
        detail: t(ctx.locale, recognized ? 'rootcert.recognized_detail' : 'rootcert.unrecognized_detail'),
      };
    });
  } catch (err) {
    return [{ id: 'root_certs_unavailable', type: 'root_certificates', severity: 'info', title: t(ctx.locale, 'rootcert.unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanRootCertificates };
