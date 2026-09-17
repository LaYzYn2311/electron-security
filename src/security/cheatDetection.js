const { listProcessNames } = require('../utils/processList');
const { t } = require('../i18n');

/**
 * Deliberately narrow: this only matches process names for the single most
 * famous, openly-documented dual-use tool in this space (a canonical
 * memory-editing/reverse-engineering tool that's also commonly used to
 * cheat in single-player or unprotected multiplayer games) — NOT an attempt
 * to enumerate private/paid cheat-loader brand names. Those rename
 * constantly, and guessing at an incomplete brand list would be unreliable
 * and a bad precedent for a security tool's own source. The durable,
 * general signal for the more serious/hidden class of cheats (kernel-level,
 * anti-cheat-bypassing) is driverInventory.js — an unsigned running kernel
 * driver, not a name match.
 */
const KNOWN_TOOLS = [{ pattern: /^cheatengine/i, label: 'Cheat Engine' }];

async function scanCheatTools(ctx) {
  let names;
  try {
    names = await listProcessNames();
  } catch (err) {
    return [{ id: 'cheat_tools_unavailable', type: 'cheat_tools', severity: 'info', title: t(ctx.locale, 'cheat.unavailable_title'), detail: err.message }];
  }

  const findings = [];
  for (const tool of KNOWN_TOOLS) {
    if (names.some((n) => tool.pattern.test(n))) {
      findings.push({
        id: `cheat_${tool.label}`,
        type: 'cheat_tools',
        severity: 'medium',
        title: t(ctx.locale, 'cheat.found_title', { name: tool.label }),
        detail: t(ctx.locale, 'cheat.found_detail'),
      });
    }
  }

  findings.push({
    id: findings.length ? 'cheat_scope_note' : 'cheat_clean',
    type: 'cheat_tools',
    severity: findings.length ? 'info' : 'ok',
    title: t(ctx.locale, findings.length ? 'cheat.scope_note_title' : 'cheat.clean_title'),
    detail: t(ctx.locale, 'cheat.scope_note_detail'),
  });

  return findings;
}

module.exports = { scanCheatTools };
