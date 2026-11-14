// Wartungsjobs: automatische Backups und (opt-in) Audio-Retention.
// Werden beim Serverstart geplant (server/index.js). Ohne externe Abhängigkeiten.

import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOAD_DIR } from './store.js';
import { deleteFile } from './files.js';
import { ensureDailyBackup } from './backup.js';


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
        deleteFile(f.filename); // auch aus Supabase entfernen (best-effort, async)
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

/** Plant Sicherung (stündlich prüfen, einmal täglich schreiben) und Retention (täglich). */
export function scheduleMaintenance() {
  const hour = 60 * 60 * 1000;
  ensureDailyBackup();
  runAudioRetention();
  const t1 = setInterval(ensureDailyBackup, hour);
  const t2 = setInterval(runAudioRetention, 24 * hour);
  t1.unref?.();
  t2.unref?.();
}
