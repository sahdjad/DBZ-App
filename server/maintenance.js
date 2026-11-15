// Wartungsjobs: automatische Backups und (opt-in) Audio-Retention.
// Werden beim Serverstart geplant (server/index.js). Ohne externe Abhängigkeiten.

import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOAD_DIR, isSupabaseDegraded } from './store.js';
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

/**
 * Löschliste abarbeiten: Dateien gelöschter Einträge, deren Frist (30 Tage)
 * abgelaufen ist, endgültig entfernen. Doppelte Sicherung: Steht der Dateiname
 * inzwischen wieder irgendwo im Bestand (z. B. nach einer Wiederherstellung),
 * bleibt die Datei erhalten und fällt nur von der Liste.
 */
export async function purgeFileTrash(now = Date.now()) {
  if (isSupabaseDegraded()) return { ok: true, skipped: 'notmodus' };
  const trash = db.all('file_trash');
  const due = trash.filter((t) => new Date(t.deleteAfter).getTime() <= now);
  if (!due.length) return { ok: true, deleted: 0, kept: 0 };
  const { file_trash: _own, ...rest } = db.snapshot();
  const haystack = JSON.stringify(rest);
  let deleted = 0;
  let kept = 0;
  for (const t of due) {
    if (haystack.includes(`"${t.filename}"`)) kept++;
    else {
      fs.rmSync(path.join(UPLOAD_DIR, t.filename), { force: true });
      await deleteFile(t.filename);
      deleted++;
    }
    trash.splice(trash.indexOf(t), 1);
  }
  db.commit();
  return { ok: true, deleted, kept };
}

// Der Datenbestand wird bei jeder Änderung als Ganzes gespeichert -- was nie
// gekürzt wird, macht jede Speicherung langsamer. Grenzen (großzügig, damit
// im Alltag nichts fehlt):
export const HISTORY_LIMITS = {
  noteReadDays: 90, // gelesene Benachrichtigungen
  noteMaxDays: 365, // auch ungelesene
  notePerUser: 300, // höchstens so viele je Person
  auditDays: 400, // Audit-Log: gut 13 Monate
  auditMax: 20000,
  resetDays: 7, // erledigte/abgelaufene Passwort-Links
};
export function trimHistory(now = Date.now(), L = HISTORY_LIMITS) {
  if (isSupabaseDegraded()) return { ok: true, skipped: 'notmodus' };
  const age = (iso) => (now - new Date(iso || 0).getTime()) / 86400000;
  const removed = { notifications: 0, audit: 0, resets: 0 };
  const keepIf = (collection, pred, key) => {
    const list = db.all(collection);
    const kept = list.filter(pred);
    removed[key] += list.length - kept.length;
    if (kept.length !== list.length) list.splice(0, list.length, ...kept);
  };
  keepIf('notifications', (n) => age(n.createdAt) <= (n.read ? L.noteReadDays : L.noteMaxDays), 'notifications');
  // je Person nur die neuesten N
  const perUser = new Map();
  for (const n of db.all('notifications')) (perUser.get(n.userId) || perUser.set(n.userId, []).get(n.userId)).push(n);
  const drop = new Set();
  for (const list of perUser.values()) {
    if (list.length <= L.notePerUser) continue;
    list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    list.slice(L.notePerUser).forEach((n) => drop.add(n));
  }
  if (drop.size) keepIf('notifications', (n) => !drop.has(n), 'notifications');
  keepIf('audit_logs', (a) => age(a.createdAt || a.at || a.timestamp) <= L.auditDays, 'audit');
  const logs = db.all('audit_logs');
  if (logs.length > L.auditMax) { removed.audit += logs.length - L.auditMax; logs.splice(0, logs.length - L.auditMax); }
  keepIf('password_resets', (p) => !((p.used || new Date(p.expiresAt).getTime() < now) && age(p.createdAt) > L.resetDays), 'resets');
  if (removed.notifications || removed.audit || removed.resets) db.commit();
  return { ok: true, removed };
}

/** Plant Sicherung (stündlich prüfen, einmal täglich schreiben) und Retention (täglich). */
export function scheduleMaintenance() {
  const hour = 60 * 60 * 1000;
  ensureDailyBackup();
  runAudioRetention();
  const t1 = setInterval(ensureDailyBackup, hour);
  trimHistory();
  const t2 = setInterval(() => { runAudioRetention(); trimHistory(); purgeFileTrash().catch((err) => console.error('[files] Löschliste:', err.message)); }, 24 * hour);
  purgeFileTrash().catch((err) => console.error('[files] Löschliste:', err.message));
  t1.unref?.();
  t2.unref?.();
}
