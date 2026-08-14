// Rollen- und Berechtigungsmodell der DBZ-App.
//
// Grundsatz (docs/ROLES_PERMISSIONS.md §9): Berechtigungen werden serverseitig
// erzwungen, nicht nur im Frontend versteckt. Alle sensiblen Routen prüfen Rolle
// UND Klassen-/Besitz-Scope.

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  LEITUNG: 'leitung', // DBZ-Leitung / Hauptadministration
  KLASSENLEHRER: 'klassenlehrer', // fester Klassenlehrer / Klassenadmin
  VERTRETUNG: 'vertretung', // Vertretungslehrer (temporär, begrenzt)
  KLASSENSPRECHER: 'klassensprecher',
  SCHUELER: 'schueler',
  ELTERN: 'eltern',
};

export const ALL_ROLES = Object.values(ROLES);

// Rollen mit Lehr-/Leitungsbefugnis in ihrer Klasse.
export const TEACHING_ROLES = [ROLES.KLASSENLEHRER, ROLES.VERTRETUNG];
export const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.LEITUNG];
// Rollen, die eine Klasse fachlich verwalten (Anwesenheit, Aufgaben, Freigaben).
export const CLASS_MANAGERS = [ROLES.SUPER_ADMIN, ROLES.LEITUNG, ROLES.KLASSENLEHRER, ROLES.VERTRETUNG];

export const ROLE_LABELS = {
  super_admin: 'System-Administrator',
  leitung: 'DBZ-Leitung',
  klassenlehrer: 'Klassenlehrer',
  vertretung: 'Vertretungslehrer',
  klassensprecher: 'Klassensprecher',
  schueler: 'Schüler',
  eltern: 'Eltern',
};

export function isAdmin(user) {
  return ADMIN_ROLES.includes(user.role);
}

export function isClassManager(user) {
  return CLASS_MANAGERS.includes(user.role);
}

/**
 * Darf `user` die Klasse `classId` fachlich verwalten?
 * - Super-Admin/Leitung: alle Klassen.
 * - Klassenlehrer/Vertretung: nur zugewiesene Klassen (user.classIds).
 */
export function canManageClass(user, classId) {
  if (isAdmin(user)) return true;
  if (TEACHING_ROLES.includes(user.role)) return (user.classIds || []).includes(classId);
  return false;
}

/** Darf `user` die Daten von Schüler `studentId` sehen (nicht: verwalten)? */
export function canViewStudent(user, student) {
  if (!student) return false;
  if (isAdmin(user)) return true;
  if (user.id === student.id) return true; // eigene Daten
  if (TEACHING_ROLES.includes(user.role)) {
    // Lehrkraft: gemeinsame Klasse
    return (user.classIds || []).some((c) => (student.classIds || []).includes(c));
  }
  if (user.role === ROLES.ELTERN) {
    return (user.childIds || []).includes(student.id);
  }
  return false;
}

/** Express-Middleware-Fabrik: verlangt eine der angegebenen Rollen. */
export function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (!allowed.includes(req.user.role))
      return res.status(403).json({ error: 'Keine Berechtigung für diese Aktion' });
    next();
  };
}
