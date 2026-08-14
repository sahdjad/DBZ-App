// Authentifizierung der DBZ-App: bcrypt-Passwörter + JWT im httpOnly-Cookie.
//
// Sicherheitsgrundsätze (docs/SECURITY_PRIVACY.md):
// - Passwörter niemals im Klartext speichern (bcrypt).
// - Token im httpOnly-Cookie (kein Zugriff durch JavaScript / XSS-Schutz).
// - JWT_SECRET zwingend über Umgebungsvariable in Produktion setzen.

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const JWT_SECRET =
  process.env.JWT_SECRET || 'dbz-dev-secret-nur-fuer-lokale-entwicklung-bitte-aendern';
const COOKIE_NAME = 'dbz_token';
const TOKEN_TTL = '7d';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function issueToken(res, user) {
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearToken(res) {
  res.clearCookie(COOKIE_NAME);
}

export function readToken(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
