'use strict';

// ---------- helpers ----------
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function t(key, params) {
  return window.i18nTranslate(state.locale, key, params);
}
function localeTag() {
  return state.locale === 'el' ? 'el-GR' : 'en-US';
}
function setStatus(text) {
  document.getElementById('status-text').textContent = text;
}
/**
 * A real, dismissible notification (top-right), distinct from the quiet
 * status-bar text — for anything the user should actually notice, with
 * room for an explanation and optional action buttons.
 */
function showToast({ title, body, tone = 'info', actions = [], autoDismissMs = 12000 }) {
  const stack = document.getElementById('toast-stack');
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.innerHTML = `
    <div class="toast-head">
      <div class="toast-title">${escapeHtml(title)}</div>
      <button class="toast-close" aria-label="close">✕</button>
    </div>
    ${body ? `<div class="toast-body">${escapeHtml(body)}</div>` : ''}
    ${actions.length ? '<div class="toast-actions"></div>' : ''}
  `;
  const dismiss = () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector('.toast-close').addEventListener('click', dismiss);
  if (actions.length) {
    const actionsEl = el.querySelector('.toast-actions');
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.className = `btn btn-small ${a.primary ? 'btn-primary' : 'btn-ghost'}`;
      btn.textContent = a.label;
      btn.addEventListener('click', () => { a.onClick?.(); if (a.dismissOnClick !== false) dismiss(); });
      actionsEl.appendChild(btn);
    }
  }
  stack.appendChild(el);
  if (autoDismissMs) setTimeout(dismiss, autoDismissMs);
  return dismiss;
}

const CONFETTI_COLORS = ['#4f8dfd', '#7c6bfb', '#33c17a', '#e5b93f', '#f0475a'];

function fireConfetti(count = 60) {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    piece.style.animationDuration = `${1.8 + Math.random() * 1.2}s`;
    piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    container.appendChild(piece);
  }
  setTimeout(() => container.remove(), 3600);
}

function animateCountUp(el, target, duration = 700) {
  if (!el) return;
  const start = performance.now();
  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const CATEGORY_ORDER = ['temp', 'logs', 'browser_cache', 'app_cache', 'trash', 'orphan_installer', 'empty_folder', 'uninstall_residue', 'duplicates', 'large_old'];
const SAFE_CATEGORIES = ['temp', 'logs', 'browser_cache', 'app_cache', 'trash', 'orphan_installer', 'empty_folder'];
const SECTION_ORDER = ['antivirus', 'firewall', 'fake_antivirus', 'disk_encryption', 'driver_inventory', 'rootkit_cross_view', 'process_masquerade', 'cheat_tools', 'remote_access_tools', 'root_certificates', 'proxy_hijack', 'hosts_file', 'browser_hijack', 'outbound_connections', 'open_ports', 'rdp', 'smbv1', 'startup_items', 'scheduled_tasks', 'shortcut_integrity', 'autorun', 'path_audit', 'local_accounts', 'screen_lock', 'file_permissions', 'browser_extensions', 'masked_extensions', 'outdated_apps', 'privacy_settings', 'privacy_access_log', 'live_access', 'onedrive_sync'];
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info', 'ok'];

function categoryLabel(key) { return t(`category.${key}`); }
function sectionLabel(key) { return t(`section.${key}`); }
function severityLabel(sev) { return t(`severity.${sev}`); }
function actionLabel(action) { return t(`action.${action}`); }

// ---------- state ----------
function loadPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function savePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode etc — ignore */ }
}

const state = {
  scanResult: null,
  securityResult: null,
  selection: new Map(), // id -> item
  reportData: null,
  locale: loadPref('scs:locale', 'el'),
  theme: loadPref('scs:theme', 'dark'),
};

// ---------- ignore list (scan items by path, security findings by id) ----------
// Persisted client-side only (localStorage) — it's a per-viewer display
// preference ("stop showing me this specific thing"), not a change to what
// the scan actually detected. Deliberately does NOT affect totals, category
// counts in the header, or the security severity legend/health score — an
// ignored item is still real, it's just decluttered from the list you review.
const IGNORED_PATHS_KEY = 'scs:ignored_paths';
const IGNORED_FINDINGS_KEY = 'scs:ignored_findings';

function loadIgnoreSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}
function saveIgnoreSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* private mode etc — ignore */ }
}
const ignoredPaths = loadIgnoreSet(IGNORED_PATHS_KEY);
const ignoredFindings = loadIgnoreSet(IGNORED_FINDINGS_KEY);

function ignorePath(p) { ignoredPaths.add(p); saveIgnoreSet(IGNORED_PATHS_KEY, ignoredPaths); }
function ignoreFinding(id) { ignoredFindings.add(id); saveIgnoreSet(IGNORED_FINDINGS_KEY, ignoredFindings); }
function clearIgnoredPaths() { ignoredPaths.clear(); saveIgnoreSet(IGNORED_PATHS_KEY, ignoredPaths); }
function clearIgnoredFindings() { ignoredFindings.clear(); saveIgnoreSet(IGNORED_FINDINGS_KEY, ignoredFindings); }
function visibleItems(cat) { return cat.items.filter((i) => !ignoredPaths.has(i.path)); }
function visibleFindings(findings) { return findings.filter((f) => !ignoredFindings.has(f.id)); }

// ---------- theme & language ----------
const THEME_CYCLE = ['dark', 'light', 'retro'];
const THEME_ICONS = { dark: '🌙', light: '☀️', retro: '🖥️' };

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('btn-theme-toggle').textContent = THEME_ICONS[theme] || '🌙';
  savePref('scs:theme', theme);
}

function applyStaticI18n() {
  document.documentElement.lang = state.locale;
  document.getElementById('btn-lang-toggle').textContent = state.locale === 'el' ? 'EN' : 'ΕΛ';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
}

function refreshLocaleDependentUI() {
  applyStaticI18n();
  if (state.scanResult) {
    renderScanResult(state.scanResult);
    syncCheckboxesFromSelection();
  }
  if (state.securityResult) renderSecurityResult(state.securityResult);
  refreshCleanupTab();
  if (document.getElementById('panel-quarantine').classList.contains('active')) {
    refreshQuarantine();
    refreshLog();
  }
  if (state.reportData) renderReport(state.reportData);
  document.getElementById('btn-select-safe').textContent = t('scan.select_safe');
}

document.getElementById('btn-theme-toggle').addEventListener('click', () => {
  const nextIndex = (THEME_CYCLE.indexOf(state.theme) + 1) % THEME_CYCLE.length;
  applyTheme(THEME_CYCLE[nextIndex]);
});

document.getElementById('btn-lang-toggle').addEventListener('click', () => {
  state.locale = state.locale === 'el' ? 'en' : 'el';
  savePref('scs:locale', state.locale);
  window.api.setLocale(state.locale);
  refreshLocaleDependentUI();
});

window.api.setLocale(state.locale);

// ================= ONBOARDING / WHAT'S NEW =================
const ONBOARDING_SEEN_KEY = 'scs:onboarding_seen';
const LAST_SEEN_VERSION_KEY = 'scs:last_seen_version';

async function runFirstRunChecks() {
  const version = await window.api.getAppVersion();
  const onboardingSeen = loadPref(ONBOARDING_SEEN_KEY, '');
  const lastSeenVersion = loadPref(LAST_SEEN_VERSION_KEY, '');

  if (!onboardingSeen) {
    const overlay = document.getElementById('onboarding-overlay');
    overlay.hidden = false;
    document.getElementById('btn-onboarding-start').addEventListener('click', () => {
      overlay.hidden = true;
      savePref(ONBOARDING_SEEN_KEY, '1');
      savePref(LAST_SEEN_VERSION_KEY, version);
    }, { once: true });
    return; // don't also show What's New on the very first run
  }

  if (lastSeenVersion && lastSeenVersion !== version) {
    const changelog = await window.api.getChangelog(version);
    if (changelog) {
      const list = changelog[state.locale] || changelog.en || [];
      const overlay = document.getElementById('whatsnew-overlay');
      document.getElementById('whatsnew-version').textContent = `v${version}`;
      document.getElementById('whatsnew-list').innerHTML = list.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
      overlay.hidden = false;
      document.getElementById('btn-whatsnew-close').addEventListener('click', () => {
        overlay.hidden = true;
      }, { once: true });
    }
  }
  savePref(LAST_SEEN_VERSION_KEY, version);
}

runFirstRunChecks();

