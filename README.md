# Electron Security

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

## Σημαντικοί περιορισμοί / σημειώσεις ειλικρίνειας

- **`outdatedApps.js` δεν είναι CVE scanner.** Ελέγχει τοπικά την έκδοση μερικών γνωστών εργαλείων (node/python/java/git/openssl) έναντι ενός hardcoded "λογικά πρόσφατου" ορίου. Δεν υπάρχει καμία αξιόπιστη offline εναλλακτική σε μια πραγματική βάση ευπαθειών — αν θέλετε πραγματικό vulnerability matching, θα χρειαστεί προαιρετική, ρητά συγκατατεθειμένη σύνδεση σε online feed (π.χ. OSV.dev), κάτι που δεν έχει υλοποιηθεί εδώ επίτηδες, σύμφωνα με το privacy-first requirement.
- **World-writable file check** λειτουργεί μόνο σε macOS/Linux (Unix permission bits)· στα Windows εμφανίζεται ως "δεν εφαρμόζεται" γιατί το μοντέλο δικαιωμάτων είναι ACL-based, όχι mode bits.
- **Open ports / firewall / scheduled tasks** βασίζονται σε system commands (`netstat`, `lsof`, `ss`, `netsh`, `socketfilterfw`, `ufw`/`firewall-cmd`, `launchctl`, `schtasks`, `crontab`). Αν κάποιο δεν είναι διαθέσιμο ή χρειάζεται αυξημένα δικαιώματα, εμφανίζεται ενημερωτικό εύρημα αντί να αποτύχει σιωπηλά η σάρωση.
- **Recycle Bin στα Windows** δεν σαρώνεται (χρειάζεται Shell API, όχι απλό filesystem path) — σημειώνεται ως κενή λίστα προς το παρόν.
- Το app δεν ζητά αυξημένα δικαιώματα (admin/root) by design· κάποιοι έλεγχοι θα δώσουν μερικά αποτελέσματα αν τρέξει ως απλός χρήστης, που είναι το αναμενόμενο/ασφαλές default.
- **Δεν έχει τρέξει/δοκιμαστεί ακόμα σε πραγματικό OS** — γράφτηκε σε περιβάλλον χωρίς Node.js εγκατεστημένο. Πριν το εμπιστευτείτε για πραγματικές διαγραφές, τρέξτε `npm start` και δοκιμάστε πρώτα σε test δεδομένα.

## Privacy

Κανένα analytics, καμία αποστολή δεδομένων πουθενά. Όλη η σάρωση/καθαρισμός/log γίνεται τοπικά μέσα στον φάκελο `userData` του Electron (π.χ. `~/Library/Application Support/system-cleaner-security-scanner` σε macOS, `%APPDATA%\system-cleaner-security-scanner` σε Windows).

Η καρτέλα **Ταχύτητα** είναι η μοναδική λειτουργία ορατή σε απλούς χρήστες που συνδέεται στο διαδίκτυο: όταν (και μόνο όταν) ο χρήστης πατήσει GO, η εφαρμογή στέλνει/λαμβάνει άσχετα, τυχαία δεδομένα προς/από τα δημόσια endpoints του `speed.cloudflare.com` — καμία προσωπική πληροφορία δεν εμπλέκεται, δεν αποθηκεύεται ιστορικό μετρήσεων πέρα από τη τρέχουσα session.

## Admin panel (κρυφό, μόνο για τον developer)

`Ctrl+Alt+A` ανοίγει ένα login prompt· σωστά credentials (βλ. `src/admin/config.js`) αποκαλύπτουν μια κρυφή καρτέλα "Admin" με:
- **Κατάσταση εφαρμογής** — version, uptime, Electron/Node versions, OS/CPU/μνήμη, ελεύθερος χώρος δίσκου.
- **Τοπικά δεδομένα** — μέγεθος/πλήθος Κάδου Ασφαλείας, cleanup log, error log.
- **Downloads** — συνολικό download count ανά GitHub release, μέσω του δημόσιου GitHub API (χρειάζεται να συμπληρωθεί `GITHUB_REPO` στο `src/admin/config.js` μόλις υπάρχει πραγματικό repo/release).
- **Error log** — καταγράφει τοπικά (`userData/error-log.jsonl`) ό,τι θα έκανε crash το main process, για support/debugging.
- Γρήγορες ενέργειες: άνοιγμα φακέλου `userData`, καθαρισμός τοπικού ιστορικού.

**Σημαντικό:** το password είναι hardcoded μέσα στον κώδικα που κατεβάζει ο καθένας — αυτό είναι obscurity, όχι πραγματική ασφάλεια. Το GitHub download-count check είναι η **δεύτερη** (και μοναδική άλλη) λειτουργία που αγγίζει το δίκτυο σε όλη την εφαρμογή, αλλά τρέχει μόνο όταν ένας admin ανοίξει αυτή τη συγκεκριμένη, κρυφή καρτέλα — ποτέ αυτόματα, ποτέ για απλούς χρήστες.
