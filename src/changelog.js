/**
 * Hand-maintained changelog shown in the "What's New" screen after an
 * auto-update installs. Keyed by exact version string from package.json.
 * Each entry is { el: [...], en: [...] } bullet lists.
 */
const CHANGELOG = {
  '2.6.0': {
    el: [
      'Νέα καρτέλα «Δίκτυο» — τοπικά στοιχεία + προαιρετική δημόσια IP/τοποθεσία',
      '14 νέοι έλεγχοι ασφαλείας (RDP, SMBv1, τοπικοί λογαριασμοί, proxy, κλείδωμα οθόνης, PATH, ψευδο-διεργασίες, ενεργή κάμερα/μικρόφωνο, κρυφές διεργασίες, ψεύτικο antivirus, συντομεύσεις, OneDrive, κ.ά.)',
      'Η σάρωση παρασκηνίου παραλείπεται όταν το σύστημα είναι απασχολημένο (π.χ. παιχνίδι)',
      'Ανάλυση μεγάλων αρχείων ανά τύπο',
      'Έλεγχος διαρροών email (άνοιγμα HaveIBeenPwned)',
    ],
    en: [
      'New "Network" tab — local info + optional public IP/geolocation',
      '14 new security checks (RDP, SMBv1, local accounts, proxy, screen lock, PATH, process masquerading, live camera/mic, hidden processes, fake antivirus, shortcuts, OneDrive, etc.)',
      'Background scan now skips itself when the system is busy (e.g. gaming)',
      'Large-file breakdown by type',
      'Email breach check (opens HaveIBeenPwned)',
    ],
  },
  '2.5.0': {
    el: [
      'Επιτεύγματα — 8 badges βασισμένα στην πραγματική χρήση σου',
      'Θέμα "Retro" (πράσινο σε μαύρο, τερματικού)',
      'Mascot που αλλάζει διάθεση με το health score',
      'Κομφετί σε τέλειο score και μετά από καθαρισμό',
      'Αστεία γεγονότα κατά τη σάρωση',
      'Roast mode — προαιρετικός σαρκαστικός τόνος στην αναφορά',
    ],
    en: [
      'Achievements — 8 badges based on your real usage',
      '"Retro" theme (green-on-black terminal)',
      'A mascot that reacts to your health score',
      'Confetti on a perfect score and after cleanup',
      'Fun facts while scanning',
      'Roast mode — optional sarcastic tone for the report',
    ],
  },
  '2.4.0': {
    el: [
      'Νέα καρτέλα «Επιδόσεις» — στιγμιότυπο CPU/RAM ανά διεργασία',
      'Λίστα παράβλεψης — κρύψε συγκεκριμένα ευρήματα μόνιμα',
      'Σύγκριση με την προηγούμενη σάρωση (νέα/λυμένα στοιχεία)',
    ],
    en: [
      'New "Performance" tab — per-process CPU/RAM snapshot',
      'Ignore list — permanently hide specific findings',
      'Compare with the previous scan (new/resolved items)',
    ],
  },
  '2.3.0': {
    el: [
      'Έλεγχος AutoPlay (USB/αφαιρούμενοι δίσκοι)',
      'Έλεγχος πρόσφατων, αυτο-υπογεγραμμένων πιστοποιητικών ρίζας',
      'Ορατότητα ενεργών εξερχόμενων συνδέσεων ανά διεργασία',
      'Εξαγωγή αναφοράς σε JSON και CSV',
    ],
    en: [
      'AutoPlay (USB/removable drive) check',
      'Recently-added, self-signed root certificate check',
      'Active outbound connection visibility, per process',
      'Export report as JSON and CSV',
    ],
  },
  '2.2.0': {
    el: [
      'Έλεγχος drivers πυρήνα για έγκυρη ψηφιακή υπογραφή',
      'Ανίχνευση γνωστών εργαλείων cheat (πχ Cheat Engine)',
      'Έλεγχος ενεργού λογισμικού απομακρυσμένης πρόσβασης (TeamViewer κλπ)',
      'Ιστορικό πρόσφατης χρήσης κάμερας/μικροφώνου',
    ],
    en: [
      'Kernel driver signature check',
      'Known cheat-tool detection (e.g. Cheat Engine)',
      'Active remote-access software check (TeamViewer, etc.)',
      'Recent camera/microphone access history',
    ],
  },
  '2.1.0': {
    el: [
      'Tray εικονίδιο με προγραμματισμένη σάρωση στο παρασκήνιο',
      'Έλεγχος κρυπτογράφησης δίσκου (BitLocker / Device Encryption)',
      'Έλεγχος ρυθμίσεων απορρήτου Windows (Advertising ID, diagnostic data)',
      'Ανίχνευση καταλοίπων απεγκατεστημένων προγραμμάτων',
      'Δυνατότητα καραντίνας απευθείας από ευρήματα ασφαλείας',
      'Προεπισκόπηση εικόνων σε διπλότυπα αρχεία',
      'Οθόνη καλωσορίσματος για νέους χρήστες',
    ],
    en: [
      'Tray icon with scheduled background scanning',
      'Disk encryption check (BitLocker / Device Encryption)',
      'Windows privacy settings check (Advertising ID, diagnostic data)',
      'Uninstalled-program leftover detection',
      'One-click quarantine directly from security findings',
      'Image thumbnails for duplicate files',
      'First-run welcome screen',
    ],
  },
};

function getChangelogFor(version) {
  return CHANGELOG[version] || null;
}

module.exports = { CHANGELOG, getChangelogFor };
