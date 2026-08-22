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

// =============================================================================
// Automatischer Leistungsstand / Notenvorschlag (rein, testbar)
// =============================================================================
// Aus gesammelten Kennzahlen (Hausaufgaben, Anwesenheit, Verhalten, Prüfungen)
// wird je Bereich eine Qualität 0–100 und daraus ein Notenvorschlag (1–6)
// abgeleitet. Es sind NUR Vorschläge – die Lehrkraft entscheidet endgültig.

export const STANDING_WEIGHTS = { homework: 0.35, attendance: 0.25, behavior: 0.1, exams: 0.15, activities: 0.15 };

function qHomework(hw) {
  if (!hw || !hw.total) return null;
  const considered = hw.passed + hw.submitted + hw.revision + hw.missed; // fällige/bearbeitete
  if (!considered) return null;
  // bestanden=100, abgegeben(offen)=80, Nachbesserung=55, verpasst=0
  return Math.round((hw.passed * 100 + hw.submitted * 80 + hw.revision * 55) / considered);
}
function qAttendance(at) {
  if (!at || !at.sessions) return null;
  let score = ((at.present + at.late) / at.sessions) * 100;
  score -= (at.unexcused / at.sessions) * 40; // unentschuldigt wiegt schwer
  score -= (at.late / at.sessions) * 8; // Verspätung leicht
  return Math.max(0, Math.min(100, Math.round(score)));
}
function qBehavior(b) {
  const total = (b?.positive || 0) + (b?.hinweis || 0);
  if (!total) return null;
  return Math.max(0, Math.min(100, Math.round(75 + b.positive * 8 - b.hinweis * 15)));
}
function qExams(ex) {
  if (!ex || !ex.count) return null;
  return Math.max(0, Math.min(100, Math.round(ex.avgPercent)));
}
function qActivities(ac) {
  if (!ac || !ac.scoredCount) return null; // nur bewertete Aktivitäten fließen in die Note
  return Math.max(0, Math.min(100, Math.round(ac.avgPercent)));
}
const qualityToGrade = (q) => Math.round((1 + ((100 - q) / 100) * 5) * 10) / 10; // 100->1,0 ; 0->6,0
const toHalfGrade = (g) => Math.max(1, Math.min(6, Math.round(g * 2) / 2));

/** Berechnet Leistungsstand + Notenvorschlag aus aggregierten Kennzahlen. */
export function computeStanding(data) {
  const dims = [
    { key: 'homework', label: 'Hausaufgaben', quality: qHomework(data.homework),
      detail: data.homework ? `${data.homework.passed}/${data.homework.total} bestanden · ${data.homework.missed} verpasst` : '–' },
    { key: 'attendance', label: 'Anwesenheit', quality: qAttendance(data.attendance),
      detail: data.attendance ? `${data.attendance.unexcused} unentschuldigt · ${data.attendance.late} verspätet` : '–' },
    { key: 'behavior', label: 'Verhalten', quality: qBehavior(data.behavior),
      detail: data.behavior ? `${data.behavior.positive} positiv · ${data.behavior.hinweis} Hinweise` : '–' },
    { key: 'exams', label: 'Prüfungen', quality: qExams(data.exams),
      detail: data.exams?.count ? `${data.exams.count} Prüfungen · Ø ${data.exams.avgPercent}%` : 'keine benoteten Prüfungen' },
    { key: 'activities', label: 'Aktivitäten', quality: qActivities(data.activities),
      detail: data.activities?.count ? `${data.activities.count} Einträge · ${data.activities.scoredCount} bewertet · Ø ${data.activities.avgPercent}%` : 'keine Aktivitäten' },
  ].map((d) => ({ ...d, grade: d.quality != null ? qualityToGrade(d.quality) : null }));

  const active = dims.filter((d) => d.quality != null);
  if (!active.length) {
    return { available: false, dimensions: dims, overallQuality: null, suggestedGrade: null, suggestedGradeHalf: null, summary: 'Noch zu wenig Daten für einen Notenvorschlag.' };
  }
  const wsum = active.reduce((s, d) => s + STANDING_WEIGHTS[d.key], 0);
  const overallQuality = Math.round(active.reduce((s, d) => s + d.quality * (STANDING_WEIGHTS[d.key] / wsum), 0));
  const suggestedGrade = qualityToGrade(overallQuality);

  // Kurze Begründung: schwächster und stärkster Bereich.
  const sorted = [...active].sort((a, b) => a.quality - b.quality);
  const weak = sorted[0];
  const strong = sorted[sorted.length - 1];
  let summary = `Vorschlag auf Basis von ${active.map((d) => d.label).join(', ')}.`;
  if (weak && weak.quality < 60) summary += ` Schwerpunkt zum Verbessern: ${weak.label} (${weak.detail}).`;
  if (strong && strong.quality >= 80 && strong !== weak) summary += ` Stark: ${strong.label}.`;

  return { available: true, dimensions: dims, overallQuality, suggestedGrade, suggestedGradeHalf: toHalfGrade(suggestedGrade), summary };
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
