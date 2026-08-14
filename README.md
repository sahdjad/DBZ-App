# DBZ-App – Deen Bildungszentrum

Digitale Schulplattform für das **Deen Bildungszentrum (DBZ)**. Pilot für **Klasse 3**,
sauber modelliert für die spätere Ausweitung auf das gesamte DBZ.

Die App ersetzt schrittweise organisatorische WhatsApp-Abläufe durch strukturierte,
datenschutzfreundliche Funktionen für Anwesenheit, Hausaufgaben, Qur'an-Fortschritt,
Protokolle und Kommunikation.

> Umgesetzt gemäß der verbindlichen Spezifikation `DBZ_APP_MASTERDATEI_ALLES.md`.

---

## Was die App kann (Pilot-Kern, Phase 1)

- **Rollen & Rechte** (serverseitig erzwungen): System-Admin, DBZ-Leitung, Klassenlehrer,
  Vertretungslehrer, Klassensprecher, Schüler, Eltern.
- **Unterricht & Anwesenheit:** heutige Sitzung starten/beenden, **QR-/Code-Check-in** mit
  **serverseitiger Check-in-Zeit** und automatischer Verspätungsberechnung, manuelle
  Korrektur (auditiert), Live-Ansicht, Anwesenheitsstatistik.
- **Abwesenheitsanträge:** Schüler/Eltern melden, Lehrkraft genehmigt/lehnt ab/fragt nach.
- **Hausaufgaben:** Aufgaben (Audio/Text/Datei/gemischt) mit Frist und individueller
  Fristverlängerung; Schüler-Abgabe mit **direkter Audioaufnahme** + Datei-Upload;
  Lehrer-Korrekturqueue mit Bewertung (Tajwid, Aussprache, Flüssigkeit, Hifz, Fehlerzahl)
  und bewusster Freigabe.
- **Protokolle:** Klassensprecher-Entwurf → Lehrer-Bestätigung.
- **Benachrichtigungen:** In-App-Inbox als Quelle der Wahrheit.
- **DBZ Online:** zentral konfigurierbare Social-Media-Links (YouTube, Instagram, TikTok).
- **Verwaltung:** Nutzer & Klassen anlegen, Organisationseinstellungen, Audit-Log.

Spätere Phasen (Qur'an-Reader, Prüfungen/Fragenbank, Gamification, Offline-Sync,
KI-Rezitation) sind in `PROJECT_STATUS.md` als Roadmap dokumentiert.

## Architektur & Tech-Stack

Eine einzige, auf **einem Port** lauffähige Node-App – bewusst einfach und **kostenarm**:

- **Frontend:** React 18, Vite, React Router, Tailwind CSS. Mobile-first, responsiv,
  Dark-Design in DBZ-Grün/Weiß, Lucide-Icons, WCAG-Fokusringe, `prefers-reduced-motion`.
- **Backend:** Express, JWT im httpOnly-Cookie, bcrypt-Passwörter, multer-Uploads.
- **Persistenz:** gekapselter JSON-Datastore (`server/store.js`). Die öffentliche
  Schnittstelle ist klein gehalten – ein späterer Umstieg auf **Supabase/Postgres**
  betrifft nur dieses Modul (Provider-/Adapter-Prinzip der Spezifikation).
- **Rechte:** serverseitige RBAC-Schicht (`server/rbac.js`) mit Rollen- und Klassen-Scope.

```
server/
  app.js        Express-App (testbar, ohne listen)
  index.js      Einstiegspunkt (seed + listen)
  api.js        REST-API (alle /api-Routen)
  rbac.js       Rollen & serverseitige Berechtigungen
  domain.js     reine Logik (Verspätung, QR-Token, Audit, Notify)
  store.js      gekapselter Datastore (JSON -> später Supabase)
  content.js    statische Fachdaten & Standard-Organisation
  seed.js       Demo-Daten (alle Rollen, Klasse 3)
  test/         Node-Test-Runner (Unit + Integration)
client/
  src/pages/    rollenabhängige Screens
  src/components/ UI-Bibliothek + AppLayout
```

## Voraussetzungen

- Node.js **>= 18** (getestet mit Node 22)
- npm

## Installation & lokale Entwicklung

