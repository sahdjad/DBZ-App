// Reine Domänenlogik der DBZ-App – ohne HTTP/DB-Abhängigkeit, damit sie
// isoliert getestet werden kann (server/test/*.test.js).

import crypto from 'crypto';
import { db, newId } from './store.js';
import { pushToUser } from './webpush.js';

// --- Anwesenheit / Verspätung ------------------------------------------------

/**
 * Berechnet Anwesenheitsstatus und Verspätungsminuten aus Serverzeit.
 * @param {Object} p
 * @param {string|Date} p.checkInAt   Zeitpunkt des Check-ins (Serverzeit)
 * @param {string|Date} p.scheduledStart Geplanter Sitzungsbeginn
 * @param {number} p.lateAfterMinutes Toleranz in Minuten (>= gilt als verspätet)
 * @returns {{ status: 'present'|'late', minutesLate: number }}
 */
export function attendanceStatusFor({ checkInAt, scheduledStart, lateAfterMinutes = 5 }) {
  const inMs = new Date(checkInAt).getTime();
  const startMs = new Date(scheduledStart).getTime();
  const minutesLate = Math.max(0, Math.floor((inMs - startMs) / 60000));
  const status = minutesLate > lateAfterMinutes ? 'late' : 'present';
  return { status, minutesLate };
}

// --- QR-Check-in-Token -------------------------------------------------------

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Erzeugt einen kurzlebigen QR-Token für eine Sitzung.
 * Es wird nur der Hash gespeichert (docs/SECURITY_PRIVACY.md §6/§7); der
 * Klartext wird einmalig an die Lehrkraft zurückgegeben.
 */
export function issueQrToken(session, ttlSeconds = 300) {
  const token = crypto.randomBytes(9).toString('base64url'); // 12 Zeichen, gut scanbar
  session.qr = {
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    revoked: false,
  };
  return token;
}

/** Prüft einen eingereichten QR-Token gegen die aktive Sitzung. */
export function verifyQrToken(session, token) {
  if (!session?.qr || session.qr.revoked) return { ok: false, reason: 'Kein aktiver QR-Code' };
  if (new Date(session.qr.expiresAt).getTime() < Date.now())
    return { ok: false, reason: 'QR-Code abgelaufen' };
  if (session.qr.tokenHash !== hashToken(token))
    return { ok: false, reason: 'QR-Code ungültig' };
  return { ok: true };
}

// --- Audit-Log ---------------------------------------------------------------

/** Protokolliert eine sensible Änderung (docs/SECURITY_PRIVACY.md §10). */
export function audit(actorId, action, entityType, entityId, before, after) {
  db.insert('audit_logs', {
    id: newId('audit'),
    actorId,
    action,
    entityType,
    entityId,
    before: before ?? null,
    after: after ?? null,
    createdAt: new Date().toISOString(),
  });
}

// --- Benachrichtigungen ------------------------------------------------------

/** Legt eine In-App-Benachrichtigung an (DBZ-Inbox = Quelle der Wahrheit).
 *  Zusätzlich wird – falls das Gerät ein Push-Abo hat – eine Browser-
 *  Benachrichtigung ausgelöst (bestleistungsbasiert, blockiert nie). */
export function notify(userId, { type, level = 'info', title, body, deepLink = null, refId = null, groupId = null }) {
  const note = db.insert('notifications', {
    id: newId('note'),
    userId,
    type,
    level,
    title,
    body,
    deepLink,
    refId, // konkretes Objekt (z. B. Nachrichten-ID, Ankündigungs-ID)
    groupId, // Gruppierung (z. B. Thread-ID) – zum gemeinsamen „gelesen" markieren
    read: false,
    createdAt: new Date().toISOString(),
  });
  // Ungelesen-Gesamtzahl dieses Nutzers -> App-Symbol-Badge im Push.
  const badge = db.all('notifications').filter((n) => n.userId === userId && !n.read).length;
  // Fire-and-forget: Push nie im Anfrage-Pfad abwarten.
  pushToUser(userId, { title, body: body || '', url: deepLink || null, tag: type, badge }).catch(() => {});
  return note;
}

/** Markiert Benachrichtigungen eines Nutzers als gelesen (nach Filter). Gibt die
 *  Anzahl der geänderten Einträge zurück. Aufrufer committet selbst. */
export function markNotificationsRead(userId, predicate) {
  let changed = 0;
  for (const n of db.all('notifications')) {
    if (n.userId === userId && !n.read && predicate(n)) { n.read = true; changed++; }
  }
  return changed;
}
