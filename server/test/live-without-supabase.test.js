// Prüft den eigentlichen Auslöser dieser Änderung: ein echtes Deployment,
// das OHNE Supabase (Datei-Speicherung) läuft -- genau wie das reale
// Render-Deployment dieser App --, muss trotzdem die volle Demo/Produktions-
// Trennung bekommen, sobald DBZ_LIVE=1 gesetzt ist. Vorher war IS_PRODUCTION
// fälschlich an "Supabase konfiguriert?" gekoppelt: ohne Supabase blieben
// Demo-Konten (z. B. die Klassenlehrkraft "Ustadh Yunus") immer aktiv UND
// für echte, gerade registrierte Nutzer in derselben Klasse sichtbar.
// Eigene Datei/eigener Prozess, damit die Umgebungsvariable nicht die
// restliche (Datei-Backend-)Testsuite verfälscht.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dbz-livetest-'));
process.env.DBZ_DATA_DIR = TMP;
process.env.JWT_SECRET = 'test-secret-live-without-supabase-check-not-real';
process.env.DBZ_LIVE = '1';
// Bewusst KEIN SUPABASE_URL/SUPABASE_SERVICE_KEY -- genau der Fall, der
// vorher durchs Raster fiel.

let server;
let base;

before(async () => {
  const { initStore, useSupabase } = await import('../store.js');
  const { seed } = await import('../seed.js');
  const { createApp } = await import('../app.js');
  assert.equal(useSupabase, false, 'dieser Test prüft ausdrücklich den Fall OHNE Supabase');
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

test('Health meldet Produktionsmodus mit DBZ_LIVE=1, obwohl kein Supabase konfiguriert ist', async () => {
  const c = client();
  const health = await c('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.mode, 'production');
  assert.equal(health.data.storage, 'file', 'Speicher-Backend bleibt Datei -- nur der Demo/Produktions-Schalter ändert sich');
});

test('Seeding legt mit DBZ_LIVE=1 KEINE Demo-Konten an (kein Ustadh Yunus, kein admin@dbz.de)', async () => {
  const c = client();
  const login = await c('POST', '/auth/login', { email: 'admin@dbz.de', password: 'demo1234' });
  assert.equal(login.status, 401, 'admin@dbz.de existiert nicht -- Demo-Seeding wurde übersprungen');
  const lehrer = await c('POST', '/auth/login', { email: 'lehrer@dbz.de', password: 'demo1234' });
  assert.equal(lehrer.status, 401, 'Die Demo-Klassenlehrkraft "Ustadh Yunus" wurde nicht angelegt');
});

test('Demo-Konten reaktivieren ist mit DBZ_LIVE=1 gesperrt, auch für einen echten, eingeloggten Admin', async () => {
  const { db, newId } = await import('../store.js');
  const { hashPassword } = await import('../auth.js');
  const pw = await hashPassword('echtesPasswort3');
  db.insert('users', {
    id: newId('user'), name: 'Echter Admin', email: 'echter-admin-2@dbz-intern.de', passwordHash: pw, role: 'super_admin',
    classIds: [], childIds: [], status: 'active', createdAt: new Date().toISOString(),
  });
  db.commit();

  const c = client();
  const login = await c('POST', '/auth/login', { email: 'echter-admin-2@dbz-intern.de', password: 'echtesPasswort3' });
  assert.equal(login.status, 200);

  const reactivate = await c('POST', '/admin/reactivate-demo-accounts', {});
  assert.equal(reactivate.status, 403);
});