```bash
npm install            # installiert Server- und (via postinstall) Client-Abhängigkeiten

# Entwicklung: Express (:4000) + Vite (:5173) mit /api-Proxy
npm run dev
```

Aufruf im Browser: http://localhost:5173

### Produktion lokal testen

```bash
npm run build          # baut das Frontend nach client/dist
npm start              # liefert Frontend + API auf einem Port (Standard 4000)
```

## Environment Variables

Siehe `.env.example`:

| Variable       | Zweck                                               | Pflicht in Produktion |
| -------------- | --------------------------------------------------- | --------------------- |
| `PORT`         | Server-Port (Standard 4000)                         | nein                  |
| `JWT_SECRET`   | Signatur der Login-Tokens                           | **ja**                |
| `DBZ_DATA_DIR` | Datenverzeichnis (persistentes Volume beim Hosting) | empfohlen             |
| `APP_URL`      | öffentliche Basis-URL (für Links in E-Mails)        | empfohlen             |
| `EMAIL_API_URL`| HTTP-Endpunkt für E-Mail-Versand (sonst „log"-Modus)| optional              |
| `EMAIL_API_KEY`| Bearer-Token für die E-Mail-API                     | optional              |
| `EMAIL_FROM`   | Absenderadresse                                     | optional              |

Ohne `EMAIL_API_URL` läuft der E-Mail-Provider im „log"-Modus (E-Mails werden nur
protokolliert). Passwort-Reset-Links werden aus Sicherheitsgründen **nie** an den
Anfragenden zurückgegeben; ohne E-Mail-Anbindung setzt die DBZ-Leitung Passwörter
direkt im Adminbereich zurück. `EXPOSE_RESET_LINK` ist ausschließlich für Tests und
darf in Produktion nicht gesetzt werden.

**Qur'an-Datenquelle (optional konfigurierbar):** Der Qur'an-Reader lädt Text,
Übersetzung und Audio zur Laufzeit über einen austauschbaren, server-seitig
gecachten Provider (`server/providers/quranProvider.js`) – standardmäßig von
[AlQuran Cloud](https://alquran.cloud) (arabischer Uthmani-Text via Tanzil,
deutsche Übersetzung Bubenheim & Elyas, Rezitation Mishary Alafasy). Es wird kein
Qur'an-Text in der App hartcodiert. Anpassbar über `QURAN_API_BASE`,
`QURAN_ED_ARABIC`, `QURAN_ED_TRANSLATION`, `QURAN_ED_AUDIO`. Der Reader benötigt
zur Erstladung einer Sure Internet; danach greift der Cache.

## Datenbank-Setup

Kein separates Setup nötig: Der Datastore wird beim ersten Start unter `server/data`
(oder `DBZ_DATA_DIR`) angelegt und mit Demo-Daten befüllt (`server/seed.js`).
Für den Produktivbetrieb ist ein Umstieg auf Supabase/Postgres vorgesehen – dafür muss
nur `server/store.js` neu implementiert werden.

## Tests

```bash
npm test               # Node-eigener Test-Runner: Unit (Verspätung, QR) + Integration (API/RBAC)
```

Abgedeckt u. a.: falsches Passwort, Rollen-Scope, QR-Check-in (Serverzeit, kein
Doppel-Check-in), Abwesenheits-Genehmigung, Hausaufgaben-Abgabe + Korrekturqueue,
klassenübergreifende Zugriffssperre.

## Demo-Zugänge

Passwort für alle: `demo1234`

| Rolle           | E-Mail          |
| --------------- | --------------- |
| Administrator   | admin@dbz.de    |
| DBZ-Leitung     | leitung@dbz.de  |
| Klassenlehrer   | lehrer@dbz.de   |
| Klassensprecher | sprecher@dbz.de |
| Schüler         | schueler@dbz.de |
| Eltern          | eltern@dbz.de   |

## Deployment (kostenlos möglich)

**Ein-Klick-Deploy auf Render** (kostenlos, erzeugt eine `*.onrender.com`-Adresse):

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/y6sy94pz7g-sudo/global/tree/claude/chatgpt-chat-readability-v1kv6v)

