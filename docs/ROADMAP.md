# DBZ-App – Roadmap

Stand: 14.11.2026. Grundlage ist das vollständige Audit vom selben Tag
(Gesamtnote 5,8/10: Funktion und Oberfläche 7–8, Sicherheit, Stabilität und Architektur 4–5).
Der ausführliche Bericht mit Stand der Behebung: `docs/AUDIT-2026-11-14.md`.

Produktion: Render Free + Supabase (bestätigt über `/api/health`).

**Grundsatz:** Erst verlässlich, dann tiefer, dann größer. Keine großen neuen Funktionen,
bevor Stufe 1 und 2 erledigt sind. Jede Korrektur bekommt einen Test, der vorher
fehlschlägt und danach besteht.

Status: ⬜ offen · 🟨 in Arbeit · ✅ erledigt

---

## Stufe 1 – Härtung (erledigt am 14.11.2026)

| | Aufgabe | Erfolgskriterium |
|---|---|---|
| ✅ | Gemeinsame Fehlerbehandlung für alle asynchronen Routen, Typ- und Längenprüfung an allen öffentlichen Eingaben | Falsche Eingaben ergeben 400, der Prozess läuft weiter |
| ✅ | Konten-Verknüpfung und Kontowechsel an die Rollenregeln binden | Niemand erreicht eine höhere Rolle als die eigene |
| ✅ | Ziele für Push-Benachrichtigungen auf die bekannten Push-Dienste begrenzen | Fremde Adressen werden abgelehnt |
| ✅ | Tägliche, versionierte Sicherung nach Supabase Storage (30 Stände), zusätzlich vor jeder Massenlöschung; Wiederherstellung dokumentiert | Stand von gestern lässt sich einspielen |
| ✅ | Abhängigkeiten aktualisieren (`npm audit fix`, Server und Client) | Keine hohen Meldungen im Server |
| ✅ | Abwesenheitsmeldung nur an die eigene Klasse | Fremde Klasse ergibt 403 |

Tests: `server/test/hardening.test.js`, `server/test/backup-supabase.test.js`. Anleitung: `docs/SICHERUNG.md`.
`pdfjs-dist` ist auf Version 6 aktualisiert (die einzige Meldung der Stufe „hoch"). Offen: `vite` (betrifft nur den Entwicklungsserver) und `react-router` (Stufe „mittel") verlangen einen Versionssprung mit Umbauten.

## Stufe 2 – Stabilisierung (erledigt am 15.11.2026, zwei Punkte offen)

