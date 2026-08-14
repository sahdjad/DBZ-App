# PROJECT_STATUS – DBZ-App

Stand: 2026-08-10 · Grundlage: `DBZ_APP_MASTERDATEI_ALLES.md`

## Technische Entscheidungen

| Thema        | Entscheidung                                                                 | Begründung |
| ------------ | ---------------------------------------------------------------------------- | ---------- |
| Stack        | React + Vite + Tailwind (Frontend), Express + JWT (Backend), ein Deploy-Port | 0-€-Betrieb, sofort lauffähig & testbar, mobile-first responsiv |
| Persistenz   | gekapselter JSON-Datastore (`server/store.js`)                               | Pilot-tauglich; API klein → späterer Supabase/Postgres-Umstieg betrifft nur ein Modul |
| Auth         | JWT im httpOnly-Cookie + bcrypt                                              | XSS-sicher, kein Secret im Client |
| Rechte       | serverseitige RBAC (`server/rbac.js`), Rolle + Klassen-Scope                 | Spec §9: nicht nur Frontend absichern |
| Check-in     | kurzlebiger Token (Hash gespeichert), Serverzeit, Verspätung serverseitig    | Manipulationssicher; QR-Rendering als spätere Erweiterung |
| Uploads      | multer, 25 MB, MIME-Whitelist (Audio/PDF/Bild), autorisierter Download       | Kostenkontrolle + Datenschutz |
| Kosten       | keine bezahlten SaaS-Abos; Render Free / Docker                              | Spec-Vorgabe „möglichst 0 €“ |

## Erledigt ✓ (Phase 0 + Phase-1-Pilotkern)

- [x] Projektstruktur, Build, Dev-/Prod-Skripte, `.env.example`
- [x] Design-System in DBZ-Grün/Weiß, Light/Dark, Statusfarben, Icons
- [x] 7 Rollen + serverseitige Berechtigungen inkl. Klassen-Scope
- [x] Login (Cookie-JWT), rollenabhängiges Dashboard & Navigation
- [x] Start-Dashboard als Tagesübersicht: anstehende Termine/Fristen, neueste
      Ankündigungen, ungelesene Nachrichten und Benachrichtigungen gebündelt
- [x] Klassen, heutige Unterrichtssitzung (start/ende)
- [x] QR-Check-in: echter QR-Code (Lehrer) + Kamera-Scan (Schüler, BarcodeDetector) mit
      Code-Fallback, Serverzeit, Verspätungsberechnung, kein Doppel-Check-in
- [x] manuelle Anwesenheitskorrektur (auditiert), Live-Ansicht, Statistik (Schüler + Klasse)
- [x] Abwesenheitsanträge: Meldung (Schüler/Eltern) → Entscheidung (Lehrkraft)
- [x] Hausaufgaben: erstellen (Audio/Text/Datei/gemischt), Frist, individuelle Verlängerung
- [x] Abgabe mit direkter Audioaufnahme + Datei-Upload + Text
- [x] Korrekturqueue mit Bewertung (Tajwid/Aussprache/Flüssigkeit/Hifz/Fehler) + Freigabe
- [x] Klassensprecher-Protokoll → Lehrer-Bestätigung
- [x] Verhalten / Tarbiyah: Lehrer erfasst Vermerke, Sichtbarkeit für Schüler/Eltern
      steuerbar und serverseitig durchgesetzt
- [x] Passwort ändern (mit Prüfung des aktuellen Passworts)
- [x] Einladungs-Flow + Selbst-Registrierung: sichere, befristete Einladungslinks
      (nur Token-Hash gespeichert, max. Nutzungen, widerrufbar); öffentliche
      Registrierungsseite; Lehrkräfte laden für die eigene Klasse ein
- [x] Passwort-Reset durch Leitung/Admin (mit Schutz für Super-Admin)
- [x] Passwort vergessen (Selbstservice): Reset-Token (nur Hash, 1 h gültig, einmalig),
      Versand über austauschbaren E-Mail-Provider; Link nie an Anfragenden zurückgegeben