// ---------- tabs ----------
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach((tb) => tb.classList.toggle('active', tb === btn));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${btn.dataset.tab}`));
  if (btn.dataset.tab === 'quarantine') { refreshQuarantine(); refreshLog(); }
  if (btn.dataset.tab === 'admin' && adminUnlocked) loadAdminPanel();
  if (btn.dataset.tab === 'network') {
    document.getElementById('outbound-geolocate-wrap').hidden = !state.securityResult?.sections?.outbound_connections;
  }
});

// ================= SCAN =================
const scanStartBtn = document.getElementById('btn-scan-start');
const scanCancelBtn = document.getElementById('btn-scan-cancel');
const scanProgressWrap = document.getElementById('scan-progress-wrap');
const scanProgressFill = document.getElementById('scan-progress-fill');
const scanProgressLabel = document.getElementById('scan-progress-label');
const scanSummary = document.getElementById('scan-summary');
const scanTotalSize = document.getElementById('scan-total-size');
const scanCategoriesEl = document.getElementById('scan-categories');

let scanStepsDone = 0;

scanStartBtn.addEventListener('click', async () => {
  scanStartBtn.disabled = true;
  scanCancelBtn.disabled = false;
  scanProgressWrap.hidden = false;
  scanSummary.hidden = true;
  scanCategoriesEl.innerHTML = '';
  scanStepsDone = 0;
  scanProgressFill.style.width = '0%';
  scanProgressLabel.textContent = t('status.scan_start_label');
  setStatus(t('status.scanning'));
  startFunFacts('scan-fun-fact');

  const off = window.api.onScanProgress((data) => {
    if (data.stage === 'done') {
      scanStepsDone += 1;
      scanProgressFill.style.width = `${Math.min(100, (scanStepsDone / CATEGORY_ORDER.length) * 100)}%`;
    }
    const label = data.label || data.category || '';
    const current = data.current ? ` — ${truncateMiddle(data.current, 70)}` : '';
    scanProgressLabel.textContent = `${label}${current}`;
  });

  try {
    const result = await window.api.scanStart(state.locale);
    state.scanResult = result;
    renderScanResult(result);
    if (!result.cancelled) compareWithLastScan(result);
    setStatus(result.cancelled ? t('status.scan_cancelled') : t('status.scan_done'));
  } catch (err) {
    setStatus(t('status.scan_error', { msg: err.message }));
  } finally {
    off();
    stopFunFacts('scan-fun-fact');
    scanStartBtn.disabled = false;
    scanCancelBtn.disabled = true;
    scanProgressWrap.hidden = true;
  }
});

scanCancelBtn.addEventListener('click', () => window.api.scanCancel());

// ---- Explorer "Scan this folder" context menu toggle ----
const contextMenuBtn = document.getElementById('btn-context-menu-toggle');
let contextMenuRegistered = false;

async function refreshContextMenuButton() {
  const status = await window.api.contextMenuStatus();
  if (!status.supported) { contextMenuBtn.hidden = true; return; }
  contextMenuRegistered = status.registered;
  contextMenuBtn.textContent = contextMenuRegistered ? t('scan.context_menu_disable') : t('scan.context_menu_enable');
}

contextMenuBtn.addEventListener('click', async () => {
  contextMenuBtn.disabled = true;
  try {
    const result = contextMenuRegistered ? await window.api.contextMenuUnregister() : await window.api.contextMenuRegister(state.locale);
    if (result.ok) {
      setStatus(contextMenuRegistered ? t('status.context_menu_disabled') : t('status.context_menu_enabled'));
    } else {
      setStatus(t('status.context_menu_error', { msg: result.reason || '?' }));
    }
    await refreshContextMenuButton();
  } finally {
    contextMenuBtn.disabled = false;
  }
});

refreshContextMenuButton();

// ---- Tray: periodic background scan toggle ----
const bgScanCheckbox = document.getElementById('opt-bg-scan');
if (bgScanCheckbox) {
  window.api.getBackgroundScanEnabled().then((enabled) => { bgScanCheckbox.checked = enabled; });
  bgScanCheckbox.addEventListener('change', () => {
    window.api.setBackgroundScanEnabled(bgScanCheckbox.checked);
  });
}
window.api.onBackgroundScanResult?.((result) => {
  if (!result || result.totalFreeable <= 0) return;
  showToast({
    title: t('tray.bg_scan_notif_title'),
    body: t('tray.bg_scan_notif_body', { mb: Math.round(result.totalFreeable / (1024 * 1024)) }),
    tone: 'info',
    autoDismissMs: 10000,
  });
});

// ---- Scoped scan triggered from Explorer's right-click menu ----
const scopedScanBanner = document.getElementById('scoped-scan-banner');

window.api.onScanTargetFolder(async (folderPath) => {
  document.querySelectorAll('.tab').forEach((tb) => tb.classList.toggle('active', tb.dataset.tab === 'scan'));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-scan'));

  scanStartBtn.disabled = true;
  scanCancelBtn.disabled = false;
  scanProgressWrap.hidden = false;
  scanSummary.hidden = true;
  scanCategoriesEl.innerHTML = '';
  scopedScanBanner.hidden = true;
  scanProgressLabel.textContent = t('status.scan_start_label');
  setStatus(t('status.scan_folder_scanning', { path: truncateMiddle(folderPath, 60) }));

  const off = window.api.onScanProgress((data) => {
    const label = data.label || data.category || '';
    const current = data.current ? ` — ${truncateMiddle(data.current, 70)}` : '';
    scanProgressLabel.textContent = `${label}${current}`;
  });

  try {
    const result = await window.api.scanFolder(folderPath, state.locale);
    state.scanResult = result;
    renderScanResult(result);
    scopedScanBanner.hidden = false;
    scopedScanBanner.innerHTML = `<span>${escapeHtml(t('scan.scoped_banner', { path: folderPath }))}</span>`;
    savePref(ACHV_USED_SCOPED_SCAN_KEY, '1');
    setStatus(t('status.scan_done'));
  } catch (err) {
    setStatus(t('status.scan_error', { msg: err.message }));
  } finally {
    off();
    scanStartBtn.disabled = false;
    scanCancelBtn.disabled = true;
    scanProgressWrap.hidden = true;
  }
});

// ---------- rotating trivia during scans ----------
const FUN_FACT_COUNT = 10;
let funFactTimer = null;

function startFunFacts(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const order = Array.from({ length: FUN_FACT_COUNT }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
  let i = 0;
  const show = () => { el.textContent = '💡 ' + t(`funfact.${order[i % order.length]}`); i += 1; };
  show();
  clearInterval(funFactTimer);
  funFactTimer = setInterval(show, 4500);
}
function stopFunFacts(elementId) {
  clearInterval(funFactTimer);
  funFactTimer = null;
  const el = document.getElementById(elementId);
  if (el) el.textContent = '';
}

function truncateMiddle(str, max) {
  if (str.length <= max) return str;
  const half = Math.floor((max - 3) / 2);
  return str.slice(0, half) + '...' + str.slice(str.length - half);
}

function renderScanResult(result) {
  scanSummary.hidden = false;
  scanTotalSize.textContent = formatBytes(result.totalFreeable);
  scanCategoriesEl.innerHTML = '';

  let cardIndex = 0;
  let totalIgnored = 0;
  for (const key of CATEGORY_ORDER) {
    const cat = result.categories[key];
    if (!cat) continue;
    totalIgnored += cat.items.length - visibleItems(cat).length;
    if (visibleItems(cat).length === 0) continue;
    const card = buildCategoryCard(key, cat);
    card.style.animationDelay = `${cardIndex * 40}ms`;
    cardIndex += 1;
    scanCategoriesEl.appendChild(card);
  }
  if (scanCategoriesEl.children.length === 0) {
    scanCategoriesEl.innerHTML = `<div class="empty-note">${escapeHtml(t('scan.empty'))}</div>`;
  }
  renderIgnoredNote(scanCategoriesEl, totalIgnored, () => { clearIgnoredPaths(); renderScanResult(state.scanResult); });
}

function renderIgnoredNote(container, count, onClear) {
  if (count <= 0) return;
  const note = document.createElement('div');
  note.className = 'ignored-note';
  note.innerHTML = `<span>${escapeHtml(t('ignore.hidden_count', { n: count }))}</span> <button type="button" class="btn-link">${escapeHtml(t('ignore.clear'))}</button>`;
  note.querySelector('.btn-link').addEventListener('click', onClear);
  container.appendChild(note);
}

// ---------- compare with last scan ----------
const LAST_SCAN_SNAPSHOT_KEY = 'scs:last_scan_snapshot';
const SNAPSHOT_MAX_PATHS_PER_CATEGORY = 3000;

function loadLastScanSnapshot() {
  try { return JSON.parse(localStorage.getItem(LAST_SCAN_SNAPSHOT_KEY) || 'null'); } catch { return null; }
}
function saveScanSnapshot(result) {
  const snapshot = { scannedAt: new Date().toISOString(), totalFreeable: result.totalFreeable, categoryPaths: {} };
  for (const [key, cat] of Object.entries(result.categories || {})) {
    snapshot.categoryPaths[key] = cat.items.slice(0, SNAPSHOT_MAX_PATHS_PER_CATEGORY).map((i) => i.path);
  }
  try { localStorage.setItem(LAST_SCAN_SNAPSHOT_KEY, JSON.stringify(snapshot)); } catch { /* private mode etc — ignore */ }
}
function formatSignedBytes(bytes) {
  const sign = bytes > 0 ? '+' : bytes < 0 ? '−' : '';
  return sign + formatBytes(Math.abs(bytes));
}

function compareWithLastScan(result) {
  const banner = document.getElementById('scan-diff-banner');
  const prev = loadLastScanSnapshot();
  if (prev) {
    const prevPaths = new Set(Object.values(prev.categoryPaths).flat());
    const currentPaths = new Set(Object.values(result.categories || {}).flatMap((c) => c.items.map((i) => i.path)));
    let added = 0;
    let removed = 0;
    for (const p of currentPaths) if (!prevPaths.has(p)) added += 1;
    for (const p of prevPaths) if (!currentPaths.has(p)) removed += 1;

    if (added === 0 && removed === 0) {
      banner.hidden = true;
    } else {
      banner.hidden = false;
      banner.innerHTML = `<span>${escapeHtml(t('scan.diff_summary', {
        added,
        removed,
        date: new Date(prev.scannedAt).toLocaleString(localeTag()),
        delta: formatSignedBytes(result.totalFreeable - prev.totalFreeable),
      }))}</span>`;
    }
  } else {
    banner.hidden = true;
  }
  saveScanSnapshot(result);
}

function buildCategoryCard(key, cat) {
  const card = document.createElement('div');
  card.className = 'category-card';
  card.dataset.category = key;

  const items = visibleItems(cat);
  const visibleSize = items.reduce((s, i) => s + i.size, 0);

  const head = document.createElement('div');
  head.className = 'category-head';
  head.innerHTML = `
    <input type="checkbox" class="cat-checkbox" />
    <span class="category-title">${escapeHtml(categoryLabel(key))}</span>
    <span class="category-meta">${escapeHtml(t('scan.items_count', { count: items.length, size: formatBytes(visibleSize) }))}</span>
    <span class="category-chevron">▶</span>
  `;
  card.appendChild(head);

  const itemsWrap = document.createElement('div');
  itemsWrap.className = 'category-items';
  if (key === 'large_old' && items.length > 0) {
    itemsWrap.appendChild(buildFileTypeBreakdown(items));
  }
  const sorted = [...items].sort((a, b) => b.size - a.size);
  const RENDER_CAP = 300;
  for (const item of sorted.slice(0, RENDER_CAP)) {
    itemsWrap.appendChild(buildItemRow(item, key));
  }
  if (sorted.length > RENDER_CAP) {
    const more = document.createElement('div');
    more.className = 'more-note';
    more.textContent = t('scan.more_note', { n: sorted.length - RENDER_CAP });
    itemsWrap.appendChild(more);
  }
  card.appendChild(itemsWrap);

  head.addEventListener('click', (e) => {
    if (e.target.classList.contains('cat-checkbox')) return;
    card.classList.toggle('open');
    head.querySelector('.category-chevron').textContent = card.classList.contains('open') ? '▼' : '▶';
  });

  const catCheckbox = head.querySelector('.cat-checkbox');
  catCheckbox.addEventListener('change', () => {
    // For duplicates, "select all" means "select all but the one copy worth keeping" —
    // ticking the category checkbox shouldn't make the user hunt down and uncheck the
    // keeper in every single group by hand.
    for (const item of items) {
      const shouldSelect = catCheckbox.checked && !(key === 'duplicates' && item.keepSuggested);
      toggleSelection(item, shouldSelect, false);
    }
    itemsWrap.querySelectorAll('.item-checkbox').forEach((cb, i) => {
      const item = sorted[i];
      if (item) cb.checked = state.selection.has(item.id);
    });
    refreshCleanupTab();
  });

  return card;
}

const FILE_TYPE_GROUPS = [
  { key: 'videos', re: /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v)$/i, color: '#f0475a' },
  { key: 'archives', re: /\.(zip|rar|7z|tar|gz|iso)$/i, color: '#e5b93f' },
  { key: 'installers', re: /\.(exe|msi|dmg|pkg)$/i, color: '#7c6bfb' },
  { key: 'images', re: /\.(jpg|jpeg|png|gif|webp|bmp|heic|raw)$/i, color: '#33c17a' },
  { key: 'documents', re: /\.(pdf|docx?|xlsx?|pptx?|txt)$/i, color: '#4f8dfd' },
];

function buildFileTypeBreakdown(items) {
  const totals = new Map();
  let other = 0;
  for (const item of items) {
    const group = FILE_TYPE_GROUPS.find((g) => g.re.test(item.path));
    if (group) totals.set(group.key, (totals.get(group.key) || 0) + item.size);
    else other += item.size;
  }
  const totalSize = items.reduce((s, i) => s + i.size, 0) || 1;
  const segments = FILE_TYPE_GROUPS
    .map((g) => ({ ...g, size: totals.get(g.key) || 0 }))
    .concat({ key: 'other', color: '#9aa1b2', size: other })
    .filter((s) => s.size > 0);

  const wrap = document.createElement('div');
  wrap.className = 'filetype-breakdown';
  wrap.innerHTML = `
    <div class="filetype-bar">${segments.map((s) => `<span style="width:${(s.size / totalSize) * 100}%;background:${s.color}" title="${escapeHtml(t(`filetype.${s.key}`))}: ${formatBytes(s.size)}"></span>`).join('')}</div>
    <div class="filetype-legend">
      ${segments.map((s) => `<span class="filetype-legend-item"><span class="dot" style="background:${s.color}"></span>${escapeHtml(t(`filetype.${s.key}`))}: ${formatBytes(s.size)}</span>`).join('')}
    </div>
  `;
  return wrap;
}

const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;

function buildItemRow(item, categoryKey) {
  const row = document.createElement('div');
  row.className = 'item-row';
  const showNote = item.groupSize && item.keepSuggested;
  const isImage = categoryKey === 'duplicates' && IMAGE_EXT_RE.test(item.path);
  const thumbHtml = isImage
    ? `<img class="item-thumb" src="file:///${encodeURI(item.path.replace(/\\/g, '/'))}" loading="lazy" alt="" />`
    : '';
  row.innerHTML = `
    <input type="checkbox" class="item-checkbox" />
    ${thumbHtml}
    <span class="item-path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</span>
    <span class="item-size">${formatBytes(item.size)}</span>
  `;
  if (isImage) {
    const img = row.querySelector('.item-thumb');
    img.addEventListener('error', () => img.remove());
  }
  if (showNote) {
    const n = document.createElement('span');
    n.className = 'item-note';
    n.textContent = t('scan.keep_suggested');
    row.appendChild(n);
  }
  const cb = row.querySelector('.item-checkbox');
  cb.checked = state.selection.has(item.id);
  cb.addEventListener('change', () => {
    toggleSelection(item, cb.checked, true);
  });

  const ignoreBtn = document.createElement('button');
  ignoreBtn.type = 'button';
  ignoreBtn.className = 'item-ignore-btn';
  ignoreBtn.title = t('ignore.item_title');
  ignoreBtn.textContent = '🚫';
  ignoreBtn.addEventListener('click', () => {
    ignorePath(item.path);
    state.selection.delete(item.id);
    renderScanResult(state.scanResult);
    refreshCleanupTab();
  });
  row.appendChild(ignoreBtn);

  return row;
}

function toggleSelection(item, checked, refresh) {
  if (checked) state.selection.set(item.id, item);
  else state.selection.delete(item.id);
  if (refresh) refreshCleanupTab();
}

document.getElementById('btn-select-safe').addEventListener('click', () => {
  if (!state.scanResult) return;
  for (const key of SAFE_CATEGORIES) {
    const cat = state.scanResult.categories[key];
    if (!cat) continue;
    for (const item of visibleItems(cat)) state.selection.set(item.id, item);
  }
  renderScanResult(state.scanResult);
  syncCheckboxesFromSelection();
  refreshCleanupTab();
  setStatus(t('status.safe_selected'));
});

document.getElementById('btn-select-none').addEventListener('click', () => {
  state.selection.clear();
  if (state.scanResult) { renderScanResult(state.scanResult); syncCheckboxesFromSelection(); }
  refreshCleanupTab();
});

function syncCheckboxesFromSelection() {
  document.querySelectorAll('.category-card').forEach((card) => {
    const key = card.dataset.category;
    const cat = state.scanResult.categories[key];
    if (!cat) return;
    const items = visibleItems(cat);
    const allSelected = items.length > 0 && items.every((i) => state.selection.has(i.id));
    card.querySelector('.cat-checkbox').checked = allSelected;
  });
}

// ================= SECURITY =================
const secStartBtn = document.getElementById('btn-sec-start');
const secCancelBtn = document.getElementById('btn-sec-cancel');
const secProgressWrap = document.getElementById('sec-progress-wrap');
const secProgressFill = document.getElementById('sec-progress-fill');
const secProgressLabel = document.getElementById('sec-progress-label');
const secSummary = document.getElementById('sec-summary');
const secSectionsEl = document.getElementById('sec-sections');

let secStepsDone = 0;

secStartBtn.addEventListener('click', async () => {
  secStartBtn.disabled = true;
  secCancelBtn.disabled = false;
  secProgressWrap.hidden = false;
  secSummary.hidden = true;
  secSectionsEl.innerHTML = '';
  secStepsDone = 0;
  secProgressFill.style.width = '0%';
  setStatus(t('status.sec_scanning'));
  startFunFacts('sec-fun-fact');

  const off = window.api.onSecurityProgress((data) => {
    if (data.stage === 'done') {
      secStepsDone += 1;
      secProgressFill.style.width = `${Math.min(100, (secStepsDone / SECTION_ORDER.length) * 100)}%`;
    }
    secProgressLabel.textContent = data.label || data.category || '';
  });

  try {
    const result = await window.api.securityStart(state.locale);
    state.securityResult = result;
    renderSecurityResult(result);
    setStatus(result.cancelled ? t('status.sec_cancelled') : t('status.sec_done'));
  } catch (err) {
    setStatus(t('status.sec_error', { msg: err.message }));
  } finally {
    off();
    stopFunFacts('sec-fun-fact');
    secStartBtn.disabled = false;
    secCancelBtn.disabled = true;
    secProgressWrap.hidden = true;
  }
});

secCancelBtn.addEventListener('click', () => window.api.securityCancel());

function renderSecurityResult(result) {
  secSummary.hidden = false;
  secSummary.innerHTML = SEVERITY_ORDER.filter((s) => s !== 'ok').map((sev) => `
    <div class="legend-pill"><span class="dot ${sev}"></span>${escapeHtml(severityLabel(sev))}: ${result.counts[sev] || 0}</div>
  `).join('');

  secSectionsEl.innerHTML = '';
  let sectionIndex = 0;
  let totalIgnored = 0;
  for (const key of SECTION_ORDER) {
    const section = result.sections[key];
    if (!section) continue;
    totalIgnored += section.findings.length - visibleFindings(section.findings).length;
    const el = buildSecSection(key, section);
    el.style.animationDelay = `${sectionIndex * 40}ms`;
    sectionIndex += 1;
    secSectionsEl.appendChild(el);
  }
  renderIgnoredNote(secSectionsEl, totalIgnored, () => { clearIgnoredFindings(); renderSecurityResult(state.securityResult); });
}

function buildSecSection(key, section) {
  const findings = visibleFindings(section.findings);
  const worst = findings.reduce((acc, f) => {
    const idx = SEVERITY_ORDER.indexOf(f.severity);
    return idx < acc ? idx : acc;
  }, SEVERITY_ORDER.length - 1);
  const worstSeverity = SEVERITY_ORDER[worst] || 'ok';

  const el = document.createElement('div');
  el.className = 'sec-section';
  const head = document.createElement('div');
  head.className = 'sec-section-head';
  head.innerHTML = `
    <span class="badge ${worstSeverity}">${escapeHtml(severityLabel(worstSeverity))}</span>
    <span class="sec-section-title">${escapeHtml(sectionLabel(key))}</span>
    <span class="category-meta">${escapeHtml(t('security.findings_count', { n: findings.length }))}</span>
    <span class="category-chevron">▶</span>
  `;
  el.appendChild(head);

  const items = document.createElement('div');
  items.className = 'sec-section-items';
  if (findings.length === 0) {
    items.innerHTML = `<div class="empty-note">${escapeHtml(t('security.empty'))}</div>`;
  } else {
    for (const f of findings) {
      const row = document.createElement('div');
      row.className = 'finding-row';
      const actionable = f.path && (f.type === 'startup_item' || f.type === 'masked_extension' || f.type === 'shortcut_integrity');
      row.innerHTML = `
        <div class="finding-title"><span class="badge ${f.severity}">${escapeHtml(severityLabel(f.severity))}</span>${escapeHtml(f.title)}</div>
        ${f.detail ? `<div class="finding-detail">${escapeHtml(f.detail)}</div>` : ''}
        <div class="finding-actions">
          ${actionable ? `<button type="button" class="btn btn-small btn-danger finding-action-btn">${escapeHtml(t('security.quarantine_action'))}</button>` : ''}
          ${f.severity !== 'ok' ? `<button type="button" class="btn btn-small btn-ghost finding-ignore-btn">🚫 ${escapeHtml(t('ignore.finding_action'))}</button>` : ''}
        </div>
      `;
      if (actionable) {
        const actionBtn = row.querySelector('.finding-action-btn');
        actionBtn.addEventListener('click', () => quarantineSecurityFinding(f, actionBtn));
      }
      const ignoreBtn = row.querySelector('.finding-ignore-btn');
      if (ignoreBtn) {
        ignoreBtn.addEventListener('click', () => {
          ignoreFinding(f.id);
          renderSecurityResult(state.securityResult);
        });
      }
      items.appendChild(row);
    }
  }
  el.appendChild(items);

  head.addEventListener('click', () => {
    el.classList.toggle('open');
    head.querySelector('.category-chevron').textContent = el.classList.contains('open') ? '▼' : '▶';
  });

  return el;
}

async function quarantineSecurityFinding(finding, btn) {
  if (!window.confirm(t('security.quarantine_confirm', { path: finding.path }))) return;
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = t('cleanup.running');
  try {
    const item = { id: finding.id, path: finding.path, size: 0, category: 'security_finding', isDirectory: !!finding.isDirectory };
    const result = await window.api.cleanupRun({ items: [item], useQuarantine: true, retentionDays: 30, createRestorePointFirst: false, locale: state.locale });
    if (result.moved?.length) {
      showToast({ title: t('security.quarantine_success_title'), body: t('security.quarantine_success_body', { path: finding.path }), tone: 'ok', autoDismissMs: 6000 });
      btn.textContent = t('security.quarantine_done');
    } else {
      const reason = result.errors?.[0]?.error || '?';
      showToast({ title: t('security.quarantine_failed_title'), body: reason, tone: 'warning', autoDismissMs: 8000 });
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  } catch (err) {
    showToast({ title: t('security.quarantine_failed_title'), body: err.message, tone: 'warning', autoDismissMs: 8000 });
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

// ================= SPEEDTEST =================
const GAUGE_MAX_MBPS = 1000;
const GAUGE_TICKS_MBPS = [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000];
const GAUGE_CENTER = { x: 150, y: 160 };
const GAUGE_RADIUS = 130;

function gaugeValueToT(value, max) {
  const v = Math.max(0, Math.min(value, max));
  return Math.log10(v + 1) / Math.log10(max + 1);
}
function gaugeAngleForT(tt) { return -90 + tt * 180; }
function gaugePoint(r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: GAUGE_CENTER.x + r * Math.sin(rad), y: GAUGE_CENTER.y - r * Math.cos(rad) };
}

function buildGaugeTicks() {
  const g = document.getElementById('gauge-ticks');
  if (!g) return;
  g.innerHTML = '';
  const svgNS = 'http://www.w3.org/2000/svg';
  for (const val of GAUGE_TICKS_MBPS) {
    const angle = gaugeAngleForT(gaugeValueToT(val, GAUGE_MAX_MBPS));
    const outer = gaugePoint(GAUGE_RADIUS + 4, angle);
    const inner = gaugePoint(GAUGE_RADIUS - 10, angle);
    const label = gaugePoint(GAUGE_RADIUS - 25, angle);
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('class', 'gauge-tick-line');
    line.setAttribute('x1', outer.x); line.setAttribute('y1', outer.y);
    line.setAttribute('x2', inner.x); line.setAttribute('y2', inner.y);
    g.appendChild(line);
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('class', 'gauge-tick-label');
    text.setAttribute('x', label.x); text.setAttribute('y', label.y + 3);
    text.textContent = String(val);
    g.appendChild(text);
  }
}

const gaugeArc = document.getElementById('gauge-arc');
const gaugeNeedleGroup = document.getElementById('gauge-needle-group');
const gaugeValueEl = document.getElementById('gauge-value');
const gaugeUnitEl = document.getElementById('gauge-unit');
const gaugePhaseEl = document.getElementById('gauge-phase');
const gaugeShell = document.querySelector('.gauge-shell');
const speedGoBtn = document.getElementById('btn-speedtest-go');
const speedCancelBtn = document.getElementById('btn-speedtest-cancel');
const speedtestMeta = document.getElementById('speedtest-meta');

function setGaugeMbps(mbps) {
  const tt = gaugeValueToT(mbps, GAUGE_MAX_MBPS);
  const angle = gaugeAngleForT(tt);
  gaugeNeedleGroup.style.transform = `rotate(${angle}deg)`;
  gaugeArc.style.strokeDashoffset = String(100 - tt * 100);
}

function resetGauge() {
  setGaugeMbps(0);
  gaugeValueEl.textContent = '0.0';
  gaugeUnitEl.textContent = 'Mbps';
  gaugePhaseEl.textContent = t('speedtest.ready');
  document.querySelectorAll('.speed-stat').forEach((el) => el.classList.remove('active'));
}

function setActiveSpeedStat(metric) {
  document.querySelectorAll('.speed-stat').forEach((el) => el.classList.toggle('active', el.dataset.metric === metric));
}

function fillSpeedStat(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  const card = el.closest('.speed-stat');
  card.classList.remove('filled');
  void card.offsetWidth;
  card.classList.add('filled');
}

function speedVerdict(mbps) {
  if (mbps < 5) return t('speedtest.verdict_poor');
  if (mbps < 25) return t('speedtest.verdict_ok');
  if (mbps < 100) return t('speedtest.verdict_good');
  if (mbps < 500) return t('speedtest.verdict_great');
  return t('speedtest.verdict_blazing');
}

const SPEED_HISTORY_KEY = 'scs:speedtest_history';
const SPEED_HISTORY_MAX = 6;

function loadSpeedHistory() {
  try { return JSON.parse(localStorage.getItem(SPEED_HISTORY_KEY) || '[]'); } catch { return []; }
}
function addSpeedHistoryEntry(entry) {
  const list = loadSpeedHistory();
  list.unshift(entry);
  try { localStorage.setItem(SPEED_HISTORY_KEY, JSON.stringify(list.slice(0, SPEED_HISTORY_MAX))); } catch { /* private mode etc — ignore */ }
  renderSpeedHistory();
}
function renderSpeedHistory() {
  const wrap = document.getElementById('speed-history-wrap');
  const el = document.getElementById('speed-history');
  const list = loadSpeedHistory();
  if (list.length === 0) { wrap.hidden = true; return; }
  wrap.hidden = false;

  // Honest framing given the history only keeps a handful of entries: this
  // names the single fastest *recorded* run's hour, not a statistical trend
  // — there isn't enough data for that, and claiming otherwise would be the
  // kind of fake precision the rest of the app avoids.
  const bestTimeNote = document.getElementById('speed-best-time');
  if (list.length >= 3) {
    const fastest = list.reduce((a, b) => (b.downloadMbps > a.downloadMbps ? b : a));
    bestTimeNote.hidden = false;
    bestTimeNote.textContent = t('speedtest.best_time', { hour: new Date(fastest.testedAt).getHours() });
  } else {
    bestTimeNote.hidden = true;
  }

  el.innerHTML = list.map((h, i) => `
    <div class="speed-history-row" style="animation-delay:${i * 40}ms">
      <span class="speed-history-time">${new Date(h.testedAt).toLocaleString(localeTag(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      <span class="speed-history-metrics">
        <span><span class="dim">↓</span>${h.downloadMbps.toFixed(0)}</span>
        <span><span class="dim">↑</span>${h.uploadMbps.toFixed(0)}</span>
        <span><span class="dim">ping</span>${h.pingMs.toFixed(0)}ms</span>
      </span>
    </div>
  `).join('');
}

let speedRunning = false;

speedGoBtn.addEventListener('click', async () => {
  if (speedRunning) return;
  speedRunning = true;
  speedGoBtn.disabled = true;
  speedCancelBtn.hidden = false;
  gaugeShell.classList.add('active');
  speedtestMeta.textContent = '';
  document.getElementById('speed-verdict').hidden = true;
  ['ping', 'download', 'upload'].forEach((m) => { document.getElementById(`stat-${m}-value`).textContent = '—'; });
  resetGauge();
  setStatus(t('status.speedtest_running'));

  const off = window.api.onSpeedtestProgress((data) => {
    if (data.phase === 'ping') {
      setActiveSpeedStat('ping');
      gaugePhaseEl.textContent = t('speedtest.phase_ping');
      gaugeUnitEl.textContent = 'ms';
      if (data.stage === 'progress') {
        gaugeValueEl.textContent = data.sample.toFixed(0);
      } else if (data.stage === 'done') {
        gaugeValueEl.textContent = data.pingMs.toFixed(0);
        fillSpeedStat('stat-ping-value', `${data.pingMs.toFixed(0)} ms`);
      }
    } else if (data.phase === 'download' || data.phase === 'upload') {
      setActiveSpeedStat(data.phase);
      gaugePhaseEl.textContent = t(data.phase === 'download' ? 'speedtest.phase_download' : 'speedtest.phase_upload');
      gaugeUnitEl.textContent = 'Mbps';
      if (data.stage === 'progress') {
        setGaugeMbps(data.mbps);
        gaugeValueEl.textContent = data.mbps.toFixed(1);
      } else if (data.stage === 'done') {
        setGaugeMbps(data.mbps);
        gaugeValueEl.textContent = data.mbps.toFixed(1);
        fillSpeedStat(`stat-${data.phase}-value`, `${data.mbps.toFixed(1)} Mbps`);
      }
    }
  });

  try {
    const result = await window.api.speedtestStart();
    off();
    if (result.error) {
      gaugePhaseEl.textContent = t('speedtest.error');
      setStatus(t('status.speedtest_error', { msg: result.error }));
    } else {
      setGaugeMbps(0);
      gaugePhaseEl.textContent = result.cancelled ? t('speedtest.cancelled') : t('speedtest.done');
      setStatus(result.cancelled ? t('status.speedtest_cancelled') : t('status.speedtest_done'));
      if (result.testedAt) {
        speedtestMeta.textContent = t('speedtest.tested_at', { date: new Date(result.testedAt).toLocaleString(localeTag()) });
      }
      const verdictEl = document.getElementById('speed-verdict');
      if (!result.cancelled && result.downloadMbps != null) {
        verdictEl.textContent = speedVerdict(result.downloadMbps);
        verdictEl.hidden = false;
        addSpeedHistoryEntry({
          testedAt: result.testedAt,
          pingMs: result.pingMs || 0,
          downloadMbps: result.downloadMbps || 0,
          uploadMbps: result.uploadMbps || 0,
        });
      }
    }
  } catch (err) {
    off();
    gaugePhaseEl.textContent = t('speedtest.error');
    setStatus(t('status.speedtest_error', { msg: err.message }));
  } finally {
    speedRunning = false;
    speedGoBtn.disabled = false;
    speedCancelBtn.hidden = true;
    gaugeShell.classList.remove('active');
  }
});

speedCancelBtn.addEventListener('click', () => window.api.speedtestCancel());

document.getElementById('btn-speed-history-clear').addEventListener('click', () => {
  try { localStorage.removeItem(SPEED_HISTORY_KEY); } catch { /* ignore */ }
  renderSpeedHistory();
});

buildGaugeTicks();
resetGauge();
renderSpeedHistory();

// ================= PERFORMANCE =================
document.getElementById('btn-perf-refresh').addEventListener('click', async () => {
  const btn = document.getElementById('btn-perf-refresh');
  const content = document.getElementById('perf-content');
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = t('performance.loading');
  try {
    const data = await window.api.getTopProcesses();
    renderPerformance(data);
  } catch (err) {
    content.innerHTML = `<p class="muted">${escapeHtml(t('status.scan_error', { msg: err.message }))}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

function renderPerformance(data) {
  const content = document.getElementById('perf-content');
  if (!data.supported) {
    content.innerHTML = `<p class="muted">${escapeHtml(t('performance.unsupported'))}</p>`;
    return;
  }
  const cpuRows = data.topCpu.map((p) => `
    <div class="perf-row">
      <span class="perf-name" title="${escapeHtml(p.Name)}">${escapeHtml(p.Name)}</span>
      <span class="perf-pid">PID ${p.Pid}</span>
      <span class="perf-value">${p.CpuPct.toFixed(1)}%</span>
    </div>`).join('');
  const memRows = data.topMem.map((p) => `
    <div class="perf-row">
      <span class="perf-name" title="${escapeHtml(p.Name)}">${escapeHtml(p.Name)}</span>
      <span class="perf-pid">PID ${p.Pid}</span>
      <span class="perf-value">${formatBytes(p.MemBytes)}</span>
    </div>`).join('');

  content.innerHTML = `
    <p class="muted perf-note">${escapeHtml(t('performance.cores_note', { cores: data.cores }))}</p>
    <div class="perf-columns">
      <div class="perf-col">
        <h2 class="section-subtitle">${escapeHtml(t('performance.top_cpu'))}</h2>
        ${cpuRows || `<p class="muted">${escapeHtml(t('performance.empty'))}</p>`}
      </div>
      <div class="perf-col">
        <h2 class="section-subtitle">${escapeHtml(t('performance.top_mem'))}</h2>
        ${memRows || `<p class="muted">${escapeHtml(t('performance.empty'))}</p>`}
      </div>
    </div>
  `;
}

// ================= NETWORK =================
document.getElementById('btn-network-refresh').addEventListener('click', async () => {
  const btn = document.getElementById('btn-network-refresh');
  const content = document.getElementById('network-local-content');
  btn.disabled = true;
  try {
    const data = await window.api.getLocalNetworkInfo();
    renderLocalNetworkInfo(data);
  } catch (err) {
    content.innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
});

function renderLocalNetworkInfo(data) {
  const content = document.getElementById('network-local-content');
  if (data.error || !data.adapters) {
    content.innerHTML = `<p class="muted">${escapeHtml(t('network.local_unavailable'))}</p>`;
    return;
  }
  const adapterRows = data.adapters.map((a) => `
    <div class="net-adapter-row">
      <div class="net-adapter-name">${escapeHtml(a.Name)}</div>
      <div class="net-adapter-desc">${escapeHtml(a.Description || '')}</div>
      <div class="net-adapter-grid">
        <span class="dim">${escapeHtml(t('network.local_ip'))}</span><span>${escapeHtml(a.IPv4 || '—')}</span>
        <span class="dim">${escapeHtml(t('network.gateway'))}</span><span>${escapeHtml(a.Gateway || '—')}</span>
        <span class="dim">${escapeHtml(t('network.dns'))}</span><span>${escapeHtml(a.DNS || '—')}</span>
      </div>
    </div>
  `).join('');
  const vpnLine = data.vpnDetected
    ? `<div class="net-vpn-status active">${escapeHtml(t('network.vpn_active', { names: data.vpnAdapterNames.join(', ') }))}</div>`
    : `<div class="net-vpn-status">${escapeHtml(t('network.vpn_inactive'))}</div>`;
  content.innerHTML = vpnLine + (adapterRows || `<p class="muted">${escapeHtml(t('network.no_adapters'))}</p>`);
}

document.getElementById('btn-public-ip').addEventListener('click', async () => {
  const btn = document.getElementById('btn-public-ip');
  const result = document.getElementById('public-ip-result');
  btn.disabled = true;
  result.textContent = t('network.checking');
  try {
    const data = await window.api.getPublicIp();
    if (data.error) { result.textContent = t('network.lookup_failed', { msg: data.error }); return; }
    result.innerHTML = `
      <div class="net-ip-card">
        <div class="net-ip-value">${escapeHtml(data.ip)}</div>
        <div class="net-ip-meta">${escapeHtml([data.city, data.region, data.country].filter(Boolean).join(', '))}</div>
        <div class="net-ip-meta dim">${escapeHtml(data.org || '')}</div>
      </div>`;
  } catch (err) {
    result.textContent = t('network.lookup_failed', { msg: err.message });
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-geolocate-outbound').addEventListener('click', async () => {
  const btn = document.getElementById('btn-geolocate-outbound');
  const result = document.getElementById('geolocate-result');
  const section = state.securityResult?.sections?.outbound_connections;
  const ips = [...new Set((section?.findings || []).map((f) => f.id.split('_').pop()).filter((s) => /^\d+\.\d+\.\d+\.\d+$/.test(s)))];
  if (ips.length === 0) { result.textContent = t('network.no_outbound_ips'); return; }
  btn.disabled = true;
  result.textContent = t('network.checking');
  try {
    const results = await window.api.geolocateIps(ips);
    result.innerHTML = results.map((r) => r.error
      ? `<div class="net-geo-row">${escapeHtml(r.ip)} — ${escapeHtml(r.error)}</div>`
      : `<div class="net-geo-row"><b>${escapeHtml(r.ip)}</b> — ${escapeHtml([r.city, r.region, r.country].filter(Boolean).join(', '))} <span class="dim">${escapeHtml(r.org || '')}</span></div>`
    ).join('');
  } catch (err) {
    result.textContent = t('network.lookup_failed', { msg: err.message });
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-hibp').addEventListener('click', () => {
  window.api.openExternal('https://haveibeenpwned.com/');
});

// ================= CLEANUP =================
const cleanupListEl = document.getElementById('cleanup-list');
const cleanupFooter = document.getElementById('cleanup-footer');
const cleanupTotalText = document.getElementById('cleanup-total-text');
const cleanupResultEl = document.getElementById('cleanup-result');

function refreshCleanupTab() {
  const items = [...state.selection.values()];
  if (items.length === 0) {
    cleanupListEl.innerHTML = `<p class="muted">${escapeHtml(t('cleanup.empty_hint'))}</p>`;
    cleanupFooter.hidden = true;
    return;
  }

  const byCategory = {};
  for (const item of items) {
    (byCategory[item.category] = byCategory[item.category] || []).push(item);
  }

  cleanupListEl.innerHTML = '';
  for (const [key, catItems] of Object.entries(byCategory)) {
    const size = catItems.reduce((s, i) => s + i.size, 0);
    const group = document.createElement('div');
    group.className = 'category-card open';
    group.innerHTML = `
      <div class="category-head" style="cursor:default">
        <span class="category-title">${escapeHtml(categoryLabel(key))}</span>
        <span class="category-meta">${escapeHtml(t('scan.items_count', { count: catItems.length, size: formatBytes(size) }))}</span>
      </div>
      <div class="category-items" style="display:block"></div>
    `;
    const itemsWrap = group.querySelector('.category-items');
    for (const item of catItems.slice(0, 100)) {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `<span class="item-path">${escapeHtml(item.path)}</span><span class="item-size">${formatBytes(item.size)}</span>`;
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn-small btn-ghost';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        state.selection.delete(item.id);
        refreshCleanupTab();
        if (state.scanResult) syncCheckboxesFromSelection();
      });
      row.appendChild(removeBtn);
      itemsWrap.appendChild(row);
    }
    if (catItems.length > 100) {
      const more = document.createElement('div');
      more.className = 'more-note';
      more.textContent = t('scan.more_plain', { n: catItems.length - 100 });
      itemsWrap.appendChild(more);
    }
    cleanupListEl.appendChild(group);
  }

  const totalSize = items.reduce((s, i) => s + i.size, 0);
  cleanupTotalText.innerHTML = `${escapeHtml(t('cleanup.will_free_prefix'))} <strong>${formatBytes(totalSize)}</strong>${escapeHtml(t('cleanup.will_free_suffix', { count: items.length }))}`;
  cleanupFooter.hidden = false;
}

document.getElementById('btn-cleanup-run').addEventListener('click', async () => {
  const items = [...state.selection.values()];
  if (items.length === 0) return;

  const useQuarantine = document.getElementById('opt-quarantine').checked;
  const retentionDays = Number(document.getElementById('opt-retention-days').value) || 30;
  const createRestorePointFirst = document.getElementById('opt-restore-point').checked;
  const totalSize = formatBytes(items.reduce((s, i) => s + i.size, 0));

  const confirmMsg = useQuarantine
    ? t('cleanup.confirm_quarantine', { count: items.length, size: totalSize, days: retentionDays })
    : t('cleanup.confirm_delete', { count: items.length, size: totalSize });
  if (!window.confirm(confirmMsg)) return;

  const btn = document.getElementById('btn-cleanup-run');
  btn.disabled = true;
  btn.textContent = t('cleanup.running');
  try {
    const result = await window.api.cleanupRun({ items, useQuarantine, retentionDays, createRestorePointFirst, locale: state.locale });
    const doneCount = useQuarantine ? result.moved.length : result.deleted.length;
    const doneSize = useQuarantine ? result.totalSize : result.deleted.reduce((s, i) => s + (i.size || 0), 0);
    const errCount = result.errors.length;

    const successMsg = useQuarantine
      ? t('cleanup.success_quarantine', { count: doneCount, size: formatBytes(doneSize) })
      : t('cleanup.success_delete', { count: doneCount, size: formatBytes(doneSize) });
    cleanupResultEl.innerHTML = `
      <div class="empty-note" style="background:#13332633;border:1px solid var(--ok);border-radius:8px;">
        ${escapeHtml(successMsg)}${errCount ? escapeHtml(t('cleanup.success_errors', { n: errCount })) : ''}
      </div>`;
    if (doneCount > 0) fireConfetti(30);

    if (createRestorePointFirst) {
      if (result.restorePoint?.created) {
        showToast({ title: t('toast.restore_point_created_title'), body: t('toast.restore_point_created_body'), tone: 'ok', autoDismissMs: 6000 });
      } else {
        showToast({
          title: t('toast.restore_point_failed_title'),
          body: t('toast.restore_point_failed_body', { reason: result.restorePoint?.reason || '?' }),
          tone: 'warning',
          autoDismissMs: 0,
          actions: [
            { label: t('toast.open_settings'), primary: true, onClick: () => window.api.openSystemProtectionSettings() },
          ],
        });
      }
    }

    const doneIds = new Set((useQuarantine ? result.moved : result.deleted).map((i) => i.id || i.originalPath));
    for (const item of items) {
      state.selection.delete(item.id);
      if (state.scanResult) {
        for (const cat of Object.values(state.scanResult.categories)) {
          cat.items = cat.items.filter((i) => i.id !== item.id || !doneIds.has(item.id));
        }
      }
    }
    if (state.scanResult) {
      for (const cat of Object.values(state.scanResult.categories)) {
        cat.totalSize = cat.items.reduce((s, i) => s + i.size, 0);
      }
      state.scanResult.totalFreeable = Object.values(state.scanResult.categories).reduce((s, c) => s + c.totalSize, 0);
      renderScanResult(state.scanResult);
    }
    refreshCleanupTab();
    setStatus(t('status.cleanup_done', { size: formatBytes(doneSize) }));
  } catch (err) {
    cleanupResultEl.innerHTML = `<div class="empty-note" style="border:1px solid var(--critical)">${escapeHtml(t('cleanup.error', { msg: err.message }))}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = t('cleanup.run_button');
  }
});

// ================= QUARANTINE =================
async function refreshQuarantine() {
  const batches = await window.api.quarantineList();
  const el = document.getElementById('quarantine-batches');
  if (batches.length === 0) {
    el.innerHTML = `<p class="muted">${escapeHtml(t('quarantine.empty'))}</p>`;
    return;
  }
  el.innerHTML = '';
  let batchIndex = 0;
  for (const batch of batches) {
    const daysLeft = Math.max(0, Math.ceil((new Date(batch.expiresAt) - Date.now()) / 86400000));
    const createdDate = new Date(batch.createdAt).toLocaleString(localeTag());
    const expiresDate = new Date(batch.expiresAt).toLocaleDateString(localeTag());
    const card = document.createElement('div');
    card.className = 'batch-card';
    card.style.animationDelay = `${batchIndex * 40}ms`;
    batchIndex += 1;
    card.innerHTML = `
      <div class="batch-info">
        <div class="batch-title">${escapeHtml(t('quarantine.batch_title', { date: createdDate, count: batch.itemCount, size: formatBytes(batch.totalSize) }))}</div>
        <div class="batch-meta">${escapeHtml(t('quarantine.expires_in', { days: daysLeft, date: expiresDate }))}</div>
      </div>
      <button class="btn btn-small" data-action="restore">${escapeHtml(t('quarantine.restore'))}</button>
      <button class="btn btn-small btn-danger" data-action="purge">${escapeHtml(t('quarantine.purge_now'))}</button>
    `;
    card.querySelector('[data-action="restore"]').addEventListener('click', async () => {
      await window.api.quarantineRestore(batch.batchId, state.locale);
      savePref(ACHV_USED_RESTORE_KEY, '1');
      setStatus(t('status.restored'));
      refreshQuarantine();
      refreshLog();
    });
    card.querySelector('[data-action="purge"]').addEventListener('click', async () => {
      if (!window.confirm(t('quarantine.confirm_purge'))) return;
      await window.api.quarantinePurgeNow(batch.batchId);
      refreshQuarantine();
      refreshLog();
    });
    el.appendChild(card);
  }
}

document.getElementById('btn-quarantine-refresh').addEventListener('click', refreshQuarantine);
document.getElementById('btn-purge-expired').addEventListener('click', async () => {
  const purged = await window.api.quarantinePurgeExpired();
  setStatus(purged.length ? t('status.purged', { n: purged.length }) : t('status.no_expired'));
  refreshQuarantine();
  refreshLog();
});

async function refreshLog() {
  const log = await window.api.cleanupLog();
  const el = document.getElementById('cleanup-log');
  if (log.length === 0) {
    el.innerHTML = `<p class="muted">${escapeHtml(t('quarantine.log_empty'))}</p>`;
    return;
  }
  el.innerHTML = log.map((entry) => `
    <div class="log-row">
      <span class="log-time">${new Date(entry.timestamp).toLocaleString(localeTag())}</span>
      <span>${escapeHtml(actionLabel(entry.action))}${entry.itemCount != null ? escapeHtml(t('log.items_suffix', { n: entry.itemCount })) : ''}${entry.totalSize ? ` — ${formatBytes(entry.totalSize)}` : ''}${entry.errorCount ? escapeHtml(t('log.errors_suffix', { n: entry.errorCount })) : ''}</span>
    </div>
  `).join('');
}

// ================= REPORT =================
const HEALTH_HISTORY_KEY = 'scs:health_history';
const HEALTH_HISTORY_MAX = 10;

function loadHealthHistory() {
  try { return JSON.parse(localStorage.getItem(HEALTH_HISTORY_KEY) || '[]'); } catch { return []; }
}
function addHealthHistoryEntry(entry) {
  const list = loadHealthHistory();
  list.unshift(entry);
  try { localStorage.setItem(HEALTH_HISTORY_KEY, JSON.stringify(list.slice(0, HEALTH_HISTORY_MAX))); } catch { /* ignore */ }
  renderHealthHistory();
}
function renderHealthHistory() {
  const wrap = document.getElementById('health-history-wrap');
  if (!wrap) return;
  const list = loadHealthHistory();
  if (list.length === 0) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const el = wrap.querySelector('.health-history-list');
  el.innerHTML = list.map((h, i) => `
    <div class="health-history-row" style="animation-delay:${i * 40}ms">
      <span class="health-history-time">${new Date(h.testedAt).toLocaleString(localeTag(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      <span class="health-history-score" style="color:${scoreColor(h.score)}">${h.score}/100</span>
    </div>
  `).join('');
}

document.getElementById('btn-report-generate').addEventListener('click', async () => {
  if (!state.scanResult || !state.securityResult) {
    setStatus(t('status.need_scan_and_sec'));
    return;
  }
  const report = await window.api.reportGenerate({ scanResult: state.scanResult, securityResult: state.securityResult, locale: state.locale });
  state.reportData = report;
  renderReport(report);
  addHealthHistoryEntry({ testedAt: report.generatedAt, score: report.healthScore });
  document.getElementById('btn-report-pdf').disabled = false;
  document.getElementById('btn-report-json').disabled = false;
  document.getElementById('btn-report-csv').disabled = false;
  setStatus(t('status.report_done'));
});

document.getElementById('btn-report-json').addEventListener('click', async () => {
  if (!state.reportData) return;
  const payload = { report: state.reportData, scanResult: state.scanResult, securityResult: state.securityResult, exportedAt: new Date().toISOString() };
  const result = await window.api.reportExportJson(payload, state.locale);
  if (result.canceled) { setStatus(t('status.export_cancelled')); return; }
  setStatus(t('status.export_saved', { path: result.filePath }));
  window.api.showInFolder(result.filePath);
});

document.getElementById('btn-report-csv').addEventListener('click', async () => {
  if (!state.reportData) return;
  const result = await window.api.reportExportCsv({ scanResult: state.scanResult, securityResult: state.securityResult }, state.locale);
  if (result.canceled) { setStatus(t('status.export_cancelled')); return; }
  setStatus(t('status.export_saved', { path: result.filePath }));
  window.api.showInFolder(result.filePath);
});

function scoreColor(score) {
  if (score >= 80) return '#33c17a';
  if (score >= 50) return '#e5b93f';
  return '#f0475a';
}

function mascotForScore(score) {
  if (score >= 95) return '🥳';
  if (score >= 80) return '😊';
  if (score >= 50) return '😟';
  return '😱';
}

const ROAST_LINE_COUNTS = { critical: 3, high: 3, medium: 3, low: 2, cleanup: 3 };
function roastLineFor(rec) {
  const bucket = ROAST_LINE_COUNTS[rec.severity] ? rec.severity : 'cleanup';
  const count = ROAST_LINE_COUNTS[bucket];
  const idx = (rec.priority % count) + 1;
  return t(`roast.${bucket}.${idx}`);
}

document.getElementById('opt-roast-mode').addEventListener('change', () => {
  if (state.reportData) renderReport(state.reportData);
});

// ---------- achievements ----------
const ACHV_USED_SCOPED_SCAN_KEY = 'scs:achv_used_scoped_scan';
const ACHV_USED_RESTORE_KEY = 'scs:achv_used_restore';
const ACHV_DUPLICATE_HUNTER_GOAL = 20;
const ACHV_NEAT_FREAK_GOAL_BYTES = 5 * 1024 ** 3;
const ACHV_SPEED_RUNNER_GOAL = 5;

async function computeAchievements() {
  const healthHistory = loadHealthHistory();
  const speedHistory = loadSpeedHistory();
  let cleanupLog = [];
  try { cleanupLog = await window.api.cleanupLog(); } catch { /* ignore */ }

  let totalCleanedBytes = 0;
  let duplicatesCleaned = 0;
  for (const entry of cleanupLog) {
    totalCleanedBytes += entry.totalSize || 0;
    for (const item of entry.items || []) {
      if (item.category === 'duplicates') duplicatesCleaned += 1;
    }
  }
  const perfectScore = healthHistory.some((h) => h.score === 100);
  const nightOwl = healthHistory.some((h) => { const hr = new Date(h.testedAt).getHours(); return hr >= 0 && hr < 5; });

  return [
    { id: 'first_scan', icon: '🔎', earned: healthHistory.length >= 1 },
    { id: 'duplicate_hunter', icon: '🕵️', earned: duplicatesCleaned >= ACHV_DUPLICATE_HUNTER_GOAL, progress: `${Math.min(duplicatesCleaned, ACHV_DUPLICATE_HUNTER_GOAL)}/${ACHV_DUPLICATE_HUNTER_GOAL}` },
    { id: 'neat_freak', icon: '🧹', earned: totalCleanedBytes >= ACHV_NEAT_FREAK_GOAL_BYTES, progress: formatBytes(totalCleanedBytes) },
    { id: 'perfect_score', icon: '💯', earned: perfectScore },
    { id: 'speed_runner', icon: '⚡', earned: speedHistory.length >= ACHV_SPEED_RUNNER_GOAL, progress: `${Math.min(speedHistory.length, ACHV_SPEED_RUNNER_GOAL)}/${ACHV_SPEED_RUNNER_GOAL}` },
    { id: 'night_owl', icon: '🦉', earned: nightOwl },
    { id: 'explorer', icon: '🗂️', earned: loadPref(ACHV_USED_SCOPED_SCAN_KEY, '') === '1' },
    { id: 'safety_net', icon: '🛟', earned: loadPref(ACHV_USED_RESTORE_KEY, '') === '1' },
  ];
}

async function renderAchievements() {
  const container = document.getElementById('achievements-shelf');
  if (!container) return;
  const achievements = await computeAchievements();
  container.innerHTML = achievements.map((a) => `
    <div class="achv-badge ${a.earned ? 'earned' : 'locked'}" title="${escapeHtml(t(`achv.${a.id}_desc`))}${a.progress ? ` (${a.progress})` : ''}">
      <div class="achv-icon">${a.earned ? a.icon : '🔒'}</div>
      <div class="achv-name">${escapeHtml(t(`achv.${a.id}_name`))}</div>
    </div>
  `).join('');
}

function renderReport(report) {
  const el = document.getElementById('report-content');
  const maxCatSize = Math.max(1, ...report.categoryBreakdown.map((c) => c.size));

  el.innerHTML = `
    <div class="score-row">
      <div class="score-circle" style="border-color:${scoreColor(report.healthScore)}">
        <div class="score-mascot" id="score-mascot" title="${escapeHtml(t('report.mascot_title'))}"></div>
        <div class="score-value" id="score-value">0</div>
        <div class="score-caption">${escapeHtml(t('report.score_caption'))}</div>
      </div>
      <div class="report-stats">
        <div class="stat-card"><div class="stat-value">${report.totalFreeableFormatted}</div><div class="stat-label">${escapeHtml(t('report.freeable_label'))}</div></div>
        <div class="stat-card"><div class="stat-value">${report.totalFindings}</div><div class="stat-label">${escapeHtml(t('report.findings_label'))}</div></div>
        <div class="stat-card"><div class="stat-value">${report.securityCounts.critical || 0}</div><div class="stat-label">${escapeHtml(t('report.critical_label'))}</div></div>
        <div class="stat-card"><div class="stat-value">${report.securityCounts.high || 0}</div><div class="stat-label">${escapeHtml(t('report.high_label'))}</div></div>
        <div class="stat-card"><div class="stat-value">${(report.securityCounts.medium || 0) + (report.securityCounts.low || 0)}</div><div class="stat-label">${escapeHtml(t('report.medium_low_label'))}</div></div>
      </div>
    </div>

    <div>
      <h2 class="section-subtitle">${escapeHtml(t('report.top5_title'))}</h2>
      <div class="rec-list">
        ${report.recommendations.length ? report.recommendations.map((r) => `
          <div class="rec-row">
            <div class="rec-rank">${r.priority}</div>
            <div>
              <div class="rec-text">${escapeHtml(r.text)}</div>
              ${r.detail ? `<div class="rec-detail">${escapeHtml(r.detail)}</div>` : ''}
              ${document.getElementById('opt-roast-mode')?.checked ? `<div class="rec-roast">${escapeHtml(roastLineFor(r))}</div>` : ''}
            </div>
          </div>
        `).join('') : `<p class="muted">${escapeHtml(t('report.no_issues'))}</p>`}
      </div>
    </div>

    <div>
      <h2 class="section-subtitle">${escapeHtml(t('report.breakdown_title'))}</h2>
      <div class="chart-bars">
        ${report.categoryBreakdown.filter((c) => c.size > 0).map((c) => `
          <div class="chart-row">
            <div class="chart-label" title="${escapeHtml(categoryLabel(c.key))}">${escapeHtml(categoryLabel(c.key))}</div>
            <div class="chart-track"><div class="chart-fill" style="width:${(c.size / maxCatSize) * 100}%"></div></div>
            <div class="chart-value">${formatBytes(c.size)}</div>
          </div>
        `).join('') || `<p class="muted">${escapeHtml(t('report.no_recoverable'))}</p>`}
      </div>
    </div>

    <div>
      <h2 class="section-subtitle">${escapeHtml(t('achv.title'))}</h2>
      <div class="achv-shelf" id="achievements-shelf"></div>
    </div>

    <div class="health-history-wrap" id="health-history-wrap" hidden>
      <div class="health-history-head">
        <h2 class="section-subtitle">${escapeHtml(t('report.history_title'))}</h2>
        <button class="btn btn-small btn-ghost" id="btn-health-history-clear">${escapeHtml(t('report.history_clear'))}</button>
      </div>
      <div class="health-history-list"></div>
    </div>
  `;

  animateCountUp(document.getElementById('score-value'), report.healthScore);
  document.getElementById('score-mascot').textContent = mascotForScore(report.healthScore);
  renderHealthHistory();
  document.getElementById('btn-health-history-clear').addEventListener('click', () => {
    try { localStorage.removeItem(HEALTH_HISTORY_KEY); } catch { /* ignore */ }
    renderHealthHistory();
  });
  if (report.healthScore === 100) fireConfetti();
  renderAchievements();
}

document.getElementById('btn-report-pdf').addEventListener('click', async () => {
  if (!state.reportData) return;
  const html = buildPrintableReportHtml(state.reportData);
  setStatus(t('status.pdf_generating'));
  const result = await window.api.reportExportPdf(html, state.locale);
  if (result.canceled) { setStatus(t('status.pdf_cancelled')); return; }
  setStatus(t('status.pdf_saved', { path: result.filePath }));
  window.api.showInFolder(result.filePath);
});

function buildPrintableReportHtml(report) {
  const maxCatSize = Math.max(1, ...report.categoryBreakdown.map((c) => c.size));
  return `<!DOCTYPE html><html lang="${state.locale}"><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:28px;}
    h1{font-size:20px;margin-bottom:2px;} .muted{color:#666;font-size:11px;}
    .score{font-size:40px;font-weight:800;color:${scoreColor(report.healthScore)};}
    table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;}
    td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;}
    .bar-bg{background:#eee;border-radius:4px;overflow:hidden;height:12px;width:200px;}
    .bar-fill{background:#4f8dfd;height:100%;}
    .stats{display:flex;gap:16px;margin:14px 0;}
    .stat{border:1px solid #ddd;border-radius:6px;padding:8px 12px;}
    .stat b{font-size:16px;display:block;}
  </style></head><body>
    <h1>System Cleaner &amp; Security Scanner — ${escapeHtml(t('report.pdf_heading'))}</h1>
    <div class="muted">${escapeHtml(t('report.generated_at', { date: new Date(report.generatedAt).toLocaleString(localeTag()) }))}</div>
    <div class="score">${report.healthScore}/100</div>
    <div class="stats">
      <div class="stat"><b>${report.totalFreeableFormatted}</b>${escapeHtml(t('report.freeable_label'))}</div>
      <div class="stat"><b>${report.totalFindings}</b>${escapeHtml(t('report.findings_label'))}</div>
      <div class="stat"><b>${report.securityCounts.critical || 0}</b>${escapeHtml(t('report.critical_label'))}</div>
      <div class="stat"><b>${report.securityCounts.high || 0}</b>${escapeHtml(t('report.high_label'))}</div>
    </div>
    <h2>${escapeHtml(t('report.top5_title'))}</h2>
    <table><tbody>
      ${report.recommendations.map((r) => `<tr><td>${r.priority}</td><td>${escapeHtml(r.text)}<br><span class="muted">${escapeHtml(r.detail || '')}</span></td></tr>`).join('') || `<tr><td>${escapeHtml(t('report.no_issues'))}</td></tr>`}
    </tbody></table>
    <h2>${escapeHtml(t('report.breakdown_title'))}</h2>
    <table><tbody>
      ${report.categoryBreakdown.filter((c) => c.size > 0).map((c) => `
        <tr><td>${escapeHtml(categoryLabel(c.key))}</td><td><div class="bar-bg"><div class="bar-fill" style="width:${(c.size / maxCatSize) * 100}%"></div></div></td><td>${formatBytes(c.size)}</td></tr>
      `).join('')}
    </tbody></table>
  </body></html>`;
}

// ================= ADMIN =================
let adminUnlocked = false;
const adminLoginOverlay = document.getElementById('admin-login-overlay');
const adminUsernameInput = document.getElementById('admin-username');
const adminPasswordInput = document.getElementById('admin-password');
const adminLoginError = document.getElementById('admin-login-error');
const adminTabBtn = document.getElementById('tab-admin');

document.addEventListener('keydown', (e) => {
  if (e.key === 'F10') {
    e.preventDefault();
    if (adminUnlocked) {
      document.querySelector('[data-tab="admin"]').click();
    } else {
      adminLoginOverlay.hidden = !adminLoginOverlay.hidden;
      if (!adminLoginOverlay.hidden) adminUsernameInput.focus();
    }
  }
});

document.getElementById('btn-admin-cancel').addEventListener('click', () => {
  adminLoginOverlay.hidden = true;
});

document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ok = await window.api.adminLogin(adminUsernameInput.value, adminPasswordInput.value);
  if (ok) {
    adminUnlocked = true;
    adminLoginOverlay.hidden = true;
    adminUsernameInput.value = '';
    adminPasswordInput.value = '';
    adminLoginError.hidden = true;
    adminTabBtn.hidden = false;
    adminTabBtn.click();
  } else {
    adminLoginError.textContent = t('admin.login_error');
    adminLoginError.hidden = false;
    adminPasswordInput.value = '';
  }
});

document.getElementById('btn-admin-logout').addEventListener('click', () => {
  adminUnlocked = false;
  adminTabBtn.hidden = true;
  document.querySelector('[data-tab="scan"]').click();
});

document.getElementById('btn-admin-refresh').addEventListener('click', () => loadAdminPanel());

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

async function loadAdminPanel() {
  const el = document.getElementById('admin-content');
  el.innerHTML = `<p class="muted">${escapeHtml(t('admin.loading'))}</p>`;

  const [diag, errors, downloads] = await Promise.all([
    window.api.adminDiagnostics(),
    window.api.adminErrorLog(),
    window.api.adminGithubDownloads(),
  ]);

  const parts = [];

  parts.push(`
    <div>
      <div class="admin-section-title">${escapeHtml(t('admin.section_app'))}</div>
      <div class="admin-grid">
        <div class="admin-tile"><div class="label">Version</div><div class="value">${escapeHtml(diag.app.version)}</div><div class="sub">${diag.app.isPackaged ? 'packaged' : 'dev'}</div></div>
        <div class="admin-tile"><div class="label">${escapeHtml(t('admin.uptime'))}</div><div class="value">${formatUptime(diag.app.uptimeMs)}</div></div>
        <div class="admin-tile"><div class="label">Electron / Node</div><div class="value">${escapeHtml(diag.app.electron)}</div><div class="sub">Node ${escapeHtml(diag.app.node)}</div></div>
        <div class="admin-tile"><div class="label">OS</div><div class="value">${escapeHtml(diag.system.platform)} ${escapeHtml(diag.system.arch)}</div><div class="sub">${escapeHtml(diag.system.release)}</div></div>
        <div class="admin-tile"><div class="label">CPU</div><div class="value">${diag.system.cpuCount} cores</div><div class="sub">${escapeHtml(diag.system.cpuModel)}</div></div>
        <div class="admin-tile"><div class="label">${escapeHtml(t('admin.memory'))}</div><div class="value">${formatBytes(diag.system.totalMemBytes - diag.system.freeMemBytes)} / ${formatBytes(diag.system.totalMemBytes)}</div></div>
        ${diag.disk ? `<div class="admin-tile"><div class="label">${escapeHtml(t('admin.disk_free'))}</div><div class="value">${formatBytes(diag.disk.freeBytes)}</div></div>` : ''}
      </div>
    </div>
  `);

  parts.push(`
    <div>
      <div class="admin-section-title">${escapeHtml(t('admin.section_local_data'))}</div>
      <div class="admin-grid">
        <div class="admin-tile"><div class="label">${escapeHtml(t('tab.quarantine'))}</div><div class="value">${diag.quarantine.batchCount} batches</div><div class="sub">${formatBytes(diag.quarantine.diskBytes)}, ${diag.quarantine.pendingItemCount} ${escapeHtml(t('admin.items'))}</div></div>
        <div class="admin-tile"><div class="label">Cleanup log</div><div class="value">${diag.cleanupLog.entryCount} ${escapeHtml(t('admin.entries'))}</div><div class="sub">${formatBytes(diag.cleanupLog.fileSizeBytes)}</div></div>
        <div class="admin-tile"><div class="label">Error log</div><div class="value">${errors.length} ${escapeHtml(t('admin.entries'))}</div></div>
      </div>
    </div>
  `);

  if (!downloads.configured) {
    parts.push(`<div><div class="admin-section-title">${escapeHtml(t('admin.section_downloads'))}</div><p class="muted">${escapeHtml(t('admin.downloads_not_configured'))}</p></div>`);
  } else if (downloads.error) {
    parts.push(`<div><div class="admin-section-title">${escapeHtml(t('admin.section_downloads'))}</div><p class="muted">${escapeHtml(t('admin.downloads_error', { msg: downloads.error }))}</p></div>`);
  } else {
    parts.push(`
      <div>
        <div class="admin-section-title">${escapeHtml(t('admin.section_downloads'))} — ${escapeHtml(downloads.repo)}</div>
        <div class="admin-grid"><div class="admin-tile"><div class="label">${escapeHtml(t('admin.total_downloads'))}</div><div class="value">${downloads.totalDownloads}</div></div></div>
        <div class="admin-log-list" style="margin-top:10px">
          ${downloads.releases.map((r) => `<div class="admin-log-row" style="border-left-color:var(--accent)"><span class="time">${escapeHtml(r.tag)}</span>${r.downloads} downloads — ${new Date(r.publishedAt).toLocaleDateString()}</div>`).join('') || `<p class="muted">${escapeHtml(t('admin.no_releases'))}</p>`}
        </div>
      </div>
    `);
  }

  parts.push(`
    <div>
      <div class="admin-section-title">${escapeHtml(t('admin.section_errors'))} (${errors.length})</div>
      <div class="admin-log-list">
        ${errors.slice(0, 20).map((e) => `<div class="admin-log-row"><span class="time">${new Date(e.timestamp).toLocaleString()}</span>${escapeHtml(e.kind)}: ${escapeHtml(e.message)}<div class="stack">${escapeHtml((e.stack || '').slice(0, 300))}</div></div>`).join('') || `<p class="muted">${escapeHtml(t('admin.no_errors'))}</p>`}
      </div>
    </div>
  `);

  parts.push(`
    <div>
      <div class="admin-section-title">${escapeHtml(t('admin.section_actions'))}</div>
      <div class="actions">
        <button class="btn btn-small" id="btn-admin-open-userdata">📂 ${escapeHtml(t('admin.open_userdata'))}</button>
        <button class="btn btn-small btn-ghost" id="btn-admin-clear-history">🗑️ ${escapeHtml(t('admin.clear_history'))}</button>
      </div>
    </div>
  `);

  el.innerHTML = parts.join('');

  document.getElementById('btn-admin-open-userdata').addEventListener('click', () => window.api.adminOpenUserData());
  document.getElementById('btn-admin-clear-history').addEventListener('click', () => {
    try {
      localStorage.removeItem(SPEED_HISTORY_KEY);
      localStorage.removeItem(HEALTH_HISTORY_KEY);
    } catch { /* ignore */ }
    renderSpeedHistory();
    setStatus(t('admin.history_cleared'));
  });
}

// ---------- auto-update ----------
window.api.onUpdaterEvent?.((data) => {
  if (data.type === 'available') {
    showToast({ title: t('toast.update_available_title'), body: t('toast.update_available_body', { version: data.version }), tone: 'info' });
  } else if (data.type === 'downloaded') {
    showToast({
      title: t('toast.update_ready_title'),
      body: t('toast.update_ready_body', { version: data.version }),
      tone: 'ok',
      autoDismissMs: 0,
      actions: [{ label: t('toast.restart_now'), primary: true, onClick: () => window.api.updaterInstallNow() }],
    });
  } else if (data.type === 'error') {
    console.warn('Updater error:', data.message);
  }
});

// ---------- init ----------
applyTheme(state.theme);
applyStaticI18n();
setStatus(t('status.ready'));
