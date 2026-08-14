# Migrationsleitfaden: JSON-Datastore → Supabase/Postgres

Der Pilot nutzt einen gekapselten JSON-Datastore (`server/store.js`). Für den
Dauerbetrieb (Nebenläufigkeit, Backups, mehrere Instanzen) wird auf **Postgres**
(z. B. Supabase) umgestellt. Dieses Dokument beschreibt den Weg. **Wichtig:** Der
Umstieg betrifft im Wesentlichen nur `server/store.js` und die Aufrufstellen – die
Fachlogik (Rollen, RLS-Regeln, Endpunkte) bleibt.

## Ausgangslage (bereits vorbereitet)
- Persistenz ist in `server/store.js` gekapselt (`db.all/insert/commit/snapshot`).
- `db.snapshot()` liefert den vollständigen Bestand (für Migration/Backup).
- Automatische Backups + Retention laufen (`server/maintenance.js`).
- Provider-Muster für externe Dienste (E-Mail, Qur'an) ist etabliert.

## Empfohlener Weg (zweistufig)

### Stufe 1 – Persistenz-Backend tauschen (kleinster Eingriff)
Die aktuelle `db`-API ist synchron und gibt veränderbare Arrays zurück. Der
schnellste, risikoarme Schritt ist ein **Postgres-JSONB-Backend**, das denselben
In-Memory-Cache hält und statt in eine Datei in eine Tabelle serialisiert:

```sql
create table app_state (
  id int primary key default 1,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

`store.js` lädt beim Start `data` in den Cache und schreibt bei `commit()` zurück
(z. B. mit `pg`). Damit ist Persistenz dauerhaft/gesichert, ohne Aufrufstellen zu
ändern. Geeignet als Zwischenschritt (weiterhin eine Instanz).

### Stufe 2 – Echtes relationales Schema + RLS (Zielbild)
Für Skalierung und Row-Level-Security jede Collection als Tabelle abbilden und die
Aufrufstellen von `db.all(...).find/filter/push` auf ein **async Repository**
umstellen (`await repo.users.byEmail(...)`). Kern-Tabellen (Auszug):

```sql
create table organizations (id text primary key, name text, short_name text,
  primary_color text, late_after_minutes int, audio_retention_days int,
  social_links jsonb, status text);

create table users (id text primary key, name text, email text unique,
  password_hash text, role text, class_ids text[], child_ids text[],
  status text, created_at timestamptz);

create table classes (id text primary key, organization_id text, name text,
  type text, language text, weekday int, start_time text, end_time text, active bool);

create table sessions (id text primary key, class_id text, date date,
  scheduled_start timestamptz, scheduled_end timestamptz, status text, qr jsonb);

create table attendance (id text primary key, session_id text, class_id text,
  student_id text, status text, check_in_at timestamptz, minutes_late int,
  source text, confirmed_by text, note text);
-- ... analog: absence_requests, assignments, submissions, reviews, extensions,
--     protocols, behavior_records, quran_goals, recitation_attempts, exams,
--     exam_attempts, report_periods, student_reports, announcements, materials,
--     threads, invites, password_resets, audit_logs
```

**Supabase-RLS** (Zielbild, Beispiel Schüler sieht nur eigene Abgaben):

```sql
alter table submissions enable row level security;
create policy own_submissions on submissions
  for select using (student_id = auth.uid());
```

> Hinweis: Die App erzwingt Rechte bereits serverseitig (`server/rbac.js`). Bei
> Supabase mit direktem Client-Zugriff sollten die RBAC-Regeln zusätzlich als
> RLS-Policies gespiegelt werden (Default deny), damit auch der DB-Zugriff sicher ist.

## Migration der Bestandsdaten
1. Laufende App: `GET /api/admin/backup.json` (Leitung/Admin) liefert den Snapshot.
2. Import-Skript liest den Snapshot und schreibt ihn in die Tabellen (Stufe 2)
   bzw. in `app_state.data` (Stufe 1).

## Benötigt vom DBZ
- Supabase-Projekt (kostenloser Tier genügt für den Start) bzw. Postgres-Zugang
  (`DATABASE_URL`).
- Danach: `pg`-Abhängigkeit hinzufügen und `store.js` auf das gewählte Backend
  umstellen. Fachlogik/Tests bleiben unverändert.
