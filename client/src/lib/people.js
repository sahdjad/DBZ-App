// Personen statt Konten: Jede Rolle einer Person ist technisch ein eigenes
// Konto (Schüler + Lehrkraft + Leitung …). In der Verwaltung soll eine Person
// aber EINMAL erscheinen -- mit allen Rollen darunter. Reine Rechenfunktionen,
// geprüft in test/people.test.js.

export const ROLE_ORDER = ['super_admin', 'leitung', 'klassenlehrer', 'vertretung', 'klassensprecher', 'schueler', 'eltern'];
const rank = (role) => { const i = ROLE_ORDER.indexOf(role); return i < 0 ? 99 : i; };
const STUDENT = ['schueler', 'klassensprecher'];

/**
 * Fasst Konten zu Personen zusammen. `users`: Konten mit `personId` (vom
 * Server; fehlt sie, zählt das Konto als eigene Person).
 * Ergebnis je Person: das Hauptkonto (id, name, E-Mail …) plus
 *   roles      alle Konten der Person, wichtigste Rolle zuerst
 *   roleSet    Menge der aktiven Rollen
 *   classIds / classNames   Klassen aller Rollen zusammen
 *   studentClassIds         Klassen, in denen die Person SCHÜLER ist
 *   status     'active', sobald irgendein Konto aktiv ist
 */
export function mergePeople(users) {
  const groups = new Map();
  for (const u of users) {
    const key = u.personId || u.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(u);
  }
  const people = [];
  for (const [personId, accounts] of groups) {
    const sorted = [...accounts].sort((a, b) => (a.status === 'disabled') - (b.status === 'disabled') || rank(a.role) - rank(b.role));
    const main = accounts.find((a) => a.id === personId) || accounts.find((a) => a.email) || sorted[0];
    const live = sorted.filter((a) => a.status !== 'disabled');
    const shown = live.length ? live : sorted;
    const uniq = (list) => [...new Set(list.filter(Boolean))];
    people.push({
      ...main,
      id: main.id,
      personId,
      role: shown[0].role, // wichtigste Rolle (für Sortierung und Anzeige)
      roles: sorted.map((a) => ({ id: a.id, role: a.role, status: a.status, classNames: a.classNames || [] })),
      roleSet: new Set(shown.map((a) => a.role)),
      accountIds: [main.id, ...accounts.filter((a) => a.id !== main.id).map((a) => a.id)], // Anmelde-Konto zuerst
      classIds: uniq(shown.flatMap((a) => a.classIds || [])),
      classNames: uniq(shown.flatMap((a) => a.classNames || [])),
      studentClassIds: uniq(shown.filter((a) => STUDENT.includes(a.role)).flatMap((a) => a.classIds || [])),
      status: live.length ? (live.some((a) => a.status === 'active') ? 'active' : live[0].status) : 'disabled',
      lastSeenAt: accounts.map((a) => a.lastSeenAt || '').sort().pop() || null,
      email: main.email || main.loginEmail || accounts.map((a) => a.email).find(Boolean) || null,
      studentNumber: accounts.map((a) => a.studentNumber).find(Boolean) || null,
      searchText: uniq([main.name, ...accounts.flatMap((a) => [a.name, a.email, a.loginEmail, a.studentNumber, ...(a.classNames || [])])]).join(' ').toLowerCase(),
    });
  }
  return people;
}

/** Filter „nach Klasse": je Klasse die Schüler, dazu Mitarbeitende, Eltern, ohne Klasse. */
export function classFilters(classes, people) {
  const byName = (a, b) => (a.kind === 'extra') - (b.kind === 'extra') || a.name.localeCompare(b.name, 'de', { numeric: true });
  const isStudent = (p) => STUDENT.some((r) => p.roleSet.has(r));
  return [
    ['all', 'Alle', () => true],
    ...[...classes].sort(byName).map((c) => [`class:${c.id}`, c.name, (p) => p.studentClassIds.includes(c.id)]),
    ['none', 'Ohne Klasse', (p) => isStudent(p) && p.studentClassIds.length === 0],
    ['staff', 'Mitarbeitende', (p) => ['super_admin', 'leitung', 'klassenlehrer', 'vertretung'].some((r) => p.roleSet.has(r))],
    ['eltern', 'Eltern', (p) => p.roleSet.has('eltern')],
  ].map(([key, label, fn]) => [key, label, fn, people.filter(fn).length]);
}
