# DBZ-App — BACKLOG & Arbeitsplan (Version 2)

Grundlage: ausführliches Nutzer-Feedback (Rollen-Durchlauf: Schüler, Lehrer,
Klassensprecher, Eltern, Leitung, Admin). Diese Datei ist die verbindliche
Aufgabenliste. **Reihenfolge laut Nutzer: erst Bugs + sichtbare Funktionen,
Datenbank/Persistenz danach, Layout ganz zum Schluss.** Ziel: alles perfekt
machen, in Paketen abarbeiten.

## Arbeitsweise (neu)
- Entwicklung läuft **direkt im Repo `sahdjad/DBZ-App`** (kein ZIP-Upload mehr).
- Änderungen committen/pushen → **Render deployt automatisch** (Service `dbz-app`,
  live unter https://dbz-app.onrender.com).
- Aufwecken via UptimeRobot aktiv (kein Kaltstart-Hängen).
- Betrieb 0 € (Render Free). Persistenz-Umstieg (Supabase) ist geplant, s. P2.

## ⚠️ Wichtiger Hinweis zur Persistenz
Free-Tier hat **keine dauerhafte Festplatte**: hochgeladene Dateien (v. a.
**Audios**) und neu eingegebene Daten gehen bei jedem Neustart/Deploy verloren.
Das ist mit hoher Wahrscheinlichkeit der Grund, warum **Audio-Abgaben nicht
abspielbar** sind. → Endgültig lösbar erst mit P2 (Datenbank + Objektspeicher).
Bis dahin gilt: neue Daten sind flüchtig.

---

## Specs zu den kniffligen Punkten (vom Nutzer bestätigt / vorgeschlagen)

### Rollen-Hierarchie
- **Admin (Ersteller):** volle „diktatorische" Rechte, Zugriff in JEDE Klasse, alles verwaltbar.
- **Leitung / Direktoren (3):** Sekretariat — ALLE Listen & Daten aller Klassen/Schüler,
  Rundschreiben/E-Mails versenden, **Geldschulden-Übersicht** (aus Strafen). Kein Interesse an HA.
- **Klassenlehrer (Hauptlehrer):** volle Rechte in eigener Klasse. Eine Klasse hat **2 Lehrer**.
- **Vertretungslehrer:** Zugang zu fremder Klasse mit **eingeschränkten** Rechten.
  - Darf: Anwesenheit/Check-in, HA stellen & korrigieren, Hifz/Qur'an bewerten, Nachrichten/Ankündigungen, Berichte einsehen.
  - Darf NICHT: Schülerliste/Roster ändern, Stundenplan/Klasseneinstellungen ändern, Zeugnisse & Strafen endgültig freigeben, Rollen vergeben.
- **Klassensprecher:** ist **Schüler** + Orga-Rechte, an Lehrer gebunden. Darf Protokolle schreiben
  und **Strafen erfassen** (Lehrer genehmigt). Sieht (nach Lehrer-Freigabe) Klassenliste inkl. krank/zu spät/Schulden.
- **Eltern:** an Kind(er) gebunden, sehen wichtige Infos des Kindes (s. u.).
- **Schüler:** Standardrolle. Jeder Lehrer ist i. d. R. auch Schüler.
- Autoritätsstufen sollen im UI **sichtbar/klar** sein.

### Check-in / QR (Lösung für „Freitag kleben, Samstag scannen")
- **Ein fester QR-Code pro Klasse** (einmal drucken, an Tür kleben).
- Check-in-Fenster öffnet **automatisch zur Unterrichtszeit** (z. B. Sa. 14:00, Dauer z. B. 15 Min),
  **ohne dass der Lehrer anwesend sein muss**. Scans außerhalb des Fensters → abgelehnt.
- Lehrer kann Fenster **aus der Ferne** öffnen/verlängern/schließen.
- Anti-Schummel: nur eingeloggte Schüler DER Klasse + nur im Zeitfenster; optional rotierender Kurzcode.
- **Echter Kamera-Scan:** Button „Einchecken" → öffnet Kamera → QR scannen → automatisch eingecheckt
  → zurück in die App. (Aktuell nur manuelle Code-Eingabe; das reicht nicht.)

### Unterricht/Anwesenheit
- Lehrer drückt nur **„Start"** (aktiviert QR-Fenster). **Kein „Beenden"** — endet automatisch
  nach 15 Min, außer Lehrer verlängert manuell.
- Anwesenheitsansicht: **grün = eingecheckt, rot = fehlt/zu spät**, alles auf einen Blick.
- **Verspätungen kumuliert** (Datum/Ort einzeln, aber Gesamtsumme in Minuten sichtbar).

### Eltern ↔ Kind
- Bei Schüler-Registrierung entsteht ein **Familien-Code**; Eltern registrieren sich damit → verknüpft.
- Kleine Kinder brauchen ggf. **kein eigenes Konto** (Eltern-Konto reicht).
- Eltern sehen: Anwesenheit, Verspätungen, Strafen/Schulden, HA (inkl. Audio anhören), Verhalten, Zeugnis.
- Eltern haben auch Zugriff auf: Kalender, Qur'an, Hifz, Materialien (falls Kind kein Handy hat).
- Zeugnisse/Berichte gehen an **Schüler UND Eltern**.

### Registrierung / Daten
- Schüler geben bei Anmeldung **alle wichtigen Kontaktdaten** an: Name, Nachname,
  Handynummer, **Eltern-/Notfallkontakt** (Selbstzahler ohne Eltern-Nr. möglich, aber Notfallkontakt).
- Grundlage für Klassenlisten & Sekretariat.

### Klassenliste (Lehrer, Klassensprecher, Leitung, Admin)
- **Tabellarisch**, nach Klassen gruppiert; pro Klasse Kopf: Klassenname, **Anzahl Schüler**, **Lehrer**.
- Darunter Schüler **alphabetisch**; Spalten: wichtige Kennzahlen (Anwesenheit, Fehltage,
  **Verspätung kumuliert (Min)**, Strafen/Schulden). **Suchfunktion** für schnelles Finden.
- Optional Schüler-ID/Nummer (Umsetzung frei).
- Lehrer & Klassensprecher sehen dieselbe Liste (Klassensprecher die für Orga nötigen Felder).

### Strafsystem
- Zwei Arten: **Seiten schreiben** oder **Geldstrafe**.
- **Klassensprecher** kann erfassen → **Lehrer genehmigt**. Fristen; bei Ablauf kommt Geld/Seiten dazu.
- **Kumuliert**; Schüler sieht auf seiner Startseite **offene Schulden** (Betrag) + Verfallsdaten.
- **Leitung** sieht Geldschulden (Einzug). Lehrer/Klassensprecher können Folgestrafe neu festlegen.

### Benachrichtigungen
- Klick auf Benachrichtigung → **springt zur Quelle** (Nachricht/Ankündigung/…).
- **Als gelesen** markierbar; **ungelesen-Zähler sinkt**.
- **App-Badge am Handy** (ungelesene Anzahl außen auf dem Icon) — Web-Push/PWA.

### Nachrichten
- Schüler & Lehrer können **Bilder + Audios** senden.
- **Reaktionen** (👍 etc.) wie bei WhatsApp.

### Hausaufgaben
- Nach dem Absenden **gesperrt**: abrufbar/anhörbar, aber **nicht neu bearbeitbar/hochladbar**.
- **10-Minuten-Kulanzfrist** zum Löschen/Neu-Hochladen; danach nur **Lehrer** kann zurücksetzen/Frist verlängern.

### Protokolle
- Für Schüler **erst sichtbar, nachdem der Lehrer das Klassensprecher-Protokoll bestätigt** hat,
  dann **Push-Benachrichtigung**. Inhalt: Themen, HA, **Strafen**.

### Verhalten
- **Nur für Eltern** sichtbar. Schüler sehen es **erst mit dem Zeugnis**.

### Berichte / Zeugnisse
- **Mehrere Typen** (nicht nur Probezeit bis 7. Ramadan): z. B. Jahresbericht; **manuell** anlegbar.
- **Volle Auswertung** aller Schülerdaten: HA gemacht/korrigiert, Hifz, Muraja'ah, Anwesenheit, Verhalten.
- **Durchschnittsnote** aus Gesamtleistung, **vom Lehrer manuell überschreibbar**. Zeugnis-Aufbau
  (Verhalten + Noten + Leistung). Geht an Schüler + Eltern.

### Prüfungen
- Bestehend: Auswahl/Freitext, Auto-Korrektur, bewusste Freigabe.
- **Neu:** Links (z. B. Kahoot) einfügen; **PDF** als Prüfung hochladen; **einzelnen Schülern**
  zuweisen (nicht nur ganze Klasse).

### Hifz / Muraja'ah (bestätigt)
- Lehrer setzt Ziel (Surah + Ayah-Bereich) für Klasse **oder** einzelne Schüler; Schüler rezitiert,
  Lehrer **bewertet in der App** (Tajwid/Aussprache/Flüssigkeit/Hifz/Fehlerzahl). Ausbau: Fehlerhistorie pro Ayah.

### Kalender (Apple-ähnlich)
- Ansichten: **Jahr / Monat / Woche / Tag**.
- **Eigene Termine eintragen** (auch außerhalb DBZ: Schule/Arbeit/Fußball …), Farben pro Kategorie,
  langfristige/serielle Termine bis Enddatum.
- **Samstags Unterricht** automatisch markiert (z. B. grün, 14:00–19:00 / laut Klassen-Einstellung).
  Beim Anlegen einer Klasse Lehrer nach Zeiten fragen → automatisch eintragen.

### Qur'an-Reader (eigener großer Block)
- **Mushaf-Modus**: echte arabische Seiten zum Lesen (unabhängig von externer App).
- **Auto-Weiterlauf** der Rezitation; Modi: Ayah-für-Ayah / Sura-für-Sura / **einzelne Ayah stop** /
  **Dauerschleife (unendlich)** / **Ayah-Bereich x–y** auf Wiederholung (für Auswendiglernen).
  Orientierung: App „iQuran".
- **Mehr Rezitatoren**: aktuell nur Alafasy. Gewünscht u. a. Husary, Minshawi, Maher al-Muaiqly, Sudais
  (Liste bestätigen). Provider AlQuran Cloud bietet viele.
- **Pro Ayah markieren + Notizen** (z. B. Tajwid-Fehler).
- **Sura-Infos**: Anzahl Ayat, Offenbarungsort (Mekka/Medina).
- **Tafsir as-Sa'di auf DEUTSCH** pro Ayah (kurz/knapp), z. B. per Long-Press.
- **Tadschwid-Regeln** (Iqlab, Idgham, Ghunnah, Ikhfa …) als Referenz + **Tadschwid-Farbschrift**
  (Qalqalah grün, Ikhfa rot, …).

### DBZ Online
- Eigene DBZ-Webseite verlinken (URL folgt vom Nutzer).

---

## Priorisierter Backlog

### P0 — Bugs (zuerst)
- [ ] Klassensprecher → „Berichte" springt zur Startseite (Routing-Bug). Reproduzieren & fixen.
- [ ] Benachrichtigungen (Schüler + Lehrer): Klick tut nichts → soll zur Quelle springen,
      „gelesen" markierbar, Zähler sinkt.
- [ ] iPad: „Klassensprecher-Protokoll bearbeiten" überlappt „Zum Unterricht einchecken"
      (Layout-Überlappung). Screenshot folgt.
- [ ] Audio-Abgaben nicht abspielbar (Korrektur & Schüleransicht). Verifizieren; sehr wahrsch.
      Persistenz-abhängig (P2) → zumindest sauberen Fehler/Hinweis, endgültig mit P2.
- [ ] Check-in per echter Kamera (statt nur manuellem Code).

### P1 — Sichtbare Funktionen (soweit ohne DB machbar)
- [ ] Anwesenheit grün/rot auf einen Blick; Verspätung kumuliert.
- [ ] Unterricht: nur „Start" + Auto-Ende nach 15 Min (verlängerbar).
- [ ] HA nach Abgabe sperren (+10 Min Kulanz; Lehrer kann zurücksetzen/verlängern).
- [ ] Nachrichten: Bilder/Audio senden + Reaktionen.
- [ ] Protokolle erst nach Lehrer-Freigabe für Schüler + Push.
- [ ] Verhalten nur für Eltern (Schüler erst mit Zeugnis).
- [ ] Prüfungen: Links + PDF + Einzelzuweisung.
- [ ] Berichte: mehrere Typen, volle Auswertung, Durchschnittsnote (überschreibbar).
- [ ] Entschuldigungen: „wie oft schon abwesend" (Wiederholung) anzeigen.
- [ ] Kalender-Umbau (Jahr/Monat/Woche/Tag, eigene Termine, Farben, Samstag automatisch).
- [ ] QR: fester Klassen-QR + zeitgesteuertes Fenster (auto-öffnen, fern verlängern).

### P2 — Fundament / Datenmodell (nach Nutzerwunsch DANACH)
- [ ] **Dauerhafte Datenbank + Objektspeicher (Supabase, kostenlos)** — löst Audio/Persistenz.
- [ ] Registrierung mit vollen Kontaktdaten (Eltern-/Notfallnummer).
- [ ] Rollen-Hierarchie + Rechte (inkl. Vertretung eingeschränkt, Klassensprecher-Rechte).
- [ ] Klassenlisten (tabellarisch, Suche, Kennzahlen) für Lehrer/Klassensprecher/Leitung/Admin.
- [ ] Eltern↔Kind-Verknüpfung (Familien-Code); Zeugnisse an beide.
- [ ] Strafsystem (Seiten/Geld, Genehmigung, Schuldenanzeige, Leitung-Einzug).
- [ ] Benachrichtigungen mit Handy-Badge (Web-Push).
- [ ] Leitung/Sekretariat-Panel (alle Daten, Rundschreiben/E-Mail, Geldschulden).
- [ ] Admin-Vollzugriff in jede Klasse.
- [ ] Demo-Konten deaktivieren + starkes Admin-Passwort (vor Echtbetrieb).
- [ ] Simulations-Daten generierbar (z. B. 5 Klassen × 30 Schüler, Lehrer, Eltern).

### P3 — Qur'an-Block (großer Ausbau, s. Spec oben)
- [ ] Mushaf-Lesemodus · mehr Rezitatoren · Auto-Play + Loop-/Bereichsmodi ·
      Ayah-Notizen/Markierung · Sura-Infos · Tafsir as-Sa'di (DE) · Tadschwid-Regeln + Farbschrift.

### P4 — Layout / Feinschliff (GANZ ZULETZT)
- [ ] Startseite/Login: dezentes Hintergrundbild (von DBZ-Webseite), leicht/verschwommen;
      responsive Handy/iPad/Mac; Vorschau der 3 Ansichten liefern.
- [ ] Scroll-Gefühl: sanftes Momentum/Overscroll; Scrollbalken schrumpft beim Scrollen.
- [ ] iPad-Überlappungen & allgemeiner Feinschliff.
- [ ] DBZ Online: Webseite verlinken.

---

## Offene Fragen an den Nutzer
- **Rezitatoren-Liste** final bestätigen (Husary, Minshawi, Maher al-Muaiqly, Sudais, + weitere?).
- **DBZ-Webseiten-URL** (für Hintergrundbild + DBZ-Online-Link).
- Screenshots: Audio-Fehler, iPad-Überlappung.
- Notensystem/Gewichtung für Durchschnittsnote.
