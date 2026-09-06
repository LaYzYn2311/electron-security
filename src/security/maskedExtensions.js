const { getLocations, home } = require('../utils/platform');
const { walk, pathExists } = require('../utils/fsWalk');
const path = require('path');
const { t } = require('../i18n');

const SAFE_LOOKING_EXT = /\.(pdf|jpg|jpeg|png|gif|bmp|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar|7z|mp3|mp4|mov|csv)$/i;
const DANGEROUS_EXT = /\.(exe|scr|bat|cmd|com|pif|vbs|vbe|js|jse|jar|msi|ps1|wsf|hta)$/i;

/**
 * Flags files whose name embeds a "safe" extension right before a dangerous
 * executable one (e.g. invoice.pdf.exe) — a classic masking trick — and
 * files with double dots more generally, scoped to Downloads/Desktop where
 * users actually double-click things.
 */
async function scanMaskedExtensions(ctx) {
  const loc = getLocations();
  const roots = [loc.downloadsDir, path.join(home, 'Desktop')].filter(Boolean);
  const findings = [];

  for (const root of roots) {
    if (!(await pathExists(root))) continue;
    for await (const entry of walk(root, { cancelToken: ctx.cancelToken, maxDepth: 3 })) {
      if (entry.isDirectory) continue;
      const name = entry.name;
      const dangerous = DANGEROUS_EXT.test(name);
      if (!dangerous) continue;

      const withoutLastExt = name.replace(DANGEROUS_EXT, '');
      const hasSafeExtBeforeIt = SAFE_LOOKING_EXT.test(withoutLastExt);

      if (hasSafeExtBeforeIt) {
        findings.push({
          id: `masked_${entry.fullPath}`,
          type: 'masked_extension',
          severity: 'critical',
          title: t(ctx.locale, 'masked.title', { name }),
          detail: t(ctx.locale, 'masked.detail', { path: entry.fullPath, safe: withoutLastExt }),
        });
      }
      ctx.onProgress?.({ category: 'masked_extension', current: entry.fullPath });
    }
  }

  return findings;
}

module.exports = { scanMaskedExtensions };
