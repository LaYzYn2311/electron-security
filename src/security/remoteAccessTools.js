const { listProcessNames } = require('../utils/processList');
const { t } = require('../i18n');

/**
 * Remote-access software is dual-use by nature: entirely legitimate for
 * self-support or IT admin work, but also the single most common vector for
 * "tech support scam" and RAT-style remote-access malware — the tool itself
 * is real, signed, legitimate software; what matters is whether the user
 * recognizes why it's running right now. So this is informational
 * ("is this something you started?"), not an accusation.
 */
const KNOWN_TOOLS = [
  { pattern: /^teamviewer/i, label: 'TeamViewer' },
  { pattern: /^anydesk/i, label: 'AnyDesk' },
  { pattern: /^rustdesk/i, label: 'RustDesk' },
  { pattern: /^(chrome_remote_desktop|remoting_host)/i, label: 'Chrome Remote Desktop' },
  { pattern: /^(ultravnc|winvnc|tvnserver|vncserver|vncviewer)/i, label: 'VNC' },
  { pattern: /^logmein/i, label: 'LogMeIn' },
  { pattern: /^(screenconnect|connectwisecontrol|scconnect)/i, label: 'ConnectWise ScreenConnect' },
  { pattern: /^supremo/i, label: 'Supremo' },
  { pattern: /^aeroadmin/i, label: 'AeroAdmin' },
  { pattern: /^(nomachine|nxplayer|nxserver)/i, label: 'NoMachine' },
  { pattern: /^splashtop/i, label: 'Splashtop' },
];

async function scanRemoteAccessTools(ctx) {
  let names;
  try {
    names = await listProcessNames();
  } catch (err) {
    return [{ id: 'remote_access_unavailable', type: 'remote_access_tools', severity: 'info', title: t(ctx.locale, 'remote.unavailable_title'), detail: err.message }];
  }

  const findings = [];
  for (const tool of KNOWN_TOOLS) {
    if (names.some((n) => tool.pattern.test(n))) {
      findings.push({
        id: `remote_${tool.label}`,
        type: 'remote_access_tools',
        severity: 'medium',
        title: t(ctx.locale, 'remote.running_title', { name: tool.label }),
        detail: t(ctx.locale, 'remote.running_detail'),
      });
    }
  }

  if (findings.length === 0) {
    findings.push({ id: 'remote_clean', type: 'remote_access_tools', severity: 'ok', title: t(ctx.locale, 'remote.clean_title'), detail: '' });
  }

  return findings;
}

module.exports = { scanRemoteAccessTools };
