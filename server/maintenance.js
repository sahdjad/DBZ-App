// Wartungsjobs: automatische Backups und (opt-in) Audio-Retention.
// Werden beim Serverstart geplant (server/index.js). Ohne externe Abhängigkeiten.

import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOAD_DIR } from './store.js';

const KEEP_BACKUPS = 14;

/** Schreibt eine Momentaufnahme der Datenbank in data/backups/ und behält die letzten N. */
export function backupNow() {
  try {
    const dir = path.join(db.dir, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(dir, `db-${ts}.json`), JSON.stringify(db.snapshot()));
    const files = fs.readdirSync(dir).filter((f) => f.startsWith('db-') && f.endsWith('.json')).sort();
    for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
      fs.rmSync(path.join(dir, old), { force: true });
    }
    return { ok: true, kept: Math.min(files.length, KEEP_BACKUPS) };
  } catch (err) {
    console.error('[backup] fehlgeschlagen:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Löscht Audio-Dateien von Abgaben, die älter als die konfigurierte Aufbewahrungs-
 * frist sind (nur wenn organisatorisch aktiviert, audioRetentionDays > 0). Bereits
 * bewertete Abgaben; Metadaten/Bewertung bleiben erhalten. "retainPermanently"
 * schützt eine Datei. Standard: deaktiviert (docs/DATA_RETENTION.md).
 */
export function runAudioRetention() {
  const org = db.all('organizations')[0];
  const days = org?.audioRetentionDays || 0;
  if (!days) return { ok: true, skipped: 'deaktiviert' };
  const cutoff = Date.now() - days * 86400000;
  let deleted = 0;
  for (const sub of db.all('submissions')) {
    if (!sub.submittedAt || new Date(sub.submittedAt).getTime() > cutoff) continue;
    if (!['passed', 'revision_required'].includes(sub.status)) continue; // erst nach Korrektur
    for (const f of sub.files || []) {
      if (f.deleted || f.retainPermanently) continue;
      if (!(f.mediaType || '').startsWith('audio')) continue;
      try {
        fs.rmSync(path.join(UPLOAD_DIR, f.filename), { force: true });
        f.deleted = true;
        f.deletedAt = new Date().toISOString();
        deleted++;
      } catch (err) {
        console.error('[retention] Löschen fehlgeschlagen:', err.message);
      }
    }
  }
  if (deleted) db.commit();
  return { ok: true, deleted };
}

/** Plant Backups und Retention (täglich) und führt sie einmal beim Start aus. */
export function scheduleMaintenance() {
  const daily = 24 * 60 * 60 * 1000;
  backupNow();
  runAudioRetention();
  const t1 = setInterval(backupNow, daily);
  const t2 = setInterval(runAudioRetention, daily);
  t1.unref?.();
  t2.unref?.();
}
