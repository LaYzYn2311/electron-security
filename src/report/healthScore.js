const { formatBytes } = require('../utils/formatBytes');
const { t } = require('../i18n');

const SEVERITY_PENALTY = { critical: 15, high: 8, medium: 4, low: 1, info: 0, ok: 0 };

// The health score is intentionally narrow: only findings that speak to
// "is malware present / is the system exposed" move the number. Everything
// else the security scan surfaces (open ports, startup items, scheduled
// tasks, browser extensions, outdated app versions, file permissions) stays
// fully visible in the Security tab and can still appear in the top-5
// recommendations — it just doesn't drag a single 0-100 number around for
// things that are often routine (a dev server bound to all interfaces on a
// home network is not the same class of problem as "no antivirus running").
const SCORE_AFFECTING_TYPES = new Set(['antivirus_status', 'firewall_status', 'masked_extension', 'hosts_file', 'browser_hijack']);

/**
 * Combines the junk-scan and security-scan results into one report:
 * a 0-100 health score, freeable space, a severity breakdown, a
 * category breakdown (for the chart), and a top-5 priority list.
 *
 * Score model: 100/100 whenever antivirus, firewall and the malware-masking
 * check found nothing worth flagging — see SCORE_AFFECTING_TYPES above.
 * Every matching finding subtracts points by severity (critical hurts
 * most). Accumulated junk/cache/duplicates is clutter, not a security
 * issue, so it's reported separately (see totalFreeable / categoryBreakdown)
 * and never lowers the score. For this to actually show 100 on a clean
 * machine, each of those three checks must only mark something 'low'+ when
 * it found something genuinely worth a look.
 */
function computeReport({ scanResult, securityResult, locale }) {
  let score = 100;

  const allFindingsForScore = securityResult?.allFindings || [];
  for (const f of allFindingsForScore) {
    if (!SCORE_AFFECTING_TYPES.has(f.type)) continue;
    score -= SEVERITY_PENALTY[f.severity] || 0;
  }

  const securityCounts = securityResult?.counts || {};
  const totalFreeable = scanResult?.totalFreeable || 0;

  score = Math.max(0, Math.min(100, Math.round(score)));

  const categoryBreakdown = Object.entries(scanResult?.categories || {}).map(([key, cat]) => ({
    key,
    label: cat.label,
    size: cat.totalSize,
    count: cat.items.length,
  })).sort((a, b) => b.size - a.size);

  const recommendations = buildRecommendations({ scanResult, securityResult, categoryBreakdown, locale });

  return {
    healthScore: score,
    totalFreeable,
    totalFreeableFormatted: formatBytes(totalFreeable),
    securityCounts,
    totalFindings: securityResult?.allFindings?.length || 0,
    categoryBreakdown,
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}

function buildRecommendations({ scanResult, securityResult, categoryBreakdown, locale }) {
  const recs = [];

  const findings = securityResult?.allFindings || [];
  for (const f of findings) {
    if (recs.length >= 5) break;
    if (f.severity === 'critical' || f.severity === 'high') {
      recs.push({ priority: recs.length + 1, severity: f.severity, text: f.title, detail: f.detail });
    }
  }

  if (recs.length < 5) {
    for (const f of findings) {
      if (recs.length >= 5) break;
      if (f.severity === 'medium' && !recs.some((r) => r.text === f.title)) {
        recs.push({ priority: recs.length + 1, severity: f.severity, text: f.title, detail: f.detail });
      }
    }
  }

  if (recs.length < 5) {
    const topCategory = categoryBreakdown.find((c) => c.size > 0);
    if (topCategory) {
      recs.push({
        priority: recs.length + 1,
        severity: 'cleanup',
        text: t(locale, 'rec.cleanup_text', { label: topCategory.label, mb: (topCategory.size / (1024 ** 2)).toFixed(0), count: topCategory.count }),
        detail: t(locale, 'rec.cleanup_detail'),
      });
    }
  }

  return recs.slice(0, 5);
}

module.exports = { computeReport };
