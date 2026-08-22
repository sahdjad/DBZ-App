// REST-API der DBZ-App. Alle Routen hängen unter /api.
//
// Sicherheit: Jede sensible Route prüft serverseitig Rolle UND Scope
// (Klasse/Besitz). Siehe server/rbac.js und docs/SECURITY_PRIVACY.md.

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import { db, newId, UPLOAD_DIR } from './store.js';
import { persistUpload, readFile } from './files.js';
import { hashPassword, verifyPassword, issueToken, clearToken, readToken } from './auth.js';
import {
  ROLES,
  ROLE_LABELS,
  ALL_ROLES,
  isAdmin,
  isClassManager,
  canManageClass,
  canViewStudent,
  requireRole,
  CLASS_MANAGERS,
  TEACHING_ROLES,
} from './rbac.js';
import {
  attendanceStatusFor,
  issueQrToken,
  verifyQrToken,
  audit,
  notify,
} from './domain.js';
import { SUBJECTS, findSubject, DEFAULT_ORG, ABSENCE_REASONS, BEHAVIOR_CATEGORIES } from './content.js';
import { SURAHS, surahByN, ayahSpan } from './quran.js';
import { listSurahs, getSurah } from './providers/quranProvider.js';
import { getTafsir, listTafsirEditions } from './providers/tafsirProvider.js';
import { getTajweedSurah } from './providers/tajweedProvider.js';
import { getChapterAudio, CHAPTER_RECITERS } from './providers/chapterAudioProvider.js';
import { createLoginThrottle } from './security.js';
import { sendEmail, emailMode } from './providers/emailProvider.js';

const loginThrottle = createLoginThrottle({ max: 8, windowMs: 10 * 60 * 1000 });
const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

const router = express.Router();

// Öffentlicher Health-/Diagnose-Endpunkt: zeigt an, ob der Server läuft und
// welches Speicher-Backend aktiv ist ("supabase" = dauerhaft, "file" = lokal).
// Enthält bewusst keine sensiblen Daten.
router.get('/health', (_req, res) => {
  res.json({ ok: true, storage: db.backend, time: new Date().toISOString() });
});

// --- Datensatz-Helfer --------------------------------------------------------

const byId = (coll, id) => db.all(coll).find((x) => x.id === id) || null;
const findUserById = (id) => byId('users', id);
const findUserByEmail = (email) =>
  db.all('users').find((u) => u.email.toLowerCase() === (email || '').toLowerCase()) || null;
const findClass = (id) => byId('classes', id);
const org = () => db.all('organizations')[0] || DEFAULT_ORG;

/** Öffentlich sichtbare Nutzerfelder (nie passwordHash oder Familien-Code). */
function publicUser(u) {
  if (!u) return null;
  const { passwordHash, familyCode, ...rest } = u;
  return { ...rest, roleLabel: ROLE_LABELS[u.role] || u.role };
}

/** Minimaler Klassenlisten-Eintrag (docs/SECURITY_PRIVACY.md §8). */
function minimalStudent(u) {
  return { id: u.id, name: u.name, role: u.role };
}

/** Klassen, die der Nutzer sehen darf. */
function visibleClasses(user) {
  const classes = db.all('classes');
  if (isAdmin(user)) return classes;
  if (CLASS_MANAGERS.includes(user.role))
    return classes.filter((c) => (user.classIds || []).includes(c.id));
  if (user.role === ROLES.ELTERN) {
    const childClassIds = new Set();
    (user.childIds || []).forEach((cid) => {
      const child = findUserById(cid);
      (child?.classIds || []).forEach((c) => childClassIds.add(c));
    });
    return classes.filter((c) => childClassIds.has(c.id));
  }
  // Schüler / Klassensprecher: eigene Klassen
  return classes.filter((c) => (user.classIds || []).includes(c.id));
}

const todayKey = () => new Date().toISOString().slice(0, 10);

/** Kombiniert ein Datum (YYYY-MM-DD) mit einer Uhrzeit (HH:MM) zu ISO. */
function combineDateTime(dateKey, time) {
  return new Date(`${dateKey}T${time || '00:00'}:00`).toISOString();
}

/** Findet oder erstellt die heutige Sitzung einer Klasse. */
function ensureTodaySession(klass) {
  const date = todayKey();
  let s = db.all('sessions').find((x) => x.classId === klass.id && x.date === date);
  if (!s) {
    s = {
      id: newId('sess'),
      classId: klass.id,
      subjectId: null,
      date,
      scheduledStart: combineDateTime(date, klass.startTime),
      scheduledEnd: combineDateTime(date, klass.endTime),
      status: 'scheduled', // scheduled | active | ended
      qr: null,
      startedAt: null,
      endedAt: null,
      createdAt: new Date().toISOString(),
    };
    db.insert('sessions', s);
  }
  return s;
}

/** Fester Check-in-Code der Klasse für den aufhängbaren Tür-QR (stabil, einmalig erzeugt). */
function ensureClassCheckinCode(klass) {
  if (!klass.checkinCode) {
    klass.checkinCode = 'TUR-' + crypto.randomBytes(6).toString('base64url');
    db.commit();
  }
  return klass.checkinCode;
}

/**
 * Ist der Tür-Check-in gerade möglich? Öffnet automatisch rund um die
 * Unterrichtszeit (ohne dass die Lehrkraft anwesend sein muss). Die Lehrkraft
 * kann das Fenster per Fernöffnung setzen/verlängern. Rückgabe { open, reason }.
 */
function doorCheckinOpen(session) {
  const now = Date.now();
  if (!session) return { open: false, reason: 'Heute ist kein Unterricht geplant.' };
  if (session.status === 'ended') return { open: false, reason: 'Der Unterricht ist bereits beendet.' };
  if (session.checkinOpenUntil && now < new Date(session.checkinOpenUntil).getTime()) return { open: true };
  if (session.status === 'active') return { open: true };
  // Automatisch nur am Unterrichtstag der Klasse (sonst nur manuell/aktiv geöffnet).
  const klass = findClass(session.classId);
  if (klass && typeof klass.weekday === 'number' && klass.weekday !== new Date().getDay())
    return { open: false, reason: 'Heute ist kein Unterrichtstag dieser Klasse.' };
  const start = new Date(session.scheduledStart).getTime();
  const EARLY_MS = 15 * 60000;
  const windowMin = org().checkinWindowMinutes || 90;
  if (now < start - EARLY_MS) return { open: false, reason: 'Check-in öffnet automatisch kurz vor Unterrichtsbeginn.' };
  if (now <= start + windowMin * 60000) return { open: true };
  return { open: false, reason: 'Das Check-in-Fenster ist vorbei. Bitte die Lehrkraft, es zu öffnen.' };
}

// --- Auth-Middleware ---------------------------------------------------------

function requireAuth(req, res, next) {
  const payload = readToken(req);
  if (!payload) return res.status(401).json({ error: 'Nicht angemeldet' });
  const user = findUserById(payload.id);
  if (!user) return res.status(401).json({ error: 'Sitzung ungültig' });
  if (user.status === 'disabled')
    return res.status(403).json({ error: 'Konto ist deaktiviert' });
  req.user = user;
  next();
}

// --- Datei-Uploads (Audio / PDF / Bild) --------------------------------------

const ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${newId('file')}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB (Audio-Kostenkontrolle, COST_STRATEGY.md)
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error('Dateityp nicht erlaubt (nur Audio, PDF, Bild)'));
  },
});

// =============================================================================
// Auth
// =============================================================================

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const key = `${(email || '').toLowerCase()}|${req.ip}`;
  if (loginThrottle.blocked(key))
    return res.status(429).json({ error: 'Zu viele Fehlversuche. Bitte in einigen Minuten erneut versuchen.' });

  const user = findUserByEmail(email);
  if (!user || !(await verifyPassword(password || '', user.passwordHash))) {
    loginThrottle.fail(key);
    return res.status(401).json({ error: 'E-Mail oder Passwort ist falsch' });
  }
  if (user.status === 'pending')
    return res.status(403).json({ error: 'Konto wartet auf Freigabe durch die DBZ-Leitung' });
  if (user.status === 'disabled')
    return res.status(403).json({ error: 'Konto ist deaktiviert' });
  loginThrottle.succeed(key);
  issueToken(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/auth/logout', (_req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

router.get('/auth/me', (req, res) => {
  const payload = readToken(req);
  if (!payload) return res.json({ user: null });
  res.json({ user: publicUser(findUserById(payload.id)) });
});

router.patch('/me', requireAuth, (req, res) => {
  const { name } = req.body || {};
  if (name && name.trim()) {
    req.user.name = name.trim();
    db.commit();
  }
  res.json({ user: publicUser(req.user) });
});

router.patch('/me/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!(await verifyPassword(currentPassword || '', req.user.passwordHash)))
    return res.status(400).json({ error: 'Aktuelles Passwort ist falsch' });
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'Das neue Passwort muss mindestens 6 Zeichen lang sein' });
  req.user.passwordHash = await hashPassword(newPassword);
  db.commit();
  audit(req.user.id, 'user.password_change', 'user', req.user.id);
  res.json({ ok: true });
});

// =============================================================================
// Einladungen & Selbst-Registrierung (öffentlich, ohne Login)
// =============================================================================

const hashInviteToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const findInviteByToken = (token) => db.all('invites').find((i) => i.tokenHash === hashInviteToken(token || ''));

function validateInvite(inv) {
  if (!inv) return { ok: false, reason: 'ungültig' };
  if (inv.revoked) return { ok: false, reason: 'widerrufen' };
  if (new Date(inv.expiresAt).getTime() < Date.now()) return { ok: false, reason: 'abgelaufen' };
  if (inv.usedCount >= inv.maxUses) return { ok: false, reason: 'aufgebraucht' };
  return { ok: true };
}

function inviteView(inv) {
  const now = Date.now();
  let status = 'aktiv';
  if (inv.revoked) status = 'widerrufen';
  else if (new Date(inv.expiresAt).getTime() < now) status = 'abgelaufen';
  else if (inv.usedCount >= inv.maxUses) status = 'aufgebraucht';
  return {
    id: inv.id,
    role: inv.intendedRole,
    roleLabel: ROLE_LABELS[inv.intendedRole] || inv.intendedRole,
    className: inv.classId ? findClass(inv.classId)?.name : null,
    childName: inv.childId ? findUserById(inv.childId)?.name : null,
    expiresAt: inv.expiresAt,
    maxUses: inv.maxUses,
    usedCount: inv.usedCount,
    status,
    createdAt: inv.createdAt,
  };
}

// Einladung prüfen (öffentlich) – zeigt Rolle/Klasse für die Registrierungsseite.
router.get('/invite/:token', (req, res) => {
  const inv = findInviteByToken(req.params.token);
  const v = validateInvite(inv);
  if (!v.ok) return res.status(400).json({ valid: false, reason: v.reason });
  res.json({
    valid: true,
    role: inv.intendedRole,
    roleLabel: ROLE_LABELS[inv.intendedRole] || inv.intendedRole,
    className: inv.classId ? findClass(inv.classId)?.name : null,
    orgName: org().name,
  });
});

// Selbst-Registrierung per Einladung (öffentlich).
router.post('/auth/register', async (req, res) => {
  const { token, name, email, password } = req.body || {};
  const inv = findInviteByToken(token || '');
  const v = validateInvite(inv);
  if (!v.ok) return res.status(400).json({ error: `Einladung ${v.reason}. Bitte neuen Einladungslink anfordern.` });
  if (!name || !name.trim() || !email || !email.trim() || !password)
    return res.status(400).json({ error: 'Name, E-Mail und Passwort sind erforderlich' });
  if (password.length < 6) return res.status(400).json({ error: 'Das Passwort muss mindestens 6 Zeichen lang sein' });
  if (findUserByEmail(email)) return res.status(409).json({ error: 'Diese E-Mail ist bereits registriert' });

  const user = {
    id: newId('user'),
    name: name.trim(),
    email: email.trim(),
    passwordHash: await hashPassword(password),
    role: inv.intendedRole,
    classIds: inv.classId ? [inv.classId] : [],
    childIds: inv.childId ? [inv.childId] : [],
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  db.insert('users', user);
  inv.usedCount += 1;
  db.commit();
  audit(user.id, 'user.register', 'user', user.id, null, { via: 'invite', role: inv.intendedRole });
  issueToken(res, user);
  res.json({ user: publicUser(user) });
});

// Passwort vergessen: erzeugt Reset-Token und versendet Link (Provider).
// Antwortet immer 200 (keine Konto-Enumeration). Im log-Modus (ohne E-Mail-Anbindung)
// wird der Link zurückgegeben, damit die DBZ ihn manuell weitergeben kann.
router.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  const user = findUserByEmail(email || '');
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  let devLink;
  if (user && user.status !== 'disabled') {
    const token = crypto.randomBytes(24).toString('base64url');
    db.insert('password_resets', {
      id: newId('pr'),
      tokenHash: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 Stunde
      used: false,
      createdAt: new Date().toISOString(),
    });
    const link = `${appUrl}/#/passwort-neu?token=${token}`;
    await sendEmail({
      to: user.email,
      subject: 'DBZ – Passwort zurücksetzen',
      text: `As-salāmu ʿalaykum,\n\nsetze dein DBZ-Passwort über diesen Link zurück (1 Stunde gültig):\n${link}\n\nFalls du das nicht warst, ignoriere diese E-Mail.`,
    });
    // Der Link wird NIE an den Anfragenden zurückgegeben (Schutz vor Übernahme);
    // Zustellung nur per E-Mail bzw. Server-Log. Nur mit explizitem Flag (Tests).
    if (process.env.EXPOSE_RESET_LINK === '1') devLink = link;
  }
  res.json({ ok: true, ...(devLink ? { devLink } : {}) });
});

router.get('/auth/reset/:token', (req, res) => {
  const pr = db.all('password_resets').find((p) => p.tokenHash === sha256(req.params.token));
  if (!pr || pr.used || new Date(pr.expiresAt).getTime() < Date.now())
    return res.status(400).json({ valid: false });
  res.json({ valid: true });
});

router.post('/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body || {};
  const pr = db.all('password_resets').find((p) => p.tokenHash === sha256(token || ''));
  if (!pr || pr.used || new Date(pr.expiresAt).getTime() < Date.now())
    return res.status(400).json({ error: 'Link ungültig oder abgelaufen. Bitte neu anfordern.' });
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'Das neue Passwort muss mindestens 6 Zeichen lang sein' });
  const user = findUserById(pr.userId);
  if (!user) return res.status(400).json({ error: 'Konto nicht gefunden' });
  user.passwordHash = await hashPassword(newPassword);
  pr.used = true;
  db.commit();
  audit(user.id, 'user.password_reset', 'user', user.id, null, { via: 'self-service' });
  res.json({ ok: true });
});

// =============================================================================
// Organisation (Social Links, Einstellungen)
// =============================================================================

router.get('/org', requireAuth, (_req, res) => {
  const o = org();
  res.json({
    org: {
      name: o.name,
      shortName: o.shortName,
      primaryColor: o.primaryColor,
      socialLinks: o.socialLinks,
      lateAfterMinutes: o.lateAfterMinutes,
      audioRetentionDays: o.audioRetentionDays ?? 0,
    },
  });
});

router.patch('/org', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.LEITUNG), (req, res) => {
  const o = db.all('organizations')[0];
  if (!o) return res.status(404).json({ error: 'Organisation nicht gefunden' });
  const before = JSON.parse(JSON.stringify(o));
  const { socialLinks, lateAfterMinutes, name, audioRetentionDays } = req.body || {};
  if (socialLinks && typeof socialLinks === 'object') o.socialLinks = { ...o.socialLinks, ...socialLinks };
  if (Number.isFinite(lateAfterMinutes)) o.lateAfterMinutes = Math.max(0, Math.min(60, lateAfterMinutes));
  if (Number.isFinite(audioRetentionDays)) o.audioRetentionDays = Math.max(0, Math.min(3650, audioRetentionDays));
  if (name && name.trim()) o.name = name.trim();
  db.commit();
  audit(req.user.id, 'org.update', 'organization', o.id, before, o);
  res.json({ ok: true });
});

// =============================================================================
// Klassen
// =============================================================================

router.get('/classes', requireAuth, (req, res) => {
  const classes = visibleClasses(req.user).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    language: c.language,
    weekday: c.weekday,
    startTime: c.startTime,
    endTime: c.endTime,
    studentCount: db.all('users').filter((u) => u.role === ROLES.SCHUELER && (u.classIds || []).includes(c.id)).length,
  }));
  res.json({ classes });
});

router.get('/classes/:id/students', requireAuth, (req, res) => {
  const klass = findClass(req.params.id);
  if (!klass) return res.status(404).json({ error: 'Klasse nicht gefunden' });
  const students = db
    .all('users')
    .filter((u) => u.role === ROLES.SCHUELER && (u.classIds || []).includes(klass.id));
  // Verwalter sehen Details, andere Klassenmitglieder nur eine minimale Liste.
  if (canManageClass(req.user, klass.id)) {
    return res.json({ students: students.map(publicUser) });
  }
  const isMember = (req.user.classIds || []).includes(klass.id);
  if (!isMember) return res.status(403).json({ error: 'Kein Zugriff auf diese Klasse' });
  res.json({ students: students.map(minimalStudent) });
});

// =============================================================================
// Unterrichtssitzungen & Anwesenheit
// =============================================================================

// Heutige Sitzung(en) für den Nutzer.
router.get('/sessions/today', requireAuth, (req, res) => {
  const classes = visibleClasses(req.user);
  const managed = classes.filter((c) => canManageClass(req.user, c.id));
  // Für Verwalter: Sitzung sicher anlegen; für Schüler nur vorhandene zeigen.
  const source = managed.length ? managed : classes;
  const sessions = source.map((c) => {
    const s = canManageClass(req.user, c.id)
      ? ensureTodaySession(c)
      : db.all('sessions').find((x) => x.classId === c.id && x.date === todayKey());
    if (!s) return null;
    return sessionView(s, c, req.user);
  }).filter(Boolean);
  res.json({ sessions });
});

