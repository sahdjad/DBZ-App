// Kurzzeit-Speicher in lib/api.js: Daten dürfen nie über Personen- oder
// Rollengrenzen hinweg sichtbar werden, und nach jeder Änderung gibt es keinen
// veralteten Stand. Dazu der gemeinsame Kalender-Bereich (lib/calendarRange.js).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, peek, setCacheOwner } from '../api.js';
import { monthGrid, calendarUrl, dateKey } from '../calendarRange.js';

const calls = [];
let pending = null; // optional: Promise, auf die die nächste Antwort wartet
globalThis.fetch = async (url, opts) => {
  calls.push([opts?.method || 'GET', url]);
  if (pending) await pending;
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ url, n: calls.length }),
  };
};

beforeEach(() => { setCacheOwner(null); calls.length = 0; pending = null; });

test('nur für die angemeldete Person gespeichert; Wechsel leert alles', async () => {
  setCacheOwner('user_a');
  await api.get('/dashboard');
  assert.equal(peek('/dashboard').url, '/api/dashboard');
  setCacheOwner('user_b'); // anderes Konto oder andere Rolle (eigene ID)
  assert.equal(peek('/dashboard'), null);
  setCacheOwner('user_a'); // zurück: nichts vom vorherigen Besuch übrig
  assert.equal(peek('/dashboard'), null);
});

test('ohne Anmeldung und für /auth wird nichts gespeichert', async () => {
  await api.get('/dashboard');
  assert.equal(peek('/dashboard'), null);
  setCacheOwner('user_a');
  await api.get('/auth/me');
  assert.equal(peek('/auth/me'), null);
});

test('späte Antwort nach einem Kontowechsel wird verworfen', async () => {
  setCacheOwner('user_a');
  let release;
  pending = new Promise((r) => { release = r; });
  const req = api.get('/threads');
  setCacheOwner('user_b');
  release();
  await req;
  assert.equal(peek('/threads'), null);
});

test('jede Änderung leert den Speicher, reine Lese-Markierungen nicht', async () => {
  setCacheOwner('user_a');
  await api.get('/assignments');
  await api.post('/notifications/read-route', { route: '/aufgaben' });
  await api.post('/me/consent', { version: 1 });
  assert.ok(peek('/assignments'));
  await api.post('/assignments', { title: 'x' });
  assert.equal(peek('/assignments'), null);
});

test('Kalender: Monatsraster beginnt montags und umfasst 6 Wochen', () => {
  const r = monthGrid(new Date(2026, 9, 23));
  assert.equal(dateKey(r.from), '2026-09-28');
  assert.equal(dateKey(r.to), '2026-11-08');
  assert.equal(calendarUrl(r), '/calendar?from=2026-09-28&to=2026-11-08');
  // Monat, der an einem Montag beginnt
  assert.equal(dateKey(monthGrid(new Date(2026, 5, 15)).from), '2026-06-01');
});
