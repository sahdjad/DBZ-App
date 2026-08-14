# DBZ APP – MASTERDATEI (ALLES IN EINER DATEI)

## WICHTIG FÜR CLAUDE CODE

Diese Datei ist die vollständige bisherige Spezifikation der DBZ-App für das Deen Bildungszentrum.
Sie enthält alle bisherigen Produktentscheidungen, Rollen, Funktionen, Datenmodelle, Designvorgaben,
Integrationen, Sicherheitsregeln, Roadmaps, Tests und Claude-Code-Anweisungen.

### Arbeitsanweisung
1. Lies diese Datei vollständig.
2. Erfinde keine fehlenden Regeln.
3. Markiere unbekannte Punkte als TBD und frage nur dann nach, wenn sie die Umsetzung wirklich blockieren.
4. Erstelle zuerst einen technischen Plan.
5. Baue danach schrittweise.
6. Verwende möglichst wenige Rückfragen und Prompts.
7. Führe Aufgaben selbstständig weiter, solange die Spezifikation eindeutig ist.
8. Design: DBZ dunkelgrün/weiß, hochwertig, islamisch, mit dezenten ornamentalen Mustern.
9. Zielplattformen: iOS, Android und Web.
10. Entwicklung möglichst kostengünstig.
11. Externe Dienste über austauschbare Provider/Adapter.
12. Datenschutz und Rollenrechte serverseitig erzwingen.
13. Keine privaten Schülerdaten an Social Media, WhatsApp oder Telegram übertragen.
14. Qur'an-KI und automatische Rezitationserkennung sind spätere Erweiterungen, kein Blocker für den Pilot.

## Offizielle DBZ-Kanäle
- YouTube: https://www.youtube.com/channel/UChiz3gfEtMvqb6pFkeZir6Q
- Instagram: https://www.instagram.com/deen.bildungszentrum/
- TikTok: https://www.tiktok.com/@dbzmuenchen

## Visuelle Referenzen
Die bisher gelieferten Referenzen zeigen:
- offizielles DBZ-Logo mit stilisiertem Buchsymbol
- Grün/Weiß als Markenbasis
- tiefes Dunkelgrün
- hellere Logo-Grüntöne
- elegante islamische geometrische/arabeske Muster
- hochwertiger Premium-Bildungsplattform-Stil
- Light- und Dark-Mode

Diese visuellen Regeln sind weiter unten im Design-System detailliert beschrieben.
Die Original-Bilddateien können später zusätzlich als Assets in das Projekt gelegt werden.

---



---

# ABSCHNITT AUS `README.md`

# DBZ – Deen Bildungszentrum App

Dieses Paket ist die verbindliche Planungsgrundlage für die Entwicklung der DBZ-App mit Claude Code.

## Ziel
Eine zentrale Schul- und Lernplattform für das Deen Bildungszentrum, zunächst für Klasse 3, später für das gesamte DBZ.

Die App ersetzt schrittweise organisatorische WhatsApp-Abläufe durch strukturierte Funktionen für:
- Anwesenheit und Verspätung
- Entschuldigungen
- Hausaufgaben und Audioabgaben
- Unterrichts- und Klassensprecherprotokolle
- Klassenverwaltung
- Prüfungen
- Qur'an/Hifz/Muraja'ah
- Elternübersicht
- Lehrmaterial/Bibliothek
- Berichte/Zeugnisse
- Kommunikation und Benachrichtigungen

## Empfohlener technischer Weg
- Frontend: React Native + Expo + TypeScript
- Web/Desktop: dieselbe Expo/React-Native-Codebasis, Adminbereich responsiv
- Backend: Supabase (Postgres, Auth, Storage, RLS)
- Push: Expo Notifications
- Lokale Offline-Daten: SQLite/Local Cache
- Versionsverwaltung: GitHub
- Entwicklung: Claude Code

## Wichtige Regel
Claude Code darf nicht sofort "alles bauen". Zuerst Dokumentation lesen, Datenmodell und Berechtigungen umsetzen, Tests definieren und danach phasenweise entwickeln.

## Reihenfolge
1. `docs/PRODUCT.md`
2. `docs/ROLES_PERMISSIONS.md`
3. `docs/DATABASE.md`
4. `docs/USER_FLOWS.md`
5. `docs/DESIGN_SYSTEM.md`
6. `docs/INTEGRATIONS.md`
7. `docs/SECURITY_PRIVACY.md`
8. `docs/MVP_ROADMAP.md`
9. `docs/TEST_CASES.md`
10. `docs/SOCIAL_MEDIA.md`
11. `OPEN_QUESTIONS.md`
12. `CLAUDE.md`
13. `MASTER_PROMPT.md`


---

# ABSCHNITT AUS `PROJECT_DECISIONS.md`

# PROJECT_DECISIONS.md

## Bereits entschieden
- Institution: Deen Bildungszentrum (DBZ)
- Pilot: Klasse 3
- ca. 30 Schüler
- ca. zwei feste Lehrer, System soll mehr unterstützen
- Lehrer dürfen Inhalte hinzufügen
- Schüler dürfen keine sensiblen Daten anderer Schüler sehen
- Elternportal vorgesehen
- mehrere Kinder pro Elternaccount
- Schuljahr ab September
- Probezeit bis Ende Dezember
- Unterricht Klasse 3 samstags ca. 14:00–18:00
- Anwesenheitspflicht
- Abwesenheitsanträge digital
- Lehrer genehmigt Entschuldigungen
- QR-Check-in gewünscht
- genaue Verspätungszeit speichern
- Hausaufgaben: Audio + schriftlich
- direkte Audioaufnahme in App gewünscht
- Lehrerfeedback als Text und Audio
- nach Deadline grundsätzlich keine Abgabe; Lehrer kann individuelle Verlängerung geben
- digitales Klassenbuch
- Klassensprecher mit eingeschränkten Protokollrechten
- Stundenplan
- Wochen- und Monatskalender
- Prüfungen/Quiz
- Bibliothek
- Qur'an-Modul langfristig
- Hifz/Muraja'ah langfristig
- Gamification/Rangliste langfristig
- Light + Dark Mode
- Stil: DBZ-Grün/Weiß + elegante islamische Ornamente
- iOS/Android/Web gewünscht
- möglichst kostengünstiger Betrieb
- Claude Code als Hauptentwicklungshilfe
- GitHub vorhanden
- MacBook als Entwicklungsgerät
- Telegram-Live-Unterricht kann bestehen bleiben
- WhatsApp soll organisatorisch schrittweise ersetzt werden

## Offizielle Social-Media-Kanäle
- YouTube: https://www.youtube.com/channel/UChiz3gfEtMvqb6pFkeZir6Q
- Instagram: https://www.instagram.com/deen.bildungszentrum/
- TikTok: https://www.tiktok.com/@dbzmuenchen


---

# ABSCHNITT AUS `OPEN_QUESTIONS.md`

# OPEN_QUESTIONS.md

Diese Punkte sind bewusst noch nicht erfunden.

## Unterricht
1. Exakte fünf Hauptfächer?
2. Exakte Kriterien für Klasse 1 → 2 → ... → 6?
3. Wer entscheidet Auf-/Rückstufung?
4. Idealer Ablauf Samstag 14:00–18:00?

## Anwesenheit
5. Ab welcher Minute "verspätet"?
6. Welche Konsequenzen gelten für unentschuldigtes Fehlen?
7. Welche Konsequenzen gelten für Verspätung?
8. Welche Konsequenzen gelten für fehlende Hausaufgabe?
9. Was enthält das bisherige "Strafenprotokoll" genau?

## Hausaufgaben
10. Exakte drei Audio-Wochentage?
11. Exakte Deadline-Uhrzeiten?
12. Inhalt der Freitags-Schreibhausaufgabe?
13. Sind die drei Audioaufgaben dieselbe oder verschiedene Stellen?

## Bewertung
14. Schulnoten 1–6 verbindlich?
15. Gewichtung der Leistungen?

## Wettbewerb
16. Rangliste mit echtem Namen, Initialen oder Alias?

## Klassensprecher
17. Dürfen Klassensprecher Entschuldigungsgründe sehen?
18. Dürfen sie Noten sehen?
19. Dürfen sie Verhaltensvermerke sehen?
20. Dürfen sie genaue Verspätungszeiten sehen?

## Eltern
21. Elternaccount für Minderjährige Pflicht oder optional?

## Datenschutz
22. Wird Adresse wirklich benötigt?
23. Werden medizinische Nachweise überhaupt benötigt?
24. Finale Löschfristen?

