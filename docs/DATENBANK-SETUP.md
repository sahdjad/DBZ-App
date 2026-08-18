# Dauerhafte Datenbank (Supabase) einrichten

Ohne Konfiguration speichert die DBZ-App in einer lokalen Datei (`server/data/db.json`).
Auf Render (kostenlos) ist diese Datei **nicht dauerhaft** – bei jedem Neustart/Deploy
gehen neue Daten verloren. Mit Supabase (ebenfalls kostenlos) bleibt alles erhalten.

Die App erkennt Supabase **automatisch**, sobald zwei Umgebungsvariablen gesetzt sind.
Sind sie nicht gesetzt, läuft alles wie bisher (lokale Datei) – es kann also nichts kaputtgehen.

## 1. Supabase-Projekt anlegen

1. Auf <https://supabase.com> mit E-Mail (oder GitHub) anmelden – kostenlos.
2. **New project** → Name z. B. `dbz-app`, ein **Datenbank-Passwort** vergeben
   (irgendein starkes Passwort, wird hier nicht weiter gebraucht), Region: **Europe**.
3. Kurz warten, bis das Projekt bereit ist.

## 2. Tabelle anlegen (einmalig)

Links im Menü **SQL Editor** öffnen, dieses SQL einfügen und **Run** drücken:

```sql
create table if not exists app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
```

Row-Level-Security-Regeln sind nicht nötig: Der Server nutzt den geheimen
**Service-Role-Key** und arbeitet ausschließlich serverseitig.

## 3. Zugangsdaten kopieren

**Project Settings** (Zahnrad) → **API**:

- **Project URL** → für `SUPABASE_URL` (z. B. `https://abcdxyz.supabase.co`)
- **service_role** Secret (unter „Project API keys") → für `SUPABASE_SERVICE_KEY`

> ⚠️ Der `service_role`-Key ist geheim. Nur in die Render-Umgebungsvariablen eintragen –
> niemals ins Frontend, ins Repository oder in Chats/Screenshots geben.

## 4. In Render eintragen

Render-Dashboard → der Web-Service der DBZ-App → **Environment** → **Add Environment Variable**:

| Key                     | Value                              |
| ----------------------- | ---------------------------------- |
| `SUPABASE_URL`          | die Project URL aus Schritt 3      |
| `SUPABASE_SERVICE_KEY`  | der service_role-Key aus Schritt 3 |

Speichern. Render startet den Dienst automatisch neu.

## 5. Prüfen

`https://dbz-app.onrender.com/api/health` im Browser öffnen. Erwartet:

```json
{ "ok": true, "storage": "supabase", "time": "…" }
```

`"storage": "supabase"` heißt: Daten werden dauerhaft gespeichert. ✅
Steht dort `"file"`, sind die Variablen noch nicht (korrekt) gesetzt.

## Hinweise

- **Nur Textdaten** (Nutzer, Anwesenheit, Hausaufgaben, Prüfungen, Nachrichten …)
  werden dauerhaft gespeichert. **Hochgeladene Audio-Dateien** liegen weiterhin lokal
  und sind nach einem Neustart weg – dafür kommt als nächster Schritt der
  Supabase-Datei-Speicher (Storage).
- Die App bündelt Schreibvorgänge und speichert im Hintergrund; beim Herunterfahren
  (Redeploy) wird der letzte Stand noch gesichert.
- Optionale Variablen: `SUPABASE_TABLE` (Standard `app_state`),
  `SUPABASE_ROW_ID` (Standard `dbz`).
