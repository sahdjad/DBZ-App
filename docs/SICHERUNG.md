# Datensicherung und Wiederherstellung

## Was automatisch passiert

- **Täglich** legt der Server eine Sicherung des gesamten Datenbestands an (die erste des Tages bleibt stehen). Aufbewahrt werden die letzten **30**.
- **Vor jeder Massenlöschung** (Nutzer löschen, Unterricht löschen, „Klasse neu starten", Wiederherstellung) wird zusätzlich gesichert. Aufbewahrt werden die letzten **20**. Schlägt diese Sicherung fehl, wird nichts gelöscht.
- Ablage in der Produktion: eigener privater Supabase-Storage-Bucket `dbz-backups` (änderbar über `SUPABASE_BACKUP_BUCKET`), getrennt von den Uploads der Nutzer, gzip-komprimiert. Lokal: `server/data/backups/`.
- Nicht gesichert werden: der Demo-Sandkasten, ein leerer Bestand, der Notmodus (Supabase nicht erreichbar) – und **hochgeladene Dateien** (Audio, PDF); die liegen im Bucket `uploads`.

## Stand zurückholen

Nur der System-Administrator: **Verwaltung → Einstellungen → Datensicherung → Wiederherstellen**, zur Bestätigung `WIEDERHERSTELLEN` eingeben.
Der aktuelle Stand wird vorher selbst gesichert („vor-wiederherstellung"), der Schritt lässt sich also zurücknehmen.
Alles, was nach der gewählten Sicherung eingetragen wurde, ist danach nicht mehr im Bestand.

## Wenn die App selbst nicht mehr startet

Die Dateien liegen im Supabase-Dashboard unter *Storage → dbz-backups*. Eine Datei herunterladen, entpacken (`gunzip`) und den Inhalt als Wert der Spalte `data` in der Tabelle `app_state` (Zeile `dbz`) eintragen, dann den Server neu starten.

## Abzug herunterladen

„Abzug herunterladen" liefert den Bestand als JSON **ohne** Passwort-Hashes, Familien-Codes, Kalender- und Push-Schlüssel. Er ist zum Ansehen und Archivieren gedacht, nicht zum Wiedereinspielen.
