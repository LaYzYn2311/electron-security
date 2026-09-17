# Electron Security V2

Cross-platform desktop εφαρμογή (Windows / macOS / Linux) που σαρώνει τον δίσκο για junk/duplicate αρχεία, ελέγχει βασικές ρυθμίσεις ασφάλειας, και επιτρέπει ασφαλή, αναστρέψιμο καθαρισμό — όλα τοπικά, χωρίς αποστολή δεδομένων online.

## Stack

- **Electron** (Chromium + Node.js) για cross-platform UI χωρίς δεύτερη γλώσσα backend. Το main process (Node.js) κάνει όλη τη σάρωση filesystem/system commands· το renderer είναι απλό HTML/CSS/JS χωρίς framework.
- Καμία εξωτερική βιβλιοθήκη σάρωσης — μόνο Node's `fs`, `crypto` (hashing για duplicates), και `child_process` (για `netstat`/`lsof`/`ss`, `netsh`/`socketfilterfw`/`ufw`, `launchctl`/`schtasks`/`crontab`).
- `electron-builder` για packaging σε `.dmg` / NSIS installer / `AppImage`.

## Δομή project

```
main.js                  # Electron main process: παράθυρα, IPC handlers
preload.js                # contextBridge — εκθέτει ασφαλές API στο renderer
src/
  scanner/                 # Σάρωση junk/duplicate/large files
    junkFiles.js            # temp, logs, browser cache, app cache, trash, orphan installers, empty folders
    duplicates.js           # duplicate detection (size-group -> SHA-256 hash)
    largeOldFiles.js        # μεγάλα αρχεία χωρίς πρόσφατη χρήση
    index.js                 # orchestrator + progress events
  speedtest/
    index.js                  # ping/download/upload μέσω speed.cloudflare.com (main process only)
  security/
    startupItems.js         # startup folders/LaunchAgents + scheduled tasks/cron
    openPorts.js             # ανοιχτές θύρες (netstat/lsof/ss)
    firewall.js               # κατάσταση firewall ανά OS
    filePermissions.js       # world-writable αρχεία (Unix)
    browserExtensions.js     # Chrome/Edge/Firefox extensions + risky permissions
    maskedExtensions.js      # double-extension / masked εκτελέσιμα σε Downloads/Desktop
    outdatedApps.js           # τοπικός, ευρετικός έλεγχος έκδοσης (node/python/java/git/openssl)
    index.js                   # orchestrator + severity aggregation
  cleanup/
    quarantine.js             # move-to-quarantine / restore / purge (αναστρέψιμο)
    cleanupLog.js              # append-only log ενεργειών (JSONL)
  report/
    healthScore.js             # health score 0-100 + top-5 προτάσεις + breakdown
  utils/
    platform.js                 # per-OS γνωστές τοποθεσίες (temp/cache/startup/...)
    fsWalk.js                    # ανθεκτικό async directory walk με cancel token
    gameExclusions.js            # προστατεύει φακέλους παιχνιδιών/launchers από τους scanners
    formatBytes.js
renderer/
  index.html / style.css / app.js   # UI (καρτέλες: Σάρωση, Ασφάλεια, Καθαρισμός, Καραντίνα, Αναφορά)
```

## Εκτέλεση (development)

Χρειάζεται **Node.js 18+** εγκατεστημένο στο μηχάνημά σας (δεν ήταν διαθέσιμο στο περιβάλλον όπου γράφτηκε αυτός ο κώδικας, οπότε δεν έχει τρέξει/δοκιμαστεί ακόμα — δοκιμάστε το πρώτα τοπικά).

```bash
npm install
npm start
```

## Build εγκαταστάσιμων πακέτων

```bash
npm run dist:mac     # .dmg
npm run dist:win     # NSIS installer (.exe)
npm run dist:linux   # .AppImage
```

Πριν το πραγματικό release, προσθέστε εικονίδια στο `build/` (π.χ. `icon.icns`, `icon.ico`, `icon.png`) και δηλώστε τα στο `build` section του `package.json` — προς το παρόν δεν υπάρχουν, το `electron-builder` θα χρησιμοποιήσει το default.

## Τι κάνει κάθε καρτέλα

