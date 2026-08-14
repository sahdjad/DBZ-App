# Frontend-Smoke-Test

`smoke.mjs` lädt die DBZ-App als jede Demo-Rolle in einem echten Chromium und
prüft die wichtigsten Seiten auf Render-, Laufzeit- und 404-Fehler. Ergänzt die
Backend-Tests (`npm test`) um eine Prüfung der tatsächlichen UI.

## Ausführen

```bash
# 1) App bauen und starten
npm run build
DBZ_DATA_DIR=$(mktemp -d) JWT_SECRET=dev PORT=4000 npm start &

# 2) Playwright-Core (nur der Treiber, keine Browser-Downloads) + eine Chromium-Binary
npm i -D playwright-core

# 3) Smoke-Test
BASE=http://127.0.0.1:4000 PLAYWRIGHT_CHROMIUM=/pfad/zu/chromium node e2e/smoke.mjs
```

Erfolg: „OK – keine Render-, Laufzeit- oder 404-Fehler." Sonst werden die
betroffenen Rolle/Seite/Fehler aufgelistet (Exit-Code 1).

Hinweis: `playwright-core` ist bewusst **keine** Projekt-Abhängigkeit (der Test ist
optional und braucht eine Browser-Binary). Auf CI/lokal bei Bedarf installieren.

## Vollständiger QA-Durchlauf (`qa.mjs`)

`qa.mjs` simuliert echte Nutzer über alle Rollen und prüft ganze Abläufe end-to-end:
Registrierung per Einladung, Datei-Upload/Abgabe, Lehrer-Korrektur, Entschuldigung,
Verhalten, Hifz, Bericht + PDF, Material, Ankündigung, Nachrichten (Hin- und Rückweg),
Admin (Klassen/Einladungen/Backup), Qur'an-Reader, sowie Fehler-, Leer- und
Berechtigungszustände und mobilen Layout-Überlauf. 44 Prüfungen.

```bash
npm run build
DBZ_DATA_DIR=$(mktemp -d) JWT_SECRET=dev PORT=4000 npm start &   # Dev-Modus für Test-Cookies
BASE=http://127.0.0.1:4000 PLAYWRIGHT_CHROMIUM=/pfad/zu/chromium node e2e/qa.mjs
```
