/**
 * Admin panel access — a hidden, password-gated diagnostics tab shipped
 * inside the app (F10 to open the login prompt).
 *
 * IMPORTANT — this is obscurity, not security. Electron apps ship as
 * readable/unpacked JS; anyone who downloads the installer can open
 * app.asar and read this file directly, credentials included. Never gate
 * anything here that would matter if a stranger saw it — it's meant to
 * keep this out of everyday users' way, not to protect real secrets.
 *
 * Change these before you build/ship if you want a different login.
 */
const ADMIN_USERNAME = 'ELADMIN1';
const ADMIN_PASSWORD = 'ELECADMIN23#';

/**
 * GitHub repo the Downloads panel reads release download counts from
 * (public API, no auth needed). Fill this in once the project is pushed to
 * GitHub and has at least one Release with the installer attached as an
 * asset — until then the panel reports "not configured".
 */
const GITHUB_REPO = { owner: 'LaYzYn2311', name: 'electron-security' };

module.exports = { ADMIN_USERNAME, ADMIN_PASSWORD, GITHUB_REPO };