| | Aufgabe |
|---|---|
| ✅ | Sitzungen widerrufbar (Passwortwechsel, „überall abmelden") |
| ✅ | Drosselung für Registrierung, Passwort vergessen, Familien-Code; Familien-Code länger und aus sicherem Zufall |
| ✅ | Datenabzug nur für den System-Administrator und ohne Geheimnisse |
| ✅ | Upload-Fehler an den Nutzer melden; Dateien beim Löschen mitlöschen; abgelehnte Uploads aufräumen |
| ✅ | Wachstum begrenzen: Benachrichtigungen und Audit-Log werden täglich gekürzt |
| ⬜ | PDF-Notizen aus dem Hauptdokument auslagern (gehört zum Umstieg auf Tabellen, Stufe 6) |
| ✅ | Schutz gegen leeres Überschreiben (beschädigte Datei, Supabase beim Start nicht erreichbar) |
| ✅ | CI (Linter, Tests, Build, Audit bei jedem Push), Linter, Fehlergrenze im Frontend |
| ✅ | Adresse der App für E-Mail-Links fest (auf Render automatisch), `.env.example` angelegt |
| ⬜ | **Betreiber:** E-Mail-Dienst wählen und `EMAIL_API_URL` bei Render eintragen – bis dahin kommt „Passwort vergessen" nicht per E-Mail an |

## Stufe 3 – Oberfläche und Barrierefreiheit (erledigt am 15.11.2026)

- ✅ Beschriftungen für alle Felder und Symbol-Knöpfe
- ✅ Tippflächen: keine unter 24 px (WCAG 2.2 AA); Abschnitts-Aktionen („Alle", „Details") 44 px
- ✅ Kontraste für Gold, Orange, Grün, Gelb-Braun und Rot im hellen Design auf mindestens 4,5:1 – auch auf Feldern
- ✅ Seite „Kein Zugriff" statt stummer Umleitung

Nachweis: automatischer Durchlauf über 32 Seiten × 6 Rollen auf Handybreite (192 Aufrufe):
0 unbeschriftete Felder, 0 unbenannte Knöpfe, 0 Tippflächen unter 24 px, kein Überlauf, keine Skriptfehler.
Offen: Prüfung mit echtem Screenreader (VoiceOver) und auf echten Geräten; durchgehend 44 px für
kleine Textlinks in Tabellen (aktuell 32 px).

## Stufe 4 – Bestehendes vervollständigen (15.11.2026, ein Punkt wartet auf eine Entscheidung)

- ✅ Vertretungslehrer: unterrichtet und betreut, ändert aber weder Klassenliste, Einstellungen, Regeln, Rollen
  noch Einladungen und gibt Berichte und Strafen nicht frei; optionales Enddatum (Verwaltung → Person → Rolle)
- ✅ Prüfungen: Versuch und Abgabe nur für zugewiesene Schüler und nur, solange die Prüfung veröffentlicht ist;
  Eltern sehen Stand und freigegebenes Ergebnis ihrer Kinder (ohne Fragen und Lösungen)
- ✅ Eingabeprüfung bei Hausaufgaben (Frist, Zielschüler) und Bewertung (Ergebnis, Zahlenbereiche)
- ✅ CSV-Export gegen Formeln geschützt; Tadschwid-Text der fremden Quelle wird am Server entschärft;
  Verhaltensvermerke erscheinen im Push ohne Wortlaut
- ✅ README, `CLAUDE.md`, `.env.example` auf Stand (`PROJECT_STATUS.md` und `BACKLOG.md` bleiben als Archiv)
- ✅ **Entschieden (16.11.2026):** Die Leitung darf Rollen ändern, einladen, Konten und Klassen anlegen und
  freischalten, ohne dass der System-Administrator bestätigt; er wird informiert. Die Bestätigungspflicht lässt
  sich in den Einstellungen wieder einschalten (nur Administrator).
- ✅ Nutzerliste: Auswahl erst über „Auswählen“, kein Alle-Auswählen-Kasten; Löschen nur für vorher deaktivierte
  Personen und mit eingetipptem „LÖSCHEN“ (auch auf dem Server erzwungen).
- ⬜ Prüfungen mit Zeitfenster; Eltern-Sicht auf Übungsverläufe; Mindestlänge für Passwörter über 6 Zeichen

## Struktur für die ganze Schule (begonnen am 15.11.2026)

Ziel: 500 Schüler, 6–20 Klassen, Schuljahr September bis August, Wechsel zum Halbjahr und Jahresbeginn,
Einstieg mitten im Jahr, eine Person mit mehreren Rollen.

- ✅ **Speichern in Blöcken** (siehe Stufe 6)
- ✅ **Stammklasse und Zusatzkurse:** Jede Klasse hat eine Art. Ein Schüler hat genau eine Stammklasse und
  beliebig viele Zusatzkurse (z. B. Umra-Kurs). Einträge aus Zusatzkursen sind dort sichtbar, zählen aber nicht
  in Anwesenheitsquote, Bericht und Notenvorschlag. Verwaltung → Klassen: Art wählen/umstellen, Teilnehmer
  aufnehmen und austragen. Die Stammklasse wird weiterhin bei der Person geändert; Zusatzkurse bleiben dabei erhalten.
- ✅ **Schuljahr (1. September bis 31. August):** Quoten, Bericht und Notenvorschlag gelten ohne andere Angabe
  für das laufende Schuljahr. Klassendaten aus früheren Jahren (Anwesenheit, Hausaufgaben, Vermerke, Prüfungen,
  Berichte, Protokolle, Ankündigungen, erledigte Strafen) sehen nur Lehrkräfte und Leitung; Schüler und Eltern
  nicht mehr. Offene Strafen bleiben sichtbar. Eigenes (Lesezeichen, eigene Übungen, Nachrichten) bleibt.
  Es wird nichts gelöscht – die Zuordnung folgt dem Datum des Eintrags. `/api/health` zeigt das Schuljahr.
- ⬜ Schuljahr für Lehrkräfte auswählbar machen (heute: laufendes Jahr als Standard, ältere über Zeitraum/Monat)
- ✅ **Klassenwechsel mit Verlauf:** Stammklasse ändern nur Leitung und Administrator (Verwaltung → Person),
  mit Grund (Aufstieg, Abstieg, Wechsel) und Datum im Klassenverlauf. Alte Einträge bleiben bei der alten Klasse,
  Zusatzkurse bleiben erhalten, das Amt des Klassensprechers endet. Lehrkräfte tragen nur aus Zusatzkursen aus.
- ✅ **Eine Person, mehrere Rollen:** in der Verwaltung eine Zeile je Person mit allen Rollen; Löschen schützt auch
  Rollenkonten (eigene Person, letzter Administrator); die Klasse einer Schüler-Rolle wechselt mit Verlauf.
- ◐ **Verwaltung für viele Klassen:** ✅ Nutzerliste nach Klasse oder Rolle, Suche · ✅ mehrere Schüler auf einmal
  versetzen (mit Grund und Klassenverlauf) · ⬜ Import von Schülern per Tabelle (offen: Einladungslink oder
  Startpasswort – Entscheidung des Nutzers)
- ✅ **Anwesenheit nachtragen (16.11.2026):** viele Unterrichtstage auf einmal (Wochentag der Klasse, z. B. ab
  1.9.2025), Vorschau je Tag, Ferien abwählbar; Entschuldigungen werden übernommen, unentschuldigt nur an Tagen
  mit Einträgen; Sicherung vorher, Nachtrag rücknehmbar. Mitglied ab Klassenverlauf bzw. erstem eigenen Nachweis.
  Verspätungen werden bewusst noch nicht nachgetragen.
- ✅ **Einladen (16.11.2026):** Klassenlink (Lehrkraft) und allgemeiner Link bestehen; neu: die Klassenlehrkraft
  sieht offene Schüler-Anmeldungen (nur Name, Datum) und nimmt sie in die eigene Klasse auf (z. B. nach dem
  Probeunterricht). Freischalten legt jetzt einen Eintrag „Einstieg“ im Klassenverlauf an.
- ✅ **Aufnahmen (16.11.2026):** Aufbewahrungsfrist zählt ab der Bewertung; Lehrkraft kann einzelne Aufnahmen
  „behalten“; Schüler speichern Aufnahmen auf dem eigenen Gerät; Speicherübersicht und Aufräumen (mit
  Bestätigung, Sicherung, 30 Tage Löschliste) für den Systemadministrator. Frist einschalten: Einstellungen.
- ⬜ **Kostenloser Zusatzspeicher** (offen): Supabase Free hat 1 GB Dateispeicher; Alternativen mit größerem
  Gratis-Kontingent prüfen, bevor die Grenze erreicht ist.
- ✅ Entschieden (16.11.2026): Aufnahmen dürfen nach der Bewertung weg; die Frist stellt der Administrator ein.

Entschieden (16.11.2026): Walima ist ein Zusatzkurs (eigene Hausaufgaben und Strafen, zählt nicht fürs Schuljahr);
für Umra braucht es keine Klasse; versetzen nur Leitung/Administrator; Klassendaten aus dem alten Schuljahr sehen nur
Lehrkräfte und Leitung, Schüler behalten nur, was sie für sich selbst gespeichert haben.

## Stufe 5 – Neue Funktionen (4 bis 8 Wochen, in dieser Reihenfolge)

1. ⬜ Wochenübersicht für Eltern
2. ⬜ Automatische Erinnerungen (Frist morgen, unentschuldigt gefehlt)
3. ⬜ Hifz nach Sabaq / Sabqi / Manzil mit Fehlerhistorie je Ayah
4. ⬜ Übersetzung von Nachrichten und Ankündigungen (Datenschutz und Kosten vorher klären)
5. ⬜ Datenexport je Person (Auskunft nach DSGVO)

## Stufe 6 – Professionalisierung (4 bis 6 Wochen)

- ✅ **Speichern in Blöcken statt als ein Dokument** (15.11.2026): je Sammlung Zeilen zu 500 Einträgen, nur
  Geändertes wird hochgeladen. Gemessen mit 500 Schülern / 20 Klassen / 30 Wochen (51 MB): je Änderung
  0–165 KB statt 51 MB. Keine Änderung an der Tabelle nötig, alte Zeile bleibt als Rückweg (`docs/SICHERUNG.md`).
  Grenzen, die bleiben: der ganze Bestand liegt im Arbeitsspeicher (350 MB bei 500 Schülern; Render Free hat 512 MB),
  und jede Speicherung prüft alle Blöcke (rund 0,4 s Rechenzeit bei dieser Größe).
- ⬜ Nächster Schritt bei Bedarf: nur geänderte Sammlungen prüfen; danach echte Tabellen mit Abfragen
  (löst auch die Arbeitsspeicher-Grenze), beginnend mit Benachrichtigungen, Audit-Log, Notizen.
- ⬜ ~~Tabellen statt eines Dokuments~~ (ersetzt durch die beiden Punkte oben): in `server/store.js` Sammlung für Sammlung auf
  Supabase-Tabellen umstellen – zuerst Benachrichtigungen, Audit-Log, Notizen, zuletzt Nutzer.
- ⬜ `server/api.js` nach Bereichen aufteilen, ohne Verhalten zu ändern
- ⬜ Rechtlicher Rahmen: Datenschutzerklärung, Auftragsverarbeitung (Supabase, Render), Löschfristen

---

## Stufe 7 – iOS-App im App Store

Empfohlener Weg: **Capacitor-Hülle** um die vorhandene React-App (kein Neubau).
Voraussetzung sind Stufe 1, 2 und der rechtliche Teil aus Stufe 6.
Die Richtlinien ändern sich; vor der Einreichung die aktuellen
[App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) prüfen.

### Was schon passt

- ✅ Konto in der App löschbar (`DELETE /api/me`) – Pflicht nach Richtlinie 5.1.1(v)
- ✅ Demo-Zugänge für die Prüfer vorhanden (Richtlinie 2.1)
- ✅ Spracherkennung auf dem Gerät, kein Audio verlässt das Handy
- ✅ Web-Manifest, Icons, Hell/Dunkel, eigene Layouts für iPhone und iPad
- ✅ Keine Käufe in der App, also kein In-App-Purchase nötig

### Was fehlt

| | Aufgabe | Warum |
|---|---|---|
| ⬜ | Datenschutzerklärung und Impressum als Seite in der App und öffentlich im Web | Pflicht (5.1.1), auch für App Store Connect |
| ⬜ | Nachrichten und Inhalte melden, Nutzer blockieren, Kontaktadresse für Beschwerden | Pflicht bei nutzererzeugten Inhalten (1.2) |
| ⬜ | Einwilligung der Eltern für Minderjährige sauber dokumentiert | Daten von Kindern (5.1.4, DSGVO) |
| ⬜ | Anmeldung ohne Cookie-Abhängigkeit für die native Hülle (Token im sicheren Gerätespeicher) | Cookies sind in der iOS-WebView unzuverlässig |
| ⬜ | Push über Apple (APNs) mit nativem Plugin | Web-Push funktioniert in der Hülle nicht |
| ⬜ | Native Mehrwerte: Push, Kamera für QR-Check-in, Mikrofon, Offline-Qur'an | Reine Web-Hüllen werden abgelehnt (4.2) |
| ⬜ | Berechtigungstexte (Mikrofon, Kamera, Mitteilungen) und `PrivacyInfo.xcprivacy` | Pflichtangaben |
| ⬜ | Datenschutz-Angaben („Privacy Nutrition Labels"), Altersfreigabe, Screenshots, Beschreibung | App Store Connect |
| ⬜ | Fremde Inhalte klären: Lizenz und Quellenangabe für Qur'an-Text, Schrift, Audio, Tafsir | Rechte an Inhalten (5.2) |
| ⬜ | Server, der nicht einschläft | Prüfer brechen bei langen Ladezeiten ab |
| ⬜ | Test über TestFlight mit echten Lehrkräften und Eltern | vor der Einreichung |

### Entscheidungen, die nur der Betreiber treffen kann

- **Apple Developer Program:** 99 US-Dollar pro Jahr. Für gemeinnützige Organisationen gibt es
  eine Gebührenbefreiung, die beantragt werden muss. Ein Konto auf den Verein braucht eine D-U-N-S-Nummer.
- **Mac mit Xcode** zum Bauen und Hochladen (oder ein Build-Dienst).
- **Öffentlich im Store oder nur für die eigene Schule** (nicht gelistete App): Die zweite
  Variante passt besser zu einer App für eine einzelne Einrichtung.

---

## Nicht anfassen

Qur'an-Bereich (Muṣḥaf, Blättern, Spracherkennung), Designsystem, Rechteschicht zwischen
Klassen, Technik-Stack (React, Vite, Tailwind, Express).