## Design
25. Original-Logo als transparente Datei verfügbar?
26. Gibt es offizielle DBZ-Schriften/Brand Guidelines?

## Vorlagen
27. Anwesenheitsliste hochladen
28. Strafenprotokoll hochladen
29. Hausaufgabenprotokoll hochladen
30. Unterrichtsprotokoll hochladen
31. Testvorlage hochladen
32. Zeugnis/Beurteilung hochladen


---

# ABSCHNITT AUS `CLAUDE.md`

# CLAUDE.md — Verbindliche Regeln für Claude Code

## Rolle
Du arbeitest an der DBZ-App des Deen Bildungszentrums.
Lies zuerst alle Dateien unter `/docs` einschließlich `docs/SOCIAL_MEDIA.md`, `PROJECT_DECISIONS.md` und `OPEN_QUESTIONS.md`.

## Oberste Regeln
1. Erfinde keine schulischen Regeln.
2. Für offene Produktentscheidungen `TBD` verwenden.
3. Keine sensible Funktion nur im Frontend absichern.
4. Supabase-RLS für sensible Daten.
5. Keine Service-Role-Keys im Client.
6. Keine Secrets committen.
7. Keine Produktionsdatenbank ohne Migration ändern.
8. Keine Funktion "fertig" nennen, bevor Tests bestehen.
9. Keine zusätzliche Dependency ohne Begründung.
10. Kostenarm entwickeln.
11. Mobile-first, Web/Admin responsiv.
12. Design strikt an `docs/DESIGN_SYSTEM.md`.
13. Kein generisches Ramadan-/Moschee-Template.
14. Islamische Ornamente nur gezielt und dezent.
15. Schülerdaten standardmäßig privat.
16. Vertretungslehrer bekommen nur temporär benötigte Rechte.
17. Klassensprecher dokumentieren, Lehrer bestätigen.
18. Offizielle Daten liegen in DBZ, nicht WhatsApp/Telegram.
19. Externe Dienste hinter Provider-/Adapter-Schnittstellen.
20. KI-Rezitation niemals als Voraussetzung für den Pilotkern.

## Architektur
Bevorzugt:
- TypeScript
- React Native + Expo
- Expo Router
- Supabase
- PostgreSQL
- RLS
- Storage
- lokale Offline-Schicht später

## Arbeitsweise
Für jedes Feature:
1. relevante Spezifikation zitieren
2. Datenmodell prüfen
3. Permission Matrix prüfen
4. Migration
5. RLS
6. Service/Repository
7. UI
8. Fehlerzustände
9. Tests
10. Dokumentation

## UX
- Lehrer-Dashboard operational, nicht dekorativ
- "Heute" / aktuelle Klasse prominent
- große Touch Targets
- klare Statusanzeige
- Light/Dark
- Arabisch korrektes RTL, sobald eingebaut

## Audio
- private Buckets
- signed URLs
- Retention vorbereiten
- Dateigröße/Dauer kontrollieren

## Git
- kleine commits
- keine Secrets
- Migrationen versionieren

## Wenn Produktentscheidung fehlt
Nicht raten.
In `OPEN_QUESTIONS.md` nachsehen.
Falls nicht vorhanden, neue offene Frage dokumentieren.


---

# ABSCHNITT AUS `MASTER_PROMPT.md`

# MASTER_PROMPT FÜR CLAUDE CODE

Du baust die DBZ-App für das Deen Bildungszentrum.

## Ausgangslage
Die Koranschule organisiert derzeit viele Abläufe über WhatsApp. Hausaufgaben, Audioabgaben, Anwesenheit, Entschuldigungen, Unterrichtsmaterial und Protokolle werden dadurch unübersichtlich. Die Pilotversion soll zunächst nur für Klasse 3 funktionieren, aber das Datenmodell muss so sauber sein, dass später das gesamte DBZ mit Präsenz- und Onlineklassen angebunden werden kann.

## Dein erster Auftrag
NICHT sofort die komplette App programmieren.

### Schritt 1
Lies vollständig:
- README.md
- PROJECT_DECISIONS.md
- OPEN_QUESTIONS.md
- docs/PRODUCT.md
- docs/ROLES_PERMISSIONS.md
- docs/DATABASE.md
- docs/USER_FLOWS.md
- docs/DESIGN_SYSTEM.md
- docs/INTEGRATIONS.md
- docs/SECURITY_PRIVACY.md
- docs/DATA_RETENTION.md
- docs/MVP_ROADMAP.md
- docs/TEST_CASES.md
- docs/INFORMATION_ARCHITECTURE.md
- docs/SOCIAL_MEDIA.md
- CLAUDE.md

### Schritt 2
Erstelle einen technischen Implementierungsplan mit:
- Ordnerstruktur
- Routing
- State/Data Fetching Strategie
- Auth Flow
- Supabase Tabellen
- Migrationen
- RLS Policy Plan
- Storage Buckets
- Push-Architektur
- QR-Check-in-Architektur
- Rollen-/Permission Middleware
- Teststrategie
- lokale Dev-Umgebung
- Deploymentstrategie
- Feature Flags

### Schritt 3
Zeige alle Blocker/TBDs.
Keine Produktregel erfinden.

### Schritt 4
Scaffolde erst danach Phase 0:
- Expo TypeScript Projekt
- Expo Router
- Theme Tokens
- Light/Dark Mode
- Supabase Client
- sichere Env-Konfiguration
- Auth Skeleton
- Layout Skeleton
- Test Setup
- Lint/Typecheck
- CI-Basis

### Schritt 5
Noch keine Bibliothek, Qur'an-KI, Rangliste oder komplexe Prüfung bauen.

## Technische Leitlinien
- eine Codebasis für iOS, Android und Web
- mobile-first
- Admin-Webansicht responsiv
- Provider Interfaces für externe Dienste
- sensible Daten niemals öffentlich
- Default deny bei RLS
- serverseitige Check-in-Zeit
- kurzlebiger QR
- Audio privat + Retention
- Audit Logs
- Einladungen gehasht, befristet und widerrufbar

## Design
Nutze die Dateien unter `/assets`.
Stil:
- tiefes Dunkelgrün
- Weiß
- Logo-Hellgrün
- hochwertige islamische Ornamente
- moderne Premium-Bildungsplattform
- keine überladene Flyeroptik
- funktionale Screens bleiben klar

## Integrationen
Plane Adapter für:
- WhatsApp
- Telegram
- Kalender
- Push
- E-Mail
- Storage
- PDF/Export
- Qur'an Content
- spätere Rezitations-KI

Implementiere nur die Provider, die für die aktuelle Phase benötigt werden.

## Qualitätsgate
Ein Feature gilt erst als abgeschlossen, wenn:
- TypeScript fehlerfrei
- Tests grün
- RLS geprüft
- unberechtigter Zugriff getestet
- mobile UI geprüft
- Dark/Light geprüft
- Loading/Error/Empty State vorhanden
- Dokumentation aktualisiert

## Offizielle DBZ Social-Media-Kanäle
Behandle diese Links als konfigurierbare Organisationsdaten:
- YouTube: https://www.youtube.com/channel/UChiz3gfEtMvqb6pFkeZir6Q
- Instagram: https://www.instagram.com/deen.bildungszentrum/
- TikTok: https://www.tiktok.com/@dbzmuenchen

Baue in der Pilotarchitektur einen zentralen `organization_settings`-/`social_links`-Mechanismus vor, damit diese Links ohne neues App-Release geändert werden können.


---

# ABSCHNITT AUS `docs/PRODUCT.md`

# PRODUCT.md — DBZ App

## 1. Produktidentität
**Name:** DBZ App  
**Institution:** Deen Bildungszentrum e.V.  
**Primäre Sprache:** Deutsch  
**Spätere Sprachen:** Englisch, Französisch; Arabisch für Inhalte und ggf. UI später  
**Startumfang:** Klasse 3  
**Langfristiger Umfang:** Präsenz- und Onlineklassen des gesamten DBZ

## 2. Produktvision
Die DBZ-App ist kein allgemeiner Qur'an-Reader und keine Chat-App. Sie ist ein digitales Schulverwaltungssystem für eine Koranschule – vom Grundprinzip vergleichbar mit einer Schulorganisations-App, aber erweitert um Qur'an-Unterricht, Hifz, Muraja'ah, Tajwid, islamische Fächer, Audioabgaben, Tarbiyah und Elternübersicht.

