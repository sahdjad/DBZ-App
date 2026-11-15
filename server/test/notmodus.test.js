// Notmodus: Supabase ist beim Start nicht erreichbar (z. B. pausiertes
// Free-Projekt). Der Server darf dann weder eine leere Schule zeigen noch
// Eingaben annehmen, die später verloren wären -- und er darf die echten Daten
// nie überschreiben. Sobald Supabase antwortet, arbeitet er von selbst weiter.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFakeSupabase } from './helpers/fake-supabase.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dbz-notmodus-'));
process.env.DBZ_DATA_DIR = TMP;
process.env.JWT_SECRET = 'test-secret-notmodus-0123456789';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.DBZ_RECOVERY_MS = '300';

let fake;
let server;
let base;
const REAL = {
  organizations: [{ id: 'org1', name: 'Echte Schule' }],
  users: [{ id: 'u_echt', name: 'Echte Leitung', email: 'echt@example.org', role: 'super_admin', status: 'active', classIds: [], childIds: [] }],
  classes: [{ id: 'c1', name: 'Echte Klasse' }],
  meta: { seeded: true },
};

before(async () => {
  fake = await startFakeSupabase();
  process.env.SUPABASE_URL = fake.url;
  const { hashPassword } = await import('../auth.js');
  REAL.users[0].passwordHash = await hashPassword('echtesPasswort1');
  fake.row = JSON.parse(JSON.stringify(REAL));
  fake.down = true; // Ausfall beim Start
  const { initStore } = await import('../store.js');
  const { seed } = await import('../seed.js');
  const { createApp } = await import('../app.js');
  await initStore(); // 5 Versuche mit Pausen, dann Notmodus (~20 s)
  await seed();
  await new Promise((resolve) => { server = createApp().listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  server?.close();
  fake?.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

const post = (p, body, cookie) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

test('Notmodus: Wartungsmeldung statt leerer Schule, echte Daten bleiben unberührt, Demo läuft', async () => {
  const health = await (await fetch(base + '/health')).json();
  assert.equal(health.storage, 'supabase-degraded');

  // Echte Anmeldung: klare Wartungsmeldung, nicht „Passwort falsch".
  const login = await post('/auth/login', { email: 'echt@example.org', password: 'echtesPasswort1' });
  assert.equal(login.status, 503);
  assert.equal((await login.json()).maintenance, true);
  // Keine Registrierung, kein Passwort-Link, keine Daten.
  assert.equal((await post('/auth/register-open', { name: 'Neu', email: 'neu@example.org', password: 'abcdef' })).status, 503);
  assert.equal((await post('/auth/forgot-password', { email: 'echt@example.org' })).status, 503);
  assert.equal((await fetch(base + '/org')).status, 503);

  // Demo-Sandkasten ist unabhängig von der Datenbank.
  const demo = await post('/auth/login', { email: 'lehrer@dbz.de', password: 'demo1234' });
  assert.equal(demo.status, 200);
  const cookie = demo.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base + '/push/status', { headers: { cookie } })).status, 200);

  // In Supabase wurde nichts geschrieben.
  assert.deepEqual(fake.row.users.map((u) => u.id), ['u_echt']);
  assert.equal(fake.calls.some((c) => c.startsWith('POST /rest/v1/app_state')), false);
});

test('Notmodus endet von selbst, sobald Supabase wieder antwortet -- mit dem echten Bestand', async () => {
  fake.down = false;
  let storage = '';
  for (let i = 0; i < 40 && storage !== 'supabase'; i++) {
    await new Promise((r) => setTimeout(r, 100));
    storage = (await (await fetch(base + '/health')).json()).storage;
  }
  assert.equal(storage, 'supabase');
  const login = await post('/auth/login', { email: 'echt@example.org', password: 'echtesPasswort1' });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.name, 'Echte Leitung');
  const { db, flushStore } = await import('../store.js');
  assert.equal(db.all('classes')[0].name, 'Echte Klasse');
  await flushStore();
  assert.equal(fake.state().classes[0].name, 'Echte Klasse', 'echter Bestand steht weiterhin in Supabase');
  assert.equal(fake.state().users.some((u) => u.id === 'u_echt'), true);
  assert.equal(fake.row.users[0].id, 'u_echt', 'die alte Zeile bleibt unverändert stehen');
});

test('Schutz: ein leerer Bestand überschreibt nie vorhandene Daten', async () => {
  const { db, flushStore } = await import('../store.js');
  db.all('users').length = 0; // simulierter Programmfehler
  db.commit();
  await flushStore();
  assert.equal(fake.state().users.some((u) => u.id === 'u_echt'), true, 'Supabase behält die Nutzer');
});
