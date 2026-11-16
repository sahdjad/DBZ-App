// Verwaltung: Konten zu Personen zusammenfassen, Filter nach Klasse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePeople, classFilters } from '../people.js';

const acc = (id, role, extra = {}) => ({ id, name: extra.name || id, role, status: 'active', classIds: [], classNames: [], ...extra });

test('Eine Person mit vier Rollen erscheint einmal -- mit allen Rollen', () => {
  const users = [
    acc('s1', 'schueler', { personId: 'p1', name: 'Sahdjad', email: null, classIds: ['c3'], classNames: ['Klasse 3'] }),
    acc('p1', 'super_admin', { personId: 'p1', name: 'Sahdjad', email: 'admin@example.org', lastSeenAt: '2026-11-01' }),
    acc('l1', 'leitung', { personId: 'p1', name: 'Sahdjad', lastSeenAt: '2026-11-15' }),
    acc('t1', 'klassenlehrer', { personId: 'p1', name: 'Sahdjad', classIds: ['c3', 'c5'], classNames: ['Klasse 3', 'Klasse 5'] }),
    acc('x', 'schueler', { name: 'Amina', email: 'a@example.org', classIds: ['c3'], classNames: ['Klasse 3'] }),
  ];
  const people = mergePeople(users);
  assert.equal(people.length, 2);
  const me = people.find((p) => p.personId === 'p1');
  assert.equal(me.id, 'p1', 'Hauptkonto ist das Anmelde-Konto');
  assert.equal(me.email, 'admin@example.org');
  assert.deepEqual(me.roles.map((r) => r.role), ['super_admin', 'leitung', 'klassenlehrer', 'schueler'], 'wichtigste Rolle zuerst');
  assert.equal(me.role, 'super_admin');
  assert.deepEqual([...me.roleSet].sort(), ['klassenlehrer', 'leitung', 'schueler', 'super_admin']);
  assert.deepEqual(me.classNames, ['Klasse 3', 'Klasse 5']);
  assert.deepEqual(me.studentClassIds, ['c3'], 'Schüler nur in Klasse 3, Lehrkraft in 3 und 5');
  assert.equal(me.lastSeenAt, '2026-11-15');
  assert.deepEqual(me.accountIds.sort(), ['l1', 'p1', 's1', 't1']);
  assert.ok(me.searchText.includes('klasse 5') && me.searchText.includes('admin@example.org'));
});

test('Entzogene Rollen zählen nicht; ganz deaktivierte Person bleibt als inaktiv erkennbar', () => {
  const people = mergePeople([
    acc('a', 'klassenlehrer', { personId: 'a', email: 'a@x.de' }),
    acc('a2', 'leitung', { personId: 'a', status: 'disabled' }),
    acc('b', 'schueler', { personId: 'b', email: 'b@x.de', status: 'disabled' }),
    acc('c', 'schueler', { email: 'c@x.de', status: 'pending' }),
  ]);
  const a = people.find((p) => p.personId === 'a');
  assert.deepEqual([...a.roleSet], ['klassenlehrer']);
  assert.equal(a.status, 'active');
  assert.equal(a.roles.length, 2, 'entzogene Rolle bleibt in der Liste der Konten sichtbar');
  assert.equal(people.find((p) => p.personId === 'b').status, 'disabled');
  assert.equal(people.find((p) => p.id === 'c').status, 'pending');
});

test('Filter nach Klasse: Stammklassen zuerst, Zusatzkurse danach, Zähler je Gruppe', () => {
  const people = mergePeople([
    acc('s1', 'schueler', { classIds: ['c3', 'kurs'] }),
    acc('s2', 'klassensprecher', { classIds: ['c10'] }),
    acc('s3', 'schueler', {}),
    acc('t', 'klassenlehrer', { classIds: ['c3'] }),
    acc('e', 'eltern', {}),
  ]);
  const classes = [{ id: 'kurs', name: 'Walima-Kurs', kind: 'extra' }, { id: 'c10', name: 'Klasse 10', kind: 'regular' }, { id: 'c3', name: 'Klasse 3', kind: 'regular' }];
  const f = classFilters(classes, people);
  assert.deepEqual(f.map((x) => [x[1], x[3]]), [['Alle', 5], ['Klasse 3', 1], ['Klasse 10', 1], ['Walima-Kurs', 1], ['Ohne Klasse', 1], ['Mitarbeitende', 1], ['Eltern', 1]]);
  assert.equal(people.filter(f[1][2])[0].id, 's1', 'Lehrkraft der Klasse zählt nicht als Schüler der Klasse');
});
