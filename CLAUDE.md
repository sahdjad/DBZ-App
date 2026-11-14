# DBZ-App – Arbeitsregeln für Claude-Sitzungen

Schulplattform des Deen Bildungszentrum (Koranschule): Node/Express + React/Vite-PWA.
Produktion: Render Free (`dbz-app`, Auto-Deploy bei jedem Merge nach `main`),
Daten in Supabase (`/api/health` meldet `storage: supabase`).
Der Nutzer schreibt Deutsch; Antworten, Commits, PRs und Code-Kommentare auf Deutsch.

## Verbindliche Regeln des Nutzers

- **Nichts ohne Erlaubnis.** Verbesserungsvorschläge nennen, aber nicht ungefragt umsetzen.
  Bei Unklarheit lieber fragen als raten.
- **Alles bleibt kostenlos** (keine bezahlten Dienste ohne ausdrückliche Zustimmung).
- **Qur'an-Text:** niemals generierte, wiederholte, Platzhalter- oder erfundene Wortfolgen.
  Nur geprüfte Quellen. Der Muṣḥaf-Druck 1421H bleibt.
- **Spracherkennung:** läuft auf dem Gerät; Roh-Audio wird nie gespeichert oder versendet.
- **Demo-Sandkasten** darf nie echte Daten berühren.
- **Sensible Daten** nie über Rollen- oder Benutzergrenzen hinweg zwischenspeichern.
- **Nur Testdaten** verwenden, sobald personenbezogene Daten sichtbar sein könnten.
- **Render-Deploy nicht brechen:** vor jedem Merge `npm test` und `npm run build`.
- Keine destruktiven Tests, Migrationen oder Änderungen an Produktionsdaten ohne Freigabe.
- Die App wird weiterentwickelt, nicht neu gebaut.
- Das Speicher-Thema (Dateigrößen, Kontingente) ist zurückgestellt, bis der Nutzer es aufruft.
- Keine Modellnamen in Commits, PRs oder Code.

## Ablauf je Aufgabe

1. Umsetzen auf dem Arbeitszweig, mit Test (bei Fehlern: Test, der vorher fehlschlägt).
2. `npm test` und `npm run build`.
3. PR nach `main`, Squash-Merge, Zweig auf `origin/main` zurücksetzen.
4. Bericht auf Deutsch – ehrlich benennen, was **nicht** geprüft wurde
   (Produktion, echte Geräte, Supabase-Betrieb sind aus der Cloud-Sitzung meist nicht erreichbar).

## Technik in Kürze

| Bereich | Ort |
|---|---|
| Server-Einstieg | `server/index.js`, `server/app.js` |
| Alle API-Routen (eine Datei, >7.500 Zeilen) | `server/api.js` |
| Datenspeicher (ein JSON-Dokument: Datei oder Supabase-Zeile `app_state`) | `server/store.js` |
| Rechte und Rollen | `server/rbac.js`, `server/auth.js` |
| Dateien / Uploads | `server/files.js` |
| Seiten | `client/src/pages/` |
| Muṣḥaf-Leser und Blättern | `client/src/components/mushaf/`, `client/src/lib/mushafPager.js` |
| Übersetzungen (Schlüssel = deutscher Text) | `client/src/i18n/en.json`, `fr.json` |
| Design-Tokens | `client/src/index.css`, `client/tailwind.config.js` |

- Lokal starten: `npm install && npm run dev` (Datei-Modus, Demo-Konten `…@dbz.de` / `demo1234`).
- Tests: `npm test` (Node-Testläufer, Server- und Client-Bibliotheken).
- Kein TypeScript, kein Linter, kein CI (Stand November 2026).

## Wo es weitergeht

`docs/ROADMAP.md` ist der verbindliche Plan (Reihenfolge, Stand, App-Store-Vorbereitung).
`BACKLOG.md` und `PROJECT_STATUS.md` sind älter und teilweise überholt.
