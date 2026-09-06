'use strict';

/**
 * Minimal i18n for backend-generated (main-process) strings: scan category
 * labels, security finding titles/details, report recommendation text.
 * Renderer-owned chrome (tabs, buttons, static copy) has its own dictionary
 * in renderer/i18n.js — the two are separate because the renderer can't
 * `require()` this file (contextIsolation/no nodeIntegration).
 */

const STRINGS = {
  el: {
    'category.temp': () => 'Προσωρινά αρχεία',
    'category.logs': () => 'Log files',
    'category.browser_cache': () => 'Cache browser',
    'category.app_cache': () => 'Cache εφαρμογών',
    'category.trash': () => 'Κάδος ανακύκλωσης',
    'category.orphan_installer': () => 'Ημιτελή / κατεστραμμένα downloads',
    'category.empty_folder': () => 'Άδειοι φάκελοι',
    'category.duplicates': () => 'Διπλότυπα αρχεία',
    'category.large_old': () => 'Μεγάλα/παλιά αρχεία',

    'junk.temp_reason': () => 'Προσωρινό αρχείο συστήματος',
    'junk.logs_reason': () => 'Log file',
    'junk.browser_cache_reason': () => 'Cache browser',
    'junk.app_cache_reason': ({ name }) => `Cache εφαρμογής (${name})`,
    'junk.trash_reason': () => 'Κάδος ανακύκλωσης',
    'junk.partial_download_reason': () => 'Ημιτελές download (δεν ολοκληρώθηκε ποτέ)',
    'junk.corrupted_installer_reason': ({ ext }) => `Πολύ μικρό για πραγματικό installer (${ext}) — πιθανότατα αποτυχημένο download`,
    'junk.empty_folder_reason': () => 'Άδειος φάκελος',
    'largeold.reason': ({ mb, days }) => `${mb} MB, χωρίς χρήση ${days} ημέρες`,
    'duplicates.reason': ({ count }) => `${count} πανομοιότυπα αντίγραφα`,

    'contextmenu.label': () => 'Σάρωση με Electron Security',
    'security.antivirus': () => 'Antivirus',
    'security.hosts_file': () => 'Hosts file',
    'security.browser_hijack': () => 'Browser hijack',
    'security.startup_items': () => 'Στοιχεία εκκίνησης',
    'security.scheduled_tasks': () => 'Προγραμματισμένες εργασίες',
    'security.open_ports': () => 'Ανοιχτές θύρες / υπηρεσίες',
    'security.firewall': () => 'Firewall',
    'security.file_permissions': () => 'Δικαιώματα αρχείων',
    'security.browser_extensions': () => 'Browser extensions',
    'security.masked_extensions': () => 'Masked / διπλές επεκτάσεις',
    'security.outdated_apps': () => 'Παρωχημένες εκδόσεις',
    'security.check_failed': ({ label }) => `Ο έλεγχος "${label}" απέτυχε`,

    'startup.item_title': ({ name }) => `Στοιχείο εκκίνησης: ${name}`,
    'startup.suspicious_suffix': () => ' — ασυνήθιστο όνομα/τοποθεσία, αξίζει έλεγχος',
    'task.scheduled_title': ({ name }) => `Προγραμματισμένη εργασία: ${name}`,
    'task.launchagent_title': ({ label }) => `LaunchAgent/Daemon: ${label}`,
    'task.cron_title': () => 'Cron job χρήστη',
    'task.unavailable_title': () => 'Δεν ήταν δυνατή η ανάγνωση προγραμματισμένων εργασιών',

    'port.title_exposed': ({ port, proto }) => `Ανοιχτή θύρα ${port}/${proto} (προσβάσιμη από το τοπικό δίκτυο)`,
    'port.title_local': ({ port, proto }) => `Ανοιχτή θύρα ${port}/${proto} (μόνο τοπικά)`,
    'port.detail': ({ address, port }) => `Address: ${address}:${port}`,
    'port.unavailable_title': () => 'Δεν ήταν δυνατή η σάρωση ανοιχτών θυρών',
    'port.unavailable_detail': ({ msg }) => `Το εργαλείο του συστήματος δεν ήταν διαθέσιμο ή απαιτεί δικαιώματα (${msg}).`,

    'firewall.enabled_title': () => 'Το firewall είναι ενεργό',
    'firewall.disabled_title': () => 'Το firewall είναι απενεργοποιημένο',
    'firewall.disabled_detail': () => 'Συνιστάται η ενεργοποίηση του firewall για προστασία από μη εξουσιοδοτημένη πρόσβαση δικτύου.',
    'firewall.unknown_title': () => 'Δεν ήταν δυνατός ο έλεγχος firewall (ufw/firewalld μη διαθέσιμα)',
    'firewall.unknown_detail': () => 'Ελέγξτε χειροκίνητα τις ρυθμίσεις firewall του συστήματός σας.',
    'firewall.failed_title': () => 'Ο έλεγχος firewall απέτυχε',

    'perms.unsupported_windows_title': () => 'Ο έλεγχος world-writable δεν εφαρμόζεται στα Windows',
    'perms.unsupported_windows_detail': () => 'Τα Windows χρησιμοποιούν ACLs αντί για Unix permission bits· δεν ελέγχθηκε.',
    'perms.title_dir': ({ name }) => `World-writable φάκελος: ${name}`,
    'perms.title_file': ({ name }) => `World-writable αρχείο: ${name}`,
    'perms.single_user_suffix': () => ' — μοναδικός χρήστης στο μηχάνημα, χαμηλός πρακτικός κίνδυνος',

    'ext.no_permissions': () => 'καμία δηλωμένη',
    'ext.detail': ({ version, perms }) => `v${version} — permissions: ${perms}`,

    'masked.title': ({ name }) => `Πιθανό masked extension: ${name}`,
    'masked.detail': ({ path, safe }) => `${path} — φαίνεται σαν "${safe}" αλλά είναι εκτελέσιμο. Κλασικό τέχνασμα malware.`,

    'av.unsupported_title': () => 'Ο έλεγχος antivirus εφαρμόζεται μόνο σε Windows',
    'av.unsupported_detail': () => 'Στα macOS/Linux δεν υπάρχει ενιαίο API καταχωρημένων antivirus προϊόντων — ελέγξτε χειροκίνητα.',
    'av.failed_title': () => 'Ο έλεγχος antivirus απέτυχε',
    'av.none_title': () => 'Δεν εντοπίστηκε κανένα antivirus',
    'av.none_detail': () => 'Δεν βρέθηκε κανένα antivirus καταχωρημένο στο Windows Security Center. Το σύστημα δεν έχει ενεργή προστασία από malware.',
    'av.enabled_title': ({ name }) => `Ενεργό antivirus: ${name}`,
    'av.disabled_title': ({ name }) => `Το antivirus "${name}" βρέθηκε αλλά φαίνεται απενεργοποιημένο`,
    'av.disabled_detail': () => 'Ενεργοποιήστε ξανά την προστασία σε πραγματικό χρόνο.',
    'av.unknown_title': ({ name }) => `Antivirus καταχωρημένο: ${name}`,
    'av.unknown_detail': () => 'Δεν ήταν δυνατό να προσδιοριστεί με βεβαιότητα αν είναι ενεργό — ελέγξτε χειροκίνητα.',

    'hosts.unavailable_title': () => 'Δεν ήταν δυνατή η ανάγνωση του hosts file',
    'hosts.blocked_vendor_title': ({ host }) => `Το hosts file μπλοκάρει το ${host}`,
    'hosts.blocked_vendor_detail': ({ ip }) => `Ανακατευθύνεται σε ${ip} — κλασικό τέχνασμα malware για να εμποδίσει ενημερώσεις antivirus.`,
    'hosts.redirect_title': ({ host, ip }) => `Το hosts file ανακατευθύνει το ${host} → ${ip}`,
    'hosts.redirect_detail': () => 'Μπορεί να είναι σκόπιμο (π.χ. τοπικό development) — αξίζει έλεγχος αν δεν το θυμάστε.',
    'hosts.clean_title': () => 'Το hosts file δεν έχει ύποπτες καταχωρήσεις',

    'hijack.unavailable_title': () => 'Δεν βρέθηκαν ρυθμίσεις Chrome/Edge για έλεγχο',
    'hijack.default_provider': () => 'προεπιλογή του browser',
    'hijack.search_ok_title': ({ browser, name }) => `${browser}: μηχανή αναζήτησης — ${name}`,
    'hijack.search_unknown_title': ({ browser, name }) => `${browser}: άγνωστη μηχανή αναζήτησης — ${name}`,
    'hijack.search_unknown_detail': ({ url }) => `${url} — δεν είναι γνωστός πάροχος. Συνηθισμένο σημάδι browser hijacker adware.`,
    'hijack.startup_title': ({ browser }) => `${browser}: προσαρμοσμένες σελίδες εκκίνησης`,
    'hijack.homepage_title': ({ browser }) => `${browser}: προσαρμοσμένη αρχική σελίδα`,

    'outdated.title': ({ name, version }) => `${name}: εντοπίστηκε έκδοση ${version}`,
    'outdated.old_detail': ({ minMajor }) => `Παλαιότερη major έκδοση (κατώφλι: ${minMajor}.x). Ενημερώστε αν δεν χρειάζεστε ρητά αυτή την έκδοση. (Τοπικός, ευρετικός έλεγχος — δεν αντικαθιστά μια πραγματική βάση ευπαθειών.)`,
    'outdated.current_detail': () => 'Τοπικός έλεγχος έκδοσης — δεν έγινε σύνδεση στο διαδίκτυο.',

    'rec.cleanup_text': ({ label, mb, count }) => `Ελευθερώστε χώρο: ${label} (${mb} MB σε ${count} στοιχεία)`,
    'rec.cleanup_detail': () => 'Κατηγορία με τον μεγαλύτερο ανακτήσιμο χώρο από τη σάρωση.',

    'quarantine.not_found': () => 'Δεν βρέθηκε πλέον (μπορεί να διαγράφηκε ήδη).',
    'quarantine.unknown_batch': () => 'Άγνωστο batch quarantine.',
    'quarantine.already_exists': () => 'Υπάρχει ήδη αρχείο στην αρχική θέση — παραλείφθηκε.',
    'dialog.export_pdf_title': () => 'Εξαγωγή αναφοράς σε PDF',
  },

  en: {
    'category.temp': () => 'Temporary files',
    'category.logs': () => 'Log files',
    'category.browser_cache': () => 'Browser cache',
    'category.app_cache': () => 'App caches',
    'category.trash': () => 'Recycle bin / Trash',
    'category.orphan_installer': () => 'Incomplete / corrupted downloads',
    'category.empty_folder': () => 'Empty folders',
    'category.duplicates': () => 'Duplicate files',
    'category.large_old': () => 'Large / old files',

    'junk.temp_reason': () => 'Temporary system file',
    'junk.logs_reason': () => 'Log file',
    'junk.browser_cache_reason': () => 'Browser cache',
    'junk.app_cache_reason': ({ name }) => `App cache (${name})`,
    'junk.trash_reason': () => 'Recycle bin / Trash',
    'junk.partial_download_reason': () => 'Incomplete download (never finished)',
    'junk.corrupted_installer_reason': ({ ext }) => `Too small to be a real installer (${ext}) — likely a failed download`,
    'junk.empty_folder_reason': () => 'Empty folder',
    'largeold.reason': ({ mb, days }) => `${mb} MB, unused for ${days} days`,
    'duplicates.reason': ({ count }) => `${count} identical copies`,

    'contextmenu.label': () => 'Scan with Electron Security',
    'security.antivirus': () => 'Antivirus',
    'security.hosts_file': () => 'Hosts file',
    'security.browser_hijack': () => 'Browser hijack',
    'security.startup_items': () => 'Startup items',
    'security.scheduled_tasks': () => 'Scheduled tasks',
    'security.open_ports': () => 'Open ports / services',
    'security.firewall': () => 'Firewall',
    'security.file_permissions': () => 'File permissions',
    'security.browser_extensions': () => 'Browser extensions',
    'security.masked_extensions': () => 'Masked / double extensions',
    'security.outdated_apps': () => 'Outdated versions',
    'security.check_failed': ({ label }) => `Check "${label}" failed`,

    'startup.item_title': ({ name }) => `Startup item: ${name}`,
    'startup.suspicious_suffix': () => ' — unusual name/location, worth reviewing',
    'task.scheduled_title': ({ name }) => `Scheduled task: ${name}`,
    'task.launchagent_title': ({ label }) => `LaunchAgent/Daemon: ${label}`,
    'task.cron_title': () => 'User cron job',
    'task.unavailable_title': () => 'Could not read scheduled tasks',

    'port.title_exposed': ({ port, proto }) => `Open port ${port}/${proto} (reachable from the local network)`,
    'port.title_local': ({ port, proto }) => `Open port ${port}/${proto} (local only)`,
    'port.detail': ({ address, port }) => `Address: ${address}:${port}`,
    'port.unavailable_title': () => 'Could not scan open ports',
    'port.unavailable_detail': ({ msg }) => `The system tool was unavailable or requires elevated permissions (${msg}).`,

    'firewall.enabled_title': () => 'Firewall is enabled',
    'firewall.disabled_title': () => 'Firewall is disabled',
    'firewall.disabled_detail': () => 'Enabling the firewall is recommended to protect against unauthorized network access.',
    'firewall.unknown_title': () => 'Could not check firewall status (ufw/firewalld unavailable)',
    'firewall.unknown_detail': () => 'Check your firewall settings manually.',
    'firewall.failed_title': () => 'Firewall check failed',

    'perms.unsupported_windows_title': () => 'World-writable check does not apply on Windows',
    'perms.unsupported_windows_detail': () => 'Windows uses ACLs instead of Unix permission bits — not checked.',
    'perms.title_dir': ({ name }) => `World-writable folder: ${name}`,
    'perms.title_file': ({ name }) => `World-writable file: ${name}`,
    'perms.single_user_suffix': () => ' — single-user machine, low practical risk',

    'ext.no_permissions': () => 'none declared',
    'ext.detail': ({ version, perms }) => `v${version} — permissions: ${perms}`,

    'masked.title': ({ name }) => `Possible masked extension: ${name}`,
    'masked.detail': ({ path, safe }) => `${path} — looks like "${safe}" but is executable. A classic malware trick.`,

    'av.unsupported_title': () => 'Antivirus check only applies on Windows',
    'av.unsupported_detail': () => 'macOS/Linux have no unified API for registered antivirus products — check manually.',
    'av.failed_title': () => 'Antivirus check failed',
    'av.none_title': () => 'No antivirus detected',
    'av.none_detail': () => 'No antivirus product is registered with Windows Security Center. The system has no active malware protection.',
    'av.enabled_title': ({ name }) => `Antivirus active: ${name}`,
    'av.disabled_title': ({ name }) => `Antivirus "${name}" found but appears disabled`,
    'av.disabled_detail': () => 'Re-enable real-time protection.',
    'av.unknown_title': ({ name }) => `Antivirus registered: ${name}`,
    'av.unknown_detail': () => 'Could not reliably determine whether it is active — check manually.',

    'hosts.unavailable_title': () => 'Could not read the hosts file',
    'hosts.blocked_vendor_title': ({ host }) => `Hosts file is blocking ${host}`,
    'hosts.blocked_vendor_detail': ({ ip }) => `Redirected to ${ip} — a classic malware trick to stop antivirus updates.`,
    'hosts.redirect_title': ({ host, ip }) => `Hosts file redirects ${host} → ${ip}`,
    'hosts.redirect_detail': () => 'May be intentional (e.g. local development) — worth checking if you don’t recognize it.',
    'hosts.clean_title': () => 'No suspicious hosts file entries',

    'hijack.unavailable_title': () => 'No Chrome/Edge settings found to check',
    'hijack.default_provider': () => "the browser's default",
    'hijack.search_ok_title': ({ browser, name }) => `${browser}: search engine — ${name}`,
    'hijack.search_unknown_title': ({ browser, name }) => `${browser}: unrecognized search engine — ${name}`,
    'hijack.search_unknown_detail': ({ url }) => `${url} — not a known provider. A common browser-hijacker adware signature.`,
    'hijack.startup_title': ({ browser }) => `${browser}: custom startup pages`,
    'hijack.homepage_title': ({ browser }) => `${browser}: custom homepage`,

    'outdated.title': ({ name, version }) => `${name}: detected version ${version}`,
    'outdated.old_detail': ({ minMajor }) => `Older major version (threshold: ${minMajor}.x). Update it unless you specifically need this version. (Local, heuristic check — not a substitute for a real vulnerability database.)`,
    'outdated.current_detail': () => 'Local version check — no network connection was made.',

    'rec.cleanup_text': ({ label, mb, count }) => `Free up space: ${label} (${mb} MB across ${count} items)`,
    'rec.cleanup_detail': () => 'Category with the largest recoverable space from the scan.',

    'quarantine.not_found': () => 'No longer found (it may already have been deleted).',
    'quarantine.unknown_batch': () => 'Unknown quarantine batch.',
    'quarantine.already_exists': () => 'A file already exists at the original location — skipped.',
    'dialog.export_pdf_title': () => 'Export report as PDF',
  },
};

function t(locale, key, params = {}) {
  const lang = STRINGS[locale] ? locale : 'el';
  const entry = STRINGS[lang][key] || STRINGS.el[key];
  if (!entry) return key;
  return entry(params);
}

module.exports = { t };
