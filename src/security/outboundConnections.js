const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { listProcesses } = require('../utils/processList');
const { t } = require('../i18n');

const MAX_FINDINGS = 15;

/**
 * The existing open-ports check only shows LISTENING sockets (what's
 * reachable from outside); this shows the other direction — where this
 * machine currently has an established outbound connection right now, and
 * which local process owns it. Purely local data from netstat/tasklist, no
 * DNS/reverse-lookup/geolocation calls — that would mean this check making
 * its own network requests, which conflicts with the app's core "no network
 * access except the opt-in speed test" design. So this reports bare IPs,
 * not resolved hostnames, and stays informational (severity 'info') rather
 * than accusatory — most of this will always be completely mundane
 * (browsers, game clients, chat apps).
 */
function isPrivateOrLoopback(ip) {
  if (/^127\./.test(ip) || ip === '::1') return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true; // IPv6 unique local
  return false;
}

function parseEstablished(netstatOutput) {
  const rows = [];
  for (const line of netstatOutput.split(/\r?\n/)) {
    const m = line.trim().match(/^TCP\s+(\S+):(\d+)\s+(\S+):(\d+)\s+ESTABLISHED\s+(\d+)/i);
    if (!m) continue;
    const [, , , remoteIp, remotePort, pid] = m;
    if (isPrivateOrLoopback(remoteIp)) continue;
    rows.push({ remoteIp, remotePort: Number(remotePort), pid: Number(pid) });
  }
  return rows;
}

async function scanOutboundConnections(ctx) {
  if (platform !== 'win32') return [];
  try {
    const [{ stdout }, processes] = await Promise.all([
      execFileAsync('netstat', ['-ano', '-p', 'TCP']),
      listProcesses(),
    ]);
    const pidToName = new Map(processes.map((p) => [p.pid, p.name]));
    const rows = parseEstablished(stdout);

    // Group by (process, remote IP) — one process often has several
    // ephemeral-port connections to the same remote host (HTTP/2 streams,
    // CDN edge nodes, etc.); reporting each individually would just be noise.
    const groups = new Map();
    for (const row of rows) {
      const processName = pidToName.get(row.pid) || `PID ${row.pid}`;
      const key = `${processName}|${row.remoteIp}`;
      if (!groups.has(key)) groups.set(key, { processName, remoteIp: row.remoteIp, ports: new Set() });
      groups.get(key).ports.add(row.remotePort);
    }

    if (groups.size === 0) {
      return [{ id: 'outbound_clean', type: 'outbound_connections', severity: 'ok', title: t(ctx.locale, 'outbound.clean_title'), detail: '' }];
    }

    const findings = [...groups.values()].slice(0, MAX_FINDINGS).map((g) => ({
      id: `outbound_${g.processName}_${g.remoteIp}`,
      type: 'outbound_connections',
      severity: 'info',
      title: t(ctx.locale, 'outbound.connection_title', { process: g.processName, ip: g.remoteIp }),
      detail: t(ctx.locale, 'outbound.connection_detail', { ports: [...g.ports].join(', ') }),
    }));

    if (groups.size > MAX_FINDINGS) {
      findings.push({ id: 'outbound_more', type: 'outbound_connections', severity: 'info', title: t(ctx.locale, 'outbound.more_title', { n: groups.size - MAX_FINDINGS }), detail: '' });
    }
    return findings;
  } catch (err) {
    return [{ id: 'outbound_unavailable', type: 'outbound_connections', severity: 'info', title: t(ctx.locale, 'outbound.unavailable_title'), detail: err.message }];
  }
}

module.exports = { scanOutboundConnections };
