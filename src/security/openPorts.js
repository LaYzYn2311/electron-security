const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform } = require('../utils/platform');
const { listProcesses } = require('../utils/processList');
const { t } = require('../i18n');

// Ports that are fine to see locally but worth flagging if reachable from
// outside (0.0.0.0 / :: instead of 127.0.0.1) because they're commonly
// targeted or often misconfigured as open-by-default dev servers.
const NOTABLE_PORTS = new Set([21, 22, 23, 25, 135, 139, 445, 1433, 1521, 3306, 3389, 5432, 5900, 6379, 8080, 9200, 27017]);

function parseWindowsNetstat(output) {
  const rows = [];
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const m = line.trim().match(/^(TCP|UDP)\s+(\S+):(\d+)\s+(\S+)\s+(LISTENING)?\s*(\d+)?\s*$/i);
    if (!m) continue;
    const [, proto, addr, portStr, , , pidStr] = m;
    rows.push({ proto, address: addr, port: Number(portStr), pid: pidStr ? Number(pidStr) : null });
  }
  return rows;
}

function parseUnixLsofOrSs(output, isSs) {
  const rows = [];
  const lines = output.split(/\r?\n/).slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    if (isSs) {
      // ss -tulpn output: Netid State Recv-Q Send-Q Local:Port Peer:Port Process
      const parts = line.trim().split(/\s+/);
      const local = parts[4] || '';
      const m = local.match(/^(.*):(\d+)$/);
      if (!m) continue;
      rows.push({ proto: parts[0], address: m[1], port: Number(m[2]) });
    } else {
      // lsof -iTCP -sTCP:LISTEN -P -n output columns include NAME like 127.0.0.1:5432 (LISTEN)
      const m = line.match(/(\S+):(\d+)\s+\(LISTEN\)/);
      if (!m) continue;
      rows.push({ proto: 'TCP', address: m[1], port: Number(m[2]) });
    }
  }
  return rows;
}

async function scanOpenPorts(ctx) {
  try {
    let rows = [];
    let pidToName = new Map();
    if (platform === 'win32') {
      const [{ stdout }, processes] = await Promise.all([
        execFileAsync('netstat', ['-ano', '-p', 'TCP']),
        listProcesses().catch(() => []),
      ]);
      rows = parseWindowsNetstat(stdout);
      pidToName = new Map(processes.map((p) => [p.pid, p.name]));
    } else if (platform === 'darwin') {
      const { stdout } = await execFileAsync('lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n']);
      rows = parseUnixLsofOrSs(stdout, false);
    } else {
      try {
        const { stdout } = await execFileAsync('ss', ['-tulpn']);
        rows = parseUnixLsofOrSs(stdout, true);
      } catch {
        const { stdout } = await execFileAsync('lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n']);
        rows = parseUnixLsofOrSs(stdout, false);
      }
    }

    const seen = new Set();
    const findings = [];
    for (const row of rows) {
      const key = `${row.proto}:${row.address}:${row.port}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const exposedExternally = /^0\.0\.0\.0$|^\*$|^::$|^\[::\]$/.test(row.address);
      // Bound only to localhost isn't a real exposure — that's routine
      // (dev servers, local databases) and not something to dock points for.
      //
      // Bound to 0.0.0.0/all-interfaces means reachable from the local
      // network (WiFi/LAN) — NOT necessarily from the internet. This app
      // never makes outbound network calls (privacy-first), so there's no
      // way to check the router's port-forwarding/UPnP state to know if a
      // port is actually internet-facing; treating "all interfaces" as
      // "exposed to the whole internet" would overstate the real risk for
      // the common case (a home router with NAT and nothing forwarded).
      // So: classic attack-target ports stay 'high' regardless, ordinary
      // services (AirPlay, Spotify Connect, etc.) are 'low' — worth
      // knowing about on an untrusted LAN (café WiFi), not alarming on a
      // home network.
      let severity = 'info';
      if (exposedExternally && NOTABLE_PORTS.has(row.port)) severity = 'high';
      else if (exposedExternally) severity = 'low';

      const processName = row.pid ? pidToName.get(row.pid) : null;
      findings.push({
        id: `port_${key}`,
        type: 'open_port',
        severity,
        title: exposedExternally
          ? t(ctx.locale, 'port.title_exposed', { port: row.port, proto: row.proto })
          : t(ctx.locale, 'port.title_local', { port: row.port, proto: row.proto }),
        detail: processName
          ? t(ctx.locale, 'port.detail_with_process', { address: row.address, port: row.port, process: processName, pid: row.pid })
          : t(ctx.locale, 'port.detail', { address: row.address, port: row.port }),
      });
    }
    return findings;
  } catch (err) {
    return [
      {
        id: 'port_scan_unavailable',
        type: 'open_port',
        severity: 'info',
        title: t(ctx.locale, 'port.unavailable_title'),
        detail: t(ctx.locale, 'port.unavailable_detail', { msg: err.message }),
      },
    ];
  }
}

module.exports = { scanOpenPorts };
