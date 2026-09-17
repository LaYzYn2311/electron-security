'use strict';

const https = require('https');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

const REQUEST_TIMEOUT_MS = 10000;
const MAX_GEOLOCATE_IPS = 10;

/**
 * Public IP + geolocation, opt-in only — same pattern as src/speedtest: runs
 * in the main process (renderer CSP never relaxed), and only fires when the
 * user explicitly clicks a button. Uses ipapi.co (HTTPS, no API key needed).
 * Geolocating an *outbound connection's* IP means sending that IP to this
 * third-party service — that's disclosed plainly in the UI, since it's a
 * real (if small) privacy trade-off distinct from "what's my own IP".
 */
function httpsGetJson(host, urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.get({ host, path: urlPath, timeout: REQUEST_TIMEOUT_MS, headers: { 'User-Agent': 'electron-security-v2' } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

async function getPublicIpInfo() {
  const data = await httpsGetJson('ipapi.co', '/json/');
  if (data.error) throw new Error(data.reason || 'lookup failed');
  return { ip: data.ip, city: data.city, region: data.region, country: data.country_name, org: data.org };
}

async function geolocateIps(ips) {
  const capped = [...new Set(ips)].slice(0, MAX_GEOLOCATE_IPS);
  const results = [];
  for (const ip of capped) {
    try {
      const data = await httpsGetJson('ipapi.co', `/${encodeURIComponent(ip)}/json/`);
      if (data.error) { results.push({ ip, error: data.reason || 'lookup failed' }); continue; }
      results.push({ ip, city: data.city, region: data.region, country: data.country_name, org: data.org });
    } catch (err) {
      results.push({ ip, error: err.message });
    }
  }
  return results;
}

// Local network adapter info — no network access at all, just local OS
// config (ipconfig-equivalent). VPN detection is a name-pattern heuristic
// against the adapter description, same limitation as any name-based check.
const VPN_KEYWORDS = 'vpn|tap-windows|wireguard|openvpn|nordvpn|expressvpn|tunnel|wintun|protonvpn|surfshark|pptp|l2tp|cisco anyconnect|globalprotect';
const SCRIPT = `
$configs = Get-NetIPConfiguration | Where-Object { $_.IPv4Address }
$adapters = foreach ($c in $configs) {
  [PSCustomObject]@{
    Name = $c.InterfaceAlias
    Description = $c.InterfaceDescription
    IPv4 = ($c.IPv4Address.IPAddress -join ', ')
    Gateway = $c.IPv4DefaultGateway.NextHop
    DNS = (($c.DNSServer.ServerAddresses | Where-Object { $_ -notmatch ':' }) -join ', ')
  }
}
$vpnAdapters = @(Get-NetAdapter | Where-Object { $_.InterfaceDescription -match '${VPN_KEYWORDS}' -or $_.Name -match '${VPN_KEYWORDS}' } | Where-Object { $_.Status -eq 'Up' })
[PSCustomObject]@{
  adapters = @($adapters)
  vpnDetected = ($vpnAdapters.Count -gt 0)
  vpnAdapterNames = @($vpnAdapters.Name)
} | ConvertTo-Json -Compress -Depth 4
`;

async function getLocalNetworkInfo() {
  const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { timeout: 15000, maxBuffer: 1024 * 1024 });
  const data = JSON.parse(stdout.trim());
  data.vpnAdapterNames = (data.vpnAdapterNames || []).filter(Boolean);
  return data;
}

module.exports = { getPublicIpInfo, geolocateIps, getLocalNetworkInfo };