## 3. Hauptprobleme
1. WhatsApp ist für Hausaufgaben, Audioabgaben und Organisation unübersichtlich.
2. Anwesenheit, Verspätung und Entschuldigungen werden nicht zuverlässig dokumentiert.
3. Schüler erkennen selbst nicht, wie oft sie fehlen oder zu spät kommen.
4. Lehrer verlieren Zeit mit manueller Organisation und Korrektur.
5. Klassensprecherprotokolle gehen unter oder werden uneinheitlich geführt.
6. Unterrichtsfortschritt wird nicht konsequent gegen einen Lehrplan gemessen.
7. Eltern haben kaum strukturierte Einsicht in Fortschritt und Anwesenheit.
8. Langfristige Schülerdaten fehlen für Probezeit, Halbjahresberichte und Jahreszeugnisse.

## 4. Nutzer
- Super-Admin / System Owner
- DBZ-Leitung / Hauptadministration
- Klassenadministratoren / feste Klassenlehrer
- Vertretungslehrer
- Klassensprecher
- Schüler
- Eltern

## 5. Aktuelle DBZ-Struktur
- ca. sechs Präsenzklassen
- mehrere Onlineklassen
- ca. 20–30 Schüler pro Klasse
- Klasse 3 als Pilot
- meist zwei Lehrer pro Klasse, langfristig bis zu drei feste Klassenlehrer möglich
- gemischte Altersgruppen von Kindern bis Erwachsenen
- Unterricht überwiegend auf Deutsch
- zusätzliche englische und französische Klassen
- Unterricht Klasse 3: Samstag
- Unterrichtszeit Klasse 3: ca. 14:00–18:00
- höchste Klasse 6: Freitag
- Sommerferien
- Schuljahr beginnt im September
- Probephase bis Ende Dezember

## 6. Unterrichtsinhalte
- Qur'an-Lesen
- Tajwid
- Hifz
- Muraja'ah
- Aqidah
- Tawhid
- Fiqh
- Salah/Wudu
- Sirah des Propheten
- Sirah/Geschichte der Sahabah
- Adhkar
- weitere islamische Grundwissenschaften
- Schreiben/Notizen; kein regulärer Arabisch-Sprachkurs in der Pilotklasse

## 7. Muss-Ziele der ersten stabilen Fassung
### Organisation
- Benutzer, Einladungen und Freigabe
- Klassen
- Lehrerzuweisung
- Stundenplan/Kalender
- heutige Unterrichtssitzung

### Anwesenheit
- Check-in
- Verspätung
- entschuldigt
- unentschuldigt
- früher gegangen
- Abwesenheitsanträge
- Monats-/Semester-/Gesamtstatistik

### Hausaufgaben
- Klassenaufgabe oder individuelle Aufgabe
- Audio, Text, Datei, PDF, Bild, Video, Link
- Deadline
- individuelle Fristverlängerung
- Schülerabgabe
- Lehrerkorrektur
- Statussystem
- automatische Erkennung "nicht abgegeben"

### Protokolle
- Unterrichtsprotokoll
- Anwesenheitsprotokoll
- Hausaufgabenprotokoll
- Verhaltens-/Konsequenzprotokoll
- Klassensprecher erstellt Entwurf
- Lehrer bestätigt

### Schülerübersicht
- eigene Daten
- Leistung
- Anwesenheit
- Aufgaben
- Fortschritt
- Bewertungen

## 8. Spätere Kernmodule
- Elternportal
- Prüfungs- und Fragenbank
- Hifz/Muraja'ah
- Qur'an-Reader
- Bibliothek/PDF-Reader
- Berichte/Zeugnisse
- Gamification
- Offline-Synchronisation
- KI-gestützte Rezitations-/Fehlererkennung

## 9. Prinzipien
- Datenschutz vor Bequemlichkeit
- Datenminimierung
- rollenbasierter Zugriff
- kein unnötiger Schüler-zu-Schüler-Datenaustausch
- klare Historie statt flüchtiger Chatnachrichten
- mobile-first
- ästhetisch, islamisch, aber funktional
- geringe laufende Kosten
- später skalierbar für weitere Klassen

## 10. Offizielle Online-Präsenz
Die App kennt die offiziellen DBZ-Kanäle als Organisationsressourcen:
- YouTube: https://www.youtube.com/channel/UChiz3gfEtMvqb6pFkeZir6Q
- Instagram: https://www.instagram.com/deen.bildungszentrum/
- TikTok: https://www.tiktok.com/@dbzmuenchen

Diese Links werden zentral konfigurierbar gespeichert und können im Bereich "DBZ Online" sowie bei öffentlichen Veröffentlichungen verwendet werden.


---

# ABSCHNITT AUS `docs/ROLES_PERMISSIONS.md`

# ROLES_PERMISSIONS.md

## 1. System Owner / Super-Admin
Initial: App-Ersteller.

Darf:
- alle Klassen, Nutzer, Rollen und Daten administrieren
- Rollen vergeben/entziehen
- DBZ-Leitung verwalten
- Systemeinstellungen ändern
- globale Ankündigungen
- Audit-Logs einsehen
- Accounts sperren/löschen
- Datenexporte
- Berechtigungen konfigurieren
- Feature Flags verwalten

Darf als einzige Rolle technische Owner-Einstellungen verwalten.

## 2. DBZ-Leitung / Hauptadministration
Darf:
- Organisationsdaten verwalten
- Klassen erstellen/bearbeiten
- Lehrer und Schüler verwalten
- Schuljahr/Termine/Prüfungen verwalten
- globale oder zielgerichtete Mitteilungen veröffentlichen
- Statistiken und Berichte sehen
- Klassenwechsel durchführen

Nicht automatisch:
- technische Owner-Rechte
- geheime Systemschlüssel
- Änderung der Super-Admin-Rolle

## 3. Klassenadmin / fester Klassenlehrer
Darf innerhalb zugewiesener Klassen:
- Schüler sehen
- Anwesenheit ändern
- Abwesenheiten genehmigen/ablehnen
- Hausaufgaben erstellen und korrigieren
- individuelle Deadlines
- Unterrichtsprotokolle
- Material
- Prüfungen
- Hifz/Muraja'ah
- Bewertungen
- Verhalten
- Elternkontakt
- interne Lehrernotizen

## 4. Vertretungslehrer
Temporärer, begrenzter Zugriff.

Darf:
- aktuelle Unterrichtssitzung
- Klassenliste
- Anwesenheit
- heutige Unterrichtsinhalte
- heutige Aufgaben
- Tagesprotokoll

Nicht automatisch:
- vollständige Elternkontakte
- private Langzeithistorie
- interne Lehrerkommunikation
- administrative Klassenänderungen
- Rollenänderungen

## 5. Klassensprecher
Darf:
- Protokollentwürfe
- Anwesenheitsentwurf
- Hausaufgabenstatus auf Protokollebene
- dokumentierte Ereignisse

Nicht:
- Entschuldigungen endgültig genehmigen
- Noten ändern
- sensible Profildaten sehen
- private Lehrerbemerkungen sehen
- Strafen endgültig aussprechen
- Rollen verwalten

Alle offiziellen Änderungen benötigen Lehrerbestätigung.

## 6. Schüler
Darf sehen:
- eigenes Profil
- eigene Klasse
- Klassenliste: nur minimaler Name/Klassenbezug
- eigener Stundenplan
- eigene Aufgaben/Abgaben
- eigene Anwesenheit
- eigene Verspätungen
- eigene Bewertungen
- eigene Prüfungen
- eigener Hifz/Muraja'ah-Fortschritt
- eigene Materialien
- eigene Benachrichtigungen
- eigener Bericht

Darf nicht:
- Adressen/Telefonnummern/Elternkontakte anderer Schüler
- private Noten/Verhalten anderer Schüler
- Lehrer-interne Notizen
- fremde Abwesenheitsgründe

## 7. Eltern
Können mehrere Kinder verknüpft haben.

Dürfen pro eigenem Kind:
- Stundenplan
- Aufgaben
- Abgaben
- Bewertungen
- Anwesenheit
- Verspätung
- genehmigte/abgelehnte Abwesenheitsanträge
- Hifz/Muraja'ah
- Verhalten, soweit für Eltern freigegeben
- Berichte
- Lehrerfeedback
- Ankündigungen

## 8. Gast-Schüler in höherer Klasse
Hat:
- Hauptklasse
- optionale Gastmitgliedschaften