function sessionView(s, klass, user) {
  const view = {
    id: s.id,
    classId: s.classId,
    className: klass?.name,
    date: s.date,
    scheduledStart: s.scheduledStart,
    scheduledEnd: s.scheduledEnd,
    status: s.status,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    hasActiveQr:
      !!s.qr && !s.qr.revoked && new Date(s.qr.expiresAt).getTime() > Date.now(),
    checkinOpenUntil: s.checkinOpenUntil || null,
    doorOpen: doorCheckinOpen(s).open,
  };
  // eigener Anwesenheitsstatus des Schülers
  if (user?.role === ROLES.SCHUELER) {
    const rec = db.all('attendance').find((a) => a.sessionId === s.id && a.studentId === user.id);
    view.myAttendance = rec ? { status: rec.status, minutesLate: rec.minutesLate } : null;
  }
  return view;
}

router.post('/sessions/:id/start', requireAuth, (req, res) => {
  const s = byId('sessions', req.params.id);
  if (!s) return res.status(404).json({ error: 'Sitzung nicht gefunden' });
  if (!canManageClass(req.user, s.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  s.status = 'active';
  s.startedAt = s.startedAt || new Date().toISOString();
  db.commit();
  audit(req.user.id, 'session.start', 'session', s.id);
  res.json({ session: sessionView(s, findClass(s.classId), req.user) });
});

router.post('/sessions/:id/end', requireAuth, (req, res) => {
  const s = byId('sessions', req.params.id);
  if (!s) return res.status(404).json({ error: 'Sitzung nicht gefunden' });
  if (!canManageClass(req.user, s.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  s.status = 'ended';
  s.endedAt = new Date().toISOString();
  if (s.qr) s.qr.revoked = true;
  db.commit();
  audit(req.user.id, 'session.end', 'session', s.id);
  res.json({ session: sessionView(s, findClass(s.classId), req.user) });
});

// QR-Token erzeugen (nur Verwalter). Klartext wird einmalig zurückgegeben.
router.post('/sessions/:id/qr', requireAuth, (req, res) => {
  const s = byId('sessions', req.params.id);
  if (!s) return res.status(404).json({ error: 'Sitzung nicht gefunden' });
  if (!canManageClass(req.user, s.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  if (s.status !== 'active') return res.status(400).json({ error: 'Sitzung ist nicht aktiv' });
  const token = issueQrToken(s, org().qrTokenTtlSeconds);
  db.commit();
  res.json({ token, expiresAt: s.qr.expiresAt });
});

// Fester Tür-QR-Code der Klasse (zum Aufhängen). Stabil; Gültigkeit ist zeitgesteuert.
router.get('/classes/:id/checkin-qr', requireAuth, (req, res) => {
  const klass = findClass(req.params.id);
  if (!klass) return res.status(404).json({ error: 'Klasse nicht gefunden' });
  if (!canManageClass(req.user, klass.id)) return res.status(403).json({ error: 'Kein Zugriff' });
  const code = ensureClassCheckinCode(klass);
  const session = ensureTodaySession(klass);
  res.json({
    code,
    className: klass.name,
    startTime: klass.startTime,
    endTime: klass.endTime,
    window: doorCheckinOpen(session),
    checkinOpenUntil: session.checkinOpenUntil || null,
  });
});

// Lehrkraft öffnet/verlängert das Check-in-Fenster aus der Ferne (z. B. vom Handy).
router.post('/sessions/:id/checkin-open', requireAuth, (req, res) => {
  const s = byId('sessions', req.params.id);
  if (!s) return res.status(404).json({ error: 'Sitzung nicht gefunden' });
  if (!canManageClass(req.user, s.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  const minutes = Math.min(Math.max(parseInt(req.body?.minutes, 10) || 30, 5), 180);
  s.checkinOpenUntil = new Date(Date.now() + minutes * 60000).toISOString();
  if (s.status === 'ended') s.status = 'scheduled';
  db.commit();
  audit(req.user.id, 'session.checkin_open', 'session', s.id, null, { minutes });
  res.json({ session: sessionView(s, findClass(s.classId), req.user) });
});

// Tür-Code neu erzeugen – alte Fotos/Ausdrucke werden dadurch ungültig.
router.post('/classes/:id/checkin-qr/rotate', requireAuth, (req, res) => {
  const klass = findClass(req.params.id);
  if (!klass) return res.status(404).json({ error: 'Klasse nicht gefunden' });
  if (!canManageClass(req.user, klass.id)) return res.status(403).json({ error: 'Kein Zugriff' });
  klass.checkinCode = 'TUR-' + crypto.randomBytes(6).toString('base64url');
  db.commit();
  audit(req.user.id, 'class.checkin_code_rotate', 'class', klass.id);
  res.json({ code: klass.checkinCode });
});

// Schüler-Check-in per QR-Token (Serverzeit, Verspätung serverseitig berechnet).
router.post('/checkin', requireAuth, requireRole(ROLES.SCHUELER), (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Kein QR-Code übermittelt' });
  const myClassIds = req.user.classIds || [];
  let session = null;
  if (String(token).startsWith('TUR-')) {
    // Fester Tür-QR der Klasse: gültig nur im automatischen/geöffneten Zeitfenster.
    const klass = db.all('classes').find((c) => c.checkinCode === token && myClassIds.includes(c.id));
    if (!klass) return res.status(400).json({ error: 'Dieser QR-Code gehört nicht zu deiner Klasse.' });
    session = ensureTodaySession(klass);
    const win = doorCheckinOpen(session);
    if (!win.open) return res.status(400).json({ error: win.reason });
  } else {
    // Kurzlebiger Sitzungs-Code (auf dem Lehrer-Bildschirm angezeigt).
    const active = db
      .all('sessions')
      .filter((s) => myClassIds.includes(s.classId) && s.status === 'active');
    session = active.find((s) => verifyQrToken(s, token).ok);
    if (!session)
      return res.status(400).json({ error: 'QR-Code ungültig oder abgelaufen' });
  }

  const existing = db
    .all('attendance')
    .find((a) => a.sessionId === session.id && a.studentId === req.user.id);
  if (existing)
    return res.json({ status: existing.status, minutesLate: existing.minutesLate, already: true });

  const now = new Date().toISOString();
  const { status, minutesLate } = attendanceStatusFor({
    checkInAt: now,
    scheduledStart: session.scheduledStart,
    lateAfterMinutes: org().lateAfterMinutes,
  });
  const rec = {
    id: newId('att'),
    sessionId: session.id,
    classId: session.classId,
    studentId: req.user.id,
    status,
    checkInAt: now,
    minutesLate,
    source: 'qr',
    confirmedBy: null,
    note: null,
    updatedAt: now,
  };
  db.insert('attendance', rec);
  audit(req.user.id, 'attendance.checkin', 'attendance', rec.id, null, { status, minutesLate });
  res.json({ status, minutesLate });
});

// Live-Anwesenheit einer Sitzung (Verwalter).
router.get('/sessions/:id/attendance', requireAuth, (req, res) => {
  const s = byId('sessions', req.params.id);
  if (!s) return res.status(404).json({ error: 'Sitzung nicht gefunden' });
  if (!canManageClass(req.user, s.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  const students = db
    .all('users')
    .filter((u) => u.role === ROLES.SCHUELER && (u.classIds || []).includes(s.classId));
  const records = db.all('attendance').filter((a) => a.sessionId === s.id);
  const list = students.map((st) => {
    const rec = records.find((a) => a.studentId === st.id);
    return {
      studentId: st.id,
      name: st.name,
      status: rec ? rec.status : 'open',
      minutesLate: rec ? rec.minutesLate : null,
      checkInAt: rec ? rec.checkInAt : null,
      source: rec ? rec.source : null,
    };
  });
  res.json({ session: sessionView(s, findClass(s.classId), req.user), attendance: list });
});

// Manuelle Anwesenheit setzen/korrigieren (Verwalter, auditiert).
router.post('/sessions/:id/attendance', requireAuth, (req, res) => {
  const s = byId('sessions', req.params.id);
  if (!s) return res.status(404).json({ error: 'Sitzung nicht gefunden' });
  if (!canManageClass(req.user, s.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  const { studentId, status, note } = req.body || {};
  const valid = ['present', 'late', 'excused', 'unexcused', 'left_early', 'remote', 'other'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });
  const student = findUserById(studentId);
  if (!student || !(student.classIds || []).includes(s.classId))
    return res.status(400).json({ error: 'Schüler gehört nicht zur Klasse' });

  let rec = db.all('attendance').find((a) => a.sessionId === s.id && a.studentId === studentId);
  const before = rec ? { status: rec.status } : null;
  if (!rec) {
    rec = {
      id: newId('att'),
      sessionId: s.id,
      classId: s.classId,
      studentId,
      status,
      checkInAt: null,
      minutesLate: 0,
      source: 'manual',
      confirmedBy: req.user.id,
      note: note || null,
      updatedAt: new Date().toISOString(),
    };
    db.insert('attendance', rec);
  } else {
    rec.status = status;
    rec.note = note || rec.note;
    rec.source = 'manual';
    rec.confirmedBy = req.user.id;
    rec.updatedAt = new Date().toISOString();
    db.commit();
  }
  audit(req.user.id, 'attendance.correct', 'attendance', rec.id, before, { status });
  res.json({ ok: true });
});

// Anwesenheitsstatistik eines Schülers.
function attendanceStats(studentId) {
  const recs = db.all('attendance').filter((a) => a.studentId === studentId);
  const count = (st) => recs.filter((a) => a.status === st).length;
  const lateMinutes = recs.filter((a) => a.status === 'late').map((a) => a.minutesLate || 0);
  return {
    sessions: recs.length,
    present: count('present'),
    late: count('late'),
    excused: count('excused'),
    unexcused: count('unexcused'),
    leftEarly: count('left_early'),
    avgMinutesLate: lateMinutes.length
      ? Math.round(lateMinutes.reduce((a, b) => a + b, 0) / lateMinutes.length)
      : 0,
    // Kumulierte Gesamt-Verspätung in Minuten (Summe über alle Sitzungen).
    totalMinutesLate: lateMinutes.reduce((a, b) => a + b, 0),
  };
}

router.get('/me/attendance', requireAuth, (req, res) => {
  res.json({ stats: attendanceStats(req.user.id) });
});

// Zusammengeführtes Schüler-/Kind-Profil (Lehrer für Klassenschüler, Eltern für
// eigene Kinder, Schüler für sich selbst). Sichtbarkeit serverseitig erzwungen.
function studentAssignments(studentId) {
  return db
    .all('assignments')
    .filter((a) => targetsFor(a).includes(studentId))
    .map((a) => {
      const sub = db.all('submissions').find((s) => s.assignmentId === a.id && s.studentId === studentId);
      const review = sub ? db.all('reviews').find((r) => r.submissionId === sub.id) : null;
      const due = effectiveDue(a, studentId);
      const overdue = due ? new Date(due).getTime() < Date.now() : false;
      let status = 'not_opened';
      if (sub)
        status = sub.status === 'passed' ? 'passed' : sub.status === 'revision_required' ? 'revision_required' : 'submitted';
      else if (overdue) status = 'missed';
      return {
        id: a.id,
        title: a.title,
        subjectName: findSubject(a.subjectId)?.name || null,
        dueAt: due,
        status,
        gradeLabel: review?.gradeLabel || null,
      };
    })
    .sort((x, y) => (y.dueAt || '').localeCompare(x.dueAt || ''));
}

router.get('/students/:id/profile', requireAuth, (req, res) => {
  const student = findUserById(req.params.id);
  if (!student || student.role !== ROLES.SCHUELER)
    return res.status(404).json({ error: 'Schüler nicht gefunden' });
  if (!canViewStudent(req.user, student)) return res.status(403).json({ error: 'Kein Zugriff' });

  let behavior = db.all('behavior_records').filter((r) => r.studentId === student.id);
  if (req.user.role === ROLES.ELTERN) behavior = behavior.filter((r) => r.visibleToParent);
  else if (req.user.id === student.id) behavior = behavior.filter((r) => r.visibleToStudent);
  behavior = behavior
    .map((r) => ({
      id: r.id,
      category: r.category,
      categoryLabel: BEHAVIOR_CATEGORIES.find((c) => c.id === r.category)?.label || r.category,
      tone: r.tone,
      note: r.note,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({
    student: {
      id: student.id,
      name: student.name,
      classNames: (student.classIds || []).map((c) => findClass(c)?.name).filter(Boolean),
    },
    attendance: attendanceStats(student.id),
    assignments: studentAssignments(student.id),
    behavior,
    viewerRole: req.user.role,
  });
});

router.get('/classes/:id/attendance-overview', requireAuth, (req, res) => {
  const klass = findClass(req.params.id);
  if (!klass) return res.status(404).json({ error: 'Klasse nicht gefunden' });
  if (!canManageClass(req.user, klass.id)) return res.status(403).json({ error: 'Kein Zugriff' });
  const students = db
    .all('users')
    .filter((u) => u.role === ROLES.SCHUELER && (u.classIds || []).includes(klass.id));
  const rows = students.map((s) => ({ id: s.id, name: s.name, ...attendanceStats(s.id) }));
  res.json({ rows });
});

// Klassenliste mit Kennzahlen (Verwalter/Leitung): Anwesenheit, offene Aufgaben,
// offene Strafen und negative Verhaltensvermerke je Schüler – für einen schnellen
// Überblick und Sprung ins Schülerprofil.
router.get('/classes/:id/roster', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const klass = findClass(req.params.id);
  if (!klass) return res.status(404).json({ error: 'Klasse nicht gefunden' });
  if (!canManageClass(req.user, klass.id)) return res.status(403).json({ error: 'Kein Zugriff' });

  const students = db
    .all('users')
    .filter((u) => u.role === ROLES.SCHUELER && (u.classIds || []).includes(klass.id));
  const assignments = db.all('assignments');
  const submissions = db.all('submissions');
  const penalties = db.all('penalties');
  const behavior = db.all('behavior_records');
  const now = Date.now();

  const rows = students.map((s) => {
    const att = attendanceStats(s.id);
    const attendanceRate = att.sessions ? Math.round(((att.present + att.late) / att.sessions) * 100) : null;

    let openAssignments = 0;
    let overdueAssignments = 0;
    for (const a of assignments) {
      if (!targetsFor(a).includes(s.id)) continue;
      const sub = submissions.find((x) => x.assignmentId === a.id && x.studentId === s.id);
      const done = sub && ['submitted', 'passed'].includes(sub.status);
      if (done) continue;
      openAssignments += 1;
      const due = effectiveDue(a, s.id);
      if (due && new Date(due).getTime() < now) overdueAssignments += 1;
    }

    const openPen = penalties.filter((p) => p.studentId === s.id && p.status === 'approved');
    const penaltyMoney = openPen.filter((p) => p.type === 'money').reduce((x, p) => x + p.amount, 0);
    const penaltyPages = openPen.filter((p) => p.type === 'pages').reduce((x, p) => x + p.amount, 0);
    const negativeBehavior = behavior.filter((b) => b.studentId === s.id && b.tone === 'negative').length;

    return {
      id: s.id,
      name: s.name,
      attendanceRate,
      sessions: att.sessions,
      unexcused: att.unexcused,
      totalMinutesLate: att.totalMinutesLate,
      openAssignments,
      overdueAssignments,
      penaltyMoney,
      penaltyPages,
      negativeBehavior,
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  res.json({ class: { id: klass.id, name: klass.name }, rows });
});

// Schulweite Übersicht für die Leitung: Kennzahlen, offene Freigaben und eine
// Aufstellung je Klasse. Bündelt Anwesenheit, Strafen und Registrierungen.
router.get('/leadership/overview', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.LEITUNG), (_req, res) => {
  const users = db.all('users');
  const students = users.filter((u) => u.role === ROLES.SCHUELER);
  const classes = db.all('classes');
  const penalties = db.all('penalties');
  const openPen = penalties.filter((p) => p.status === 'approved');
  const rateOf = (s) => {
    const a = attendanceStats(s.id);
    return a.sessions ? ((a.present + a.late) / a.sessions) * 100 : null;
  };

  const counts = {
    classes: classes.length,
    students: students.length,
    parents: users.filter((u) => u.role === ROLES.ELTERN).length,
    teachers: users.filter((u) => [ROLES.KLASSENLEHRER, ROLES.VERTRETUNG].includes(u.role)).length,
    pendingUsers: users.filter((u) => u.status === 'pending').length,
  };
  const penaltySummary = {
    pendingApprovals: penalties.filter((p) => p.status === 'pending').length,
    openCount: openPen.length,
    openMoney: openPen.filter((p) => p.type === 'money').reduce((x, p) => x + p.amount, 0),
    openPages: openPen.filter((p) => p.type === 'pages').reduce((x, p) => x + p.amount, 0),
  };
  const classRows = classes
    .map((c) => {
      const cs = students.filter((s) => (s.classIds || []).includes(c.id));
      const rates = cs.map(rateOf).filter((r) => r !== null);
      const cids = new Set(cs.map((s) => s.id));
      const cp = openPen.filter((p) => cids.has(p.studentId));
      return {
        id: c.id,
        name: c.name,
        students: cs.length,
        attendanceRate: rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null,
        openMoney: cp.filter((p) => p.type === 'money').reduce((x, p) => x + p.amount, 0),
        openPages: cp.filter((p) => p.type === 'pages').reduce((x, p) => x + p.amount, 0),
        unexcused: cs.reduce((x, s) => x + attendanceStats(s.id).unexcused, 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  res.json({ counts, penalties: penaltySummary, classes: classRows });
});

// =============================================================================
// Kalender / Stundenplan
// =============================================================================

// Liefert Termine (Unterricht aus dem Klassen-Stundenplan + Hausaufgaben-Fristen)
// für einen Datumsbereich, rollenabhängig gefiltert.
router.get('/calendar', requireAuth, (req, res) => {
  const from = (req.query.from || todayKey()).slice(0, 10);
  const to = (req.query.to || from).slice(0, 10);
  const fromD = new Date(`${from}T00:00:00`);
  let toD = new Date(`${to}T23:59:59`);
  // Sicherheitslimit: höchstens ~1 Jahr berechnen (für die Jahresansicht)
  const maxTo = new Date(fromD.getTime() + 372 * 86400000);
  if (toD > maxTo) toD = maxTo;

  const classes = visibleClasses(req.user);
  const events = [];

  // Unterrichtstermine aus dem wöchentlichen Stundenplan
  for (let d = new Date(fromD); d <= toD; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    const dateKey = d.toISOString().slice(0, 10);
    for (const c of classes) {
      if (c.weekday !== dow) continue;
      const sess = db.all('sessions').find((s) => s.classId === c.id && s.date === dateKey);
      events.push({
        date: dateKey,
        type: 'lesson',
        title: c.name,
        time: `${c.startTime}–${c.endTime}`,
        status: sess?.status || 'scheduled',
      });
    }
  }

  // Hausaufgaben-Fristen
  const add = (a, due, who) => {
    if (!due) return;
    const d = new Date(due);
    if (d < fromD || d > toD) return;
    events.push({
      date: due.slice(0, 10),
      type: 'deadline',
      title: who ? `${a.title} · ${who}` : a.title,
      time: d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    });
  };
  if (req.user.role === ROLES.SCHUELER) {
    db.all('assignments').filter((a) => targetsFor(a).includes(req.user.id)).forEach((a) => add(a, effectiveDue(a, req.user.id)));
  } else if (req.user.role === ROLES.ELTERN) {
    (req.user.childIds || []).forEach((cid) => {
      const child = findUserById(cid);
      db.all('assignments').filter((a) => targetsFor(a).includes(cid)).forEach((a) => add(a, effectiveDue(a, cid), child?.name));
    });
  } else if (isClassManager(req.user)) {
    db.all('assignments').filter((a) => canManageClass(req.user, a.classId)).forEach((a) => add(a, a.dueAt));
  }

  // Persönliche Termine (nur eigene) inkl. Wiederholung
  for (const ev of db.all('events').filter((e) => e.userId === req.user.id)) {
    for (const occ of expandEvent(ev, fromD, toD)) {
      events.push({
        id: ev.id,
        date: occ,
        type: 'personal',
        title: ev.title,
        time: ev.allDay ? '' : [ev.startTime, ev.endTime].filter(Boolean).join('–'),
        startTime: ev.startTime || null,
        endTime: ev.endTime || null,
        allDay: !!ev.allDay,
        category: ev.category || 'other',
        note: ev.note || '',
        recurring: !!(ev.recurrence && ev.recurrence.freq),
      });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  res.json({ events });
});

// --- Persönliche Kalendertermine --------------------------------------------

const EVENT_CATS = ['dbz', 'personal', 'school', 'work', 'sport', 'other'];

/** Expandiert einen Termin (inkl. Wiederholung) zu den Vorkommen im Bereich. */
function expandEvent(ev, fromD, toD) {
  const base = new Date(`${ev.date}T00:00:00`);
  const rec = ev.recurrence && ev.recurrence.freq ? ev.recurrence : null;
  const out = [];
  if (!rec) {
    if (base >= fromD && base <= toD) out.push(ev.date);
    return out;
  }
  const until = rec.until ? new Date(`${rec.until}T23:59:59`) : toD;
  const end = until < toD ? until : toD;
  let cap = 0;
  for (const d = new Date(base); d <= end && cap < 400; cap++) {
    if (d >= fromD) out.push(d.toISOString().slice(0, 10));
    if (rec.freq === 'daily') d.setDate(d.getDate() + 1);
    else if (rec.freq === 'weekly') d.setDate(d.getDate() + 7);
    else if (rec.freq === 'monthly') d.setMonth(d.getMonth() + 1);
    else break;
  }
  return out;
}

function normalizeRecurrence(r) {
  if (r && ['daily', 'weekly', 'monthly'].includes(r.freq)) {
    return { freq: r.freq, until: /^\d{4}-\d{2}-\d{2}$/.test(r.until || '') ? r.until : null };
  }
  return null;
}

router.get('/events', requireAuth, (req, res) => {
  const list = db.all('events').filter((e) => e.userId === req.user.id).sort((a, b) => a.date.localeCompare(b.date));
  res.json({ events: list });
});

router.post('/events', requireAuth, (req, res) => {
  const { title, date, startTime, endTime, allDay, category, note, recurrence } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Titel erforderlich' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'Gültiges Datum erforderlich' });
  const ev = {
    id: newId('evt'),
    userId: req.user.id,
    title: title.trim(),
    date,
    allDay: !!allDay,
    startTime: allDay ? null : startTime || null,
    endTime: allDay ? null : endTime || null,
    category: EVENT_CATS.includes(category) ? category : 'other',
    note: (note || '').trim(),
    recurrence: normalizeRecurrence(recurrence),
    createdAt: new Date().toISOString(),
  };
  db.insert('events', ev);
  res.json({ event: ev });
});

router.patch('/events/:id', requireAuth, (req, res) => {
  const ev = byId('events', req.params.id);
  if (!ev || ev.userId !== req.user.id) return res.status(404).json({ error: 'Termin nicht gefunden' });
  const b = req.body || {};
  if (b.title !== undefined) ev.title = String(b.title).trim() || ev.title;
  if (b.date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) ev.date = b.date;
  if (b.allDay !== undefined) ev.allDay = !!b.allDay;
  if (b.startTime !== undefined) ev.startTime = ev.allDay ? null : b.startTime || null;
  if (b.endTime !== undefined) ev.endTime = ev.allDay ? null : b.endTime || null;
  if (b.category !== undefined && EVENT_CATS.includes(b.category)) ev.category = b.category;
  if (b.note !== undefined) ev.note = String(b.note).trim();
  if (b.recurrence !== undefined) ev.recurrence = normalizeRecurrence(b.recurrence);
  db.commit();
  res.json({ event: ev });
});

router.delete('/events/:id', requireAuth, (req, res) => {
  const list = db.all('events');
  const idx = list.findIndex((e) => e.id === req.params.id && e.userId === req.user.id);
  if (idx < 0) return res.status(404).json({ error: 'Termin nicht gefunden' });
  list.splice(idx, 1);
  db.commit();
  res.json({ ok: true });
});

// =============================================================================
// Abwesenheitsanträge
// =============================================================================

router.get('/absence-reasons', requireAuth, (_req, res) => res.json({ reasons: ABSENCE_REASONS }));

router.post('/absence-requests', requireAuth, (req, res) => {
  const { studentId, classId, requestType, reasonCategory, comment, sessionDate } = req.body || {};
  // Schüler stellt für sich; Eltern für ihr Kind.
  let targetStudentId = req.user.id;
  if (req.user.role === ROLES.ELTERN) {
    if (!(req.user.childIds || []).includes(studentId))
      return res.status(403).json({ error: 'Kein verknüpftes Kind' });
    targetStudentId = studentId;
  } else if (req.user.role !== ROLES.SCHUELER) {
    return res.status(403).json({ error: 'Nur Schüler oder Eltern können Anträge stellen' });
  }
  const student = findUserById(targetStudentId);
  const cid = classId || (student.classIds || [])[0];
  if (!cid) return res.status(400).json({ error: 'Keine Klasse zugeordnet' });
  const valid = ['absent', 'late', 'leave_early', 'other'];
  if (!valid.includes(requestType)) return res.status(400).json({ error: 'Ungültiger Antragstyp' });

  const reqItem = {
    id: newId('absreq'),
    studentId: targetStudentId,
    studentName: student.name,
    classId: cid,
    requestType,
    reasonCategory: reasonCategory || 'sonstiges',
    comment: comment || '',
    sessionDate: sessionDate || null,
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    createdAt: new Date().toISOString(),
  };
  db.insert('absence_requests', reqItem);
  // Verwalter der Klasse benachrichtigen.
  db.all('users')
    .filter((u) => canManageClass(u, cid) && !isAdmin(u))
    .forEach((t) =>
      notify(t.id, {
        type: 'absence_pending',
        level: 'warning',
        title: 'Neue Abwesenheitsmeldung',
        body: `${student.name} hat eine Abwesenheit gemeldet und wartet auf Entscheidung.`,
        deepLink: '/entschuldigungen',
      }),
    );
  res.json({ request: reqItem });
});

router.get('/absence-requests', requireAuth, (req, res) => {
  let list = db.all('absence_requests');
  if (req.user.role === ROLES.SCHUELER) {
    list = list.filter((r) => r.studentId === req.user.id);
  } else if (req.user.role === ROLES.ELTERN) {
    list = list.filter((r) => (req.user.childIds || []).includes(r.studentId));
  } else if (isClassManager(req.user)) {
    list = list.filter((r) => canManageClass(req.user, r.classId));
    // Zähler: wie oft war der Schüler insgesamt schon abwesend – Kontext für die Entscheidung.
    list = list.map((r) => {
      const recs = db.all('attendance').filter((a) => a.studentId === r.studentId);
      const absences = recs.filter((a) => a.status === 'excused' || a.status === 'unexcused').length;
      const requestCount = db.all('absence_requests').filter((x) => x.studentId === r.studentId).length;
      return { ...r, studentAbsences: absences, studentAbsenceRequests: requestCount };
    });
  } else {
    list = [];
  }
  // pending zuerst, dann nach Datum
  list = [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  res.json({ requests: list });
});

router.post('/absence-requests/:id/decide', requireAuth, (req, res) => {
  const item = byId('absence_requests', req.params.id);
  if (!item) return res.status(404).json({ error: 'Antrag nicht gefunden' });
  if (!canManageClass(req.user, item.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  const { decision } = req.body || {};
  const map = { approve: 'approved', reject: 'rejected', needs_info: 'needs_info' };
  if (!map[decision]) return res.status(400).json({ error: 'Ungültige Entscheidung' });
  const before = { status: item.status };
  item.status = map[decision];
  item.decidedBy = req.user.id;
  item.decidedAt = new Date().toISOString();
  db.commit();
  audit(req.user.id, 'absence.decide', 'absence_request', item.id, before, { status: item.status });
  notify(item.studentId, {
    type: 'absence_decided',
    level: decision === 'approve' ? 'info' : 'warning',
    title: 'Entscheidung zu deiner Abwesenheit',
    body:
      decision === 'approve'
        ? 'Deine Abwesenheit wurde genehmigt.'
        : decision === 'reject'
          ? 'Deine Abwesenheit wurde abgelehnt.'
          : 'Zu deiner Abwesenheit gibt es eine Rückfrage.',
    deepLink: '/abwesenheit',
  });
  res.json({ ok: true, status: item.status });
});

// =============================================================================
// Hausaufgaben
// =============================================================================

router.get('/subjects', requireAuth, (_req, res) => res.json({ subjects: SUBJECTS }));

router.post('/assignments', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const { classId, title, description, subjectId, type, dueAt, targetStudentIds } = req.body || {};
  if (!canManageClass(req.user, classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'Titel ist erforderlich' });
  const validTypes = ['audio', 'text', 'file', 'quran', 'mixed'];
  const a = {
    id: newId('asg'),
    classId,
    subjectId: findSubject(subjectId) ? subjectId : null,
    title: title.trim(),
    description: description || '',
    type: validTypes.includes(type) ? type : 'mixed',
    opensAt: new Date().toISOString(),
    dueAt: dueAt || null,
    targetType: targetStudentIds?.length ? 'students' : 'class',
    targetStudentIds: targetStudentIds || [],
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
  };
  db.insert('assignments', a);
  // Zielschüler benachrichtigen.
  targetsFor(a).forEach((sid) =>
    notify(sid, {
      type: 'assignment_new',
      level: 'info',
      title: 'Neue Hausaufgabe',
      body: `${a.title}`,
      deepLink: '/aufgaben',
    }),
  );
  audit(req.user.id, 'assignment.create', 'assignment', a.id);
  res.json({ assignment: a });
});

/** IDs der Schüler, für die eine Aufgabe gilt. */
function targetsFor(a) {
  if (a.targetType === 'students') return a.targetStudentIds;
  return db
    .all('users')
    .filter((u) => u.role === ROLES.SCHUELER && (u.classIds || []).includes(a.classId))
    .map((u) => u.id);
}

/** Effektive Deadline für einen Schüler (inkl. individueller Verlängerung). */
function effectiveDue(assignment, studentId) {
  const ext = db
    .all('extensions')
    .filter((e) => e.assignmentId === assignment.id && e.studentId === studentId)
    .sort((a, b) => b.newDueAt.localeCompare(a.newDueAt))[0];
  return ext ? ext.newDueAt : assignment.dueAt;
}

router.get('/assignments', requireAuth, (req, res) => {
  if (req.user.role === ROLES.SCHUELER) {
    const list = db
      .all('assignments')
      .filter((a) => targetsFor(a).includes(req.user.id))
      .map((a) => decorateForStudent(a, req.user.id));
    return res.json({ assignments: list.sort(byDueThenNew) });
  }
  if (isClassManager(req.user)) {
    const list = db
      .all('assignments')
      .filter((a) => canManageClass(req.user, a.classId))
      .map((a) => {
        const targets = targetsFor(a);
        const subs = db.all('submissions').filter((s) => s.assignmentId === a.id);
        return {
          ...a,
          className: findClass(a.classId)?.name,
          subjectName: findSubject(a.subjectId)?.name || null,
          targetCount: targets.length,
          submittedCount: subs.length,
          pendingReview: subs.filter((s) => s.status === 'submitted').length,
        };
      });
    return res.json({ assignments: list.sort(byDueThenNew) });
  }
  res.json({ assignments: [] });
});

function byDueThenNew(a, b) {
  const da = a.dueAt || '9999';
  const dbb = b.dueAt || '9999';
  if (da !== dbb) return da.localeCompare(dbb);
  return (b.createdAt || '').localeCompare(a.createdAt || '');
}

function decorateForStudent(a, studentId) {
  const sub = db.all('submissions').find((s) => s.assignmentId === a.id && s.studentId === studentId);
  const due = effectiveDue(a, studentId);
  const isOverdue = due ? new Date(due).getTime() < Date.now() : false;
  const isRevision = sub && sub.status === 'revision_required';
  // Nach dem Absenden gesperrt (10-Min-Kulanz), außer der Lehrer gab zur Überarbeitung frei.
  const GRACE_MS = 10 * 60 * 1000;
  const locked =
    !!sub && sub.status === 'submitted' && !isRevision && sub.submittedAt
      ? Date.now() - new Date(sub.submittedAt).getTime() > GRACE_MS
      : false;
  let studentStatus = 'not_opened';
  if (sub) {
    studentStatus =
      sub.status === 'passed'
        ? 'passed'
        : sub.status === 'revision_required'
          ? 'revision_required'
          : 'submitted';
  } else if (isOverdue) {
    studentStatus = 'missed';
  }
  return {
    id: a.id,
    classId: a.classId,
    className: findClass(a.classId)?.name,
    title: a.title,
    description: a.description,
    type: a.type,
    subjectName: findSubject(a.subjectId)?.name || null,
    dueAt: due,
    canSubmit: isRevision || (!isOverdue && !locked),
    locked,
    studentStatus,
  };
}

router.get('/assignments/:id', requireAuth, (req, res) => {
  const a = byId('assignments', req.params.id);
  if (!a) return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
  if (req.user.role === ROLES.SCHUELER) {
    if (!targetsFor(a).includes(req.user.id)) return res.status(403).json({ error: 'Kein Zugriff' });
    const sub = db.all('submissions').find((s) => s.assignmentId === a.id && s.studentId === req.user.id);
    const review = sub ? db.all('reviews').find((r) => r.submissionId === sub.id) : null;
    return res.json({ assignment: decorateForStudent(a, req.user.id), submission: sub || null, review });
  }
  if (!canManageClass(req.user, a.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  res.json({ assignment: a });
});

// Individuelle Fristverlängerung (Verwalter).
router.post('/assignments/:id/extend', requireAuth, (req, res) => {
  const a = byId('assignments', req.params.id);
  if (!a) return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
  if (!canManageClass(req.user, a.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  const { studentId, newDueAt, reason } = req.body || {};
  if (!targetsFor(a).includes(studentId)) return res.status(400).json({ error: 'Schüler ist kein Ziel der Aufgabe' });
  if (!newDueAt) return res.status(400).json({ error: 'Neue Frist erforderlich' });
  const ext = {
    id: newId('ext'),
    assignmentId: a.id,
    studentId,
    newDueAt,
    reason: reason || '',
    grantedBy: req.user.id,
    createdAt: new Date().toISOString(),
  };
  db.insert('extensions', ext);
  audit(req.user.id, 'assignment.extend', 'assignment', a.id, null, { studentId, newDueAt });
  notify(studentId, {
    type: 'extension_granted',
    level: 'info',
    title: 'Fristverlängerung',
    body: `Für "${a.title}" wurde deine Frist verlängert.`,
    deepLink: '/aufgaben',
  });
  res.json({ extension: ext });
});

// Abgabe (Schüler): Text + Datei(en). Deadline serverseitig geprüft.
router.post(
  '/assignments/:id/submit',
  requireAuth,
  requireRole(ROLES.SCHUELER),
  upload.array('files', 5),
  async (req, res) => {
    const a = byId('assignments', req.params.id);
    if (!a) return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
    if (!targetsFor(a).includes(req.user.id)) return res.status(403).json({ error: 'Kein Zugriff' });

    const due = effectiveDue(a, req.user.id);
    let sub = db.all('submissions').find((s) => s.assignmentId === a.id && s.studentId === req.user.id);
    const isRevision = sub && sub.status === 'revision_required';
    // Nach Deadline gesperrt – außer Überarbeitung nach Aufforderung.
    if (due && new Date(due).getTime() < Date.now() && !isRevision)
      return res.status(400).json({ error: 'Die Abgabefrist ist abgelaufen' });
    // Nach dem Absenden gesperrt (10-Min-Kulanz), außer der Lehrer gibt sie zur Überarbeitung frei.
    const GRACE_MS = 10 * 60 * 1000;
    if (sub && sub.status === 'submitted' && !isRevision &&
        Date.now() - new Date(sub.submittedAt).getTime() > GRACE_MS)
      return res.status(400).json({
        error: 'Diese Abgabe ist gesperrt. Bitte deine Lehrkraft, sie zurückzusetzen oder die Frist zu verlängern.',
      });

    // Dateien dauerhaft sichern (Supabase Storage), bevor wir bestätigen.
    await Promise.all((req.files || []).map((f) => persistUpload(f)));
    const files = (req.files || []).map((f) => ({
      id: newId('subfile'),
      filename: f.filename,
      originalName: f.originalname,
      mediaType: f.mimetype,
      size: f.size,
    }));
    const text = (req.body?.text || '').trim();
    if (!files.length && !text)
      return res.status(400).json({ error: 'Bitte Text eingeben oder eine Datei hochladen' });

    if (!sub) {
      sub = {
        id: newId('sub'),
        assignmentId: a.id,
        classId: a.classId,
        studentId: req.user.id,
        studentName: req.user.name,
        text,
        files,
        status: 'submitted',
        submittedAt: new Date().toISOString(),
      };
      db.insert('submissions', sub);
    } else {
      sub.text = text || sub.text;
      sub.files = [...sub.files, ...files];
      sub.status = 'submitted';
      sub.submittedAt = new Date().toISOString();
      db.commit();
    }
    // Verwalter benachrichtigen.
    db.all('users')
      .filter((u) => canManageClass(u, a.classId) && !isAdmin(u))
      .forEach((t) =>
        notify(t.id, {
          type: 'submission_new',
          level: 'info',
          title: 'Neue Abgabe',
          body: `${req.user.name} hat "${a.title}" abgegeben.`,
          deepLink: '/korrektur',
        }),
      );
    res.json({ submission: sub });
  },
);

// Datei einer Abgabe herunterladen (autorisiert; signierter Zugriff simuliert).
router.get('/submissions/:id/file/:fileId', requireAuth, async (req, res) => {
  const sub = byId('submissions', req.params.id);
  if (!sub) return res.status(404).json({ error: 'Nicht gefunden' });
  const student = findUserById(sub.studentId);
  const allowed =
    sub.studentId === req.user.id ||
    canManageClass(req.user, sub.classId) ||
    canViewStudent(req.user, student);
  if (!allowed) return res.status(403).json({ error: 'Kein Zugriff' });
  const file = sub.files.find((f) => f.id === req.params.fileId);
  if (!file || file.deleted) return res.status(404).json({ error: 'Datei fehlt' });
  const buf = await readFile(file.filename);
  if (!buf) return res.status(404).json({ error: 'Datei fehlt' });
  res.setHeader('Content-Type', file.mediaType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
  res.end(buf);
});

// Korrekturqueue einer Klasse (Verwalter).
router.get('/review-queue', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const subs = db
    .all('submissions')
    .filter((s) => canManageClass(req.user, s.classId))
    .map((s) => {
      const a = byId('assignments', s.assignmentId);
      const review = db.all('reviews').find((r) => r.submissionId === s.id);
      return {
        id: s.id,
        assignmentId: s.assignmentId,
        assignmentTitle: a?.title,
        className: findClass(s.classId)?.name,
        studentName: s.studentName,
        text: s.text,
        files: s.files,
        status: s.status,
        submittedAt: s.submittedAt,
        review: review || null,
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'submitted' ? -1 : 1;
      return (b.submittedAt || '').localeCompare(a.submittedAt || '');
    });
  res.json({ submissions: subs });
});

// Abgabe bewerten / Feedback (Verwalter, auditiert, bewusste Freigabe).
router.post('/submissions/:id/review', requireAuth, (req, res) => {
  const sub = byId('submissions', req.params.id);
  if (!sub) return res.status(404).json({ error: 'Abgabe nicht gefunden' });
  if (!canManageClass(req.user, sub.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  const { gradeLabel, feedbackText, outcome, tajwid, pronunciation, fluency, memorization, errorCount } =
    req.body || {};
  const passed = outcome === 'passed';
  let review = db.all('reviews').find((r) => r.submissionId === sub.id);
  const payload = {
    submissionId: sub.id,
    teacherId: req.user.id,
    gradeLabel: gradeLabel || null,
    feedbackText: feedbackText || '',
    tajwid: num(tajwid),
    pronunciation: num(pronunciation),
    fluency: num(fluency),
    memorization: num(memorization),
    errorCount: num(errorCount),
    releasedAt: new Date().toISOString(),
  };
  if (!review) {
    review = { id: newId('rev'), ...payload };
    db.insert('reviews', review);
  } else {
    Object.assign(review, payload);
    db.commit();
  }
  sub.status = passed ? 'passed' : 'revision_required';
  db.commit();
  audit(req.user.id, 'submission.review', 'submission', sub.id, null, { outcome: sub.status });
  notify(sub.studentId, {
    type: 'review_released',
    level: passed ? 'info' : 'warning',
    title: passed ? 'Deine Abgabe wurde bewertet' : 'Überarbeitung angefordert',
    body: passed ? 'Es gibt neues Feedback zu deiner Abgabe.' : 'Bitte überarbeite deine Abgabe.',
    deepLink: '/aufgaben',
  });
  res.json({ review, status: sub.status });
});

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

// =============================================================================
// Protokolle (Klassensprecher-Entwurf -> Lehrer-Freigabe)
// =============================================================================

router.get('/protocols', requireAuth, (req, res) => {
  let list = db.all('protocols');
  if (req.user.role === ROLES.KLASSENSPRECHER || req.user.role === ROLES.SCHUELER) {
    list = list.filter((p) => (req.user.classIds || []).includes(p.classId));
    // Reine Schüler sehen Protokolle erst, nachdem die Lehrkraft sie freigegeben hat.
    if (req.user.role === ROLES.SCHUELER) list = list.filter((p) => p.status === 'approved');
  } else if (isClassManager(req.user)) {
    list = list.filter((p) => canManageClass(req.user, p.classId));
  } else if (!isAdmin(req.user)) {
    list = [];
  }
  res.json({ protocols: [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) });
});

// Entwurf anlegen/aktualisieren (Klassensprecher der Klasse oder Verwalter).
router.post('/sessions/:id/protocol', requireAuth, (req, res) => {
  const s = byId('sessions', req.params.id);
  if (!s) return res.status(404).json({ error: 'Sitzung nicht gefunden' });
  const isRep =
    req.user.role === ROLES.KLASSENSPRECHER && (req.user.classIds || []).includes(s.classId);
  if (!isRep && !canManageClass(req.user, s.classId))
    return res.status(403).json({ error: 'Kein Zugriff' });
  const { content, protocolType } = req.body || {};
  let p = db.all('protocols').find((x) => x.sessionId === s.id);
  if (!p) {
    p = {
      id: newId('proto'),
      sessionId: s.id,
      classId: s.classId,
      protocolType: protocolType || 'unterricht',
      content: content || {},
      status: 'draft',
      createdBy: req.user.id,
      submittedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date().toISOString(),
    };
    db.insert('protocols', p);
  } else {
    if (p.status === 'approved') return res.status(400).json({ error: 'Protokoll ist bereits freigegeben' });
    p.content = content ?? p.content;
    if (protocolType) p.protocolType = protocolType;
    db.commit();
  }
  res.json({ protocol: p });
});

router.post('/protocols/:id/submit', requireAuth, (req, res) => {
  const p = byId('protocols', req.params.id);
  if (!p) return res.status(404).json({ error: 'Protokoll nicht gefunden' });
  const isRep =
    req.user.role === ROLES.KLASSENSPRECHER && (req.user.classIds || []).includes(p.classId);
  if (!isRep && !canManageClass(req.user, p.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  p.status = 'submitted';
  p.submittedAt = new Date().toISOString();
  db.commit();
  db.all('users')
    .filter((u) => canManageClass(u, p.classId) && !isAdmin(u))
    .forEach((t) =>
      notify(t.id, {
        type: 'protocol_submitted',
        level: 'info',
        title: 'Protokoll eingereicht',
        body: 'Ein Klassensprecher-Protokoll wartet auf Bestätigung.',
        deepLink: '/protokolle',
      }),
    );
  res.json({ protocol: p });
});

router.post('/protocols/:id/approve', requireAuth, (req, res) => {
  const p = byId('protocols', req.params.id);
  if (!p) return res.status(404).json({ error: 'Protokoll nicht gefunden' });
  if (!canManageClass(req.user, p.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  const { decision } = req.body || {};
  if (!['approve', 'return'].includes(decision)) return res.status(400).json({ error: 'Ungültige Entscheidung' });
  const before = { status: p.status };
  p.status = decision === 'approve' ? 'approved' : 'returned';
  p.reviewedBy = req.user.id;
  p.reviewedAt = new Date().toISOString();
  db.commit();
  audit(req.user.id, 'protocol.review', 'protocol', p.id, before, { status: p.status });
  // Nach Freigabe: Schüler der Klasse benachrichtigen (jetzt sichtbar).
  if (p.status === 'approved') {
    db.all('users')
      .filter((u) => u.role === ROLES.SCHUELER && (u.classIds || []).includes(p.classId))
      .forEach((st) =>
        notify(st.id, {
          type: 'protocol_submitted',
          level: 'info',
          title: 'Neues Protokoll',
          body: 'Ein Unterrichtsprotokoll wurde freigegeben.',
          deepLink: '/protokolle',
        }),
      );
  }
  res.json({ protocol: p });
});

// =============================================================================
// Verhalten / Tarbiyah
// =============================================================================

router.get('/behavior-categories', requireAuth, (_req, res) => res.json({ categories: BEHAVIOR_CATEGORIES }));

// Vermerk anlegen (Verwalter der Klasse). Sichtbarkeit für Schüler/Eltern steuerbar.
router.post('/behavior', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const { studentId, classId, category, note, tone, visibleToStudent, visibleToParent } = req.body || {};
  if (!canManageClass(req.user, classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  const student = findUserById(studentId);
  if (!student || !(student.classIds || []).includes(classId))
    return res.status(400).json({ error: 'Schüler gehört nicht zur Klasse' });
  if (!BEHAVIOR_CATEGORIES.some((c) => c.id === category))
    return res.status(400).json({ error: 'Ungültige Kategorie' });
  if (!note || !note.trim()) return res.status(400).json({ error: 'Bitte einen Vermerk eingeben' });

  const rec = {
    id: newId('beh'),
    studentId,
    studentName: student.name,
    classId,
    category,
    tone: tone === 'negative' ? 'negative' : 'positive',
    note: note.trim(),
    // Standard: Schüler sehen den Vermerk NICHT (erst mit dem Zeugnis); nur wenn ausdrücklich freigegeben.
    visibleToStudent: visibleToStudent === true,
    visibleToParent: visibleToParent !== false,
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
  };
  db.insert('behavior_records', rec);
  audit(req.user.id, 'behavior.create', 'behavior', rec.id, null, { category, tone: rec.tone });

  if (rec.visibleToStudent)
    notify(studentId, {
      type: 'behavior_new',
      level: rec.tone === 'negative' ? 'warning' : 'info',
      title: rec.tone === 'negative' ? 'Neuer Hinweis' : 'Positive Rückmeldung',
      body: rec.note,
      deepLink: '/verhalten',
    });
  if (rec.visibleToParent)
    db.all('users')
      .filter((u) => u.role === ROLES.ELTERN && (u.childIds || []).includes(studentId))
      .forEach((p) =>
        notify(p.id, {
          type: 'behavior_new',
          level: rec.tone === 'negative' ? 'warning' : 'info',
          title: `Rückmeldung zu ${student.name}`,
          body: rec.note,
          deepLink: '/verhalten',
        }),
      );
  res.json({ record: rec });
});

// Vermerke lesen – rollen- und sichtbarkeitsabhängig.
router.get('/behavior', requireAuth, (req, res) => {
  const all = db.all('behavior_records');
  let list;
  if (req.user.role === ROLES.SCHUELER) {
    list = all.filter((r) => r.studentId === req.user.id && r.visibleToStudent);
  } else if (req.user.role === ROLES.ELTERN) {
    const childId = req.query.studentId;
    if (childId && !(req.user.childIds || []).includes(childId))
      return res.status(403).json({ error: 'Kein verknüpftes Kind' });
    const ids = childId ? [childId] : req.user.childIds || [];
    list = all.filter((r) => ids.includes(r.studentId) && r.visibleToParent);
  } else if (isClassManager(req.user)) {
    list = all.filter((r) => canManageClass(req.user, r.classId));
    if (req.query.studentId) list = list.filter((r) => r.studentId === req.query.studentId);
  } else {
    list = [];
  }
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ records: list });
});

// =============================================================================
// Qur'an-Reader (über austauschbaren Provider)
// =============================================================================

router.get('/quran/surahs', requireAuth, (_req, res) => res.json({ surahs: listSurahs() }));

// Auswählbare Rezitatoren. Nur Rezitatoren mit durchgehender Sure-Aufnahme UND
// Ayah-Zeitmarken (quran.com) – so ist die lückenlose Wiedergabe für jede
// Auswahl gleich hochwertig.
const RECITERS = CHAPTER_RECITERS.map((r) => ({ id: r.id, name: r.name }));
router.get('/quran/reciters', requireAuth, (_req, res) => res.json({ reciters: RECITERS }));

// Durchgehende Audiodatei einer Sure + Ayah-Zeitmarken (für lückenlose
// Wiedergabe, Geschwindigkeit, Bereich/Wiederholung und Hervorhebung).
router.get('/quran/audio/:n', requireAuth, async (req, res) => {
  try {
    const data = await getChapterAudio(req.params.n, req.query.reciter);
    res.json({ audio: data });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Sure nicht gefunden' });
    if (err.code === 'PROVIDER_UNAVAILABLE')
      return res.status(503).json({ error: 'Audio konnte nicht geladen werden. Bitte Internetverbindung prüfen und erneut versuchen.' });
    res.status(500).json({ error: 'Serverfehler beim Laden des Audios' });
  }
});

// Persönlicher Qur'an-Zustand: zuletzt gelesen + Lesezeichen.
function quranState(userId) {
  let s = db.all('quran_marks').find((x) => x.userId === userId);
  if (!s) {
    s = { userId, lastSurah: null, bookmarks: [], updatedAt: null };
    db.insert('quran_marks', s);
  }
  return s;
}

router.get('/quran/me', requireAuth, (req, res) => {
  const s = quranState(req.user.id);
  res.json({
    lastRead: s.lastSurah ? { surah: s.lastSurah, surahName: surahByN(s.lastSurah)?.name } : null,
    bookmarks: s.bookmarks.map((b) => ({ ...b, surahName: surahByN(b.surah)?.name })),
  });
});

router.post('/quran/last-read', requireAuth, (req, res) => {
  const { surah } = req.body || {};
  if (!surahByN(surah)) return res.status(400).json({ error: 'Ungültige Sure' });
  const s = quranState(req.user.id);
  s.lastSurah = Number(surah);
  s.updatedAt = new Date().toISOString();
  db.commit();
  res.json({ ok: true });
});

// Lesezeichen umschalten (vorhandenes an gleicher Stelle wird entfernt).
router.post('/quran/bookmarks', requireAuth, (req, res) => {
  const { surah, ayah, note } = req.body || {};
  if (!surahByN(surah) || !ayah) return res.status(400).json({ error: 'Ungültige Angabe' });
  const s = quranState(req.user.id);
  const existing = s.bookmarks.find((b) => b.surah === Number(surah) && b.ayah === Number(ayah));
  if (existing) {
    s.bookmarks = s.bookmarks.filter((b) => b !== existing);
    db.commit();
    return res.json({ removed: true });
  }
  const b = { id: newId('bm'), surah: Number(surah), ayah: Number(ayah), note: note || '', createdAt: new Date().toISOString() };
  s.bookmarks.unshift(b);
  db.commit();
  res.json({ bookmark: { ...b, surahName: surahByN(b.surah)?.name } });
});

router.delete('/quran/bookmarks/:id', requireAuth, (req, res) => {
  const s = quranState(req.user.id);
  const before = s.bookmarks.length;
  s.bookmarks = s.bookmarks.filter((b) => b.id !== req.params.id);
  if (s.bookmarks.length === before) return res.status(404).json({ error: 'Nicht gefunden' });
  db.commit();
  res.json({ ok: true });
});

// Ayah-Notiz setzen (z. B. Tajwid-Fehler). Legt bei Bedarf ein Lesezeichen an
// (Upsert nach Sure+Ayah); leere Notiz entfernt nur den Text, nicht das Zeichen.
router.post('/quran/notes', requireAuth, (req, res) => {
  const { surah, ayah, note } = req.body || {};
  if (!surahByN(surah) || !ayah) return res.status(400).json({ error: 'Ungültige Angabe' });
  const s = quranState(req.user.id);
  let b = s.bookmarks.find((x) => x.surah === Number(surah) && x.ayah === Number(ayah));
  if (!b) {
    b = { id: newId('bm'), surah: Number(surah), ayah: Number(ayah), note: '', createdAt: new Date().toISOString() };
    s.bookmarks.unshift(b);
  }
  b.note = String(note || '').trim();
  db.commit();
  res.json({ bookmark: { ...b, surahName: surahByN(b.surah)?.name } });
});

// Tadschwid-Text (farbig markiert) einer Sure inkl. Seiten-/Juzʼ-Nummer.
router.get('/quran/tajweed/:n', requireAuth, async (req, res) => {
  try {
    const data = await getTajweedSurah(req.params.n);
    res.json({ surah: data });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Sure nicht gefunden' });
    if (err.code === 'PROVIDER_UNAVAILABLE')
      return res.status(503).json({ error: 'Tadschwid-Text konnte nicht geladen werden. Bitte später erneut versuchen.' });
    res.status(500).json({ error: 'Serverfehler beim Laden des Tadschwid-Texts' });
  }
});

// Tafsir-Ausgaben (as-Saʿdī arabisch, Ibn Kathīr englisch) und Inhalt pro Ayah.
router.get('/quran/tafsir-editions', requireAuth, (_req, res) => res.json({ editions: listTafsirEditions() }));

router.get('/quran/tafsir/:surah/:ayah', requireAuth, async (req, res) => {
  try {
    const data = await getTafsir(req.params.surah, req.params.ayah, req.query.edition || 'saadi');
    res.json({ tafsir: data });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Ayah nicht gefunden' });
    if (err.code === 'PROVIDER_UNAVAILABLE')
      return res.status(503).json({ error: 'Tafsir konnte nicht geladen werden. Bitte später erneut versuchen.' });
    res.status(500).json({ error: 'Serverfehler beim Laden des Tafsir' });
  }
});

router.get('/quran/surah/:n', requireAuth, async (req, res) => {
  try {
    const data = await getSurah(req.params.n, {
      translation: req.query.translation || undefined,
      reciter: req.query.reciter || undefined,
    });
    res.json({ surah: data });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Sure nicht gefunden' });
    if (err.code === 'PROVIDER_UNAVAILABLE')
      return res.status(503).json({ error: 'Qur\'an-Daten konnten nicht geladen werden. Bitte Internetverbindung prüfen und erneut versuchen.' });
    res.status(500).json({ error: 'Serverfehler beim Laden der Sure' });
  }
});

// =============================================================================
// Hifz / Muraja'ah (Qur'an-Fortschritt)
// =============================================================================

const GOAL_TYPES = ['new_hifz', 'murajaah', 'consolidation', 'test'];

router.get('/surahs', requireAuth, (_req, res) => res.json({ surahs: SURAHS }));

function goalView(g) {
  const attempts = db.all('recitation_attempts').filter((a) => a.goalId === g.id).sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt));
  return {
    ...g,
    surahFromName: surahByN(g.surahFrom)?.name,
    surahToName: surahByN(g.surahTo)?.name,
    attemptCount: attempts.length,
    lastAttempt: attempts[0] || null,
  };
}

router.post('/quran-goals', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const { studentId, goalType, surahFrom, ayahFrom, surahTo, ayahTo, dueAt } = req.body || {};
  const student = findUserById(studentId);
  if (!student || student.role !== ROLES.SCHUELER) return res.status(404).json({ error: 'Schüler nicht gefunden' });
  const classId = (student.classIds || []).find((c) => canManageClass(req.user, c));
  if (!classId) return res.status(403).json({ error: 'Kein Zugriff' });
  const span = ayahSpan(surahFrom, ayahFrom, surahTo, ayahTo);
  if (!span) return res.status(400).json({ error: 'Ungültiger Ayah-Bereich' });

  const goal = {
    id: newId('goal'),
    studentId,
    studentName: student.name,
    classId,
    goalType: GOAL_TYPES.includes(goalType) ? goalType : 'new_hifz',
    surahFrom: Number(surahFrom),
    ayahFrom: Number(ayahFrom),
    surahTo: Number(surahTo),
    ayahTo: Number(ayahTo),
    ayatCount: span,
    dueAt: dueAt || null,
    status: 'open',
    assignedBy: req.user.id,
    createdAt: new Date().toISOString(),
  };
  db.insert('quran_goals', goal);
  audit(req.user.id, 'quran.goal', 'quran_goal', goal.id);
  notify(studentId, { type: 'hifz_goal', level: 'info', title: 'Neues Qur\'an-Ziel', body: `${surahByN(goal.surahFrom)?.name} ${goal.ayahFrom} – ${surahByN(goal.surahTo)?.name} ${goal.ayahTo}`, deepLink: '/hifz' });
  res.json({ goal: goalView(goal) });
});

router.get('/quran-goals', requireAuth, (req, res) => {
  let list = db.all('quran_goals');
  if (req.user.role === ROLES.SCHUELER) list = list.filter((g) => g.studentId === req.user.id);
  else if (req.user.role === ROLES.ELTERN) {
    const sid = req.query.studentId;
    if (sid && !(req.user.childIds || []).includes(sid)) return res.status(403).json({ error: 'Kein verknüpftes Kind' });
    const ids = sid ? [sid] : req.user.childIds || [];
    list = list.filter((g) => ids.includes(g.studentId));
  } else if (isClassManager(req.user)) {
    list = list.filter((g) => canManageClass(req.user, g.classId));
    if (req.query.studentId) list = list.filter((g) => g.studentId === req.query.studentId);
  } else list = [];
  list = list.map(goalView).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Fortschrittssumme (bestandene Hifz-/Festigungsziele)
  const memorizedAyat = list
    .filter((g) => g.status === 'passed' && (g.goalType === 'new_hifz' || g.goalType === 'consolidation'))
    .reduce((sum, g) => sum + g.ayatCount, 0);
  res.json({ goals: list, summary: { memorizedAyat } });
});

router.post('/quran-goals/:id/attempt', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const goal = byId('quran_goals', req.params.id);
  if (!goal) return res.status(404).json({ error: 'Ziel nicht gefunden' });
  if (!canManageClass(req.user, goal.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  const { tajwid, pronunciation, fluency, memorization, errorCount, passed, note } = req.body || {};
  const clamp = (v) => (v === undefined || v === null || v === '' ? null : Math.max(0, Math.min(10, Number(v))));
  const attempt = {
    id: newId('rec'),
    goalId: goal.id,
    studentId: goal.studentId,
    teacherId: req.user.id,
    attemptedAt: new Date().toISOString(),
    tajwid: clamp(tajwid),
    pronunciation: clamp(pronunciation),
    fluency: clamp(fluency),
    memorization: clamp(memorization),
    errorCount: errorCount === '' || errorCount === undefined ? null : Math.max(0, Number(errorCount)),
    passed: !!passed,
    note: note || '',
  };
  db.insert('recitation_attempts', attempt);
  if (passed) goal.status = 'passed';
  db.commit();
  audit(req.user.id, 'quran.attempt', 'quran_goal', goal.id, null, { passed: !!passed });
  notify(goal.studentId, {
    type: 'hifz_attempt',
    level: passed ? 'info' : 'warning',
    title: passed ? 'Qur\'an-Ziel bestanden' : 'Rezitation bewertet',
    body: `${surahByN(goal.surahFrom)?.name} ${goal.ayahFrom}–${goal.ayahTo}`,
    deepLink: '/hifz',
  });
  res.json({ attempt, goal: goalView(goal) });
});

router.get('/quran-goals/:id', requireAuth, (req, res) => {
  const goal = byId('quran_goals', req.params.id);
  if (!goal) return res.status(404).json({ error: 'Ziel nicht gefunden' });
  const student = findUserById(goal.studentId);
  const ok =
    (isClassManager(req.user) && canManageClass(req.user, goal.classId)) ||
    canViewStudent(req.user, student);
  if (!ok) return res.status(403).json({ error: 'Kein Zugriff' });
  const attempts = db.all('recitation_attempts').filter((a) => a.goalId === goal.id).sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt));
  res.json({ goal: goalView(goal), attempts });
});

// =============================================================================
// Prüfungen / Quiz
// =============================================================================

// Punkte einer Abgabe berechnen (Auto für Choice, manuell für Freitext).
function computeScores(exam, attempt) {
  let mc = 0;
  let manual = 0;
  let max = 0;
  let pendingText = 0;
  for (const q of exam.questions) {
    max += q.points || 0;
    const ans = (attempt.answers || []).find((a) => a.questionId === q.id) || {};
    if (q.type === 'text') {
      if (typeof ans.awardedPoints === 'number') manual += ans.awardedPoints;
      else pendingText++;
    } else {
      const sel = new Set(ans.selected || []);
      const cor = new Set(q.correct || []);
      if (cor.size > 0 && sel.size === cor.size && [...cor].every((c) => sel.has(c))) mc += q.points || 0;
    }
  }
  const total = mc + manual;
  return { total, max, pendingText, percent: max ? Math.round((total / max) * 100) : 0 };
}

// Prüfung ohne Lösungen (für Schüler beim Ablegen).
function examForStudent(exam) {
  return {
    id: exam.id,
    title: exam.title,
    description: exam.description,
    link: exam.link || null,
    subjectName: findSubject(exam.subjectId)?.name || null,
    passPercentage: exam.passPercentage,
    questions: exam.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      points: q.points,
      options: (q.options || []).map((o) => ({ id: o.id, text: o.text })),
    })),
  };
}

router.post('/exams', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const { classId, subjectId, title, description, passPercentage, questions, link, targetStudentIds } = req.body || {};
  if (!canManageClass(req.user, classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'Titel erforderlich' });
  const cleanLink = typeof link === 'string' && /^https?:\/\//i.test(link.trim()) ? link.trim() : '';
  const qList = Array.isArray(questions) ? questions : [];
  if (!cleanLink && qList.length === 0)
    return res.status(400).json({ error: 'Mindestens eine Frage oder ein Link erforderlich' });

  const parsed = qList.map((q, i) => {
    const type = ['single', 'multi', 'text'].includes(q.type) ? q.type : 'single';
    const options = type === 'text' ? [] : (q.options || []).map((o, j) => ({ id: `o${i}_${j}`, text: String(o.text || '').trim() }));
    const correct = type === 'text' ? [] : (q.correct || []).map((idx) => `o${i}_${idx}`);
    return {
      id: `q${i}`,
      type,
      prompt: String(q.prompt || '').trim(),
      points: Math.max(1, parseInt(q.points, 10) || 1),
      options,
      correct,
    };
  });
  if (parsed.some((q) => !q.prompt)) return res.status(400).json({ error: 'Jede Frage braucht einen Text' });
  if (parsed.some((q) => q.type !== 'text' && q.options.length < 2))
    return res.status(400).json({ error: 'Choice-Fragen brauchen mind. 2 Optionen' });
  if (parsed.some((q) => q.type !== 'text' && q.correct.length === 0))
    return res.status(400).json({ error: 'Bitte richtige Antwort(en) markieren' });

  const exam = {
    id: newId('exam'),
    classId,
    subjectId: findSubject(subjectId) ? subjectId : null,
    title: title.trim(),
    description: description || '',
    link: cleanLink,
    // Leer = ganze Klasse; sonst nur diese Schüler (Einzelzuweisung).
    targetStudentIds: Array.isArray(targetStudentIds)
      ? targetStudentIds.filter((id) => targetStudentsOfClass(classId).includes(id))
      : [],
    passPercentage: Math.min(100, Math.max(0, parseInt(passPercentage, 10) || 50)),
    questions: parsed,
    status: 'draft',
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
  };
  db.insert('exams', exam);
  audit(req.user.id, 'exam.create', 'exam', exam.id);
  res.json({ exam });
});

router.post('/exams/:id/publish', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const exam = byId('exams', req.params.id);
  if (!exam) return res.status(404).json({ error: 'Prüfung nicht gefunden' });
  if (!canManageClass(req.user, exam.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  exam.status = 'published';
  db.commit();
  examTargets(exam).forEach((sid) =>
    notify(sid, { type: 'exam_published', level: 'info', title: 'Neue Prüfung', body: exam.title, deepLink: '/pruefungen' }),
  );
  audit(req.user.id, 'exam.publish', 'exam', exam.id);
  res.json({ ok: true });
});

function targetStudentsOfClass(classId) {
  return db.all('users').filter((u) => u.role === ROLES.SCHUELER && (u.classIds || []).includes(classId)).map((u) => u.id);
}

/** Zielschüler einer Prüfung: leere Zuweisung = ganze Klasse, sonst die zugewiesenen. */
function examTargets(exam) {
  const all = targetStudentsOfClass(exam.classId);
  return exam.targetStudentIds?.length ? all.filter((id) => exam.targetStudentIds.includes(id)) : all;
}

/** Ist der Schüler Ziel dieser Prüfung? */
function examTargetsStudent(exam, studentId) {
  return !exam.targetStudentIds?.length || exam.targetStudentIds.includes(studentId);
}

router.get('/exams', requireAuth, (req, res) => {
  if (req.user.role === ROLES.SCHUELER) {
    const list = db
      .all('exams')
      .filter((e) => e.status === 'published' && (req.user.classIds || []).includes(e.classId) && examTargetsStudent(e, req.user.id))
      .map((e) => {
        const att = db.all('exam_attempts').find((a) => a.examId === e.id && a.studentId === req.user.id);
        let studentStatus = 'open';
        let result = null;
        if (att) {
          studentStatus = att.status === 'released' ? 'released' : att.status === 'submitted' ? 'submitted' : 'in_progress';
          if (att.status === 'released') result = { total: att.total, max: att.max, percent: att.percent, passed: att.percent >= e.passPercentage };
        }
        return { id: e.id, title: e.title, subjectName: findSubject(e.subjectId)?.name || null, questionCount: e.questions.length, link: e.link || null, linkOnly: !!e.link && e.questions.length === 0, studentStatus, result };
      });
    return res.json({ exams: list });
  }
  if (isClassManager(req.user)) {
    const list = db
      .all('exams')
      .filter((e) => canManageClass(req.user, e.classId))
      .map((e) => {
        const attempts = db.all('exam_attempts').filter((a) => a.examId === e.id);
        return {
          id: e.id,
          title: e.title,
          className: findClass(e.classId)?.name,
          subjectName: findSubject(e.subjectId)?.name || null,
          status: e.status,
          questionCount: e.questions.length,
          submitted: attempts.filter((a) => a.status !== 'in_progress').length,
          pendingGrading: attempts.filter((a) => a.status === 'submitted').length,
        };
      });
    return res.json({ exams: list });
  }
  res.json({ exams: [] });
});

// Detail: Schüler bekommt Prüfung ohne Lösungen (+ eigener Versuch), Verwalter alles.
router.get('/exams/:id', requireAuth, (req, res) => {
  const exam = byId('exams', req.params.id);
  if (!exam) return res.status(404).json({ error: 'Prüfung nicht gefunden' });
  if (req.user.role === ROLES.SCHUELER) {
    if (exam.status !== 'published' || !(req.user.classIds || []).includes(exam.classId) || !examTargetsStudent(exam, req.user.id))
      return res.status(403).json({ error: 'Kein Zugriff' });
    const att = db.all('exam_attempts').find((a) => a.examId === exam.id && a.studentId === req.user.id);
    let attempt = null;
    if (att) {
      attempt = { id: att.id, status: att.status, answers: att.answers };
      if (att.status === 'released') {
        attempt.total = att.total;
        attempt.max = att.max;
        attempt.percent = att.percent;
        attempt.passed = att.percent >= exam.passPercentage;
        attempt.solutions = exam.questions.map((q) => ({ id: q.id, correct: q.correct }));
      }
    }
    return res.json({ exam: examForStudent(exam), attempt, passPercentage: exam.passPercentage });
  }
  if (!canManageClass(req.user, exam.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  res.json({ exam });
});

// Versuch starten
router.post('/exams/:id/attempt', requireAuth, requireRole(ROLES.SCHUELER), (req, res) => {
  const exam = byId('exams', req.params.id);
  if (!exam || exam.status !== 'published' || !(req.user.classIds || []).includes(exam.classId))
    return res.status(403).json({ error: 'Kein Zugriff' });
  let att = db.all('exam_attempts').find((a) => a.examId === exam.id && a.studentId === req.user.id);
  if (!att) {
    att = {
      id: newId('att'),
      examId: exam.id,
      classId: exam.classId,
      studentId: req.user.id,
      studentName: req.user.name,
      answers: [],
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      submittedAt: null,
      total: null,
      max: null,
      percent: null,
      releasedAt: null,
    };
    db.insert('exam_attempts', att);
  }
  res.json({ attempt: { id: att.id, status: att.status } });
});

// Abgeben (Auto-Korrektur der Choice-Fragen)
router.post('/exams/:id/submit', requireAuth, requireRole(ROLES.SCHUELER), (req, res) => {
  const exam = byId('exams', req.params.id);
  if (!exam) return res.status(404).json({ error: 'Prüfung nicht gefunden' });
  const att = db.all('exam_attempts').find((a) => a.examId === exam.id && a.studentId === req.user.id);
  if (!att) return res.status(400).json({ error: 'Kein aktiver Versuch' });
  if (att.status !== 'in_progress') return res.status(400).json({ error: 'Bereits abgegeben' });
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  att.answers = exam.questions.map((q) => {
    const a = answers.find((x) => x.questionId === q.id) || {};
    return q.type === 'text'
      ? { questionId: q.id, text: String(a.text || '').trim() }
      : { questionId: q.id, selected: Array.isArray(a.selected) ? a.selected : [] };
  });
  att.submittedAt = new Date().toISOString();
  att.status = 'submitted';
  const sc = computeScores(exam, att);
  att.total = sc.total;
  att.max = sc.max;
  att.percent = sc.percent;
  db.commit();
  db.all('users')
    .filter((u) => canManageClass(u, exam.classId) && !isAdmin(u))
    .forEach((t) => notify(t.id, { type: 'exam_submitted', level: 'info', title: 'Prüfung abgegeben', body: `${req.user.name}: ${exam.title}`, deepLink: '/pruefungen' }));
  res.json({ ok: true });
});

// Versuche einer Prüfung (Verwalter, zum Bewerten)
router.get('/exams/:id/attempts', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const exam = byId('exams', req.params.id);
  if (!exam) return res.status(404).json({ error: 'Prüfung nicht gefunden' });
  if (!canManageClass(req.user, exam.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  const attempts = db.all('exam_attempts').filter((a) => a.examId === exam.id && a.status !== 'in_progress');
  res.json({ exam, attempts });
});

// Freitext bewerten + Ergebnis freigeben
router.post('/attempts/:id/grade', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const att = byId('exam_attempts', req.params.id);
  if (!att) return res.status(404).json({ error: 'Versuch nicht gefunden' });
  if (!canManageClass(req.user, att.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  const exam = byId('exams', att.examId);
  const awarded = req.body?.awarded || {}; // { questionId: points }
  att.answers = att.answers.map((a) => {
    const q = exam.questions.find((x) => x.id === a.questionId);
    if (q && q.type === 'text' && awarded[a.questionId] !== undefined) {
      const p = Math.max(0, Math.min(q.points, parseInt(awarded[a.questionId], 10) || 0));
      return { ...a, awardedPoints: p };
    }
    return a;
  });
  const sc = computeScores(exam, att);
  att.total = sc.total;
  att.max = sc.max;
  att.percent = sc.percent;
  if (req.body?.release) {
    att.status = 'released';
    att.releasedAt = new Date().toISOString();
    notify(att.studentId, {
      type: 'exam_result',
      level: 'info',
      title: 'Prüfungsergebnis',
      body: `${exam.title}: ${att.total}/${att.max} Punkte`,
      deepLink: '/pruefungen',
    });
  }
  db.commit();
  audit(req.user.id, 'exam.grade', 'attempt', att.id, null, { released: !!req.body?.release });
  res.json({ ok: true, scores: sc });
});

// =============================================================================
// Berichte / Zeugnisse
// =============================================================================

// Aggregiert Kennzahlen eines Schülers für einen Bericht.
function reportData(studentId) {
  const asgs = studentAssignments(studentId);
  const hw = { total: asgs.length, passed: 0, submitted: 0, revision: 0, missed: 0, open: 0 };
  asgs.forEach((a) => {
    if (a.status === 'passed') hw.passed++;
    else if (a.status === 'submitted') hw.submitted++;
    else if (a.status === 'revision_required') hw.revision++;
    else if (a.status === 'missed') hw.missed++;
    else hw.open++;
  });
  const beh = db.all('behavior_records').filter((r) => r.studentId === studentId);
  return {
    attendance: attendanceStats(studentId),
    homework: hw,
    behavior: {
      positive: beh.filter((r) => r.tone === 'positive').length,
      hinweis: beh.filter((r) => r.tone === 'negative').length,
    },
  };
}

router.get('/report-periods', requireAuth, requireRole(CLASS_MANAGERS), (_req, res) => {
  res.json({ periods: db.all('report_periods') });
});

router.post('/report-periods', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.LEITUNG), (req, res) => {
  const { name, reportType, startsOn, endsOn } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  const p = {
    id: newId('period'),
    name: name.trim(),
    reportType: reportType || 'custom',
    startsOn: startsOn || null,
    endsOn: endsOn || null,
    createdAt: new Date().toISOString(),
  };
  db.insert('report_periods', p);
  res.json({ period: p });
});

// Bericht erzeugen/aktualisieren (Kennzahlen frisch aggregiert). Verwalter.
router.post('/reports', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const { studentId, periodId } = req.body || {};
  const student = findUserById(studentId);
  if (!student || student.role !== ROLES.SCHUELER) return res.status(404).json({ error: 'Schüler nicht gefunden' });
  if (!(student.classIds || []).some((c) => canManageClass(req.user, c)))
    return res.status(403).json({ error: 'Kein Zugriff' });
  const period = byId('report_periods', periodId);
  if (!period) return res.status(400).json({ error: 'Berichtsperiode nicht gefunden' });

  let r = db.all('student_reports').find((x) => x.studentId === studentId && x.periodId === periodId);
  const data = reportData(studentId);
  if (!r) {
    r = {
      id: newId('rep'),
      studentId,
      studentName: student.name,
      classId: (student.classIds || [])[0],
      periodId,
      periodName: period.name,
      data,
      teacherComment: '',
      status: 'draft',
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
      releasedAt: null,
    };
    db.insert('student_reports', r);
  } else {
    r.data = data; // Kennzahlen neu berechnen
    db.commit();
  }
  audit(req.user.id, 'report.generate', 'report', r.id);
  res.json({ report: r });
});

router.patch('/reports/:id', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const r = byId('student_reports', req.params.id);
  if (!r) return res.status(404).json({ error: 'Bericht nicht gefunden' });
  if (!canManageClass(req.user, r.classId)) return res.status(403).json({ error: 'Kein Zugriff' });
  const { teacherComment, status } = req.body || {};
  if (teacherComment !== undefined) r.teacherComment = teacherComment;
  if (status === 'draft' || status === 'released') {
    const wasReleased = r.status === 'released';
    r.status = status;
    if (status === 'released' && !wasReleased) {
      r.releasedAt = new Date().toISOString();
      notify(r.studentId, {
        type: 'report_released',
        level: 'info',
        title: 'Neuer Bericht verfügbar',
        body: `Dein Bericht "${r.periodName}" wurde freigegeben.`,
        deepLink: '/berichte',
      });
      db.all('users')
        .filter((u) => u.role === ROLES.ELTERN && (u.childIds || []).includes(r.studentId))
        .forEach((p) =>
          notify(p.id, {
            type: 'report_released',
            level: 'info',
            title: 'Neuer Bericht verfügbar',
            body: `Der Bericht "${r.periodName}" für ${r.studentName} wurde freigegeben.`,
            deepLink: '/berichte',
          }),
        );
    }
  }
  db.commit();
  audit(req.user.id, 'report.update', 'report', r.id, null, { status: r.status });
  res.json({ report: r });
});

router.get('/reports', requireAuth, (req, res) => {
  let list = db.all('student_reports');
  if (isClassManager(req.user)) list = list.filter((r) => canManageClass(req.user, r.classId));
  else if (req.user.role === ROLES.SCHUELER || req.user.role === ROLES.KLASSENSPRECHER)
    list = list.filter((r) => r.studentId === req.user.id && r.status === 'released');
  else if (req.user.role === ROLES.ELTERN)
    list = list.filter((r) => (req.user.childIds || []).includes(r.studentId) && r.status === 'released');
  else list = [];
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ reports: list });
});

router.get('/reports/:id', requireAuth, (req, res) => {
  const r = byId('student_reports', req.params.id);
  if (!r) return res.status(404).json({ error: 'Bericht nicht gefunden' });
  const ok =
    (isClassManager(req.user) && canManageClass(req.user, r.classId)) ||
    (req.user.id === r.studentId && r.status === 'released') ||
    (req.user.role === ROLES.ELTERN && (req.user.childIds || []).includes(r.studentId) && r.status === 'released');
  if (!ok) return res.status(403).json({ error: 'Kein Zugriff' });
  res.json({ report: r });
});

// =============================================================================
// Direktnachrichten (sichere 1:1-Kommunikation)
// =============================================================================

// Erlaubte Gesprächspartner: Schüler/Eltern <-> Lehrkräfte der jeweiligen Klasse.
// Kein Schüler-zu-Schüler (docs/SECURITY_PRIVACY.md §8).
function messageContacts(user) {
  const users = db.all('users');
  const active = (u) => u.status !== 'disabled' && u.id !== user.id;
  if (isAdmin(user)) return users.filter((u) => active(u) && CLASS_MANAGERS.includes(u.role));
  if (isClassManager(user)) {
    const myClasses = user.classIds || [];
    const students = users.filter((u) => u.role === ROLES.SCHUELER && (u.classIds || []).some((c) => myClasses.includes(c)));
    const studentIds = new Set(students.map((s) => s.id));
    const parents = users.filter((u) => u.role === ROLES.ELTERN && (u.childIds || []).some((ch) => studentIds.has(ch)));
    return [...students, ...parents].filter(active);
  }
  if (user.role === ROLES.SCHUELER)
    return users.filter((u) => active(u) && CLASS_MANAGERS.includes(u.role) && (u.classIds || []).some((c) => (user.classIds || []).includes(c)));
  if (user.role === ROLES.ELTERN) {
    const childClasses = new Set();
    (user.childIds || []).forEach((ch) => (findUserById(ch)?.classIds || []).forEach((c) => childClasses.add(c)));
    return users.filter((u) => active(u) && CLASS_MANAGERS.includes(u.role) && (u.classIds || []).some((c) => childClasses.has(c)));
  }
  return [];
}
const canMessage = (user, otherId) => messageContacts(user).some((u) => u.id === otherId);

// Erlaubte Reaktionen (bewusst kleine, passende Auswahl).
const MSG_REACTIONS = ['👍', '❤️', '🤲', '✅', '😊', '😮'];

function msgKind(mime = '') {
  if (mime.startsWith('image')) return 'image';
  if (mime.startsWith('audio')) return 'audio';
  return 'file';
}

/** Kurzvorschau einer Nachricht für die Thread-Liste. */
function msgPreview(m) {
  if (!m) return '';
  if (m.body) return m.body.slice(0, 80);
  if (m.file) return m.file.kind === 'image' ? '📷 Bild' : m.file.kind === 'audio' ? '🎤 Sprachnachricht' : '📎 Datei';
  return '';
}

/** Nachricht für die Ausgabe (interner Dateiname wird nicht mitgesendet). */
function messageView(m) {
  const file = m.file
    ? { kind: m.file.kind, originalName: m.file.originalName, mediaType: m.file.mediaType, size: m.file.size }
    : null;
  return {
    id: m.id,
    senderId: m.senderId,
    senderName: m.senderName,
    body: m.body || '',
    createdAt: m.createdAt,
    file,
    reactions: m.reactions || {},
  };
}

/** Baut eine neue Nachricht (inkl. optionaler Datei) aus dem Request. */
async function buildMessage(req) {
  const now = new Date().toISOString();
  const msg = {
    id: newId('msg'),
    senderId: req.user.id,
    senderName: req.user.name,
    body: (req.body?.body || '').trim(),
    createdAt: now,
    reactions: {},
  };
  if (req.file) {
    await persistUpload(req.file);
    msg.file = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mediaType: req.file.mimetype,
      size: req.file.size,
      kind: msgKind(req.file.mimetype),
    };
  }
  return msg;
}

function threadListView(t, userId) {
  const otherId = t.participantIds.find((id) => id !== userId);
  const last = t.messages[t.messages.length - 1] || null;
  const readAt = t.reads?.[userId] || '';
  const unread = t.messages.filter((m) => m.senderId !== userId && m.createdAt > readAt).length;
  return {
    id: t.id,
    otherName: t.participantNames[otherId] || 'Unbekannt',
    lastBody: msgPreview(last),
    lastAt: t.lastMessageAt,
    unread,
  };
}

router.get('/message-contacts', requireAuth, (req, res) => {
  res.json({ contacts: messageContacts(req.user).map((u) => ({ id: u.id, name: u.name, roleLabel: ROLE_LABELS[u.role] })) });
});

router.get('/threads', requireAuth, (req, res) => {
  const list = db
    .all('threads')
    .filter((t) => t.participantIds.includes(req.user.id))
    .sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))
    .map((t) => threadListView(t, req.user.id));
  res.json({ threads: list, unread: list.reduce((s, t) => s + t.unread, 0) });
});

router.post('/threads', requireAuth, upload.single('file'), async (req, res) => {
  const { recipientId } = req.body || {};
  const recipient = findUserById(recipientId);
  if (!recipient) return res.status(404).json({ error: 'Empfänger nicht gefunden' });
  if (!canMessage(req.user, recipientId)) return res.status(403).json({ error: 'Nachricht an diese Person ist nicht erlaubt' });
  if (!(req.body?.body || '').trim() && !req.file) return res.status(400).json({ error: 'Nachricht darf nicht leer sein' });

  const msg = await buildMessage(req);
  const now = msg.createdAt;
  // Bestehenden Direkt-Thread wiederverwenden
  let t = db.all('threads').find(
    (x) => x.participantIds.length === 2 && x.participantIds.includes(req.user.id) && x.participantIds.includes(recipientId),
  );
  if (!t) {
    t = {
      id: newId('thread'),
      participantIds: [req.user.id, recipientId],
      participantNames: { [req.user.id]: req.user.name, [recipientId]: recipient.name },
      messages: [msg],
      reads: { [req.user.id]: now },
      createdAt: now,
      lastMessageAt: now,
    };
    db.insert('threads', t);
  } else {
    t.messages.push(msg);
    t.lastMessageAt = now;
    t.reads[req.user.id] = now;
    db.commit();
  }
  notify(recipientId, { type: 'message', level: 'info', title: `Neue Nachricht von ${req.user.name}`, body: msgPreview(msg).slice(0, 100), deepLink: '/nachrichten' });
  res.json({ threadId: t.id });
});

router.get('/threads/:id', requireAuth, (req, res) => {
  const t = byId('threads', req.params.id);
  if (!t || !t.participantIds.includes(req.user.id)) return res.status(403).json({ error: 'Kein Zugriff' });
  t.reads = t.reads || {};
  t.reads[req.user.id] = new Date().toISOString();
  db.commit();
  const otherId = t.participantIds.find((id) => id !== req.user.id);
  res.json({
    thread: { id: t.id, otherName: t.participantNames[otherId], messages: t.messages.map(messageView), meId: req.user.id },
  });
});

router.post('/threads/:id/messages', requireAuth, upload.single('file'), async (req, res) => {
  const t = byId('threads', req.params.id);
  if (!t || !t.participantIds.includes(req.user.id)) return res.status(403).json({ error: 'Kein Zugriff' });
  if (!(req.body?.body || '').trim() && !req.file) return res.status(400).json({ error: 'Nachricht darf nicht leer sein' });
  const msg = await buildMessage(req);
  t.messages.push(msg);
  t.lastMessageAt = msg.createdAt;
  t.reads = t.reads || {};
  t.reads[req.user.id] = msg.createdAt;
  db.commit();
  const otherId = t.participantIds.find((id) => id !== req.user.id);
  notify(otherId, { type: 'message', level: 'info', title: `Neue Nachricht von ${req.user.name}`, body: msgPreview(msg).slice(0, 100), deepLink: '/nachrichten' });
  res.json({ message: messageView(msg) });
});

// Anhang einer Nachricht herunterladen (nur Thread-Teilnehmer).
router.get('/threads/:id/messages/:mid/file', requireAuth, async (req, res) => {
  const t = byId('threads', req.params.id);
  if (!t || !t.participantIds.includes(req.user.id)) return res.status(403).json({ error: 'Kein Zugriff' });
  const m = t.messages.find((x) => x.id === req.params.mid);
  if (!m || !m.file) return res.status(404).json({ error: 'Anhang fehlt' });
  const buf = await readFile(m.file.filename);
  if (!buf) return res.status(404).json({ error: 'Anhang fehlt' });
  res.setHeader('Content-Type', m.file.mediaType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(m.file.originalName)}"`);
  res.end(buf);
});

// Reaktion auf eine Nachricht setzen/entfernen (umschalten).
router.post('/threads/:id/messages/:mid/react', requireAuth, (req, res) => {
  const t = byId('threads', req.params.id);
  if (!t || !t.participantIds.includes(req.user.id)) return res.status(403).json({ error: 'Kein Zugriff' });
  const emoji = String(req.body?.emoji || '');
  if (!MSG_REACTIONS.includes(emoji)) return res.status(400).json({ error: 'Ungültige Reaktion' });
  const m = t.messages.find((x) => x.id === req.params.mid);
  if (!m) return res.status(404).json({ error: 'Nachricht nicht gefunden' });
  m.reactions = m.reactions || {};
  const set = new Set(m.reactions[emoji] || []);
  if (set.has(req.user.id)) set.delete(req.user.id);
  else set.add(req.user.id);
  if (set.size) m.reactions[emoji] = [...set];
  else delete m.reactions[emoji];
  db.commit();
  res.json({ reactions: m.reactions });
});

// =============================================================================
// Materialien / Bibliothek
// =============================================================================

function canSeeMaterial(user, m) {
  if (isAdmin(user) || m.createdBy === user.id) return true;
  if (!m.classId) return true; // schulweit
  if ((user.classIds || []).includes(m.classId)) return true;
  if (canManageClass(user, m.classId)) return true;
  if (user.role === ROLES.ELTERN)
    return (user.childIds || []).some((ch) => (findUserById(ch)?.classIds || []).includes(m.classId));
  return false;
}

function materialView(m) {
  const { fileRef, ...rest } = m;
  return {
    ...rest,
    subjectName: findSubject(m.subjectId)?.name || null,
    className: m.classId ? findClass(m.classId)?.name : 'Schulweit',
    fileName: fileRef?.originalName || null,
    mediaType: fileRef?.mediaType || null,
  };
}

router.post('/materials', requireAuth, requireRole(CLASS_MANAGERS), upload.single('file'), async (req, res) => {
  const { title, description, materialType, classId, subjectId, url, body } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Titel erforderlich' });
  const type = ['file', 'link', 'note'].includes(materialType) ? materialType : 'note';

  // Reichweite: schulweit nur Admin/Leitung; Klassenlehrer nur eigene Klasse
  const cid = classId || null;
  if (cid) {
    if (!canManageClass(req.user, cid)) return res.status(403).json({ error: 'Kein Zugriff auf diese Klasse' });
  } else if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Schulweites Material nur durch die Leitung' });
  }

  const m = {
    id: newId('mat'),
    organizationId: org().id,
    title: title.trim(),
    description: description || '',
    materialType: type,
    classId: cid,
    subjectId: findSubject(subjectId) ? subjectId : null,
    url: type === 'link' ? String(url || '').trim() : null,
    body: type === 'note' ? String(body || '').trim() : null,
    fileRef: null,
    createdBy: req.user.id,
    createdByName: req.user.name,
    createdAt: new Date().toISOString(),
  };
  if (type === 'file') {
    if (!req.file) return res.status(400).json({ error: 'Bitte eine Datei hochladen' });
    await persistUpload(req.file); // dauerhaft in Supabase Storage sichern
    m.fileRef = { filename: req.file.filename, originalName: req.file.originalname, mediaType: req.file.mimetype, size: req.file.size };
  }
  if (type === 'link' && !m.url) return res.status(400).json({ error: 'Bitte einen Link angeben' });
  if (type === 'note' && !m.body) return res.status(400).json({ error: 'Bitte einen Text eingeben' });

  db.insert('materials', m);
  audit(req.user.id, 'material.create', 'material', m.id);
  res.json({ material: materialView(m) });
});

router.get('/materials', requireAuth, (req, res) => {
  let list = db.all('materials').filter((m) => canSeeMaterial(req.user, m));
  if (req.query.classId) list = list.filter((m) => m.classId === req.query.classId);
  list = list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(materialView);
  res.json({ materials: list });
});

router.get('/materials/:id/file', requireAuth, async (req, res) => {
  const m = byId('materials', req.params.id);
  if (!m || m.materialType !== 'file' || !m.fileRef) return res.status(404).json({ error: 'Nicht gefunden' });
  if (!canSeeMaterial(req.user, m)) return res.status(403).json({ error: 'Kein Zugriff' });
  const buf = await readFile(m.fileRef.filename);
  if (!buf) return res.status(404).json({ error: 'Datei fehlt' });
  res.setHeader('Content-Type', m.fileRef.mediaType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(m.fileRef.originalName)}"`);
  res.end(buf);
});

router.delete('/materials/:id', requireAuth, (req, res) => {
  const list = db.all('materials');
  const idx = list.findIndex((m) => m.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Nicht gefunden' });
  if (list[idx].createdBy !== req.user.id && !isAdmin(req.user)) return res.status(403).json({ error: 'Kein Zugriff' });
  const [removed] = list.splice(idx, 1);
  db.commit();
  audit(req.user.id, 'material.delete', 'material', removed.id);
  res.json({ ok: true });
});

// =============================================================================
// Strafen (Seiten / Geld)
//
// Ablauf: Klassensprecher ERFASST eine Strafe (Status "pending") -> Klassenlehrer
// GENEHMIGT oder LEHNT AB. Genehmigte Strafen sind offene Schulden; die Leitung/
// Lehrkraft verbucht sie später als ERLEDIGT (bezahlt bzw. Seiten abgegeben).
// Erfasst ein Verwalter selbst, ist die Strafe sofort genehmigt.
// =============================================================================

function penaltyText(p) {
  return p.type === 'money' ? `${p.amount} €` : `${p.amount} Seiten`;
}

/** Darf der Nutzer für diese Klasse Strafen erfassen? (Verwalter oder Klassensprecher der Klasse) */
function canRecordPenalty(user, classId) {
  if (canManageClass(user, classId)) return true;
  if (user.role === ROLES.KLASSENSPRECHER) return (user.classIds || []).includes(classId);
  return false;
}

/** Lädt eine Strafe und prüft Verwalter-Zugriff auf ihre Klasse. */
function penaltyForManager(req, res) {
  const p = byId('penalties', req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Strafe nicht gefunden' });
    return null;
  }
  if (!canManageClass(req.user, p.classId)) {
    res.status(403).json({ error: 'Kein Zugriff' });
    return null;
  }
  return p;
}

// Strafe erfassen (Klassensprecher oder Verwalter der Klasse).
router.post('/penalties', requireAuth, requireRole([...CLASS_MANAGERS, ROLES.KLASSENSPRECHER]), (req, res) => {
  const { classId, studentId, type, amount, reason } = req.body || {};
  const klass = findClass(classId);
  if (!klass) return res.status(404).json({ error: 'Klasse nicht gefunden' });
  if (!canRecordPenalty(req.user, classId)) return res.status(403).json({ error: 'Kein Zugriff auf diese Klasse' });

  const student = findUserById(studentId);
  if (!student || student.role !== ROLES.SCHUELER || !(student.classIds || []).includes(classId))
    return res.status(400).json({ error: 'Bitte einen gültigen Schüler dieser Klasse wählen' });
  if (!['pages', 'money'].includes(type)) return res.status(400).json({ error: 'Ungültige Straf-Art' });
  const amt = Number(amount);
  if (!(amt > 0)) return res.status(400).json({ error: 'Bitte eine Menge größer 0 angeben' });
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'Bitte einen Grund angeben' });

  const isManager = canManageClass(req.user, classId);
  const now = new Date().toISOString();
  const p = {
    id: newId('pen'),
    classId,
    className: klass.name,
    studentId,
    studentName: student.name,
    type,
    amount: amt,
    reason: reason.trim(),
    status: isManager ? 'approved' : 'pending',
    createdBy: req.user.id,
    createdByName: req.user.name,
    createdByRole: req.user.role,
    createdAt: now,
    decidedBy: isManager ? req.user.id : null,
    decidedByName: isManager ? req.user.name : null,
    decidedAt: isManager ? now : null,
    settledBy: null,
    settledByName: null,
    settledAt: null,
    rejectionReason: null,
  };
  db.insert('penalties', p);
  audit(req.user.id, 'penalty.create', 'penalty', p.id);

  if (isManager) {
    notify(student.id, {
      type: 'penalty_new',
      level: 'warning',
      title: 'Neue Strafe',
      body: `${penaltyText(p)} – Grund: ${p.reason}`,
      deepLink: '/strafen',
    });
  } else {
    db.all('users')
      .filter((u) => canManageClass(u, classId) && !isAdmin(u))
      .forEach((t) =>
        notify(t.id, {
          type: 'penalty_pending',
          level: 'info',
          title: 'Strafe zu genehmigen',
          body: `${req.user.name} hat eine Strafe für ${student.name} erfasst.`,
          deepLink: '/strafen',
        }),
      );
  }
  res.json({ penalty: p });
});

// Strafen auflisten (rollenabhängig gefiltert).
router.get('/penalties', requireAuth, (req, res) => {
  const all = db.all('penalties');
  const u = req.user;
  let list;
  if (isAdmin(u)) list = all;
  else if (TEACHING_ROLES.includes(u.role)) list = all.filter((p) => (u.classIds || []).includes(p.classId));
  else if (u.role === ROLES.KLASSENSPRECHER) list = all.filter((p) => (u.classIds || []).includes(p.classId));
  else if (u.role === ROLES.SCHUELER)
    list = all.filter((p) => p.studentId === u.id && ['approved', 'settled'].includes(p.status));
  else if (u.role === ROLES.ELTERN)
    list = all.filter((p) => (u.childIds || []).includes(p.studentId) && ['approved', 'settled'].includes(p.status));
  else list = [];

  if (req.query.classId) list = list.filter((p) => p.classId === req.query.classId);
  if (req.query.studentId) list = list.filter((p) => p.studentId === req.query.studentId);
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({
    penalties: list,
    canManage: isClassManager(u),
    canRecord: isClassManager(u) || u.role === ROLES.KLASSENSPRECHER,
  });
});

// Genehmigen (Verwalter).
router.post('/penalties/:id/approve', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const p = penaltyForManager(req, res);
  if (!p) return;
  if (p.status !== 'pending') return res.status(400).json({ error: 'Nur offene Einträge können genehmigt werden' });
  p.status = 'approved';
  p.decidedBy = req.user.id;
  p.decidedByName = req.user.name;
  p.decidedAt = new Date().toISOString();
  db.commit();
  audit(req.user.id, 'penalty.approve', 'penalty', p.id);
  notify(p.studentId, {
    type: 'penalty_new',
    level: 'warning',
    title: 'Neue Strafe',
    body: `${penaltyText(p)} – Grund: ${p.reason}`,
    deepLink: '/strafen',
  });
  res.json({ penalty: p });
});

// Ablehnen (Verwalter).
router.post('/penalties/:id/reject', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const p = penaltyForManager(req, res);
  if (!p) return;
  if (p.status !== 'pending') return res.status(400).json({ error: 'Nur offene Einträge können abgelehnt werden' });
  p.status = 'rejected';
  p.decidedBy = req.user.id;
  p.decidedByName = req.user.name;
  p.decidedAt = new Date().toISOString();
  p.rejectionReason = (req.body?.reason || '').trim() || null;
  db.commit();
  audit(req.user.id, 'penalty.reject', 'penalty', p.id);
  if (p.createdBy !== req.user.id)
    notify(p.createdBy, {
      type: 'penalty_rejected',
      level: 'info',
      title: 'Strafe abgelehnt',
      body: `Deine Erfassung für ${p.studentName} wurde abgelehnt.`,
      deepLink: '/strafen',
    });
  res.json({ penalty: p });
});

// Als erledigt verbuchen (bezahlt / Seiten abgegeben) – Verwalter/Leitung.
router.post('/penalties/:id/settle', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const p = penaltyForManager(req, res);
  if (!p) return;
  if (p.status !== 'approved')
    return res.status(400).json({ error: 'Nur genehmigte (offene) Strafen können als erledigt gebucht werden' });
  p.status = 'settled';
  p.settledBy = req.user.id;
  p.settledByName = req.user.name;
  p.settledAt = new Date().toISOString();
  db.commit();
  audit(req.user.id, 'penalty.settle', 'penalty', p.id);
  notify(p.studentId, {
    type: 'penalty_settled',
    level: 'success',
    title: 'Strafe erledigt',
    body: `${penaltyText(p)} wurde als erledigt verbucht.`,
    deepLink: '/strafen',
  });
  res.json({ penalty: p });
});

// Löschen: eigener, noch offener Eintrag (z. B. Klassensprecher-Tippfehler) oder Admin.
router.delete('/penalties/:id', requireAuth, (req, res) => {
  const list = db.all('penalties');
  const idx = list.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Nicht gefunden' });
  const p = list[idx];
  const own = p.createdBy === req.user.id && p.status === 'pending';
  if (!own && !isAdmin(req.user)) return res.status(403).json({ error: 'Kein Zugriff' });
  list.splice(idx, 1);
  db.commit();
  audit(req.user.id, 'penalty.delete', 'penalty', p.id);
  res.json({ ok: true });
});

// =============================================================================
// Eltern ↔ Kind: Verknüpfung per Familien-Code
//
// Jeder Schüler hat einen kurzen Familien-Code. Eltern geben ihn in ihrem Konto
// ein und werden dadurch mit dem Kind verknüpft (dürfen dann dessen Anwesenheit,
// Berichte, Verhalten & Strafen sehen). Der Code ist mehrfach nutzbar (Vater und
// Mutter) und kann vom Schüler/Verwalter neu erzeugt (= alter ungültig) werden.
// Die maßgebliche Verknüpfung durch die Leitung bleibt zusätzlich über
// PATCH /admin/users/:id { childIds } möglich.
// =============================================================================

const FAMILY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // ohne 0/O/1/I/L
const LINKABLE_ROLES = [ROLES.SCHUELER, ROLES.KLASSENSPRECHER];

function genFamilyCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += FAMILY_ALPHABET[Math.floor(Math.random() * FAMILY_ALPHABET.length)];
  return c;
}
function ensureFamilyCode(student) {
  if (!student.familyCode) {
    let code;
    do {
      code = genFamilyCode();
    } while (db.all('users').some((u) => u.familyCode === code));
    student.familyCode = code;
    db.commit();
  }
  return student.familyCode;
}

// Schüler: eigenen Familien-Code ansehen / neu erzeugen.
router.get('/me/family-code', requireAuth, requireRole(LINKABLE_ROLES), (req, res) => {
  res.json({ code: ensureFamilyCode(req.user) });
});
router.post('/me/family-code/rotate', requireAuth, requireRole(LINKABLE_ROLES), (req, res) => {
  req.user.familyCode = null;
  res.json({ code: ensureFamilyCode(req.user) });
});

// Verwalter/Admin (oder der Schüler selbst): Familien-Code eines Schülers ansehen,
// um ihn den Eltern weiterzugeben.
router.get('/students/:id/family-code', requireAuth, (req, res) => {
  const student = findUserById(req.params.id);
  if (!student || !LINKABLE_ROLES.includes(student.role))
    return res.status(404).json({ error: 'Schüler nicht gefunden' });
  const managesClass = (student.classIds || []).some((c) => canManageClass(req.user, c));
  if (!(req.user.id === student.id || isAdmin(req.user) || managesClass))
    return res.status(403).json({ error: 'Kein Zugriff' });
  res.json({ code: ensureFamilyCode(student), studentName: student.name });
});

// Eltern: verknüpfte Kinder auflisten.
router.get('/family/children', requireAuth, requireRole(ROLES.ELTERN), (req, res) => {
  const children = (req.user.childIds || [])
    .map((cid) => {
      const c = findUserById(cid);
      if (!c) return null;
      const klass = findClass((c.classIds || [])[0]);
      return { id: c.id, name: c.name, className: klass?.name || null };
    })
    .filter(Boolean);
  res.json({ children });
});

// Eltern: mit einem Kind per Code verknüpfen.
router.post('/family/link', requireAuth, requireRole(ROLES.ELTERN), (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (code.length < 4) return res.status(400).json({ error: 'Bitte einen gültigen Familien-Code eingeben' });
  const student = db
    .all('users')
    .find((u) => LINKABLE_ROLES.includes(u.role) && u.familyCode && u.familyCode.toUpperCase() === code);
  if (!student) return res.status(404).json({ error: 'Familien-Code ungültig' });

  req.user.childIds = req.user.childIds || [];
  if (req.user.childIds.includes(student.id))
    return res.status(400).json({ error: `${student.name} ist bereits mit deinem Konto verknüpft` });
  req.user.childIds.push(student.id);
  student.parentIds = student.parentIds || [];
  if (!student.parentIds.includes(req.user.id)) student.parentIds.push(req.user.id);
  db.commit();
  audit(req.user.id, 'family.link', 'user', student.id);
  notify(student.id, {
    type: 'family_linked',
    level: 'info',
    title: 'Elternteil verknüpft',
    body: `${req.user.name} ist jetzt mit deinem Konto verknüpft.`,
    deepLink: '/konto',
  });
  const klass = findClass((student.classIds || [])[0]);
  res.json({ child: { id: student.id, name: student.name, className: klass?.name || null } });
});

// Eltern: Verknüpfung zu einem Kind wieder lösen.
router.post('/family/unlink', requireAuth, requireRole(ROLES.ELTERN), (req, res) => {
  const { childId } = req.body || {};
  req.user.childIds = (req.user.childIds || []).filter((c) => c !== childId);
  const student = findUserById(childId);
  if (student) student.parentIds = (student.parentIds || []).filter((p) => p !== req.user.id);
  db.commit();
  audit(req.user.id, 'family.unlink', 'user', childId);
  res.json({ ok: true });
});

// =============================================================================
// Ankündigungen (offizielle Mitteilungen – WhatsApp-Ersatz)
// =============================================================================

function announcementAudienceUsers(a) {
  const users = db.all('users');
  if (a.audience.type === 'all') return users;
  if (a.audience.type === 'role') return users.filter((u) => u.role === a.audience.role);
  if (a.audience.type === 'class') {
    const cid = a.audience.classId;
    return users.filter(
      (u) =>
        (u.classIds || []).includes(cid) ||
        (u.role === ROLES.ELTERN &&
          (u.childIds || []).some((ch) => (findUserById(ch)?.classIds || []).includes(cid))),
    );
  }
  return [];
}

function canSeeAnnouncement(user, a) {
  if (isAdmin(user) || a.authorId === user.id) return true;
  return announcementAudienceUsers(a).some((u) => u.id === user.id);
}

function announcementView(a) {
  let audienceLabel = 'Alle';
  if (a.audience.type === 'class') audienceLabel = findClass(a.audience.classId)?.name || 'Klasse';
  else if (a.audience.type === 'role') audienceLabel = ROLE_LABELS[a.audience.role] || a.audience.role;
  return { ...a, audienceLabel };
}

router.post('/announcements', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const { title, body, priority, audience } = req.body || {};
  if (!title || !title.trim() || !body || !body.trim())
    return res.status(400).json({ error: 'Titel und Text sind erforderlich' });
  const aud = audience || { type: 'class' };

  // Reichweite je nach Rolle begrenzen
  if (isAdmin(req.user)) {
    if (aud.type === 'class' && !findClass(aud.classId)) return res.status(400).json({ error: 'Klasse nicht gefunden' });
    if (aud.type === 'role' && !ALL_ROLES.includes(aud.role)) return res.status(400).json({ error: 'Rolle ungültig' });
    if (!['all', 'class', 'role'].includes(aud.type)) return res.status(400).json({ error: 'Zielgruppe ungültig' });
  } else {
    // Klassenlehrer/Vertretung: nur eigene Klasse
    if (aud.type !== 'class' || !canManageClass(req.user, aud.classId))
      return res.status(403).json({ error: 'Nur Ankündigungen an die eigene Klasse erlaubt' });
  }

  const a = {
    id: newId('ann'),
    authorId: req.user.id,
    authorName: req.user.name,
    authorRole: req.user.role,
    title: title.trim(),
    body: body.trim(),
    priority: priority === 'high' ? 'high' : 'normal',
    audience: aud,
    createdAt: new Date().toISOString(),
  };
  db.insert('announcements', a);
  audit(req.user.id, 'announcement.create', 'announcement', a.id);
  // Zielgruppe benachrichtigen (außer Autor)
  announcementAudienceUsers(a)
    .filter((u) => u.id !== req.user.id)
    .forEach((u) =>
      notify(u.id, {
        type: 'announcement',
        level: a.priority === 'high' ? 'warning' : 'info',
        title: `Ankündigung: ${a.title}`,
        body: a.body.slice(0, 140),
        deepLink: '/ankuendigungen',
      }),
    );
  res.json({ announcement: announcementView(a) });
});

router.get('/announcements', requireAuth, (req, res) => {
  const list = db
    .all('announcements')
    .filter((a) => canSeeAnnouncement(req.user, a))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(announcementView);
  res.json({ announcements: list });
});

router.delete('/announcements/:id', requireAuth, (req, res) => {
  const list = db.all('announcements');
  const idx = list.findIndex((a) => a.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Nicht gefunden' });
  if (list[idx].authorId !== req.user.id && !isAdmin(req.user))
    return res.status(403).json({ error: 'Kein Zugriff' });
  const [removed] = list.splice(idx, 1);
  db.commit();
  audit(req.user.id, 'announcement.delete', 'announcement', removed.id);
  res.json({ ok: true });
});

// =============================================================================
// Benachrichtigungen (DBZ-Inbox)
// =============================================================================

router.get('/notifications', requireAuth, (req, res) => {
  const items = db
    .all('notifications')
    .filter((n) => n.userId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ items, unread: items.filter((n) => !n.read).length });
});

router.post('/notifications/read', requireAuth, (req, res) => {
  db.all('notifications').forEach((n) => {
    if (n.userId === req.user.id) n.read = true;
  });
  db.commit();
  res.json({ ok: true });
});

// Einzelne Benachrichtigung als gelesen markieren (beim Anklicken).
router.post('/notifications/:id/read', requireAuth, (req, res) => {
  const n = byId('notifications', req.params.id);
  if (!n || n.userId !== req.user.id) return res.status(404).json({ error: 'Nicht gefunden' });
  n.read = true;
  db.commit();
  res.json({ ok: true });
});

// =============================================================================
// Dashboard (rollenabhängig)
// =============================================================================

// Anstehende Termine (Unterricht + Fristen) für die nächsten Tage.
function upcomingFor(user, days = 14, limit = 5) {
  const today = new Date(`${todayKey()}T00:00:00`);
  const end = new Date(today.getTime() + days * 86400000);
  const events = [];
  const classes = visibleClasses(user);
  for (let d = new Date(today); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    const dk = d.toISOString().slice(0, 10);
    for (const c of classes) if (c.weekday === dow) events.push({ date: dk, type: 'lesson', title: c.name, time: `${c.startTime}–${c.endTime}` });
  }
  const addDue = (a, due, who) => {
    if (!due) return;
    const dd = new Date(due);
    if (dd < today || dd > end) return;
    events.push({ date: due.slice(0, 10), type: 'deadline', title: who ? `${a.title} · ${who}` : a.title, time: new Date(due).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) });
  };
  if (user.role === ROLES.SCHUELER) db.all('assignments').filter((a) => targetsFor(a).includes(user.id)).forEach((a) => addDue(a, effectiveDue(a, user.id)));
  else if (user.role === ROLES.ELTERN) (user.childIds || []).forEach((cid) => { const ch = findUserById(cid); db.all('assignments').filter((a) => targetsFor(a).includes(cid)).forEach((a) => addDue(a, effectiveDue(a, cid), ch?.name)); });
  else if (isClassManager(user)) db.all('assignments').filter((a) => canManageClass(user, a.classId)).forEach((a) => addDue(a, a.dueAt));
  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '')).slice(0, limit);
}

function unreadMessagesFor(userId) {
  return db.all('threads').filter((t) => t.participantIds.includes(userId)).reduce((s, t) => {
    const readAt = t.reads?.[userId] || '';
    return s + t.messages.filter((m) => m.senderId !== userId && m.createdAt > readAt).length;
  }, 0);
}

router.get('/dashboard', requireAuth, (req, res) => {
  const user = publicUser(req.user);
  const notifications = db
    .all('notifications')
    .filter((n) => n.userId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
  const unread = db.all('notifications').filter((n) => n.userId === req.user.id && !n.read).length;
  const announcements = db
    .all('announcements')
    .filter((a) => canSeeAnnouncement(req.user, a))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3)
    .map(announcementView);
  const upcoming = upcomingFor(req.user);
  const unreadMessages = unreadMessagesFor(req.user.id);

  const base = { user, notifications, unread, announcements, upcoming, unreadMessages, org: publicOrg() };

  if (req.user.role === ROLES.SCHUELER) {
    const assignments = db
      .all('assignments')
      .filter((a) => targetsFor(a).includes(req.user.id))
      .map((a) => decorateForStudent(a, req.user.id));
    const open = assignments.filter((a) => ['not_opened', 'submitted', 'revision_required'].includes(a.studentStatus));
    return res.json({
      ...base,
      role: 'schueler',
      attendance: attendanceStats(req.user.id),
      openAssignments: open.sort(byDueThenNew).slice(0, 5),
      nextSession: nextSessionFor(req.user),
    });
  }

  if (isClassManager(req.user)) {
    const classes = visibleClasses(req.user);
    const todaySessions = classes
      .filter((c) => canManageClass(req.user, c.id))
      .map((c) => sessionView(ensureTodaySession(c), c, req.user));
    const pendingAbsences = db
      .all('absence_requests')
      .filter((r) => r.status === 'pending' && canManageClass(req.user, r.classId)).length;
    const pendingReviews = db
      .all('submissions')
      .filter((s) => s.status === 'submitted' && canManageClass(req.user, s.classId)).length;
    const pendingProtocols = db
      .all('protocols')
      .filter((p) => p.status === 'submitted' && canManageClass(req.user, p.classId)).length;
    return res.json({
      ...base,
      role: 'lehrer',
      todaySessions,
      pending: { absences: pendingAbsences, reviews: pendingReviews, protocols: pendingProtocols },
      classes: classes.map((c) => ({ id: c.id, name: c.name })),
    });
  }

  if (req.user.role === ROLES.ELTERN) {
    const children = (req.user.childIds || []).map((cid) => {
      const child = findUserById(cid);
      return child ? { id: child.id, name: child.name, attendance: attendanceStats(child.id) } : null;
    }).filter(Boolean);
    return res.json({ ...base, role: 'eltern', children });
  }

  if (req.user.role === ROLES.KLASSENSPRECHER) {
    const classId = (req.user.classIds || [])[0];
    const klass = findClass(classId);
    return res.json({
      ...base,
      role: 'klassensprecher',
      attendance: attendanceStats(req.user.id),
      todaySession: klass ? sessionView(ensureTodaySession(klass), klass, req.user) : null,
    });
  }

  // Admin/Leitung
  return res.json({
    ...base,
    role: 'admin',
    stats: {
      users: db.all('users').length,
      classes: db.all('classes').length,
      students: db.all('users').filter((u) => u.role === ROLES.SCHUELER).length,
      pendingUsers: db.all('users').filter((u) => u.status === 'pending').length,
    },
  });
});

function publicOrg() {
  const o = org();
  return { name: o.name, shortName: o.shortName, socialLinks: o.socialLinks };
}

function nextSessionFor(user) {
  const classId = (user.classIds || [])[0];
  const klass = findClass(classId);
  if (!klass) return null;
  const today = db.all('sessions').find((s) => s.classId === classId && s.date === todayKey());
  if (today) return sessionView(today, klass, user);
  return {
    className: klass.name,
    weekday: klass.weekday,
    scheduledStart: null,
    startTime: klass.startTime,
    endTime: klass.endTime,
  };
}

// =============================================================================
// Admin: Nutzer & Klassen
// =============================================================================

router.get('/admin/users', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.LEITUNG), (_req, res) => {
  res.json({ users: db.all('users').map(publicUser) });
});

router.post('/admin/users', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.LEITUNG), async (req, res) => {
  const { name, email, password, role, classIds, childIds } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, E-Mail, Passwort erforderlich' });
  if (!ALL_ROLES.includes(role)) return res.status(400).json({ error: 'Ungültige Rolle' });
  if (role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN)
    return res.status(403).json({ error: 'Nur der System-Administrator kann diese Rolle vergeben' });
  if (findUserByEmail(email)) return res.status(409).json({ error: 'E-Mail bereits vergeben' });
  const user = {
    id: newId('user'),
    name: name.trim(),
    email: email.trim(),
    passwordHash: await hashPassword(password),
    role,
    classIds: classIds || [],
    childIds: childIds || [],
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  db.insert('users', user);
  audit(req.user.id, 'user.create', 'user', user.id, null, { role });
  res.json({ user: publicUser(user) });
});

// Nutzer nachträglich verwalten: Name, Rolle, Klassen, Eltern-Kind, Status.
router.patch('/admin/users/:id', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.LEITUNG), (req, res) => {
  const u = findUserById(req.params.id);
  if (!u) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
  // Nur der System-Administrator darf Super-Admins bearbeiten.
  if (u.role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN)
    return res.status(403).json({ error: 'Nur der System-Administrator darf diese Rolle bearbeiten' });

  const { name, role, classIds, childIds, status } = req.body || {};
  const before = { role: u.role, status: u.status, classIds: u.classIds, childIds: u.childIds };

  if (name && name.trim()) u.name = name.trim();

  if (role && role !== u.role) {
    if (!ALL_ROLES.includes(role)) return res.status(400).json({ error: 'Ungültige Rolle' });
    if ((role === ROLES.SUPER_ADMIN || u.role === ROLES.SUPER_ADMIN) && req.user.role !== ROLES.SUPER_ADMIN)
      return res.status(403).json({ error: 'Nur der System-Administrator darf diese Rolle vergeben/entziehen' });
    if (u.role === ROLES.SUPER_ADMIN) {
      const admins = db.all('users').filter((x) => x.role === ROLES.SUPER_ADMIN);
      if (admins.length <= 1) return res.status(400).json({ error: 'Der letzte System-Administrator kann nicht geändert werden' });
    }
    u.role = role;
  }

  if (Array.isArray(classIds)) u.classIds = classIds.filter((c) => findClass(c));
  if (Array.isArray(childIds))
    u.childIds = childIds.filter((id) => findUserById(id)?.role === ROLES.SCHUELER);

  if (status === 'active' || status === 'disabled') {
    if (status === 'disabled' && u.id === req.user.id)
      return res.status(400).json({ error: 'Das eigene Konto kann nicht deaktiviert werden' });
    u.status = status;
  }

  db.commit();
  audit(req.user.id, 'user.update', 'user', u.id, before, { role: u.role, status: u.status });
  res.json({ user: publicUser(u) });
});

router.post('/admin/classes', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.LEITUNG), (req, res) => {
  const { name, weekday, startTime, endTime, type, language } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  const klass = {
    id: newId('class'),
    organizationId: org().id,
    name: name.trim(),
    type: type || 'presence',
    language: language || 'de',
    weekday: Number.isFinite(weekday) ? weekday : 6,
    startTime: startTime || '14:00',
    endTime: endTime || '18:00',
    active: true,
    createdAt: new Date().toISOString(),
  };
  db.insert('classes', klass);
  audit(req.user.id, 'class.create', 'class', klass.id);
  res.json({ class: klass });
});

router.get('/admin/audit', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.LEITUNG), (_req, res) => {
  res.json({ logs: db.all('audit_logs').slice(-200).reverse() });
});

// Vollständiges Backup herunterladen (Leitung/Admin) – für Off-Site-Sicherung.
router.get('/admin/backup.json', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.LEITUNG), (req, res) => {
  audit(req.user.id, 'backup.download', 'organization', org().id);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="dbz-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(db.snapshot(), null, 2));
});

// Passwort eines Nutzers zurücksetzen (Leitung/Admin). Neues Passwort wird
// von der Leitung vergeben und der Person übergeben.
router.post('/admin/users/:id/reset-password', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.LEITUNG), async (req, res) => {
  const u = findUserById(req.params.id);
  if (!u) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
  if (u.role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN)
    return res.status(403).json({ error: 'Nur der System-Administrator darf dieses Passwort zurücksetzen' });
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'Das neue Passwort muss mindestens 6 Zeichen lang sein' });
  u.passwordHash = await hashPassword(newPassword);
  db.commit();
  audit(req.user.id, 'user.reset_password', 'user', u.id);
  res.json({ ok: true });
});

// =============================================================================
// Einladungen verwalten (Leitung/Admin; Lehrkräfte für die eigene Klasse)
// =============================================================================

const INVITE_ROLES_FOR_MANAGER = [ROLES.SCHUELER, ROLES.KLASSENSPRECHER, ROLES.ELTERN];

router.post('/admin/invites', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const { role, classId, expiresInDays, maxUses, childId } = req.body || {};
  if (!ALL_ROLES.includes(role)) return res.status(400).json({ error: 'Ungültige Rolle' });

  if (isAdmin(req.user)) {
    if (role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN)
      return res.status(403).json({ error: 'Nur der System-Administrator darf diese Rolle einladen' });
    if (classId && !findClass(classId)) return res.status(400).json({ error: 'Klasse nicht gefunden' });
  } else {
    if (!INVITE_ROLES_FOR_MANAGER.includes(role))
      return res.status(403).json({ error: 'Lehrkräfte können nur Schüler, Klassensprecher oder Eltern einladen' });
    if (!classId || !canManageClass(req.user, classId))
      return res.status(403).json({ error: 'Nur Einladungen für die eigene Klasse' });
  }
  if (childId && findUserById(childId)?.role !== ROLES.SCHUELER)
    return res.status(400).json({ error: 'Verknüpftes Kind ist kein Schüler' });

  const token = crypto.randomBytes(24).toString('base64url');
  const inv = {
    id: newId('inv'),
    tokenHash: hashInviteToken(token),
    intendedRole: role,
    classId: classId || null,
    childId: role === ROLES.ELTERN ? childId || null : null,
    organizationId: org().id,
    expiresAt: new Date(Date.now() + Math.min(90, Math.max(1, parseInt(expiresInDays, 10) || 14)) * 86400000).toISOString(),
    maxUses: Math.min(100, Math.max(1, parseInt(maxUses, 10) || 1)),
    usedCount: 0,
    createdBy: req.user.id,
    revoked: false,
    createdAt: new Date().toISOString(),
  };
  db.insert('invites', inv);
  audit(req.user.id, 'invite.create', 'invite', inv.id, null, { role, classId: classId || null });
  res.json({ token, invite: inviteView(inv) });
});

router.get('/admin/invites', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  let list = db.all('invites');
  if (!isAdmin(req.user)) list = list.filter((i) => i.createdBy === req.user.id);
  res.json({ invites: list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(inviteView) });
});

router.post('/admin/invites/:id/revoke', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const inv = byId('invites', req.params.id);
  if (!inv) return res.status(404).json({ error: 'Einladung nicht gefunden' });
  if (inv.createdBy !== req.user.id && !isAdmin(req.user)) return res.status(403).json({ error: 'Kein Zugriff' });
  inv.revoked = true;
  db.commit();
  audit(req.user.id, 'invite.revoke', 'invite', inv.id);
  res.json({ ok: true });
});

// =============================================================================
// CSV-Export (Verwaltung)
// =============================================================================

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
function sendCsv(res, filename, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(rows));
}

