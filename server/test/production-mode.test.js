// Prüft die Demo/Produktions-Trennung: sobald Supabase konfiguriert ist
// (useSupabase=true -> IS_PRODUCTION=true in server/api.js), dürfen
// Demo-Login, Demo-Seeding und "Demo-Konten reaktivieren" nicht mehr
// öffentlich erreichbar sein. Läuft bewusst in einer eigenen Datei (eigener
// Prozess unter `node --test`), damit die Supabase-Umgebungsvariablen nicht
// die restliche (Datei-Backend-)Testsuite verfälschen.
//
// Die konfigurierte Supabase-URL ist absichtlich nicht erreichbar (kein
// echtes Projekt) -- initStore() fällt dabei nach den eingebauten
// Wiederholungsversuchen automatisch in den "supabase-degraded"-Notmodus
// (lokales Datei-Backup), OHNE dass useSupabase/IS_PRODUCTION dadurch
// falsch würden: die Sperre hängt an der KONFIGURATION, nicht am
// tatsächlichen Verbindungserfolg. Das dauert durch die eingebauten
// Wiederholungsversuche ca. 20s (siehe initStore() in store.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dbz-prodtest-'));
process.env.DBZ_DATA_DIR = TMP;
process.env.JWT_SECRET = 'test-secret-production-mode-check-not-real';
process.env.SUPABASE_URL = 'https://fake-nonexistent-project.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'fake-service-role-key-for-test-only';

let server;
let base;

before(async () => {
  const { initStore } = await import('../store.js');
  const { seed } = await import('../seed.js');
  const { createApp } = await import('../app.js');
  await initStore(); // fällt nach Wiederholungsversuchen in den Notmodus (~20s)
  await seed();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
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
  assert.equal(health.data.mode, 'production', 'IS_PRODUCTION folgt der Supabase-Konfiguration, nicht dem Verbindungserfolg');
});

test('Seeding legt in Produktion KEINE Demo-Konten an', async () => {
  const c = client();
  const login = await c('POST', '/auth/login', { email: 'admin@dbz.de', password: 'demo1234' });
  assert.equal(login.status, 401, 'admin@dbz.de existiert nicht -- Demo-Seeding wurde in Produktion übersprungen');
});

test('Demo-Login bleibt in Produktion gesperrt, selbst wenn zufällig ein Konto mit Demo-E-Mail existiert', async () => {
  const { db, newId } = await import('../store.js');
  const { hashPassword } = await import('../auth.js');
  const pw = await hashPassword('echtesPasswort1');
  db.insert('users', {
    id: newId('user'), name: 'Test', email: 'admin@dbz.de', passwordHash: pw, role: 'super_admin',
    classIds: [], childIds: [], status: 'active', createdAt: new Date().toISOString(),
  });
  db.commit();

  const c = client();
  const login = await c('POST', '/auth/login', { email: 'admin@dbz.de', password: 'echtesPasswort1' });
  assert.equal(login.status, 401, 'Sperre greift nach E-Mail, nicht nur weil das Konto fehlt');
});

test('Demo-Konten reaktivieren ist in Produktion gesperrt, auch für einen echten, eingeloggten Admin', async () => {
  const { db, newId } = await import('../store.js');
  const { hashPassword } = await import('../auth.js');
  const pw = await hashPassword('echtesPasswort2');
  db.insert('users', {
    id: newId('user'), name: 'Echter Admin', email: 'echter-admin@dbz-intern.de', passwordHash: pw, role: 'super_admin',
    classIds: [], childIds: [], status: 'active', createdAt: new Date().toISOString(),
  });
  db.commit();

  const c = client();
  const login = await c('POST', '/auth/login', { email: 'echter-admin@dbz-intern.de', password: 'echtesPasswort2' });
  assert.equal(login.status, 200, 'echter Administrator wird NICHT ausgesperrt');

  const reactivate = await c('POST', '/admin/reactivate-demo-accounts', {});
  assert.equal(reactivate.status, 403, 'Reaktivierung ist in Produktion für niemanden verfügbar, auch nicht für berechtigte echte Admins');
});