Für Gastklasse:
- keine Anwesenheitspflicht
- keine Konsequenz für Verspätung
- keine Pflicht-Hausaufgabe
- nur freigegebene Materialien
- keine Änderung der Hauptklasse

## 9. Technischer Grundsatz
Berechtigungen dürfen nicht nur im Frontend versteckt werden.
Sie müssen serverseitig über Datenbank-/API-Regeln erzwungen werden.

## 10. Audit
Jede sensible Änderung protokollieren:
- wer
- wann
- was
- vorheriger Wert
- neuer Wert
- betroffene Person/Klasse


---

# ABSCHNITT AUS `docs/DATABASE.md`

# DATABASE.md — logisches Datenmodell

## Konventionen
- IDs: UUID
- alle Zeitstempel mit Zeitzone
- `created_at`, `updated_at`
- Soft-Delete wo sinnvoll
- sensible Daten strikt per RLS
- `organization_id` früh vorsehen, damit spätere Mehrschul-/Mandantenfähigkeit möglich ist

## Kern

### organizations
- id
- name
- short_name
- logo_url
- primary_color
- status

### profiles
- id -> auth user
- first_name
- last_name
- display_name
- birth_date
- gender
- phone
- email
- avatar_path
- locale
- status

### roles
- id
- code
- name
- scope_type

### user_roles
- id
- user_id
- role_id
- organization_id
- class_id nullable
- valid_from
- valid_until
- granted_by

### parent_child_links
- parent_user_id
- child_user_id
- relationship_label
- active

## Schulstruktur

### school_years
- id
- organization_id
- name
- starts_on
- ends_on
- probation_ends_on

### terms
- id
- school_year_id
- name
- starts_on
- ends_on

### classes
- id
- organization_id
- school_year_id
- name
- type: presence/online
- language
- default_weekday
- start_time
- end_time
- active

### class_memberships
- id
- class_id
- user_id
- membership_type: primary/guest
- attendance_required
- homework_required
- started_at
- ended_at

### teacher_class_assignments
- id
- teacher_id
- class_id
- assignment_type: fixed/substitute
- valid_from
- valid_until
- permissions_profile

## Stundenplan / Unterricht

### subjects
- id
- organization_id
- name
- category

### curriculum_plans
- id
- class_id
- school_year_id
- subject_id
- title
- target_completion_date

### curriculum_units
- id
- curriculum_plan_id
- order_index
- title
- description
- status

### lesson_sessions
- id
- class_id
- subject_id nullable
- starts_at
- ends_at
- status
- created_by
- substitute_teacher_id nullable

### lesson_session_topics
- id
- session_id
- curriculum_unit_id nullable
- title
- notes
- minutes_spent

## Anwesenheit

### attendance_records
- id
- session_id
- student_id
- status: present/late/excused/unexcused/left_early/remote/other
- check_in_at
- check_out_at
- minutes_late
- source: qr/manual/import
- confirmed_by
- note

### qr_checkin_tokens
- id
- session_id
- token_hash
- valid_from
- valid_until
- revoked

### absence_requests
- id
- student_id
- class_id
- session_id nullable
- request_type: absent/late/leave_early/other
- expected_arrival nullable
- expected_departure nullable
- reason_category
- comment
- evidence_path nullable
- status: pending/approved/rejected/needs_info
- decided_by
- decided_at
- created_at

## Hausaufgaben

### assignments
- id
- class_id
- subject_id
- title
- description
- assignment_type: audio/text/file/quiz/quran/mixed
- opens_at
- due_at
- late_upload_policy
- created_by
- status

### assignment_targets
- id
- assignment_id
- target_type: class/student
- target_id

### assignment_attachments
- id
- assignment_id
- file_path
- file_type
- title

### assignment_views
- assignment_id
- user_id
- first_opened_at
- last_opened_at

### deadline_extensions
- id
- assignment_id
- student_id
- new_due_at
- reason
- granted_by

### submissions
- id
- assignment_id
- student_id
- submitted_at
- status: submitted/in_review/passed/revision_required
- text_content nullable

### submission_files
- id
- submission_id
- storage_path
- media_type
- duration_seconds nullable
- retain_permanently boolean
- scheduled_delete_at nullable

### submission_reviews
- id
- submission_id
- teacher_id
- grade_numeric nullable
- grade_label nullable
- tajwid_score nullable
- pronunciation_score nullable
- fluency_score nullable
- memorization_score nullable
- error_count nullable
- text_feedback nullable
- audio_feedback_path nullable
- released_to_student_at nullable

## Protokolle

### class_protocols
- id
- session_id
- created_by
- protocol_type
- content_json
- status: draft/submitted/approved/returned
- submitted_at
- reviewed_by
- reviewed_at

### protocol_entries
- id
- protocol_id
- category
- student_id nullable
- content
- visibility

## Verhalten / Tarbiyah

### behavior_records
- id
- student_id
- class_id
- session_id nullable
- category: adab/participation/punctuality/homework/behavior/positive/negative
- severity nullable
- note
- visible_to_student
- visible_to_parent
- created_by

### teacher_private_notes
- id
- student_id
- class_id
- note
- created_by

## Qur'an / Hifz

### quran_goals
- id
- student_id
- class_id
- goal_type: new_hifz/murajaah/consolidation/test
- surah_from
- ayah_from
- surah_to
- ayah_to
- pages_estimate nullable
- due_at
- status
- assigned_by

### recitation_attempts
- id
- quran_goal_id
- student_id
- teacher_id
- attempted_at
- grade
- tajwid_score
- pronunciation_score
- fluency_score
- memorization_score
- error_count
- passed

### recitation_errors
- id
- attempt_id
- surah
- ayah
- error_type
- note

### completed_quran_ranges
- id
- student_id
- surah
- ayah_from
- ayah_to
- completion_type
- confirmed_by
- confirmed_at

## Prüfungen

### question_banks
- id
- organization_id
- subject_id
- title

### questions
- id
- question_bank_id
- type
- prompt
- content_json
- points
- auto_gradable

### exams
- id
- class_id
- subject_id
- title
- opens_at
- closes_at
- duration_minutes
- pass_percentage
- created_by

### exam_questions
- exam_id
- question_id
- order_index
- points_override nullable

### exam_attempts
- id
- exam_id
- student_id
- started_at
- submitted_at
- score
- status
- released_at

### exam_answers
- id
- attempt_id
- question_id
- answer_json
- awarded_points
- teacher_feedback

## Bibliothek

### materials
- id
- organization_id
- title
- material_type
- storage_path/url
- subject_id nullable
- class_id nullable
- book_title nullable
- topic nullable
- teacher_id nullable
- public_visibility
- downloadable
- offline_allowed

### bookmarks
- user_id
- material_id
- location_json

### material_notes
- id
- user_id
- material_id
- location_json
- note

## Kommunikation

### announcements
- id
- organization_id
- author_id
- title
- body
- priority
- audience_json
- publish_at

### notifications
- id
- user_id
- type
- title
- body
- read_at
- deep_link
- created_at

### direct_threads
- id
- thread_type
- class_id nullable

### thread_members
- thread_id
- user_id

### messages
- id
- thread_id
- sender_id
- message_type
- body
- file_path nullable
- created_at

## Einladungen

### invites
- id
- organization_id
- class_id
- intended_role
- token_hash
- expires_at
- max_uses
- used_count
- created_by
- revoked

## Berichte

### report_periods
- id
- school_year_id
- name
- starts_on
- ends_on
- report_type

### student_reports
- id
- student_id
- report_period_id
- generated_data_json
- teacher_comment
- status
- pdf_path nullable

## Audit

### audit_logs
- id
- actor_id
- action
- entity_type
- entity_id
- before_json
- after_json
- created_at
- ip_hash nullable


---

# ABSCHNITT AUS `docs/USER_FLOWS.md`

# USER_FLOWS.md

## 1. Einladung und Registrierung
1. Admin erstellt Einladung für Klasse + Rolle.
2. System erzeugt zeitlich begrenzten Einladungslink.
3. Link wird z. B. per WhatsApp geteilt.
4. Nutzer öffnet Link.
5. Registrierung mit Benutzername/E-Mail/Passwort; Telefonnummer optional nach festgelegter Regel.
6. Account bleibt `pending`.
7. Klassenadmin/Admin prüft.
8. Freigabe.
9. Nutzer landet rollenabhängig im Dashboard.