1. **Σάρωση** — τρέχει όλους τους scanners, δείχνει progress bar με δυνατότητα ακύρωσης, και μια λίστα ανά κατηγορία με checkboxes (ανά αρχείο ή ανά κατηγορία). Το κουμπί "Επιλογή προτεινόμενων ασφαλών" επιλέγει μόνο τις κατηγορίες χαμηλού ρίσκου (temp/cache/logs/trash/empty folders/installers) — **ποτέ** duplicates ή large/old files αυτόματα, γιατί εκεί χρειάζεται ανθρώπινη κρίση. Φάκελοι παιχνιδιών/launchers (Steam, Epic, Origin/EA, Ubisoft Connect, GOG Galaxy, Battle.net, Riot, Rockstar κ.ά.) εξαιρούνται εντελώς από όλους τους scanners εκτός από τα δικά τους cache/log/temp/dump υποφακέλα — βλ. `src/utils/gameExclusions.js`.
2. **Ασφάλεια** — τρέχει όλους τους security checks, ομαδοποιημένα ευρήματα με χρωματική σήμανση σοβαρότητας (Χαμηλό/Μεσαίο/Υψηλό/Κρίσιμο/Ενημερωτικό).
3. **Ταχύτητα** — μέτρηση ping, download και upload σε Mbps με animated gauge (Ookla-style), verdict ("καλό για 4K/gaming" κλπ) και τοπικό ιστορικό μετρήσεων, μέσω των δημόσιων, ανώνυμων endpoints `speed.cloudflare.com/__down` και `/__up`. Είναι η μοναδική λειτουργία **ορατή στους απλούς χρήστες** που συνδέεται στο διαδίκτυο, και μόνο όταν ο χρήστης πατήσει το κουμπί GO — τρέχει αποκλειστικά στο main process, όχι στο renderer, ώστε το αυστηρό CSP του renderer να μη χρειάζεται καμία χαλάρωση. (Υπάρχει και μία δεύτερη, κρυφή εξαίρεση — δες το admin panel παρακάτω.)
4. **Καθαρισμός** — δείχνει ό,τι επιλέχθηκε στη Σάρωση, με toggle για quarantine (προεπιλογή: ενεργό, 30 ημέρες) και ρητή επιβεβαίωση (`confirm()`) πριν από κάθε διαγραφή. Καμία αυτόματη διαγραφή.
5. **Καραντίνα** — λίστα batches με ημέρες μέχρι λήξη, "Επαναφορά" ή "Οριστική διαγραφή τώρα"· plus πλήρες ιστορικό ενεργειών.
6. **Αναφορά** — health score 0-100, ανακτήσιμος χώρος, top-5 προτάσεις προτεραιότητας, breakdown ανά κατηγορία, εξαγωγή σε PDF (μέσω Electron's `printToPDF`, τοπικά, χωρίς cloud service).

## v2.1.0 — νέα χαρακτηριστικά

- **System tray + περιοδική σάρωση παρασκηνίου** — checkbox στην καρτέλα «Σάρωση» (`src/tray.js`, `src/settings.js`). Όταν ενεργό, τρέχει `runFullScan` κάθε 6 ώρες στο main process· αν βρεθεί αρκετός ανακτήσιμος χώρος, στέλνει native notification. Στα Windows, κλείνοντας το παράθυρο κρύβεται στο tray αντί να κλείσει η εφαρμογή (μία φορά εμφανίζεται ενημερωτικό notification γι' αυτό) — μόνο «Έξοδος» από το tray menu κλείνει πραγματικά την εφαρμογή.
- **"Τι νέο υπάρχει"** — modal που εμφανίζεται μία φορά μετά από κάθε auto-update, με το changelog της νέας έκδοσης (`src/changelog.js`).
- **Έλεγχος κρυπτογράφησης δίσκου** — νέος έλεγχος στην καρτέλα Ασφάλεια (`src/security/diskEncryption.js`), μέσω WMI `Win32_EncryptableVolume` (λειτουργεί με BitLocker σε Pro/Enterprise και Device Encryption σε Home).
- **Έλεγχος ρυθμίσεων απορρήτου Windows** — Advertising ID και επίπεδο diagnostic data μέσω registry (`src/security/privacySettings.js`).
- **Ανίχνευση καταλοίπων απεγκατεστημένων προγραμμάτων** — νέα κατηγορία στη Σάρωση (`src/scanner/uninstallResidue.js`). **Καθαρά ευρετικός έλεγχος**: συγκρίνει ονόματα φακέλων στο AppData/Program Files με τη λίστα εγκατεστημένων προγραμμάτων από το registry· ό,τι δεν ταιριάζει και δεν έχει αλλάξει εδώ και 180+ ημέρες σημειώνεται ως πιθανό κατάλοιπο. **Ποτέ** δεν συμπεριλαμβάνεται στην "Επιλογή προτεινόμενων ασφαλών" — απαιτεί πάντα ανθρώπινη επιβεβαίωση.
- **Ενέργειες πάνω σε ευρήματα ασφαλείας** — τα ευρήματα "Στοιχείο εκκίνησης" και "Masked extension" έχουν πλέον κουμπί "Μετακίνηση στον Κάδο Ασφαλείας" απευθείας από την καρτέλα Ασφάλεια.
- **Προεπισκόπηση εικόνων σε διπλότυπα** — thumbnail (μέσω `file://`) για διπλότυπα αρχεία με επέκταση εικόνας· το CSP του renderer χαλάρωσε ελαφρά (`img-src 'self' file:`) μόνο για αυτό.
- **Οθόνη καλωσορίσματος (πρώτη εκτέλεση)** — σύντομη επεξήγηση της εφαρμογής και της στάσης της απέναντι στο απόρρητο, εμφανίζεται μία φορά.

## v2.2.0 — νέα χαρακτηριστικά

- **Drivers πυρήνα (`src/security/driverInventory.js`)** — ελέγχει κάθε *ενεργό* driver πυρήνα (`Win32_SystemDriver`) για έγκυρη ψηφιακή υπογραφή (`Get-AuthenticodeSignature`). Ένα ενεργό, μη έγκυρα υπογεγραμμένο driver είναι σοβαρό εύρημα (severity `high`) — είτε test-signing mode ενεργό, είτε κάτι παρέκαμψε το driver-signature enforcement των Windows. Γενικός, διαρκής δείκτης (δεν βασίζεται σε λίστα ονομάτων) που πιάνει τόσο rootkits/malware όσο και πιο εξελιγμένα cheats που χρειάζονται πρόσβαση πυρήνα.
- **Εργαλεία cheat (`src/security/cheatDetection.js`)** — σκόπιμα στενό: αναγνωρίζει μόνο το Cheat Engine (το πιο διάσημο, δημόσια τεκμηριωμένο εργαλείο αυτού του είδους) μέσω της λίστας τρεχουσών διεργασιών. **Δεν** προσπαθεί να απαριθμήσει εμπορικά "cheat" προϊόντα — αλλάζουν όνομα συνεχώς, και μια ημιτελής λίστα ονομάτων θα ήταν αναξιόπιστη. Ενημερωτικό εύρημα, όχι κατηγορία· η ουσιαστική/διαρκής ανίχνευση είναι ο παραπάνω έλεγχος drivers πυρήνα.
- **Απομακρυσμένη πρόσβαση (`src/security/remoteAccessTools.js`)** — ελέγχει αν τρέχει γνωστό λογισμικό remote access (TeamViewer, AnyDesk, RustDesk, VNC, LogMeIn, ConnectWise, κ.ά.) — νόμιμα εργαλεία, αλλά και ο πιο συνηθισμένος φορέας για tech-support scams.
- **Ιστορικό κάμερας/μικροφώνου (`src/security/privacyAccessLog.js`)** — διαβάζει το ίδιο ιστορικό που δείχνουν τα Windows στο Ρυθμίσεις → Απόρρητο → Κάμερα/Μικρόφωνο (`CapabilityAccessManager\ConsentStore`), δείχνει τις τελευταίες 5 εφαρμογές ανά συσκευή που το χρησιμοποίησαν τις τελευταίες 30 ημέρες.
- Νέος βοηθητικός module `src/utils/processList.js` (κοινός για τα δύο process-name checks).

## v2.3.0 — νέα χαρακτηριστικά

- **AutoPlay (`src/security/autorunCheck.js`)** — ελέγχει αν είναι ενεργό το AutoPlay για αφαιρούμενους δίσκους. Σκόπιμα χαμηλής σοβαρότητας: το πραγματικό ιστορικό exploit (αυτόματη εκτέλεση `autorun.inf`) διορθώθηκε OS-wide από τα Windows το 2011· αυτό είναι πλέον ευκολία, όχι κίνδυνος.
- **Πιστοποιητικά ρίζας (`src/security/rootCertificates.js`)** — εντοπίζει αυτο-υπογεγραμμένα πιστοποιητικά που προστέθηκαν στο trusted root store τα τελευταία 2 χρόνια (κλασική τεχνική HTTPS interception, αλλά και συνηθισμένο νόμιμο pattern για desktop εφαρμογές με τοπικό HTTPS UI — π.χ. Battle.net, Razer Chroma, επιβεβαιωμένο σε πραγματικό μηχάνημα). Μικρό ενσωματωμένο allowlist γνωστών νόμιμων περιπτώσεων, ειδοποιεί ακόμα για όλα με ξεκάθαρη, μη-alarmist διατύπωση.
- **Εξερχόμενες συνδέσεις (`src/security/outboundConnections.js`)** — δείχνει ποιες διεργασίες έχουν αυτή τη στιγμή ενεργή σύνδεση προς εξωτερικές (μη-ιδιωτικές) διευθύνσεις IP, ομαδοποιημένες ανά διεργασία+IP. Αποκλειστικά τοπικά δεδομένα (`netstat`/`tasklist`) — **καμία** αναζήτηση DNS/geolocation, ώστε να μην παραβιάζεται η αρχή "καμία σύνδεση στο διαδίκτυο εκτός του προαιρετικού speed test".
- **Εξαγωγή αναφοράς σε JSON/CSV** — δίπλα στο υπάρχον PDF export, στην καρτέλα «Αναφορά».

## v2.4.0 — νέα χαρακτηριστικά

- **Λίστα παράβλεψης** — κουμπί 🚫 σε κάθε στοιχείο σάρωσης/εύρημα ασφαλείας που το κρύβει μόνιμα (localStorage, ανά χρήστη). Σκόπιμα δεν επηρεάζει τα σύνολα/health score — ένα παραβλεφθέν στοιχείο εξακολουθεί να υπάρχει, απλά δεν εμφανίζεται στη λίστα. "N κρυμμένα — Επαναφορά" για να τα ξαναδείς όλα.
- **Σύγκριση με προηγούμενη σάρωση** — μετά από κάθε πλήρη σάρωση, banner με +νέα/-λυμένα στοιχεία σε σχέση με την προηγούμενη (αποθηκεύεται τοπικά).
- **Καρτέλα «Επιδόσεις» (`src/system/resourceUsage.js`)** — στιγμιότυπο (όχι live monitoring) top διεργασιών ανά CPU/RAM. Το CPU% υπολογίζεται με δειγματοληψία του `.CPU` (cumulative, .NET API) σε ~0.7s διάστημα — όχι named performance counters, που είναι localized ονόματα στα μη-αγγλικά Windows και θα απέτυχαν σε ελληνικά Windows.
## v2.5.0 — "για πλάκα" χαρακτηριστικά

- **Επιτεύγματα** — 8 badges στην καρτέλα «Αναφορά» (πρώτη σάρωση, κυνηγός διπλότυπων, καθαριστής, άριστα, ταχύτητα, νυχτοπούλι, εξερευνητής, δίχτυ ασφαλείας), υπολογισμένα από στοιχεία που ήδη υπάρχουν (cleanup log, health/speed history) — καθαρά renderer-side, καμία αλλαγή backend.
- **Θέμα "Retro"** — τρίτη επιλογή στο theme toggle (🌙 → ☀️ → 🖥️), πράσινο-σε-μαύρο τερματικού με λεπτό scanline εφέ.
- **Mascot health score** — μικρό emoji πάνω στον κύκλο score που αλλάζει διάθεση (🥳/😊/😟/😱) ανάλογα με το νούμερο.
- **Κομφετί** — σε τέλειο score (100/100) και μετά από κάθε επιτυχή καθαρισμό.
- **Αστεία γεγονότα κατά τη σάρωση** — εναλλάξ κατά τη διάρκεια σάρωσης/ελέγχου ασφαλείας.
- **Roast mode** — προαιρετικό checkbox στην καρτέλα «Αναφορά» που προσθέτει μια σαρκαστική παρατήρηση κάτω από κάθε πρόταση, χωρίς να αλλάζει το πραγματικό, τεχνικό κείμενο.

## v2.6.0 — "IP things" + antivirus/antispy batch

- **Καρτέλα «Δίκτυο»** — τοπικά στοιχεία δικτύου (adapters, IP, gateway, DNS, εντοπισμός VPN) χωρίς καμία σύνδεση στο διαδίκτυο· συν δύο ρητά προαιρετικά κουμπιά (ίδιο μοτίβο με το Speed Test): δημόσια IP/τοποθεσία και τοποθεσία εξερχόμενων συνδέσεων, μέσω `ipapi.co`.
- **14 νέοι έλεγχοι ασφαλείας**, όλοι δοκιμασμένοι σε πραγματικό μηχάνημα:
  - RDP / SMBv1 / τοπικοί λογαριασμοί (Guest, κενοί κωδικοί) / proxy συστήματος / κλείδωμα οθόνης — τυπικοί έλεγχοι "harden your Windows PC".
  - **Ψευδο-διεργασίες συστήματος** (`processMasquerade.js`) — σημαντικό εύρημα κατά την ανάπτυξη: τα Windows αρνούνται πρόσβαση στη διαδρομή προστατευμένων διεργασιών σε απλό χρήστη, οπότε ο έλεγχος κρίνει *μόνο* ό,τι μπορεί πραγματικά να επιβεβαιώσει· τα υπόλοιπα δηλώνονται ρητά ως "δεν ελέγχθηκαν", όχι ύποπτα.
  - **Κρυφές διεργασίες (cross-view)** — συγκρίνει δύο ανεξάρτητες μεθόδους απαρίθμησης διεργασιών.
  - **Ενεργή χρήση κάμερας/μικροφώνου ΤΩΡΑ** — διαφορετικό από το ιστορικό της v2.2.0.
  - **PATH audit**, **ακεραιότητα συντομεύσεων (.lnk)**, **ψεύτικο antivirus**, **OneDrive sync status**.
- **Η σάρωση παρασκηνίου παραλείπεται όταν το σύστημα είναι απασχολημένο** — φόρτο-βασισμένη ευρετική (όχι λίστα ονομάτων παιχνιδιών): αν κάποια διεργασία χρησιμοποιεί ≥40% CPU, η προγραμματισμένη σάρωση παραλείπεται και ξαναδοκιμάζει σε 15 λεπτά. Η χειροκίνητη "Σάρωση τώρα" δεν επηρεάζεται.
- **Δεν** υλοποιήθηκε το Focus Assist state check — επιβεβαιώθηκε ότι δεν είναι αξιόπιστα αναγνώσιμο τοπικά (το γνωστό CloudStore path δεν υπάρχει καν σε αυτό το μηχάνημα).
- **Ανάλυση μεγάλων/παλιών αρχείων ανά τύπο** και **"καλύτερη ώρα για speed test"** insight στην καρτέλα Ταχύτητα.
- **Έλεγχος διαρροών email** — το HaveIBeenPwned απαιτεί πλέον πληρωμένο API key για αυτόματο έλεγχο, οπότε το κουμπί απλά ανοίγει τον ιστότοπό τους στον προεπιλεγμένο browser.

- Σκόπιμα **δεν** υλοποιήθηκε ακόμα ένα "game-folder DLL scan" (σαρωτής για DLL injection σε φακέλους παιχνιδιών) που είχε προταθεί — μετά από αξιολόγηση, η αξιόπιστη ανίχνευση εγκατεστημένων game-folder roots σε όλα τα launchers/δίσκους είναι μη τετριμμένη και υψηλού κινδύνου για false positives χωρίς πολύ περισσότερη δουλειά· ο υπάρχων έλεγχος drivers πυρήνα καλύπτει το πιο σοβαρό υποσύνολο αυτού του κινδύνου με πολύ πιο αξιόπιστο τρόπο.

## Σημαντικοί περιορισμοί / σημειώσεις ειλικρίνειας

- **`outdatedApps.js` δεν είναι CVE scanner.** Ελέγχει τοπικά την έκδοση μερικών γνωστών εργαλείων (node/python/java/git/openssl) έναντι ενός hardcoded "λογικά πρόσφατου" ορίου. Δεν υπάρχει καμία αξιόπιστη offline εναλλακτική σε μια πραγματική βάση ευπαθειών — αν θέλετε πραγματικό vulnerability matching, θα χρειαστεί προαιρετική, ρητά συγκατατεθειμένη σύνδεση σε online feed (π.χ. OSV.dev), κάτι που δεν έχει υλοποιηθεί εδώ επίτηδες, σύμφωνα με το privacy-first requirement.
- **World-writable file check** λειτουργεί μόνο σε macOS/Linux (Unix permission bits)· στα Windows εμφανίζεται ως "δεν εφαρμόζεται" γιατί το μοντέλο δικαιωμάτων είναι ACL-based, όχι mode bits.
- **Open ports / firewall / scheduled tasks** βασίζονται σε system commands (`netstat`, `lsof`, `ss`, `netsh`, `socketfilterfw`, `ufw`/`firewall-cmd`, `launchctl`, `schtasks`, `crontab`). Αν κάποιο δεν είναι διαθέσιμο ή χρειάζεται αυξημένα δικαιώματα, εμφανίζεται ενημερωτικό εύρημα αντί να αποτύχει σιωπηλά η σάρωση.
- **Recycle Bin στα Windows** δεν σαρώνεται (χρειάζεται Shell API, όχι απλό filesystem path) — σημειώνεται ως κενή λίστα προς το παρόν.
- Το app δεν ζητά αυξημένα δικαιώματα (admin/root) by design· κάποιοι έλεγχοι θα δώσουν μερικά αποτελέσματα αν τρέξει ως απλός χρήστης, που είναι το αναμενόμενο/ασφαλές default.
- **Το uninstall-residue scan είναι ευρετικό, όχι σίγουρο.** Δεν υπάρχει ιστορικό στιγμιότυπο του τι ήταν εγκατεστημένο πριν, οπότε ένα portable εργαλείο ή κάτι εγκατεστημένο εκτός του τυπικού registry uninstall entry μπορεί να φαίνεται ίδιο με ένα πραγματικό κατάλοιπο. Γι' αυτό είναι πάντα `severity: low`, ποτέ στο "Επιλογή προτεινόμενων ασφαλών", και εξαιρεί explicit ένα allowlist γνωστών vendor/system φακέλων (Microsoft, Google, Mozilla, κάρτες γραφικών κλπ) — βλ. `NEVER_FLAG` στο `src/scanner/uninstallResidue.js`.

## Privacy

Κανένα analytics, καμία αποστολή δεδομένων πουθενά. Όλη η σάρωση/καθαρισμός/log γίνεται τοπικά μέσα στον φάκελο `userData` του Electron (π.χ. `~/Library/Application Support/system-cleaner-security-scanner` σε macOS, `%APPDATA%\system-cleaner-security-scanner` σε Windows).

Η καρτέλα **Ταχύτητα** είναι η μοναδική λειτουργία ορατή σε απλούς χρήστες που συνδέεται στο διαδίκτυο: όταν (και μόνο όταν) ο χρήστης πατήσει GO, η εφαρμογή στέλνει/λαμβάνει άσχετα, τυχαία δεδομένα προς/από τα δημόσια endpoints του `speed.cloudflare.com` — καμία προσωπική πληροφορία δεν εμπλέκεται, δεν αποθηκεύεται ιστορικό μετρήσεων πέρα από τη τρέχουσα session.

## Admin panel (κρυφό, μόνο για τον developer)

`F10` ανοίγει ένα login prompt· σωστά credentials (βλ. `src/admin/config.js`) αποκαλύπτουν μια κρυφή καρτέλα "Admin" με:
- **Κατάσταση εφαρμογής** — version, uptime, Electron/Node versions, OS/CPU/μνήμη, ελεύθερος χώρος δίσκου.
- **Τοπικά δεδομένα** — μέγεθος/πλήθος Κάδου Ασφαλείας, cleanup log, error log.
- **Downloads** — συνολικό download count ανά GitHub release, μέσω του δημόσιου GitHub API. Repo: [LaYzYn2311/electron-security](https://github.com/LaYzYn2311/electron-security).
- **Error log** — καταγράφει τοπικά (`userData/error-log.jsonl`) ό,τι θα έκανε crash το main process, για support/debugging.
- Γρήγορες ενέργειες: άνοιγμα φακέλου `userData`, καθαρισμός τοπικού ιστορικού.

**Σημαντικό:** το password είναι hardcoded μέσα στον κώδικα που κατεβάζει ο καθένας — αυτό είναι obscurity, όχι πραγματική ασφάλεια. Το GitHub download-count check είναι η **δεύτερη** (και μοναδική άλλη) λειτουργία που αγγίζει το δίκτυο σε όλη την εφαρμογή, αλλά τρέχει μόνο όταν ένας admin ανοίξει αυτή τη συγκεκριμένη, κρυφή καρτέλα — ποτέ αυτόματα, ποτέ για απλούς χρήστες.