- [x] E-Mail-Provider (austauschbar): „log"-Modus ohne Konfiguration, HTTP-API per ENV
- [x] Automatische Backups (täglich, letzte 14) + Admin-Backup-Download
- [x] Audio-Retention (opt-in, Standard aus): automatische Löschung nach Frist,
      Bewertung/Metadaten bleiben; Frist im Adminbereich einstellbar
- [x] Postgres/Supabase-Migration vorbereitet: Snapshot-Nahtstelle + Leitfaden
      (docs/DB_MIGRATION.md) mit Start-Schema und RLS-Hinweisen
- [x] Schüler-/Kind-Profil (Anwesenheit + Aufgaben + Verhalten an einem Ort) für
      Lehrer, Eltern und Schüler – Zugriff serverseitig geprüft
- [x] Ankündigungen (WhatsApp-Ersatz): Leitung an alle/Rolle/Klasse, Lehrer an
      eigene Klasse; Feed + automatische Benachrichtigung; Wichtig-Markierung
- [x] Materialien / Bibliothek: Lehrer/Leitung teilen Datei (PDF/Bild), Link oder
      Notiz je Klasse/Fach oder schulweit; Schüler/Eltern greifen klassenweise zu
      (Zugriff serverseitig geprüft)
- [x] Direktnachrichten: sichere 1:1-Threads Schüler/Eltern ↔ Lehrkräfte der Klasse
      (kein Schüler-zu-Schüler); Kontaktliste serverseitig begrenzt; Ungelesen-Zähler
- [x] Benachrichtigungs-Inbox
- [x] DBZ-Online (konfigurierbare Social Links)
- [x] Verwaltung: Nutzer, Klassen, Organisationseinstellungen, Audit-Log
- [x] Nutzerverwaltung: Rolle/Klassen ändern, Eltern-Kind verknüpfen, Konten
      aktivieren/deaktivieren (Austritt) – Schutzregeln (Super-Admin/letzter Admin/
      Selbst-Deaktivierung) serverseitig abgesichert
- [x] Audit-Log für sensible Änderungen
- [x] Tests (Unit + Integration) grün; Frontend-Build grün; E2E-Smoke-Test grün
- [x] Browser-Verifikation (Chromium): 56 Seitenaufrufe über 5 Rollen ohne Render-,
      Laufzeit- oder 404-Fehler (e2e/smoke.mjs)
- [x] Vollständiger QA-Durchlauf (e2e/qa.mjs, 44 Prüfungen): reale Nutzer-Abläufe
      aller Rollen inkl. Upload/Abgabe, Korrektur, Bericht+PDF, Nachrichten,
      Einladung/Registrierung, Admin, Qur'an, Fehler-/Leer-/Berechtigungszustände
- [x] Mobil-Layout: horizontaler Überlauf behoben (Basis-Grid-Spalte app-weit) –
      kein Überlauf auf allen geprüften Seiten/Rollen
- [x] Keine externen Schrift-CDNs (DSGVO + Offline): System-Schriften mit Fallbacks
- [x] Sicherheits-Härtung: Schutz-Header (CSP, HSTS in Prod, X-Frame-Options DENY,
      Permissions-Policy), Brute-Force-Schutz am Login (Sperre nach Fehlversuchen),
      Produktions-Fail-Safe für schwaches JWT_SECRET, x-powered-by entfernt
- [x] Deployment-Konfig (Render Blueprint + Dockerfile), README, Kostenübersicht

## Offen / nächste Schritte (nach Roadmap der Spec)

**Phase 2 – Verwaltungsstabilität**
- [x] Eltern-Detailansicht pro Kind (Schüler-/Kind-Profil)
- [x] Kalender / Stundenplan (Monatsansicht: Unterrichtstermine + Hausaufgaben-Fristen,
      rollenabhängig; Prüfungen folgen mit dem Prüfungsmodul)