## 2. Unterricht starten
1. Lehrer öffnet Dashboard.
2. "Heute – Klasse 3 – 14:00–18:00".
3. "Unterricht starten".
4. Lesson Session wird aktiv.
5. QR-Check-in kann aktiviert werden.
6. Schüler checken ein.
7. Lehrer sieht live: anwesend / verspätet / angekündigt / offen.
8. Lehrer kann manuell korrigieren.
9. Am Ende: Protokoll und Unterrichtsstoff bestätigen.

## 3. QR-Check-in
1. Server erstellt kurzlebigen Token.
2. Lehrer zeigt QR.
3. Schüler öffnet "Einchecken".
4. QR wird gescannt.
5. Server prüft:
   - Token gültig?
   - Nutzer gehört zur Klasse oder berechtigter Gast?
   - Session aktiv?
   - nicht bereits eingecheckt?
6. Zeit wird serverseitig gespeichert.
7. Status wird anhand Verspätungsregel berechnet.
8. Lehrer kann korrigieren, Änderung wird auditiert.

## 4. Abwesenheit/Verspätung melden
1. Schüler/Eltern öffnen "Abwesenheit melden".
2. Typ auswählen: fehlt / später / früher gehen.
3. Datum/Session.
4. Grundkategorie + Kommentar.
5. Optional Nachweis, falls später organisatorisch beschlossen.
6. Antrag `pending`.
7. Lehrer erhält Benachrichtigung.
8. Lehrer: genehmigen / ablehnen / Rückfrage.
9. Ergebnis erscheint Schüler/Eltern.
10. Genehmigung beeinflusst Attendance-Status.

## 5. Hausaufgabe erstellen
1. Lehrer wählt Klasse.
2. Titel, Fach, Beschreibung.
3. Art: Audio/Text/Datei/Mixed.
4. Zielgruppe Klasse oder einzelne Schüler.
5. Öffnungszeit + Deadline.
6. Anhänge.
7. Veröffentlichung.
8. Nutzer erhalten Inbox + Push, wenn erlaubt/verfügbar.

## 6. Hausaufgabe abgeben
1. Schüler öffnet Aufgabe.
2. App markiert "geöffnet".
3. Schüler nimmt Audio direkt auf oder lädt Datei hoch.
4. App zeigt Dateigröße/Dauer.
5. Upload.
6. Final "Abgeben".
7. Nach Deadline kein Upload, außer individuelle Verlängerung.
8. Status "Abgegeben".

## 7. Audio korrigieren
1. Lehrer sieht Warteschlange.
2. Audio abspielen.
3. Schnellbewertung:
   - Aussprache
   - Flüssigkeit
   - Tajwid
   - Auswendiglernen
   - Fehlerzahl
4. Textfeedback oder Audiofeedback.
5. Ergebnis: bestanden / überarbeiten.
6. Freigabe an Schüler.
7. Speicher-Retention startet.

## 8. Klassensprecherprotokoll
1. Unterrichtssitzung erzeugt Protokollentwurf.
2. Klassensprecher füllt erlaubte Felder.
3. Einreichen.
4. Lehrer erhält Benachrichtigung.
5. Lehrer prüft.
6. Bestätigen / bearbeiten / zurückgeben.
7. Erst bestätigtes Protokoll gilt als offiziell.

## 9. Gast in höherer Klasse
1. Admin erstellt `guest membership`.
2. Gast sieht Stundenplan und freigegebenes Material.
3. Attendance `not required`.
4. Hausaufgaben `not required`.
5. Keine Konsequenz für Verspätung/Fehlen in Gastklasse.

## 10. Prüfung
1. Lehrer erstellt Prüfung aus Fragenbank.
2. Zeit, Versuche, Bestehensgrenze.
3. Schüler startet.
4. Auto-Fragen werden automatisch korrigiert.
5. Freitext wartet auf Lehrer.
6. Lehrer schließt Korrektur ab.
7. Ergebnis wird bewusst freigegeben.
8. Erst dann sieht Schüler Details.

## 11. Bericht
1. System aggregiert festgelegten Zeitraum.
2. Anwesenheit, Hausaufgaben, Prüfungen, Qur'an, Verhalten.
3. Lehrer ergänzt Kommentar.
4. Bericht wird geprüft.
5. PDF wird erzeugt.
6. Schüler/Eltern erhalten Zugriff, wenn freigegeben.

## 12. Schüler verlässt DBZ
1. Account deaktivieren.
2. Zugriff sofort sperren.
3. Aufbewahrungs-/Löschregeln anwenden.
4. Vor endgültiger Löschung erforderliche Berichts-/Nachweisdaten trennen.
5. Löschung auditieren.


---

# ABSCHNITT AUS `docs/DESIGN_SYSTEM.md`

# DESIGN_SYSTEM.md — DBZ

## 1. Visuelle Richtung
Die App soll:
- hochwertig
- modern
- klar islamisch
- professionell wie eine echte Bildungsplattform
- grün/weiß
- elegant
- nicht minimalistisch-leer
- aber auch nicht ornamental überladen wirken

## 2. Markenquellen
Siehe:
- `assets/dbz_logo_reference.png`
- `assets/dbz_ornament_reference.png`

Das DBZ-Buchsymbol und die Grünabstufungen bilden die Markenbasis.
Das ornamentale islamische Muster dient als sekundäres Designmotiv.

## 3. Farbpalette
Aus den gelieferten visuellen Referenzen abgeleitete Arbeitsfarben:

### Dark
- `DBZ-950: #001000`
- `DBZ-900: #102010`
- `DBZ-850: #103010`
- `DBZ-800: #204020`
- `DBZ-700: #205020`

### Brand / Logo Greens
- `DBZ-500: #70A060`
- `DBZ-400: #80B070`
- `DBZ-300: #90C080`

### Neutrals
- `Canvas-Light: #F7F8F5`
- `Surface-Light: #FFFFFF`
- `Text-Dark: #101510`
- `Text-Light: #F4F6F2`

Die finalen Tokens dürfen nach sauberem Sampling des Original-Logos feinjustiert werden, aber visuell in dieser Familie bleiben.

## 4. Light Mode
- Hintergrund: warmes Off-White
- Karten: Weiß
- Primärbuttons: tiefes DBZ-Grün
- Akzent: Logo-Hellgrün
- Text: sehr dunkles Grün/Anthrazit
- Borders: gedämpftes Grün-Grau

## 5. Dark Mode
Kein neutrales Schwarz als Hauptfläche.
- Hintergrund: nahezu schwarzes Grün
- Karten: dunkle Grüntöne
- Text: Off-White
- Primary: helleres DBZ-Grün
- Border/Divider: mittleres Grün

## 6. Ornamentregeln
Ornamente verwenden:
- Splash
- Login
- Profilheader
- Qur'an-Modul
- Bibliothek
- Bericht/Zeugnis
- leere Zustände
- einzelne Hero-Bereiche

Nicht stark verwenden:
- Tabellen
- Anwesenheitslisten
- Korrekturmasken
- Formulare
- Prüfungen
- Admin-Datenansichten

Opazität im funktionalen UI sehr gering halten.

## 7. Typografie
- UI: moderne, hochlesbare Sans-Serif
- Arabisch: separate hochwertige arabische Schriftfamilie
- Qur'an-Text: dedizierte Qur'an-taugliche Darstellung
- keine dekorative Kalligraphie für normale Buttons/Formfelder

## 8. Formensprache
- Karten: 14–20 px Radius
- Buttons: 12–16 px Radius
- Inputs: 12–14 px
- große Touch-Flächen
- klare Hierarchie
- Icons einheitlich

## 9. Statusfarben
DBZ-Grün darf nicht gleichzeitig jede Bedeutung tragen.

- Erfolg/Bestanden: Grün
- Warnung/ausstehend: Amber/Orange
- Fehler/unentschuldigt/Frist verpasst: Rot
- Information: Blau nur dezent
- Neutral: Grau

Farben immer zusätzlich mit Text/Icon kennzeichnen.

## 10. Schüler-Dashboard
Oben:
- DBZ Branding
- Begrüßung
- nächster Unterricht
- heutige/offene Aufgabe

Schnellzugriff:
- Home
- Aufgaben
- Qur'an
- Kalender
- Profil

## 11. Lehrer-Dashboard
Priorität vor Dekoration:
- heutige Klasse
- Startzeit
- Anwesenheit live
- offene Korrekturen
- ausstehende Entschuldigungen
- Protokoll
- Unterrichtsplan

## 12. Desktop/Admin
- linke Sidebar
- klarer Contentbereich
- Tabellen mit Filter
- Suchfunktion
- Rollen-/Klassenfilter
- keine mobile Bottom Navigation auf Desktop