// Anwesenheitsübersicht einer Klasse als CSV (Verwalter der Klasse).
router.get('/export/attendance.csv', requireAuth, requireRole(CLASS_MANAGERS), (req, res) => {
  const klass = findClass(req.query.classId);
  if (!klass) return res.status(404).json({ error: 'Klasse nicht gefunden' });
  if (!canManageClass(req.user, klass.id)) return res.status(403).json({ error: 'Kein Zugriff' });
  const students = db.all('users').filter((u) => u.role === ROLES.SCHUELER && (u.classIds || []).includes(klass.id));
  const rows = [['Name', 'Sitzungen', 'Anwesend', 'Verspätet', 'Entschuldigt', 'Unentschuldigt', 'Ø Versp. (Min)', 'Quote %']];
  for (const s of students) {
    const a = attendanceStats(s.id);
    const rate = a.sessions ? Math.round(((a.present + a.late) / a.sessions) * 100) : 0;
    rows.push([s.name, a.sessions, a.present, a.late, a.excused, a.unexcused, a.avgMinutesLate, rate]);
  }
  audit(req.user.id, 'export.attendance', 'class', klass.id);
  sendCsv(res, `anwesenheit_${klass.name.replace(/\s+/g, '_')}.csv`, rows);
});

// Klassenliste als CSV (nur Leitung/Admin – enthält Kontaktdaten).
router.get('/export/roster.csv', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.LEITUNG), (req, res) => {
  const klass = findClass(req.query.classId);
  if (!klass) return res.status(404).json({ error: 'Klasse nicht gefunden' });
  const members = db.all('users').filter((u) => (u.classIds || []).includes(klass.id));
  const rows = [['Name', 'E-Mail', 'Rolle', 'Status']];
  members.forEach((u) => rows.push([u.name, u.email, ROLE_LABELS[u.role] || u.role, u.status]));
  audit(req.user.id, 'export.roster', 'class', klass.id);
  sendCsv(res, `klassenliste_${klass.name.replace(/\s+/g, '_')}.csv`, rows);
});

export default router;
