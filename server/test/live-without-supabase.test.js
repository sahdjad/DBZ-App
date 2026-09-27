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
  const fn = async (method, urlPath, body) => {
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
  fn.cookie = async () => cookie;
  return fn;
}

test('Health meldet Produktionsmodus mit DBZ_LIVE=1, obwohl kein Supabase konfiguriert ist', async () => {
  const c = client();
  const health = await c('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.mode, 'production');
  assert.equal(health.data.storage, 'file', 'Speicher-Backend bleibt Datei -- nur der Demo/Produktions-Schalter ändert sich');
});

test('Seeding legt mit DBZ_LIVE=1 KEINE Demo-Konten in der echten Datenbank an', async () => {
  const { db } = await import('../store.js');
  assert.ok(!db.all('users').some((u) => ['admin@dbz.de', 'lehrer@dbz.de'].includes(u.email)));
});

test('Demo-Sandkasten: vollständige Trennung -- nichts aus der Demo landet in der echten Datenbank oder auf der Festplatte', async () => {
  const { db, newId } = await import('../store.js');
  const { hashPassword } = await import('../auth.js');
  // Echte Klasse + echter Schüler + echter Admin
  db.insert('classes', { id: 'class_real', name: 'Echte Klasse', weekday: 6, startTime: '14:00', endTime: '18:00', active: true, createdAt: new Date().toISOString() });
  db.insert('users', { id: newId('user'), name: 'Echter Schüler', email: 'echt-schueler@dbz-intern.de', passwordHash: await hashPassword('echt12345'), role: 'schueler', classIds: ['class_real'], childIds: [], status: 'active', createdAt: new Date().toISOString() });
  db.insert('users', { id: newId('user'), name: 'Echter Admin', email: 'echt-admin@dbz-intern.de', passwordHash: await hashPassword('echt12345'), role: 'super_admin', classIds: [], childIds: [], status: 'active', createdAt: new Date().toISOString() });
  db.commit();
  const realUsersBefore = db.all('users').length;

  const demo = client();
  const login = await demo('POST', '/auth/login', { email: 'admin@dbz.de', password: 'demo1234' });
  assert.equal(login.status, 200, 'Demo-Zugang funktioniert (im Sandkasten)');
  assert.equal(login.data.user.demo, true);
  const users = (await demo('GET', '/admin/users')).data.users;
  assert.ok(users.some((u) => u.name === 'Ustadh Yunus'), 'Sandkasten hat die Demo-Beispieldaten');
  assert.ok(!users.some((u) => u.email.endsWith('@dbz-intern.de')), 'keine echten Konten sichtbar');
  assert.ok(!(await demo('GET', '/classes')).data.classes.some((c) => c.id === 'class_real'), 'keine echte Klasse sichtbar');

  // Im Sandkasten Daten ändern
  const created = await demo('POST', '/admin/users', { name: 'Demo Neu', email: `demo-neu-${Date.now()}@x.de`, password: 'passwort1', role: 'schueler', classIds: ['class_3'] });
  assert.equal(created.status, 200);
  const teacherDemo = client();
  await teacherDemo('POST', '/auth/login', { email: 'lehrer@dbz.de', password: 'demo1234' });
  const asg = await teacherDemo('POST', '/assignments', { classId: 'class_3', title: 'Nur Demo-Aufgabe', type: 'text' });
  assert.equal(asg.status, 200);

  // Datei-Upload aus der Demo (Kontext darf beim Upload nicht verloren gehen)
  const sDemo = client();
  await sDemo('POST', '/auth/login', { email: 'schueler@dbz.de', password: 'demo1234' });
  const cookie = await sDemo.cookie();
  const form = new FormData();
  form.set('recipientId', 'inbox:klasse');
  form.set('body', 'Demo mit Anhang');
  form.set('file', new Blob([Buffer.from('%PDF-1.4 demo')], { type: 'application/pdf' }), 'demo.pdf');
  const up = await fetch(`${base}/api/threads`, { method: 'POST', headers: { cookie }, body: form });
  assert.equal(up.status, 200);

  // Echte Datenbank unverändert
  assert.equal(db.all('users').length, realUsersBefore, 'keine Demo-Konten in der echten Datenbank');
  assert.ok(!db.all('assignments').some((a) => a.title === 'Nur Demo-Aufgabe'));
  assert.ok(!db.all('threads').some((t) => (t.messages || []).some((m) => m.body === 'Demo mit Anhang')), 'Upload-Anfrage blieb im Sandkasten');
  const onDisk = fs.readFileSync(path.join(TMP, 'db.json'), 'utf8');
  assert.ok(!onDisk.includes('Nur Demo-Aufgabe') && !onDisk.includes('Ustadh Yunus'), 'nichts davon auf der Festplatte');

  // Echter Admin sieht nichts aus der Demo
  const real = client();
  assert.equal((await real('POST', '/auth/login', { email: 'echt-admin@dbz-intern.de', password: 'echt12345' })).status, 200);
  const realList = (await real('GET', '/admin/users')).data.users;
  assert.ok(!realList.some((u) => u.name === 'Ustadh Yunus' || u.name === 'Demo Neu'));
  assert.ok(!(await real('GET', '/auth/me')).data.user.demo);
});