## 13. Splash
- DBZ dunkler grüner Hintergrund
- Logo/Symbol zentral
- sehr dezentes Ornament
- keine unnötige Animation


---

# ABSCHNITT AUS `docs/INFORMATION_ARCHITECTURE.md`

# INFORMATION_ARCHITECTURE.md

## Schüler Mobile Navigation
1. Home
2. Aufgaben
3. Qur'an
4. Kalender
5. Profil

Über Home/Mehr:
- Prüfungen
- Bibliothek
- Anwesenheit
- Berichte
- Nachrichten

## Lehrer Mobile Navigation
1. Home
2. Klasse
3. Aufgaben
4. Kalender
5. Mehr

`Klasse`:
- Heute
- Anwesenheit
- Schüler
- Protokoll
- Fortschritt
- Verhalten

`Mehr`:
- Prüfungen
- Materialien
- Nachrichten
- Berichte
- Einstellungen

## Klassensprecher
Schülernavigation + zusätzlicher Bereich:
- Protokolle

## Eltern
1. Home
2. Kind
3. Aufgaben
4. Kalender
5. Profil

Bei mehreren Kindern: Kind-Umschalter oben.

## Admin Web
Sidebar:
- Dashboard
- Organisation
- Schuljahre
- Klassen
- Nutzer
- Lehrer
- Schüler
- Eltern
- Stundenplan
- Anwesenheit
- Aufgaben
- Prüfungen
- Lehrpläne
- Materialien
- Ankündigungen
- Berichte
- Rollen
- Audit Logs
- Einstellungen
- Integrationen


---

# ABSCHNITT AUS `docs/INTEGRATIONS.md`

# INTEGRATIONS.md

## Ziel
Die DBZ-App soll nicht als isolierte Insel gebaut werden. Externe Dienste werden über Adapter angebunden, sodass später ein Anbieter gewechselt werden kann, ohne die gesamte App neu zu schreiben.

## 1. Integration Layer
Technische Interfaces vorsehen:
- NotificationProvider
- MessagingProvider
- CalendarProvider
- StorageProvider
- LiveLessonProvider
- EmailProvider
- ExportProvider
- RecitationAIProvider
- AnalyticsProvider (optional)
- BackupProvider

Keine Geschäftslogik direkt an einen Anbieter koppeln.

## 2. WhatsApp

### Phase 1
WhatsApp nicht als Haupt-Datenbank benutzen.
Nutzen:
- Einladungslinks teilen
- optional "Lehrer auf WhatsApp kontaktieren" Deep Link
- Übergangsphase für Elternkommunikation

### Phase 2
Optional offizielle WhatsApp Business/Cloud-API-Anbindung für:
- wichtige Mitteilungen
- Erinnerungen
- Freigaben
- kein Ersatz für DBZ-Inbox

### Grundsatz
Offizielle Schuldaten bleiben in DBZ. WhatsApp ist Transportkanal, nicht Quelle der Wahrheit.

## 3. Telegram
Aktueller Live-Unterricht kann auf Telegram bleiben.

Phase 1:
- Link zum Live-Unterricht aus Stundenplan/Termin öffnen

Später:
- Telegram Bot/Integration nur wenn organisatorisch sinnvoll
- Live-Link automatisch pro Termin
- keine sensiblen Schülerdaten an Telegram senden

## 4. Kalender
Phase 1:
- interne Wochen-/Monatsansicht
- `.ics` Export für Apple/Google/Outlook Kalender

Später:
- direkte Kalender-Synchronisation, wenn gewünscht

Events:
- Unterricht
- Prüfung
- Sonderunterricht
- Ersatztermin
- Deadline

## 5. E-Mail
Für:
- Registrierung
- Passwort-/Account-Hilfe
- wichtige Admininformationen
- optionale Berichtfreigabe

Provider austauschbar halten.

## 6. Push Notifications
Für:
- neue Aufgabe
- Deadline morgen/heute
- Prüfung
- Unterricht bald
- neue Bewertung
- neues Hifz-Ziel
- Entschuldigungsentscheidung
- Protokoll wartet auf Lehrer
- dringende DBZ-Mitteilung

Wichtig:
Die DBZ-Inbox bleibt vollständig, auch wenn Betriebssystem-Push deaktiviert ist.

## 7. QR-System
- integrierte Kamera
- kurzlebiger QR-Token
- serverseitige Check-in-Zeit
- manueller Fallback durch Lehrer
- keine dauerhaften statischen QR-Codes für Anwesenheit

## 8. Datei-/Audiospeicher
Start:
- Supabase Storage

Architektur:
- StorageProvider kapseln
- später S3-kompatiblen Speicher austauschbar machen

Kostenkontrolle:
- Audio komprimieren
- Dauer begrenzen/anzeigen
- Retention Policy
- dauerhaftes Speichern nur bewusst
- Thumbnails/Previews getrennt behandeln

## 9. PDF / Berichte
Export:
- Halbjahresbericht
- Jahresbericht
- Anwesenheitsauszug
- Schülerübersicht
- Unterrichtsprotokoll

Später:
- offizielles DBZ-Zeugnislayout mit Logo

## 10. CSV / Datenexport
Admin:
- Schülerliste
- Anwesenheit
- Noten
- Hausaufgabenstatus
- Prüfungsresultate

Nur mit Berechtigung.

## 11. Qur'an-Datenquelle
Qur'an-Text, Übersetzung, Tafsir und Audio müssen später über klar lizenzierte/verlässliche Datenquellen eingebunden werden.
Provider abstrahieren:
- QuranTextProvider
- QuranTranslationProvider
- TafsirProvider
- ReciterAudioProvider

Keine Texte ohne geprüfte Quelle hart in die App kopieren.

## 12. KI-Rezitation
Nicht Teil der kritischen V1.

Schnittstelle vorbereiten:
`RecitationAIProvider`

Spätere Aufgaben:
- Audio/Text Alignment
- erkannte Ayah
- Auslassungen
- Wiederholungen
- mögliche Fehlerhinweise
- Lehrer bestätigt immer

KI darf keine endgültige religiöse/leistungsbezogene Bewertung autonom erteilen.

## 13. Web/Admin
Ein gemeinsames Backend.
Admin-Ansicht responsiv im Web.
Lehrer sollen mobile und Tablet-Nutzung priorisiert bekommen.

## 14. Backups
- Datenbankbackups
- Export wichtiger Berichtsperioden
- regelmäßiger Test der Wiederherstellung
- sensible Dateien nicht in GitHub

## 15. GitHub
- Source Code
- Issues
- Pull Requests
- Branch Protection später
- keine API Keys/Secrets committen

## 16. Claude Code
Claude Code darf:
- Repository lesen
- Tasks implementieren
- Tests ausführen
- Migrationen vorbereiten

Claude Code darf nicht:
- Secrets in Code schreiben
- RLS abschalten
- Datenbank in Produktion ohne Migration verändern
- Funktionen ohne Tests als fertig markieren

## 17. Offizielle Social-Media-Kanäle
Offizielle DBZ-Kanäle:
- YouTube: https://www.youtube.com/channel/UChiz3gfEtMvqb6pFkeZir6Q
- Instagram: https://www.instagram.com/deen.bildungszentrum/
- TikTok: https://www.tiktok.com/@dbzmuenchen

### V1
- zentrale Organisationseinstellungen für Social Links
- Deep Link / externe App öffnen
- Bereich "DBZ Online"
- YouTube-Links als Unterrichtsmaterial erlauben

### Später
- erlaubte öffentliche Veröffentlichungen/Feeds einbinden
- Social Sharing
- YouTube-Einbettung
- API-basierte Integration nur nach technischer und datenschutzrechtlicher Prüfung

Keine privaten Schülerdaten an externe Social-Plattformen übertragen.


---

# ABSCHNITT AUS `docs/SOCIAL_MEDIA.md`

# SOCIAL_MEDIA.md — Offizielle DBZ-Kanäle

## Offizielle Social-Media-Kanäle

### YouTube
https://www.youtube.com/channel/UChiz3gfEtMvqb6pFkeZir6Q

### Instagram
https://www.instagram.com/deen.bildungszentrum/

### TikTok
https://www.tiktok.com/@dbzmuenchen

## Nutzung innerhalb der DBZ-App

