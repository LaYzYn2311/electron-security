const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { platform, getLocations } = require('../utils/platform');
const { pathExists } = require('../utils/fsWalk');
const { t } = require('../i18n');

// Locations that are normal/expected for an app to install itself into.
const TRUSTED_HINTS = ['/Applications/', 'Program Files', 'Program Files (x86)', '/usr/', '/System/'];

function looksSuspicious(name, fullPath) {
  const isHidden = name.startsWith('.');
  const inTrustedLocation = TRUSTED_HINTS.some((h) => fullPath.includes(h));
  const hasWeirdChars = /[^\x20-\x7EͰ-Ͽ]/.test(name); // control chars / non-printable, allow greek
  return (isHidden && !inTrustedLocation) || hasWeirdChars;
}

async function scanStartupLocations(ctx) {
  const loc = getLocations();
  const findings = [];

  for (const dir of loc.startupLocations || []) {
    if (!(await pathExists(dir))) continue;
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const suspicious = looksSuspicious(entry.name, fullPath);
      findings.push({
        id: `startup_${fullPath}`,
        type: 'startup_item',
        severity: suspicious ? 'medium' : 'info',
        title: t(ctx.locale, 'startup.item_title', { name: entry.name }),
        detail: `${fullPath}${suspicious ? t(ctx.locale, 'startup.suspicious_suffix') : ''}`,
        path: fullPath,
        isDirectory: entry.isDirectory(),
      });
    }
  }

  return findings;
}

async function scanScheduledTasks(ctx) {
  const findings = [];
  try {
    if (platform === 'win32') {
      const { stdout } = await execFileAsync('schtasks', ['/query', '/fo', 'CSV', '/nh']);
      const lines = stdout.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const cols = line.split('","').map((c) => c.replace(/^"|"$/g, ''));
        const name = cols[0] || line;
        if (/\\Microsoft\\Windows\\/i.test(name)) continue; // built-in OS tasks, too noisy
        findings.push({
          id: `task_${name}`,
          type: 'scheduled_task',
          severity: 'info',
          title: t(ctx.locale, 'task.scheduled_title', { name }),
          detail: cols.join(' | '),
        });
      }
    } else if (platform === 'darwin') {
      const { stdout } = await execFileAsync('launchctl', ['list']);
      const lines = stdout.split(/\r?\n/).slice(1).filter(Boolean);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const label = parts[2] || line;
        if (/^com\.apple\./.test(label)) continue; // built-in Apple services, too noisy
        findings.push({
          id: `task_${label}`,
          type: 'scheduled_task',
          severity: 'info',
          title: t(ctx.locale, 'task.launchagent_title', { label }),
          detail: line,
        });
      }
    } else {
      try {
        const { stdout } = await execFileAsync('crontab', ['-l']);
        const lines = stdout.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
        for (const line of lines) {
          findings.push({
            id: `cron_${line}`,
            type: 'scheduled_task',
            severity: 'info',
            title: t(ctx.locale, 'task.cron_title'),
            detail: line,
          });
        }
      } catch {
        /* no crontab for user, fine */
      }
    }
  } catch (err) {
    findings.push({
      id: 'scheduled_tasks_unavailable',
      type: 'scheduled_task',
      severity: 'info',
      title: t(ctx.locale, 'task.unavailable_title'),
      detail: err.message,
    });
  }
  return findings;
}

module.exports = { scanStartupLocations, scanScheduledTasks };