- [x] Vertretungslehrer-Zuweisung (Rolle + Klasse in der Admin-UI)
- [ ] Vertretungslehrer: automatisches Ablaufdatum (valid_until) als Verfeinerung
- [ ] Gastmitgliedschaften (höhere Klasse) in der UI
- [x] Berichte/Zeugnisse: Probezeit-/Halbjahresbericht (Anwesenheit + Hausaufgaben +
      Verhalten aggregiert), Lehrerkommentar, Freigabe an Schüler/Eltern
- [x] PDF-Export der Berichte: druckoptimiertes DBZ-Zeugnis-Layout (weißes A4,
      Kopf, Kennzahlentabelle, Lehrerkommentar, Unterschriftszeilen) via Browser-Druck
- [x] CSV-Export: Anwesenheitsübersicht je Klasse (Lehrkraft) und Klassenliste
      (Leitung/Admin) – Excel-freundlich (BOM, Semikolon), Zugriff geprüft, Audit-Log
- [ ] Audio-Retention-Job (automatisches Löschen nach Frist)

**Phase 3 – Lernen**
- [x] Hifz/Muraja'ah: Ziele (Surah/Ayah-Bereich), Rezitationsbewertung
      (Tajwid/Aussprache/Flüssigkeit/Hifz/Fehlerzahl), Fortschritt in Ayat
      (detaillierte Fehlerhistorie pro Ayah als spätere Verfeinerung)
- [x] Prüfungen/Quiz: Erstellen (Single/Multi/Freitext), Veröffentlichen, Ablegen,
      Auto-Korrektur der Choice-Fragen, Freitext-Bewertung, bewusste Ergebnis-Freigabe
- [ ] Lehrplan-/Curriculum-Fortschritt

**Phase 4–6**
- [x] Qur'an-Reader: 114 Suren, arabischer Text + deutsche Übersetzung + Rezitator-Audio
      über austauschbaren, server-seitig gecachten Provider (AlQuran Cloud); Suche,
      Audio-Wiedergabe mit Wiederholungsmodus (1/3/5/10×). Kein Text hartcodiert.
- [x] Qur'an-Reader vertieft: Lesezeichen (Ayah merken/entfernen, Sprung zur Stelle)
      und "Weiterlesen" (zuletzt geöffnete Sure) pro Nutzer
- [ ] Tafsir-Anzeige und weitere Übersetzungen/Rezitatoren (Provider vorbereitet)
- [ ] In-App-PDF-Reader mit Lesezeichen/Notizen (aktuell: Material öffnet im Browser)
- [ ] Gamification (Punkte/Streaks/Abzeichen, datenschutzkonforme Rangliste)
- [ ] Offline-Sync, WhatsApp-/Telegram-/Kalender-Adapter, Betriebssystem-Push
- [ ] KI-Rezitationsassistenz (nur Assistenz, Lehrer bleibt finale Instanz)

**Plattform**
- [x] Installierbare PWA (Manifest, Service Worker, eigene Icons, Offline-Shell,
      "App installieren"-Button) — Homescreen-Installation ohne App-Store
- [ ] optional Capacitor-Wrapper für native iOS/Android-Stores
- [ ] Umstieg Datastore → Supabase/Postgres mit RLS (für Mehrinstanz-Betrieb)

## Offene Produktentscheidungen (TBD – aus `OPEN_QUESTIONS.md`)

Nicht erfunden, zentral konfigurierbar hinterlegt bzw. für später markiert:
- Verspätungsgrenze (aktuell Default 5 Min, im Admin einstellbar)
- Notensystem 1–6 / Gewichtung
- finale Lösch-/Aufbewahrungsfristen
- Original-Logo (transparent) + offizielle Brand Guidelines
- Rangliste: echter Name / Initialen / Alias

## Bekannte Probleme

- Keine offenen Fehler bekannt. Tests und Build laufen grün.
- JSON-Datastore ist nicht für hohe Nebenläufigkeit/Mehrinstanz gedacht (Pilot-Scope).