### V1
- Bereich "DBZ Online"
- Buttons/Links zu YouTube, Instagram und TikTok
- Links öffnen bevorzugt die jeweilige App, sonst Browser
- Social Links zentral in den Organisationseinstellungen speichern
- Admin kann Links später ohne App-Update ändern
- keine Social-Media-Inhalte als Quelle für interne Schuldaten verwenden

### Später
- öffentliche DBZ-Veröffentlichungen innerhalb der App anzeigen
- YouTube-Videos in Material/Ankündigungen verlinken oder einbetten
- Social-Sharing für erlaubte öffentliche Inhalte
- Deep Links zu offiziellen DBZ-Kanälen
- optionaler Feed nur über offizielle und technisch zulässige APIs/Embeds

## Datenschutz
- keine Schülerdaten automatisiert an Social-Media-Plattformen übertragen
- keine privaten Hausaufgaben, Profile, Anwesenheiten oder Bewertungen teilen
- externe Inhalte klar als externe Plattform kennzeichnen
- Tracking/Embeds erst nach Datenschutzprüfung einsetzen

## Design
Social-Media-Verlinkungen verwenden das DBZ-Designsystem.
Die Social-Plattformen sollen visuell nicht die Markenidentität der App dominieren.


---

# ABSCHNITT AUS `docs/SECURITY_PRIVACY.md`

# SECURITY_PRIVACY.md

## 1. Kontext
Die App verarbeitet Daten von Minderjährigen und Erwachsenen:
- Namen
- Geburtsdatum
- Kontakt
- Elternkontakt
- Profilbild
- Anwesenheit
- Leistung
- Verhalten
- Audiodateien
- Nachrichten

Daher "privacy by design".

## 2. Datenminimierung
Nur Felder speichern, die tatsächlich für DBZ benötigt werden.
Noch offene Felder wie genaue Adresse oder Nachweis-Uploads müssen vor Produktion organisatorisch begründet werden.

## 3. RLS
Jede sensible Supabase-Tabelle erhält Row Level Security.
Default: deny.
Zugriff nur durch explizite Policies.

## 4. Secrets
- nie in App-Code
- nie in Git
- `.env` nicht committen
- Service Role Key nur serverseitig
- Rotation bei Verdacht

## 5. Auth
Pilot:
- Einladung erforderlich
- Accountfreigabe erforderlich
- Login über definierte Credentials
- Passwort-Reset über Adminprozess oder später sicheren Recovery-Flow

Für Lehrer/Admins später MFA stark erwägen.

## 6. Einladungen
- zufällige Tokens
- serverseitig nur Hash speichern
- Ablaufdatum
- max. Nutzungen
- widerrufbar
- Klasse/Rolle gebunden

## 7. Audio
- privat
- nur Schüler, berechtigte Eltern und berechtigte Lehrer
- keine öffentliche URL
- signed/temporary URLs
- automatische Löschung nach Retention-Regel
- "dauerhaft aufbewahren" nur bewusst

## 8. Schüler-zu-Schüler
Keine API-Abfrage vollständiger Profile.
Separate sichere Klassenlisten-View mit minimalen Feldern.

## 9. Lehrer-private Notizen
Eigene Tabelle/Policy.
Nie versehentlich in Schüler-/Eltern-Responses laden.

## 10. Audit
Sensible Änderungen:
- Noten
- Anwesenheit
- Rollen
- Entschuldigungen
- Verhalten
- Deadlines
- Accountstatus

## 11. Löschung/Austritt
Zugriff sofort deaktivieren.
Danach definierter Lösch-/Archivprozess.
Nicht pauschal alle Daten nach "einem Monat" löschen, bevor feststeht, welche schulischen Nachweise aufbewahrt werden müssen.

## 12. Gesundheits-/Entschuldigungsgründe
Grundkategorien möglichst allgemein halten.
Keine unnötigen medizinischen Details verlangen.

## 13. Dateien
- MIME prüfen
- Dateigröße begrenzen
- keine ausführbaren Dateien
- sichere Dateinamen
- Viren-/Malware-Prüfung später, wenn externe Uploads wachsen

## 14. Logging
Keine Passwörter, Tokens, Audioinhalte oder vollständigen sensiblen Profile in Logs.

## 15. Production Gate
Vor echter Nutzung mit Minderjährigen:
- Datenschutzhinweise
- Verantwortlicher
- Rechtsgrundlagen/Einwilligungsprozesse prüfen
- Löschkonzept
- Verzeichnis/Prozesse der Datenverarbeitung organisatorisch klären


---

# ABSCHNITT AUS `docs/DATA_RETENTION.md`

# DATA_RETENTION.md

## Ziel
Speicherkosten klein halten und unnötige personenbezogene Daten nicht dauerhaft aufbewahren.

## Arbeitsregeln – vor Produktion final bestätigen

### Audio-Hausaufgaben
Vorschlag:
- nach Korrektur + 45 Tagen löschen
- dauerhaft nur bei bewusst gesetztem `retain_permanently`
- Metadaten/Bewertung bleiben erhalten

### Lehrer-Audiofeedback
Vorschlag:
- ebenfalls zeitlich begrenzen, wenn Textfeedback ausreichend archiviert ist

### Aufgabenanhänge
Solange Aufgabe/Schuljahr relevant ist.

### Anwesenheit
Für Berichte und Jahresstatistik längerfristig notwendig.
Finale Dauer organisatorisch/rechtlich festlegen.

### Prüfungen/Noten
Mindestens bis Bericht/Zeugnis finalisiert; weitere Aufbewahrung TBD.

### Chat-/Feedbacknachrichten
Keine unbegrenzte Speicherung als Standard.
Retention TBD.

### Verlassene Accounts
- sofort deaktivieren
- personenbezogene Daten nach definierter Frist löschen/anonymisieren
- Berichts-/Nachweisdaten getrennt prüfen

### Audit Logs
Dauer TBD; nicht unbegrenzt ohne Zweck.

## Regel
Kein automatisches Löschen implementieren, bevor:
1. Datenkategorie feststeht
2. Aufbewahrungszweck feststeht
3. verantwortliche DBZ-Person zugestimmt hat


---

# ABSCHNITT AUS `docs/COST_STRATEGY.md`

# COST_STRATEGY.md

## Ziel
Pilot mit möglichst kleinen laufenden Kosten.

## Prinzipien
1. Keine Microservices.
2. Ein Backend.
3. Eine Codebasis.
4. Kein eigener Server, solange Managed Backend genügt.
5. Audio ist primärer Speicherfaktor.
6. Automatische Audio-Retention.
7. Bilder komprimieren.
8. Keine KI-Auswertung in V1.
9. Externe APIs nur bei echtem Nutzen.
10. Provider abstrahieren, damit später gewechselt werden kann.

## Kostenrelevante Bereiche
- Dateispeicher
- Audio-Traffic
- Push
- E-Mail
- App-Store-Konten/Veröffentlichung
- spätere KI
- Backups

## Audio
Bei 30 Schülern und mehreren 10–15-minütigen Audioabgaben pro Woche kann Speicher schnell wachsen.
Daher:
- komprimieren
- Retention
- optional maximale Länge
- permanentes Speichern nur bewusst

## Skalierung
Erst nach erfolgreichem Klasse-3-Pilot:
- gesamte Koranschule
- weitere Sprachen
- zusätzliche Anbieter
- kostenpflichtige Infrastruktur


---

# ABSCHNITT AUS `docs/ATTENDANCE_RULES.md`

# ATTENDANCE_RULES.md

## Status
- present
- late
- excused
- unexcused
- left_early
- remote
- other

## Noch offen
Verspätungsgrenze `TBD`.

## Check-in
- dynamischer QR
- Serverzeit
- Lehrer-Fallback
- Audit bei manueller Änderung

## Vorabmeldung
Schüler/Eltern können Antrag senden:
- fehlt
- verspätet
- früher gehen
- sonstiges

Nur Lehrer/entsprechender Admin entscheidet über Entschuldigung.

## Statistik
- Monat
- Halbjahr/Semester
- Schuljahr
- gesamt
- Anzahl Unterrichtstage
- Anwesenheitsquote
- Verspätungen
- unentschuldigtes Fehlen
- entschuldigtes Fehlen
- durchschnittliche Verspätungsminuten


---

# ABSCHNITT AUS `docs/HOMEWORK_RULES.md`

# HOMEWORK_RULES.md

## Aktueller Realablauf
- pro Woche mehrere Qur'an-Audioabgaben
- zusätzlich schriftliche Hausaufgabe
- Lehrer kontrolliert Audio manuell