Der Button öffnet Render, liest `render.yaml`, erzeugt `JWT_SECRET` automatisch und baut die
App. Beim ersten Mal einmalig mit dem GitHub-Konto anmelden und den Repo-Zugriff bestätigen.

Die App ist ein einzelner Web-Service. Manuelle 0-€-/Free-Tier-Wege:

- **Render (kostenlos)** – `render.yaml` liegt bei. Render-Konto → *New +* → *Blueprint* →
  dieses Repo + Branch. `JWT_SECRET` wird automatisch erzeugt. Der Free-Tarif hat keine
  persistente Disk (Daten sind flüchtig, ideal für eine Live-Demo). Für Dauerbetrieb:
  bezahlte Instanz + Disk (auskommentiert in `render.yaml`) oder Supabase/Postgres.
- **Docker** (Fly.io, Railway, eigener Server) – `Dockerfile` liegt bei:
  ```bash
  docker build -t dbz-app .
  docker run -p 4000:4000 -e JWT_SECRET=… -v dbzdata:/data dbz-app
  ```

### Was du selbst tun musst (wenige Schritte)

1. Repo mit deinem Render-/Hosting-Konto verbinden.
2. Deployment starten (Blueprint bzw. Docker).
3. `JWT_SECRET` prüfen (bei Render automatisch gesetzt).
4. Nach dem ersten Start mit den Demo-Konten anmelden, eigene Nutzer/Klassen anlegen,
   Demo-Konten deaktivieren.

## Kostenübersicht

| Dienst            | Zweck                 | Kostenloses Limit                    | Spätere Kosten             | Alternative            |
| ----------------- | --------------------- | ------------------------------------ | -------------------------- | ---------------------- |
| Render Free Web   | Hosting (App + API)   | 750 h/Monat, schläft bei Inaktivität, Daten flüchtig | ~7 $/Monat + Disk für Dauerbetrieb | Fly.io, Railway, VPS |
| (später) Supabase | Postgres/Auth/Storage | großzügiger Free-Tier                | ab Pro-Plan                | Neon, eigenes Postgres |

Keine bezahlten SaaS-Abos nötig. Audio-Uploads sind auf 25 MB begrenzt; für den
Dauerbetrieb ist eine Retention-Strategie vorgesehen (`docs/DATA_RETENTION.md`).

## Bekannte Einschränkungen

- Persistenz ist ein JSON-Datastore (ideal für den Pilot). Für viele parallele Schreibzugriffe
  bzw. mehrere Serverinstanzen sollte auf Supabase/Postgres umgestellt werden.
- Check-in per **echtem QR-Code + Kamera-Scan** (native `BarcodeDetector`). Auf Geräten
  ohne diese API (z. B. iOS Safari) dient die manuelle Code-Eingabe als Fallback.
- Native iOS/Android-Apps: Die Codebasis läuft als installierbare Web-App (PWA-fähig);
  ein nativer Wrapper (z. B. Capacitor) ist ein späterer Schritt (siehe `PROJECT_STATUS.md`).
- Push-Benachrichtigungen: aktuell In-App-Inbox; Betriebssystem-Push ist als Adapter geplant.

## Datenschutz

Die App verarbeitet Daten Minderjähriger. Umgesetzt: rollenbasierter Zugriff (serverseitig),
private Uploads mit autorisiertem Zugriff, Audit-Log sensibler Änderungen, Datenminimierung
bei Abwesenheitsgründen. **Sicherheits-Härtung:** Schutz-HTTP-Header inkl. Content-Security-Policy
und (in Produktion) HSTS, Brute-Force-Schutz am Login, und ein Fail-Safe, der den Start in
Produktion mit fehlendem/schwachem `JWT_SECRET` verhindert. Es werden **keine externen Schrift-/CDN-Dienste** eingebunden
(keine Datenübertragung an Dritte beim Seitenaufruf, DSGVO-freundlich, offline-fähig).
Der Qur'an-Reader lädt Inhalte nur auf ausdrückliche Nutzung über den konfigurierbaren
Provider. Vor echtem Einsatz sind die organisatorischen Punkte in
`docs/SECURITY_PRIVACY.md` (§15 Production Gate) zu klären.

## Lizenz / Träger

© Deen Bildungszentrum e.V. Interne Schulplattform.
