// Härtung (Audit November 2026): Absturzschutz, Rechte beim Verknüpfen von
// Konten, Push-Ziele, Datensicherung mit Wiederherstellung, Abwesenheit nur an
// die eigene Klasse. Eigene Datei = eigener Prozess und eigenes Datenverzeichnis.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dbz-hard-'));
process.env.DBZ_DATA_DIR = TMP;
process.env.JWT_SECRET = 'test-secret';

let server;
let base;

before(async () => {
  const { seed } = await import('../seed.js');
  const { createApp } = await import('../app.js');
  await seed();
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (method, p, body) => {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + '/api' + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    return { status: res.status, data };
  };
}
async function loginAs(email) {
  const c = client();
  const r = await c('POST', '/auth/login', { email, password: 'demo1234' });
  assert.equal(r.status, 200, `Login ${email}`);
  return c;
}
const alive = async () => (await fetch(base + '/api/health')).status;

test('Falsche Datentypen an öffentlichen Routen: 400 statt Absturz', async () => {
  const anon = client();
  const profile = { firstName: 'A', lastName: 'B', birthDate: '2010-01-01', gender: 'm', street: 'S', houseNumber: '1', zip: '1', city: 'C', phone: '1', selfPayer: true };
  const cases = [
    ['/auth/register-open', { name: 1, email: 'a@b.de', password: 'abcdef' }],
    ['/auth/register-open', { name: 'A', email: ['a@b.de'], password: 'abcdef' }],
    ['/auth/register-open', { name: 'A', email: 'neu@b.de', password: 'abcdef', ...profile, firstName: 5 }],
    ['/auth/register-open', { name: 'A', email: 'neu@b.de', password: 'abcdef', ...profile, siblings: { a: 1 } }],
    ['/auth/login', { email: 'schueler@dbz.de', password: 12345678 }],
    ['/auth/login', { email: { $ne: null }, password: 'x' }],
    ['/auth/login', [1, 2, 3]],
    ['/auth/forgot-password', { email: 42 }],
    ['/auth/reset-password', { token: {}, newPassword: [] }],
    ['/auth/register', { token: 7, name: {}, email: 1, password: 2 }],
  ];
  for (const [route, body] of cases) {
    const r = await anon('POST', route, body);
    assert.equal(r.status, 400, `${route} ${JSON.stringify(body)} -> ${r.status}`);
    assert.equal(await alive(), 200, 'Server läuft weiter');
  }
  // Überlange Eingabe wird abgelehnt.
  assert.equal((await anon('POST', '/auth/login', { email: 'a'.repeat(30000), password: 'x' })).status, 400);
  // Kaputtes JSON: 400, keine internen Details.
  const raw = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":' });
  assert.equal(raw.status, 400);
  assert.doesNotMatch(JSON.stringify(await raw.json()), /position|Unexpected|JSON/i);
  // Normale Anmeldung funktioniert weiter.
  await loginAs('schueler@dbz.de');
});

test('Fehler in einer asynchronen Route beenden den Prozess nicht', async () => {
  const c = await loginAs('schueler@dbz.de');
  // Kein Text-Feld der Tür-Prüfung: der Handler selbst stolpert (TypeError im async-Teil).
  const r = await c('POST', '/push/subscribe', { subscription: { endpoint: 5, keys: 7 } });
  assert.ok(r.status >= 400 && r.status < 500);
  assert.equal(await alive(), 200);
});

test('Leitung kann sich nicht mit einem Administrator-Konto verknüpfen', async () => {
  const leitung = await loginAs('leitung@dbz.de');
  const r = await leitung('POST', '/admin/link-accounts', { emailA: 'leitung@dbz.de', emailB: 'admin@dbz.de' });
  assert.equal(r.status, 403);
  assert.equal((await leitung('POST', '/me/switch/user_admin')).status, 403);
  assert.equal((await leitung('GET', '/auth/me')).data.user.role, 'leitung');
  // Auch nicht über ein drittes Konto als Umweg.
  assert.equal((await leitung('POST', '/admin/link-accounts', { emailA: 'schueler@dbz.de', emailB: 'admin@dbz.de' })).status, 403);
  // Erlaubt bleibt: Konten unterhalb der eigenen Stufe verknüpfen.
  assert.equal((await leitung('POST', '/admin/link-accounts', { emailA: 'lehrer@dbz.de', emailB: 'amina@dbz.de' })).status, 200);
  // Der System-Administrator darf weiterhin alles verknüpfen.
  const admin = await loginAs('admin@dbz.de');
  assert.equal((await admin('POST', '/admin/link-accounts', { emailA: 'admin@dbz.de', emailB: 'eltern@dbz.de' })).status, 200);
});

test('Push: nur Zustelldienste der Browser-Hersteller, nie interne Adressen', async () => {
  const { isAllowedPushEndpoint } = await import('../webpush.js');
  for (const ok of [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://web.push.apple.com/QGx',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://db5p.notify.windows.com/w/?token=abc',
  ]) assert.equal(isAllowedPushEndpoint(ok), true, ok);
  for (const bad of [
    'http://127.0.0.1:4555/x', 'https://127.0.0.1/x', 'http://fcm.googleapis.com/x', 'https://localhost/x',
    'https://169.254.169.254/latest/meta-data', 'https://fcm.googleapis.com.evil.example/x', 'https://evilpush.apple.com/x',
    'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'file:///etc/passwd', 'x', '', null,
  ]) assert.equal(isAllowedPushEndpoint(bad), false, String(bad));

  // Über die API: Ein interner Testdienst darf NIE angesprochen werden.
  let hits = 0;
  const probe = http.createServer((_q, s) => { hits++; s.end('ok'); });
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  try {
    const c = await loginAs('schueler@dbz.de');
    const crypto = await import('node:crypto');
    const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
    const b64 = (b) => Buffer.from(b).toString('base64url');
    const sub = { endpoint: `http://127.0.0.1:${probe.address().port}/intern`, keys: { p256dh: b64(ecdh.getPublicKey()), auth: b64(crypto.randomBytes(16)) } };
    assert.equal((await c('POST', '/push/subscribe', { subscription: sub })).status, 400);
    // Altbestand: ein früher gespeichertes Abo mit interner Adresse wird nicht mehr bedient.
    const { db } = await import('../store.js');
    db.insert('push_subscriptions', { id: 'push_alt', userId: 'user_yusuf', endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
    const t = await c('POST', '/push/test', {});
    assert.equal(t.status, 200);
    assert.equal(t.data.sent, 0);
    assert.equal(hits, 0, 'kein Aufruf an die interne Adresse');
  } finally { probe.close(); }
});

test('Abwesenheit lässt sich nur an die eigene Klasse melden', async () => {
  const admin = await loginAs('admin@dbz.de');
  const other = (await admin('POST', '/admin/classes', { name: 'Fremde Klasse' })).data.class;
  assert.ok(other?.id);
  const body = { requestType: 'absent', reasonCategory: 'krank', comment: 'Ich habe hohes Fieber und liege im Bett.' };
  const s = await loginAs('schueler@dbz.de');
  assert.equal((await s('POST', '/absence-requests', { ...body, classId: other.id })).status, 403);
  assert.equal((await s('POST', '/absence-requests', { ...body, classId: 'class_3' })).status, 200);
  assert.equal((await s('POST', '/absence-requests', body)).status, 200, 'ohne Klasse: eigene Klasse');
  const p = await loginAs('eltern@dbz.de');
  assert.equal((await p('POST', '/absence-requests', { ...body, studentId: 'user_yusuf', classId: other.id })).status, 403);
});

test('Datensicherung: täglich einmal, vor Massenlöschung, Wiederherstellung holt Gelöschtes zurück', async () => {
  const { ensureDailyBackup, listBackups, loadBackup } = await import('../backup.js');
  const first = await ensureDailyBackup();
  assert.equal(first.ok, true);
  const again = await ensureDailyBackup();
  assert.equal(again.existed, true, 'am selben Tag wird die erste Sicherung nicht überschrieben');
  assert.equal((await listBackups()).filter((b) => b.kind === 'daily').length, 1);

  const admin = await loginAs('admin@dbz.de');
  // Nur der System-Administrator sieht und nutzt Sicherungen.
  const leitung = await loginAs('leitung@dbz.de');
  assert.equal((await leitung('GET', '/admin/backups')).status, 403);
  assert.equal((await leitung('GET', '/admin/backup.json')).status, 403);
  assert.equal((await leitung('POST', `/admin/backups/${first.name}/restore`, { confirm: 'WIEDERHERSTELLEN' })).status, 403);

  // Abzug enthält keine Geheimnisse.
  const dump = (await admin('GET', '/admin/backup.json')).data;
  assert.ok(dump.users.length > 3);
  assert.doesNotMatch(JSON.stringify(dump), /passwordHash|"familyCode"|calendarToken|push_keys|password_resets/);

  // Massenlöschung legt vorher automatisch eine Sicherung an.
  const before = (await listBackups()).filter((b) => b.kind === 'event').length;
  const del = await admin('POST', '/admin/users/bulk-delete', { ids: ['user_amina'] });
  assert.equal(del.status, 200);
  assert.equal(del.data.results[0].ok, true);
  const events = (await listBackups()).filter((b) => b.kind === 'event');
  assert.equal(events.length, before + 1);
  const snap = await loadBackup(events[0].name);
  assert.ok(snap.users.some((u) => u.id === 'user_amina'), 'Sicherung enthält den Stand VOR der Löschung');
  assert.equal((await admin('GET', '/admin/users')).data.users.some((u) => u.id === 'user_amina'), false);

  // Wiederherstellen: nur mit Bestätigung, danach ist das Konto wieder da und kann sich anmelden.
  assert.equal((await admin('POST', `/admin/backups/${events[0].name}/restore`, { confirm: 'ja' })).status, 400);
  assert.equal((await admin('POST', '/admin/backups/event-gibt-es-nicht.json.gz/restore', { confirm: 'WIEDERHERSTELLEN' })).status, 404);
  assert.equal((await admin('POST', '/admin/backups/..%2Fdb.json/restore', { confirm: 'WIEDERHERSTELLEN' })).status, 404);
  const r = await admin('POST', `/admin/backups/${events[0].name}/restore`, { confirm: 'WIEDERHERSTELLEN' });
  assert.equal(r.status, 200);
  assert.equal((await admin('GET', '/admin/users')).data.users.some((u) => u.id === 'user_amina'), true);
  await loginAs('amina@dbz.de');
  // Die Wiederherstellung hat selbst eine Sicherung angelegt (lässt sich zurücknehmen).
  assert.ok((await listBackups()).some((b) => b.name.includes('vor-wiederherstellung')));
});

test('Sicherungen werden begrenzt: höchstens 30 tägliche und 20 anlassbezogene', async () => {
  const { backupNow, listBackups, KEEP_DAILY, KEEP_EVENT } = await import('../backup.js');
  const dir = path.join(TMP, 'backups');
  const sample = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]));
  const day = (i) => new Date(Date.UTC(2025, 0, i)).toISOString().slice(0, 10);
  for (let i = 1; i <= 40; i++) fs.writeFileSync(path.join(dir, `daily-${day(i)}.json.gz`), sample);
  for (let i = 1; i <= 30; i++) fs.writeFileSync(path.join(dir, `event-${day(i)}T10-00-00-alt.json.gz`), sample);
  assert.equal((await backupNow('event', 'Test!')).ok, true);
  const all = await listBackups();
  assert.equal(all.filter((b) => b.kind === 'daily').length, KEEP_DAILY);
  assert.equal(all.filter((b) => b.kind === 'event').length, KEEP_EVENT);
  assert.ok(all.some((b) => b.name.startsWith(`daily-${new Date().toISOString().slice(0, 10)}`)), 'die neueste tägliche bleibt');
  assert.ok(all.some((b) => /-test\.json\.gz$/.test(b.name)), 'neue Sicherung bleibt, Name bereinigt');
  assert.equal(all.some((b) => b.name.includes('2025-01-01')), false, 'älteste entfernt');
});
