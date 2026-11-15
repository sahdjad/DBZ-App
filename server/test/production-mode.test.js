// Prüft die Demo/Produktions-Trennung, wenn Supabase konfiguriert ist
// (IS_PRODUCTION=true): kein Demo-Seeding in der echten Datenbank; Demo-
// Zugänge landen ausschließlich im abgeschotteten Sandkasten. Läuft bewusst in
// einer eigenen Datei (eigener Prozess unter `node --test`), damit die
// Supabase-Umgebungsvariablen nicht die restliche (Datei-Backend-)Testsuite
// verfälschen. Supabase ist hier ein nachgebauter Dienst (helpers/fake-supabase.js);
// das Verhalten bei einem Ausfall prüft notmodus.test.js.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFakeSupabase } from './helpers/fake-supabase.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dbz-prodtest-'));
process.env.DBZ_DATA_DIR = TMP;
process.env.JWT_SECRET = 'test-secret-production-mode-check-not-real';
process.env.SUPABASE_SERVICE_KEY = 'service-key';

let server;
let base;
let fake;

before(async () => {
  fake = await startFakeSupabase();
  process.env.SUPABASE_URL = fake.url;
  const { initStore } = await import('../store.js');
  const { seed } = await import('../seed.js');
  const { createApp } = await import('../app.js');
  await initStore();
  await seed();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fake?.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (method, urlPath, body) => {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (body) headers['content-type'] = 'application/json';
    const res = await fetch(base + '/api' + urlPath, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    return { status: res.status, data };
  };
}

test('Health meldet Produktionsmodus, wenn Supabase konfiguriert ist', async () => {
  const c = client();
  const health = await c('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.mode, 'production', 'IS_PRODUCTION folgt der Supabase-Konfiguration');
  assert.equal(health.data.storage, 'supabase');
});

test('Seeding legt in Produktion KEINE Demo-Konten in der echten Datenbank an', async () => {
  const { db } = await import('../store.js');
  assert.ok(!db.all('users').some((u) => u.email === 'admin@dbz.de'), 'kein Demo-Konto in der echten Datenbank');
});

test('Demo-Login landet im abgeschotteten Sandkasten -- echte Konten bleiben unsichtbar', async () => {
  const { db, newId } = await import('../store.js');
  const { hashPassword } = await import('../auth.js');
  db.insert('users', {
    id: newId('user'), name: 'Echter Admin', email: 'echter-admin@dbz-intern.de', passwordHash: await hashPassword('echtesPasswort2'), role: 'super_admin',
    classIds: [], childIds: [], status: 'active', createdAt: new Date().toISOString(),
  });
  db.commit();
  const demo = client();
  const login = await demo('POST', '/auth/login', { email: 'admin@dbz.de', password: 'demo1234' });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.demo, true);
  const users = (await demo('GET', '/admin/users')).data.users;
  assert.ok(!users.some((u) => u.email === 'echter-admin@dbz-intern.de'), 'Sandkasten sieht keine echten Konten');
  assert.equal((await demo('POST', '/admin/reactivate-demo-accounts', {})).status, 404, 'alte Reaktivierung gibt es nicht mehr');
});

test('Existiert ein ECHTES Konto mit einer Demo-E-Mail, gilt das echte Konto (kein Sandkasten, kein Demo-Passwort)', async () => {
  const { db, newId } = await import('../store.js');
  const { hashPassword } = await import('../auth.js');
  db.insert('users', {
    id: newId('user'), name: 'Echte Leitung', email: 'leitung@dbz.de', passwordHash: await hashPassword('echtesPasswort1'), role: 'leitung',
    classIds: [], childIds: [], status: 'active', createdAt: new Date().toISOString(),
  });
  db.commit();
  const c = client();
  assert.equal((await c('POST', '/auth/login', { email: 'leitung@dbz.de', password: 'demo1234' })).status, 401);
  const ok = await c('POST', '/auth/login', { email: 'leitung@dbz.de', password: 'echtesPasswort1' });
  assert.equal(ok.status, 200);
  assert.ok(!ok.data.user.demo);
});