## Assignment Types
- audio
- text
- file
- quran
- quiz
- mixed

## Targeting
- gesamte Klasse
- einzelner Schüler
- mehrere ausgewählte Schüler

## Deadline
Nach Deadline:
- kein Upload
- Ausnahme nur durch individuelle Verlängerung des Lehrers

## Lehrerstatus
- not_submitted
- submitted
- in_review
- passed
- revision_required

## Schülerstatus
- not_opened
- opened
- submitted
- feedback_available
- revision_required

## Anhänge
- PDF
- Bild
- Audio
- Video
- Link

## Audio
- direkt aufnehmen
- vorhandene Datei
- private Speicherung
- Feedback Text/Audio


---

# ABSCHNITT AUS `docs/NOTIFICATION_CATALOG.md`

# NOTIFICATION_CATALOG.md

## Schüler
- Neue Hausaufgabe
- Hausaufgabe morgen fällig
- Hausaufgabe heute fällig
- Neue Bewertung
- Revision angefordert
- Prüfung angekündigt
- Prüfungsergebnis freigegeben
- Unterricht beginnt bald
- Neues Material
- Hifz-Ziel aktualisiert
- Entschuldigung genehmigt/abgelehnt/Rückfrage
- wichtige DBZ-Ankündigung

## Lehrer
- Neue Audioabgabe
- Entschuldigung wartet
- Protokoll eingereicht
- Schülerfristverlängerung läuft aus
- offene Korrekturen
- dringende Leitungsmitteilung

## Eltern
- wichtige Abwesenheits-/Verspätungsinformation
- neue Bewertung, falls freigegeben
- Bericht verfügbar
- wichtige Ankündigung

## Kanäle
1. In-App Inbox = Quelle der Wahrheit
2. Push = zusätzlicher Hinweis
3. E-Mail = ausgewählte Fälle
4. WhatsApp = optionaler externer Adapter später


---

# ABSCHNITT AUS `docs/QURAN_FUTURE.md`

# QURAN_FUTURE.md

## Nicht Blocker für Pilot

## Qur'an Reader
- arabischer Mushaf
- deutsche Übersetzung
- Tafsir
- Rezitator-Audio
- Tajwid-Darstellung
- Ayah markieren
- Favoriten
- Notizen
- Wiederholungsmodus 3x/5x/10x
- Lehrer wählt Versbereich als Aufgabe

## Hifz
- neue Stelle
- Muraja'ah
- Festigung
- Prüfung
- Fortschritt in Ayat/Suwar/Seiten/Ajza'
- Lehrerbestätigung

## Bewertung
- Schulnote oder Label nach finaler Entscheidung
- Tajwid
- Aussprache
- Flüssigkeit
- Auswendiglernen
- Fehlerzahl

## Fehlerhistorie
- Fehler pro Ayah
- Fehlertyp
- Häufigkeit
- Trend

## KI
Später:
- Audio folgt Qur'an-Text
- erkennt wahrscheinliche Stelle
- markiert mögliche Auslassungen/Fehler
- nur Assistenz
- Lehrer bleibt finale Instanz


---

# ABSCHNITT AUS `docs/MVP_ROADMAP.md`

# MVP_ROADMAP.md

## Phase 0 — Architektur
- Repo
- Expo/TypeScript
- Supabase
- Environment Setup
- Design Tokens
- Auth Skeleton
- Rollenmodell
- RLS-Grundlage
- Tests

## Phase 1 — Pilotkern Klasse 3
### Accounts
- Einladung
- Registrierung
- Freigabe
- Rollen
- Klasse

### Unterricht
- Stundenplan
- heutige Session
- Session starten/beenden

### Anwesenheit
- QR-Check-in
- manuelle Anwesenheit
- Verspätung
- Abwesenheitsantrag
- Genehmigung
- Statistik

### Hausaufgaben
- Aufgabe erstellen
- Klassenziel/Einzelziel
- Audioaufnahme/-upload
- Deadline
- individuelle Verlängerung
- Korrektur
- Feedback

### Protokolle
- Klassensprecher
- Einreichung
- Lehrerfreigabe

### Notifications
- DBZ-Inbox
- Push-Basis

## Phase 2 — Verwaltungsstabilität
- Elternaccounts
- Verhalten/Tarbiyah
- detaillierte Statistiken
- CSV/PDF Export
- Probezeitberichte
- Schuljahreswechsel
- Gastmitgliedschaften
- Vertretungslehrer

## Phase 3 — Lernen
- Hifz
- Muraja'ah
- Tajwid-Fehlerhistorie
- Prüfungen/Fragenbank
- Lehrplanfortschritt

## Phase 4 — Bibliothek/Qur'an
- Materialbibliothek
- PDF Reader
- Notizen/Lesezeichen
- Qur'an-Reader
- Übersetzung/Tafsir
- Audio
- Wiederholungsmodus

## Phase 5 — Motivation
- Punkte
- Streaks
- Abzeichen
- datenschutzkonforme Rangliste

## Phase 6 — Erweiterungen
- Englisch/Französisch
- Offline Sync
- WhatsApp API optional
- Telegram Integration optional
- direkte Kalendersynchronisation
- KI-Rezitationsassistenz

## Nicht tun
Nicht Phase 4–6 parallel mit Phase 1 entwickeln.
Erst den Pilot stabil nutzen.


---

# ABSCHNITT AUS `docs/TEST_CASES.md`

# TEST_CASES.md

## Auth
- ungültiger Invite wird abgewiesen
- abgelaufener Invite wird abgewiesen
- Invite für Klasse 3 kann nicht eigenmächtig Klasse 6 wählen
- pending User erhält keinen Unterrichtszugriff
- deaktivierter User kann sich nicht anmelden

## Rollen
- Schüler kann keine fremden Profile abrufen
- Klassensprecher kann keine Note ändern
- Vertretungslehrer sieht keine privaten Lehrernotizen
- Klassenlehrer kann eigene Klasse administrieren
- Super-Admin kann Rollen verwalten
- normaler Admin kann Super-Admin nicht entfernen

## Anwesenheit
- gültiger QR checkt ein
- abgelaufener QR wird abgelehnt
- doppelter Check-in erzeugt keinen zweiten Datensatz
- Check-in-Zeit kommt vom Server
- Verspätung wird korrekt berechnet
- Lehrer kann korrigieren
- Korrektur wird auditiert
- Gastschüler bekommt keine Pflichtverletzung

## Abwesenheit
- Schüler kann Antrag stellen
- Schüler kann ihn nicht selbst genehmigen
- Lehrer erhält ihn
- Genehmigung wirkt auf Attendance
- fremde Schüler sehen keinen Grund

## Hausaufgaben
- Schüler sieht nur eigene/klassenzugewiesene Aufgaben
- nach Deadline Upload gesperrt
- individuelle Verlängerung funktioniert nur für Zielschüler
- Lehrer sieht Nichtabgabe
- Audio nur berechtigte Nutzer
- Audio-Retention setzt Löschdatum
- dauerhaftes Audio wird nicht automatisch gelöscht

## Protokolle
- Klassensprecher kann Entwurf anlegen
- Einreichung sperrt definierte Felder
- Lehrer kann zurückgeben
- erst approved gilt offiziell

## Eltern
- Elternteil sieht nur verknüpfte Kinder
- mehrere Kinder funktionieren
- Elternteil sieht keine Lehrer-Privatnotizen

## Prüfungen
- Zeitlimit
- Versuchszahl
- Auto-Grading
- Freitext bleibt pending
- Ergebnis vor Freigabe verborgen

## Datenschutz
- direkte Storage-URL ohne Berechtigung nicht zugänglich
- RLS Tests für jede sensible Tabelle
- API Response enthält keine unnötigen Felder

## UI
- Light/Dark
- Smartphone
- Tablet
- Web
- Screen Reader Labels
- Status nicht nur per Farbe


---

# EINMALIGER STARTSATZ FÜR CLAUDE CODE

Nachdem diese Datei im Projektordner liegt, reicht als erste Nachricht:

> Lies `DBZ_APP_MASTERDATEI_ALLES.md` vollständig. Behandle sie als verbindliche Produktspezifikation. Erstelle zuerst den technischen Implementierungsplan und beginne danach selbstständig mit Phase 0. Frage nur bei wirklich blockierenden TBD-Punkten nach und halte dich strikt an Rollen, Datenschutz, Design und Roadmap.

Danach soll Claude Code möglichst selbstständig anhand dieser Masterdatei weiterarbeiten.
