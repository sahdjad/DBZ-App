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
  assert.equal((await admin('PATCH', '/admin/users/user_amina', { status: 'disabled' })).status, 200);
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
  // Gesichert wurde der Stand nach dem Deaktivieren -- wieder aktivieren, dann klappt die Anmeldung.
  assert.equal((await admin('PATCH', '/admin/users/user_amina', { status: 'active' })).status, 200);
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

// ---- Stufe 2 -------------------------------------------------------------------

test('Sitzungen: Passwortwechsel und „überall abmelden" beenden andere Anmeldungen', async () => {
  const admin = await loginAs('admin@dbz.de');
  const email = `sitzung-${Date.now()}@dbz.de`;
  const u = (await admin('POST', '/admin/users', { name: 'Sitzung Test', email, password: 'demo1234', role: 'klassenlehrer', classIds: ['class_3'] })).data.user;
  const role = (await admin('POST', `/admin/users/${u.id}/roles`, { role: 'schueler' })).data.account;

  const handy = await loginAs(email);
  const laptop = await loginAs(email);
  const tablet = await loginAs(email);
  assert.equal((await tablet('POST', `/me/switch/${role.id}`)).status, 200); // andere Rolle derselben Person
  assert.equal((await handy('GET', '/push/status')).status, 200);

  // Passwort am Laptop ändern: Laptop bleibt angemeldet, Handy und Tablet fliegen raus.
  assert.equal((await laptop('PATCH', '/me/password', { currentPassword: 'demo1234', newPassword: 'neuesPasswort1' })).status, 200);
  assert.equal((await laptop('GET', '/push/status')).status, 200, 'dieses Gerät bleibt angemeldet');
  assert.equal((await handy('GET', '/push/status')).status, 401, 'altes Token ist ungültig');
  assert.equal((await handy('GET', '/auth/me')).data.user, null);
  assert.equal((await tablet('GET', '/push/status')).status, 401, 'gilt für alle Rollen der Person');

  // Neu anmelden, dann „überall abmelden".
  const neu = client();
  assert.equal((await neu('POST', '/auth/login', { email, password: 'neuesPasswort1' })).status, 200);
  assert.equal((await laptop('POST', '/me/logout-everywhere', {})).status, 200);
  assert.equal((await laptop('GET', '/push/status')).status, 200);
  assert.equal((await neu('GET', '/push/status')).status, 401);

  // Zurücksetzen durch die Verwaltung meldet die Person ebenfalls überall ab.
  assert.equal((await admin('POST', `/admin/users/${u.id}/reset-password`, { newPassword: 'vonAdmin123' })).status, 200);
  assert.equal((await laptop('GET', '/push/status')).status, 401);
  // Andere Personen sind nicht betroffen; die Sitzungs-Version wird nicht ausgegeben.
  const me = await admin('GET', '/auth/me');
  assert.equal(me.data.user.role, 'super_admin');
  assert.equal('sessionVersion' in me.data.user, false);
});

test('Drosselung: Registrierung, Passwort vergessen, Anmeldung je Konto, Familien-Code', async () => {
  const from = (ip) => async (route, body) => {
    const res = await fetch(base + '/api' + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
    return res.status;
  };
  // Offene Registrierung: 10 je Stunde und Absender, dann 429 (hier absichtlich unvollständige Angaben).
  const reg = from('203.0.113.7');
  const seen = [];
  for (let i = 0; i < 12; i++) seen.push(await reg('/auth/register-open', { name: 'X', email: `x${i}@example.org`, password: 'abcdef' }));
  assert.deepEqual(seen.slice(0, 10), Array(10).fill(400));
  assert.deepEqual(seen.slice(10), [429, 429]);
  assert.equal(await from('203.0.113.8')('/auth/register-open', { name: 'X', email: 'y@example.org', password: 'abcdef' }), 400, 'anderer Absender ist nicht betroffen');

  // Passwort vergessen: je Adresse höchstens 3 Links pro Stunde -- Antwort bleibt gleich (keine Auskunft).
  const { db } = await import('../store.js');
  const before = db.all('password_resets').length;
  for (let i = 0; i < 6; i++) assert.equal(await from(`198.51.100.${i}`)('/auth/forgot-password', { email: 'lehrer@dbz.de' }), 200);
  assert.equal(db.all('password_resets').length - before, 3);
  // je Absender höchstens 10 in 15 Minuten
  const fp = from('203.0.113.50');
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push(await fp('/auth/forgot-password', { email: `niemand${i}@example.org` }));
  assert.equal(codes[9], 200);
  assert.equal(codes[10], 429);

  // Anmeldung: Fehlversuche je Konto zählen auch von wechselnden Absendern.
  let last = 0;
  for (let i = 0; i < 26; i++) last = await from(`192.0.2.${i}`)('/auth/login', { email: 'sprecher@dbz.de', password: 'falsch' });
  assert.equal(last, 429);
  assert.equal(await from('192.0.2.200')('/auth/login', { email: 'sprecher@dbz.de', password: 'demo1234' }), 429, 'Konto vorübergehend gesperrt');
  assert.equal(await from('192.0.2.200')('/auth/login', { email: 'schueler@dbz.de', password: 'demo1234' }), 200, 'andere Konten nicht betroffen');

  // Familien-Code: nach 5 falschen Codes ist Schluss -- auch der richtige geht dann nicht mehr.
  const student = await loginAs('amina@dbz.de');
  const code = (await student('GET', '/me/family-code')).data.code;
  assert.match(code, /^[A-HJKMNP-Z2-9]{6,8}$/);
  const fresh = (await student('POST', '/me/family-code/rotate')).data.code;
  assert.equal(fresh.length, 8, 'neue Codes haben 8 Zeichen');
  const parent = await loginAs('eltern@dbz.de');
  for (let i = 0; i < 5; i++) assert.equal((await parent('POST', '/family/link', { code: `FALSCH${i}X` })).status, 404);
  assert.equal((await parent('POST', '/family/link', { code: fresh })).status, 429);
});

test('Dateien: abgelehnter Upload bleibt nicht liegen; gelöschte Aufgabe -> Dateien nach 30 Tagen weg', async () => {
  const { db, UPLOAD_DIR } = await import('../store.js');
  const { purgeFileTrash } = await import('../maintenance.js');
  const onDisk = () => fs.readdirSync(UPLOAD_DIR).sort();
  const cookieOf = async (email) => (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234' }) })).headers.get('set-cookie').split(';')[0];
  const audio = (name) => { const f = new FormData(); f.append('files', new Blob([Buffer.from('RIFFxxxxWAVE')], { type: 'audio/wav' }), name); return f; };
  const teacher = await loginAs('lehrer@dbz.de');
  const sCookie = await cookieOf('schueler@dbz.de');

  // (1) Abgelehnt: Aufgabe existiert nicht -> Datei wird wieder entfernt.
  const before = onDisk();
  const rejected = await fetch(base + '/api/assignments/gibt-es-nicht/submit', { method: 'POST', headers: { cookie: sCookie }, body: audio('a.wav') });
  assert.ok(rejected.status >= 400);
  await new Promise((r) => setTimeout(r, 150));
  assert.deepEqual(onDisk(), before, 'kein verwaister Upload');
  // Ohne Anmeldung ebenfalls nichts.
  const anon = await fetch(base + '/api/assignments/x/submit', { method: 'POST', body: audio('b.wav') });
  assert.equal(anon.status, 401);
  await new Promise((r) => setTimeout(r, 150));
  assert.deepEqual(onDisk(), before);

  // (2) Angenommen: Datei liegt da und gehört zur Abgabe.
  const asg = (await teacher('POST', '/assignments', { classId: 'class_3', title: 'Datei-Test', type: 'audio' })).data.assignment;
  const ok = await fetch(base + `/api/assignments/${asg.id}/submit`, { method: 'POST', headers: { cookie: sCookie }, body: audio('c.wav') });
  assert.equal(ok.status, 200);
  const sub = db.all('submissions').find((s) => s.assignmentId === asg.id);
  const name = sub.files[0].filename;
  assert.ok(onDisk().includes(name));

  // (3) Aufgabe löschen: Datei kommt auf die Löschliste, bleibt aber 30 Tage (Wiederherstellung möglich).
  assert.equal((await teacher('DELETE', `/assignments/${asg.id}`)).status, 200);
  const entry = db.all('file_trash').find((t) => t.filename === name);
  assert.ok(entry, 'Datei steht auf der Löschliste');
  const days = (new Date(entry.deleteAfter) - Date.now()) / 86400000;
  assert.ok(days > 29 && days <= 30);
  assert.deepEqual(await purgeFileTrash(), { ok: true, deleted: 0, kept: 0 });
  assert.ok(onDisk().includes(name), 'vor Ablauf der Frist bleibt die Datei');

  // (4) Nach der Frist: wird wieder auf die Datei verwiesen (z. B. Wiederherstellung), bleibt sie.
  const later = Date.now() + 31 * 86400000;
  db.insert('submissions', { id: 'sub_wieder', assignmentId: 'x', studentId: 'user_yusuf', files: [{ filename: name }] });
  assert.deepEqual(await purgeFileTrash(later), { ok: true, deleted: 0, kept: 1 });
  assert.ok(onDisk().includes(name));
  // ... sonst wird sie endgültig gelöscht.
  const subs = db.all('submissions'); subs.splice(subs.findIndex((s) => s.id === 'sub_wieder'), 1);
  db.all('file_trash').push({ filename: name, deleteAfter: new Date(Date.now() - 1000).toISOString() });
  assert.deepEqual(await purgeFileTrash(), { ok: true, deleted: 1, kept: 0 });
  assert.equal(onDisk().includes(name), false, 'Aufnahme ist wirklich gelöscht');
  assert.equal(db.all('file_trash').length, 0);
});

test('Unbekannte API-Pfade: 404 als JSON', async () => {
  const res = await fetch(base + '/api/gibt/es/nicht');
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /json/);
});

test('Verlauf wird begrenzt: alte Benachrichtigungen, Audit-Einträge und Passwort-Links', async () => {
  const { db } = await import('../store.js');
  const { trimHistory } = await import('../maintenance.js');
  const day = 86400000;
  const iso = (d) => new Date(Date.now() - d * day).toISOString();
  const notes = db.all('notifications');
  const audits = db.all('audit_logs');
  const n0 = notes.length; const a0 = audits.length;
  const mk = (id, userId, d, read) => notes.push({ id, userId, type: 't', title: 'x', read, createdAt: iso(d) });
  mk('alt_gelesen', 'uX', 120, true); // weg (gelesen, > 90 Tage)
  mk('alt_ungelesen', 'uX', 120, false); // bleibt (ungelesen, < 365 Tage)
  mk('uralt_ungelesen', 'uX', 400, false); // weg
  mk('neu_gelesen', 'uX', 10, true); // bleibt
  for (let i = 0; i < 320; i++) mk(`viel_${i}`, 'uViel', i / 100, false); // 320 -> 300
  audits.push({ id: 'audit_alt', action: 'x', createdAt: iso(500) }, { id: 'audit_neu', action: 'x', createdAt: iso(5) });
  db.all('password_resets').push(
    { id: 'pr_alt', used: true, expiresAt: iso(30), createdAt: iso(30) },
    { id: 'pr_offen', used: false, expiresAt: new Date(Date.now() + day).toISOString(), createdAt: iso(0) },
  );
  const r = trimHistory();
  assert.equal(r.ok, true);
  const ids = new Set(db.all('notifications').map((n) => n.id));
  assert.equal(ids.has('alt_gelesen'), false);
  assert.equal(ids.has('uralt_ungelesen'), false);
  assert.equal(ids.has('alt_ungelesen'), true);
  assert.equal(ids.has('neu_gelesen'), true);
  const viel = db.all('notifications').filter((n) => n.userId === 'uViel');
  assert.equal(viel.length, 300);
  assert.equal(viel.some((n) => n.id === 'viel_0'), true, 'die neuesten bleiben');
  assert.equal(viel.some((n) => n.id === 'viel_319'), false, 'die ältesten gehen');
  assert.equal(db.all('notifications').length, n0 + 2 + 300, 'bestehende Einträge anderer Personen unberührt');
  assert.equal(db.all('audit_logs').some((a) => a.id === 'audit_alt'), false);
  assert.equal(db.all('audit_logs').length, a0 + 1);
  assert.equal(db.all('password_resets').some((p) => p.id === 'pr_alt'), false);
  assert.equal(db.all('password_resets').some((p) => p.id === 'pr_offen'), true);
  assert.deepEqual(trimHistory().removed, { notifications: 0, audit: 0, resets: 0 }, 'zweiter Lauf ändert nichts');
});

// ---- Stufe 4 -------------------------------------------------------------------

test('Vertretung: unterrichtet, ändert aber nichts Dauerhaftes; Enddatum sperrt die Klasse', async () => {
  const admin = await loginAs('admin@dbz.de');
  const email = `vertretung-${Date.now()}@dbz.de`;
  const made = await admin('POST', '/admin/users', { name: 'Vertretung Test', email, password: 'demo1234', role: 'vertretung', classIds: ['class_3'], validUntil: '2099-12-31' });
  assert.equal(made.status, 200);
  assert.equal(made.data.user.validUntil, '2099-12-31');
  const v = await loginAs(email);

  // Erlaubt: Unterrichtsalltag.
  assert.equal((await v('GET', '/classes/class_3/students')).status, 200);
  const asg = await v('POST', '/assignments', { classId: 'class_3', title: 'Von der Vertretung', type: 'text' });
  assert.equal(asg.status, 200);
  const pen = await v('POST', '/penalties', { classId: 'class_3', studentId: 'user_yusuf', type: 'pages', amount: 1, reason: 'Test' });
  assert.equal(pen.status, 200, 'erfassen darf sie');

  // Nicht erlaubt: Klassenliste, Einstellungen, Regeln, Rollen, Einladungen, Freigaben.
  const denied = [
    ['DELETE', '/classes/class_3/students/user_yusuf'],
    ['PATCH', '/classes/class_3/settings', { startTime: '09:00' }],
    ['PATCH', '/classes/class_3/homework-rules', {}],
    ['POST', '/classes/class_3/reset-data', { scopes: ['attendance'], confirmName: 'Klasse 3' }],
    ['POST', '/students/user_yusuf/klassensprecher', { promote: true }],
    ['POST', '/students/user_yusuf/probation', { probation: true }],
    ['POST', '/admin/invites', { role: 'schueler', classId: 'class_3' }],
    ['PUT', '/rules/text/class_3', { text: 'x' }],
    ['PUT', '/rules/catalog/class_3', { items: [] }],
    ['POST', `/penalties/${pen.data.penalty.id}/settle`, {}],
    ['POST', `/penalties/${pen.data.penalty.id}/approve`, {}],
  ];
  for (const [m, p, b] of denied) {
    const r = await v(m, p, b);
    assert.equal(r.status, 403, `${m} ${p} -> ${r.status}`);
    assert.match(r.data.error, /Klassenleitung/);
  }
  const { db } = await import('../store.js');
  assert.ok(db.all('users').find((u) => u.id === 'user_yusuf').classIds.includes('class_3'), 'Schüler ist noch in der Klasse');

  // Die Klassenleitung darf das weiterhin.
  const teacher = await loginAs('lehrer@dbz.de');
  assert.equal((await teacher('POST', `/penalties/${pen.data.penalty.id}/settle`, {})).status, 200);

  // Enddatum in der Vergangenheit: Klasse gesperrt, eigenes Konto bleibt erreichbar.
  assert.equal((await admin('PATCH', `/admin/users/${made.data.user.id}`, { validUntil: 'morgen' })).status, 400);
  assert.equal((await admin('PATCH', `/admin/users/${made.data.user.id}`, { validUntil: '2020-01-01' })).status, 200);
  const blocked = await v('GET', '/classes/class_3/students');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.expired, true);
  assert.match(blocked.data.error, /01\.01\.2020/);
  assert.equal((await v('POST', '/assignments', { classId: 'class_3', title: 'x', type: 'text' })).status, 403);
  assert.equal((await v('GET', '/auth/me')).data.user.role, 'vertretung');
  assert.equal((await v('GET', '/notifications')).status, 200);
  assert.equal((await v('POST', '/auth/logout')).status, 200);
  // Enddatum entfernen -> wieder aktiv. Rollenwechsel entfernt es ganz.
  assert.equal((await admin('PATCH', `/admin/users/${made.data.user.id}`, { validUntil: null })).status, 200);
  const again = await loginAs(email);
  assert.equal((await again('GET', '/classes/class_3/students')).status, 200);
  await admin('PATCH', `/admin/users/${made.data.user.id}`, { validUntil: '2099-01-01' });
  const promoted = await admin('PATCH', `/admin/users/${made.data.user.id}`, { role: 'klassenlehrer' });
  assert.equal(promoted.data.user.validUntil, undefined);
});

test('Prüfungen: Versuch und Abgabe nur für zugewiesene Schüler; Eltern sehen Stand und Ergebnis ohne Inhalte', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const q = [{ type: 'single', prompt: 'Frage', options: [{ text: 'a' }, { text: 'b' }], correct: [0], points: 1 }];
  // Nur Yusuf zugewiesen.
  const exam = (await teacher('POST', '/exams', { classId: 'class_3', title: 'Nur für Yusuf', questions: q, targetStudentIds: ['user_yusuf'] })).data.exam;
  assert.equal((await teacher('POST', `/exams/${exam.id}/publish`)).status, 200);

  const other = await loginAs('amina@dbz.de'); // gleiche Klasse, nicht zugewiesen
  assert.equal((await other('GET', `/exams/${exam.id}`)).status, 403);
  assert.equal((await other('POST', `/exams/${exam.id}/attempt`)).status, 403);
  assert.equal((await other('POST', `/exams/${exam.id}/submit`, { answers: [] })).status, 403);
  const { db } = await import('../store.js');
  assert.equal(db.all('exam_attempts').filter((a) => a.examId === exam.id).length, 0);

  const yusuf = await loginAs('schueler@dbz.de');
  assert.equal((await yusuf('POST', `/exams/${exam.id}/attempt`)).status, 200);

  // Eltern von Yusuf: sehen die Prüfung als „in Arbeit", ohne Fragen; öffnen können sie sie nicht.
  const parent = await loginAs('eltern@dbz.de');
  const seen = (await parent('GET', '/exams')).data.exams.find((e) => e.id === exam.id);
  assert.ok(seen);
  assert.equal(seen.childName, 'Yusuf');
  assert.equal(seen.studentStatus, 'in_progress');
  assert.equal(seen.result, null);
  assert.equal(seen.readOnly, true);
  assert.equal('questions' in seen, false);
  assert.equal((await parent('GET', `/exams/${exam.id}`)).status, 403);
  assert.equal((await parent('POST', `/exams/${exam.id}/attempt`)).status, 403);

  const qid = db.all('exams').find((e) => e.id === exam.id).questions[0].id;
  assert.equal((await yusuf('POST', `/exams/${exam.id}/submit`, { answers: [{ questionId: qid, selected: [0] }] })).status, 200);
  assert.equal((await parent('GET', '/exams')).data.exams.find((e) => e.id === exam.id).studentStatus, 'submitted');
});

test('Eingaben: Hausaufgabe, Bewertung, CSV-Export, Tadschwid-HTML, Verhaltensvermerk', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  // Hausaufgabe: Frist und Zielschüler werden geprüft.
  assert.equal((await teacher('POST', '/assignments', { classId: 'class_3', title: 'A', type: 'text', dueAt: 'irgendwann' })).status, 400);
  assert.equal((await teacher('POST', '/assignments', { classId: 'class_3', title: 'A', type: 'text', targetStudentIds: ['user_gibt_es_nicht'] })).status, 400);
  assert.equal((await teacher('POST', '/assignments', { classId: 'class_3', title: 'A', type: 'text', targetStudentIds: 'user_yusuf' })).status, 400);
  const asg = await teacher('POST', '/assignments', { classId: 'class_3', title: 'Bewertungstest', type: 'text', targetStudentIds: ['user_yusuf'], dueAt: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(asg.status, 200);

  // Bewertung: nur bekannte Ergebnisse und plausible Zahlen.
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'schueler@dbz.de', password: 'demo1234' }) });
  const form = new FormData(); form.set('text', 'Meine Antwort');
  const sub = await (await fetch(base + `/api/assignments/${asg.data.assignment.id}/submit`, { method: 'POST', headers: { cookie: login.headers.get('set-cookie').split(';')[0] }, body: form })).json();
  const rev = (body) => teacher('POST', `/submissions/${sub.submission.id}/review`, body);
  assert.equal((await rev({ outcome: 'egal' })).status, 400);
  assert.equal((await rev({})).status, 400);
  assert.equal((await rev({ outcome: 'passed', tajwid: -5 })).status, 400);
  assert.equal((await rev({ outcome: 'passed', fluency: 'sehr gut' })).status, 400);
  assert.equal((await rev({ outcome: 'passed', errorCount: 1.5 })).status, 400);
  assert.equal((await rev({ outcome: 'revision', feedbackText: 'Bitte nochmal' })).status, 200, 'Wert der App');
  assert.equal((await rev({ outcome: 'passed', tajwid: 8, errorCount: 2 })).status, 200);

  // CSV: Formel-Anfänge werden entschärft, Zahlen bleiben Zahlen.
  const { db } = await import('../store.js');
  const yusuf = db.all('users').find((u) => u.id === 'user_yusuf');
  const realName = yusuf.name;
  yusuf.name = '=HYPERLINK("http://boese.example";"Klick")';
  try {
    const cookie = (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'lehrer@dbz.de', password: 'demo1234' }) })).headers.get('set-cookie').split(';')[0];
    const csv = await (await fetch(base + '/api/export/attendance.csv?classId=class_3', { headers: { cookie } })).text();
    assert.ok(csv.includes(`"'=HYPERLINK(`), 'Formel als Text gekennzeichnet');
    assert.equal(/(^|;|\n)=/.test(csv.replace(/^\uFEFF/, '')), false, 'keine Zelle beginnt mit =');
  } finally { yusuf.name = realName; }

  // Tadschwid: nur bekannte Markierungen kommen durch.
  const { safeTajweedHtml } = await import('../providers/tajweedProvider.js');
  const ok = 'بِسْمِ <tajweed class=ham_wasl>ٱ</tajweed>للَّهِ <span class=end>١</span>';
  assert.equal(safeTajweedHtml(ok), ok, 'echter Text bleibt unverändert');
  assert.equal(safeTajweedHtml('<tajweed class="ghunnah">نّ</tajweed>'), '<tajweed class=ghunnah>نّ</tajweed>');
  const evil = safeTajweedHtml('<img src=x onerror=alert(1)><script>x</script><span onclick="x">a</span><tajweed class=x onmouseover=y>b</tajweed><a href="javascript:1">c</a>');
  assert.equal(/<(img|script|a|span onclick|tajweed class=x on)/i.test(evil), false);
  assert.ok(evil.includes('&lt;img'));

  // Verhaltensvermerk: der Wortlaut bleibt in der App vollständig; der neutrale
  // Ersatztext für den Sperrbildschirm wird nicht mitgespeichert.
  const cats = (await teacher('GET', '/behavior-categories')).data.categories;
  const beh = await teacher('POST', '/behavior', { studentId: 'user_yusuf', classId: 'class_3', category: cats[0].id, note: 'Vertraulicher Wortlaut 4711', tone: 'negative', visibleToStudent: true });
  assert.equal(beh.status, 200);
  const note = db.all('notifications').filter((n) => n.userId === 'user_yusuf' && n.type === 'behavior_new').pop();
  assert.equal(note.body, 'Vertraulicher Wortlaut 4711', 'in der App vollständig');
  assert.equal('pushBody' in note, false, 'Ersatztext wird nicht gespeichert');
});

// ---- Struktur ------------------------------------------------------------------

test('Stammklasse und Zusatzkurs: Kurs ist freiwillig, zählt nicht, Stammklasse bleibt unberührt', async () => {
  const admin = await loginAs('admin@dbz.de');
  const { db } = await import('../store.js');
  const yusuf = () => db.all('users').find((u) => u.id === 'user_yusuf');

  // Kurs anlegen (Zusatzkurs) und Lehrkraft zuordnen.
  assert.equal((await admin('POST', '/admin/classes', { name: 'X', kind: 'irgendwas' })).status, 400);
  const course = (await admin('POST', '/admin/classes', { name: 'Umra-Kurs', kind: 'extra' })).data.class;
  assert.equal(course.kind, 'extra');
  assert.equal((await admin('GET', '/classes')).data.classes.find((c) => c.id === 'class_3').kind, 'regular', 'bestehende Klassen sind Stammklassen');
  assert.equal((await admin('POST', `/admin/classes/${course.id}/teachers`, { userId: 'user_lehrer' })).status, 200);
  const teacher = await loginAs('lehrer@dbz.de');

  // Ausgangswerte der Stammklasse.
  const before = (await teacher('GET', '/students/user_yusuf/standing')).data;
  assert.ok(before.data.attendance);

  // Teilnehmer aufnehmen: nur bei Zusatzkursen, Stammklasse bleibt vorn.
  assert.equal((await teacher('POST', '/classes/class_3/members', { studentId: 'user_yusuf' })).status, 400, 'Stammklasse wird nicht so geändert');
  assert.equal((await teacher('POST', `/classes/${course.id}/members`, { studentId: 'user_yusuf' })).status, 200);
  assert.equal((await teacher('POST', `/classes/${course.id}/members`, { studentId: 'user_yusuf' })).status, 400);
  assert.deepEqual(yusuf().classIds, ['class_3', course.id]);
  const members = (await teacher('GET', `/classes/${course.id}/members`)).data;
  assert.deepEqual(members.members.map((m) => [m.id, m.className]), [['user_yusuf', 'Klasse 3']]);
  assert.ok(members.available.length > 0);
  // Schüler dürfen das nicht selbst.
  const student = await loginAs('schueler@dbz.de');
  assert.equal((await student('POST', `/classes/${course.id}/members`, { studentId: 'user_yusuf' })).status, 403);

  // Im Kurs passiert etwas: Fehltag, Hausaufgabe, Verhaltensvermerk.
  const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const sess = (await teacher('POST', `/classes/${course.id}/days`, { date: day })).data.session;
  assert.equal((await teacher('POST', `/sessions/${sess.id}/attendance`, { studentId: 'user_yusuf', status: 'unexcused' })).status, 200);
  const asg = await teacher('POST', '/assignments', { classId: course.id, title: 'Kurs-Aufgabe', type: 'text', dueAt: new Date(Date.now() - 3600000).toISOString() });
  assert.equal(asg.status, 200);
  const cats = (await teacher('GET', '/behavior-categories')).data.categories;
  assert.equal((await teacher('POST', '/behavior', { studentId: 'user_yusuf', classId: course.id, category: cats[0].id, note: 'Im Kurs', tone: 'negative' })).status, 200);

  // Der Schüler sieht die Kurs-Aufgabe ...
  assert.ok((await student('GET', '/assignments')).data.assignments.some((a) => a.id === asg.data.assignment.id));
  // ... aber Bericht und Notenvorschlag bleiben exakt wie vorher.
  const after = (await teacher('GET', '/students/user_yusuf/standing')).data;
  assert.deepEqual(after.data.attendance, before.data.attendance, 'Fehltag im Kurs zählt nicht');
  assert.deepEqual(after.data.homework, before.data.homework, 'Kurs-Aufgabe zählt nicht');
  assert.deepEqual(after.data.behavior, before.data.behavior, 'Vermerk im Kurs zählt nicht');
  assert.deepEqual(after.standing, before.standing);
  // Gegenprobe: derselbe Vermerk in der Stammklasse zählt.
  await teacher('POST', '/behavior', { studentId: 'user_yusuf', classId: 'class_3', category: cats[0].id, note: 'In der Klasse', tone: 'negative' });
  assert.equal((await teacher('GET', '/students/user_yusuf/standing')).data.data.behavior.hinweis, before.data.behavior.hinweis + 1);

  // Verwaltung ändert die Stammklasse: der Zusatzkurs bleibt erhalten; zwei Stammklassen gehen nicht.
  const other = (await admin('POST', '/admin/classes', { name: 'Klasse 4' })).data.class;
  assert.equal((await admin('PATCH', '/admin/users/user_yusuf', { classIds: ['class_3', other.id] })).status, 400);
  assert.equal((await admin('PATCH', '/admin/users/user_yusuf', { classIds: [other.id] })).status, 200);
  assert.deepEqual(yusuf().classIds, [other.id, course.id]);
  assert.equal((await admin('PATCH', '/admin/users/user_yusuf', { classIds: ['class_3'] })).status, 200);
  assert.deepEqual(yusuf().classIds, ['class_3', course.id]);
  // Eltern sehen weiterhin die Stammklasse als Klasse des Kindes.
  const parent = await loginAs('eltern@dbz.de');
  assert.equal((await parent('GET', '/family/children')).data.children.find((c) => c.id === 'user_yusuf').className, 'Klasse 3');

  // Art umstellen: Stammklasse mit Schülern kann kein Zusatzkurs werden; Kurs mit Teilnehmern, die schon eine Stammklasse haben, keine Stammklasse.
  const no1 = await admin('PATCH', '/admin/classes/class_3', { kind: 'extra' });
  assert.equal(no1.status, 400);
  assert.match(no1.data.error, /keine Stammklasse mehr/);
  assert.equal((await admin('PATCH', `/admin/classes/${course.id}`, { kind: 'regular' })).status, 400);
  assert.equal((await admin('PATCH', `/admin/classes/${other.id}`, { kind: 'extra', name: 'Walima-Kurs' })).data.class.kind, 'extra');

  // Austragen aus dem Kurs: Stammklasse bleibt.
  assert.equal((await teacher('DELETE', `/classes/${course.id}/students/user_yusuf`)).status, 200);
  assert.deepEqual(yusuf().classIds, ['class_3']);
});

test('Klassenwechsel: nur Leitung/Administrator, mit Verlauf; alte Einträge bleiben bei der alten Klasse', async () => {
  const admin = await loginAs('admin@dbz.de');
  const { db } = await import('../store.js');
  const email = `wechsel-${Date.now()}@dbz.de`;
  const s = (await admin('POST', '/admin/users', { name: 'Wechsel Kind', email, password: 'demo1234', role: 'klassensprecher', classIds: ['class_3'] })).data.user;
  const k5 = (await admin('POST', '/admin/classes', { name: 'Klasse 5' })).data.class;
  const kurs = (await admin('POST', '/admin/classes', { name: 'Walima-Kurs', kind: 'extra' })).data.class;
  assert.equal((await admin('POST', `/classes/${kurs.id}/members`, { studentId: s.id })).status, 200);

  // Ein Eintrag in der alten Klasse.
  const teacher = await loginAs('lehrer@dbz.de');
  const cats = (await teacher('GET', '/behavior-categories')).data.categories;
  await teacher('POST', '/behavior', { studentId: s.id, classId: 'class_3', category: cats[0].id, note: 'Alte Klasse', tone: 'positive' });

  // Lehrkraft kann nicht versetzen (hat keinen Zugang zur Verwaltung).
  assert.equal((await teacher('PATCH', `/admin/users/${s.id}`, { classIds: [k5.id] })).status, 403);
  assert.equal((await admin('PATCH', `/admin/users/${s.id}`, { classIds: [k5.id], classChangeReason: 'unsinn' })).status, 400);

  // Leitung versetzt: Aufstieg.
  const leitung = await loginAs('leitung@dbz.de');
  const moved = await leitung('PATCH', `/admin/users/${s.id}`, { classIds: [k5.id], classChangeReason: 'promotion' });
  assert.equal(moved.status, 200);
  const user = db.all('users').find((u) => u.id === s.id);
  assert.deepEqual(user.classIds, [k5.id, kurs.id], 'neue Stammklasse vorn, Zusatzkurs bleibt');
  assert.equal(user.role, 'schueler', 'Amt des Klassensprechers endet mit dem Wechsel');

  const hist = (await admin('GET', `/admin/users/${s.id}`)).data.user.enrollments;
  assert.deepEqual(hist.map((e) => [e.className, e.reason, Boolean(e.to)]), [['Klasse 5', 'promotion', false], ['Klasse 3', 'start', true]]);
  assert.equal(hist[0].byName, 'Br. Leitung');
  // Noch einmal dieselbe Klasse speichern erzeugt keinen neuen Eintrag.
  await admin('PATCH', `/admin/users/${s.id}`, { classIds: [k5.id] });
  assert.equal((await admin('GET', `/admin/users/${s.id}`)).data.user.enrollments.length, 2);

  // Der alte Eintrag bleibt bei Klasse 3; die alte Lehrkraft sieht den Schüler nicht mehr in ihrer Liste.
  assert.equal(db.all('behavior_records').find((b) => b.studentId === s.id).classId, 'class_3');
  assert.equal((await teacher('GET', '/classes/class_3/roster')).data.rows.some((r) => r.id === s.id), false);
  // Schüler und alte Lehrkraft wurden benachrichtigt.
  assert.ok(db.all('notifications').some((n) => n.userId === s.id && n.title === 'Klassenwechsel' && /Klasse 5/.test(n.body)));
  assert.ok(db.all('notifications').some((n) => n.userId === 'user_lehrer' && n.title === 'Klassenwechsel' && /Klasse 3 → Klasse 5/.test(n.body)));

  // Aus dem Zusatzkurs darf die Kurs-Lehrkraft austragen, aus der Stammklasse nicht.
  await admin('POST', `/admin/classes/${kurs.id}/teachers`, { userId: 'user_lehrer' });
  await admin('POST', `/admin/classes/${k5.id}/teachers`, { userId: 'user_lehrer' });
  const t2 = await loginAs('lehrer@dbz.de');
  assert.equal((await t2('DELETE', `/classes/${k5.id}/students/${s.id}`)).status, 403);
  assert.equal((await t2('DELETE', `/classes/${kurs.id}/students/${s.id}`)).status, 200);
  assert.deepEqual(db.all('users').find((u) => u.id === s.id).classIds, [k5.id]);
});

test('Schuljahr: Auswertungen gelten fürs laufende Jahr; Schüler und Eltern sehen keine Klassendaten aus dem Vorjahr', async () => {
  const { db } = await import('../store.js');
  const health = await (await fetch(base + '/api/health')).json();
  assert.match(health.schoolYear, /^\d{4}\/\d{2}$/);
  const startYear = Number(health.schoolYear.slice(0, 4));
  const lastYear = `${startYear}-03-15`; // liegt sicher vor dem 1. September des laufenden Schuljahres
  const old = `${lastYear}T10:00:00.000Z`;

  const teacher = await loginAs('lehrer@dbz.de');
  const student = await loginAs('schueler@dbz.de');
  const parent = await loginAs('eltern@dbz.de');
  const before = (await teacher('GET', '/students/user_yusuf/standing')).data.data;
  const attBefore = (await student('GET', '/me/attendance')).data.stats.sessions;
  assert.ok(attBefore > 0, 'Demo-Daten liegen im laufenden Schuljahr');

  // Einträge aus dem Vorjahr (direkt im Bestand, wie sie nach einem Jahreswechsel dalägen).
  db.insert('sessions', { id: 'sess_alt', classId: 'class_3', date: lastYear, status: 'ended' });
  db.insert('attendance', { id: 'att_alt', sessionId: 'sess_alt', classId: 'class_3', studentId: 'user_yusuf', status: 'unexcused', updatedAt: old });
  db.insert('assignments', { id: 'asg_alt', classId: 'class_3', title: 'Vorjahr-Aufgabe', type: 'text', targetType: 'class', targetStudentIds: [], dueAt: old, createdAt: old, createdBy: 'user_lehrer' });
  db.insert('behavior_records', { id: 'beh_alt', studentId: 'user_yusuf', classId: 'class_3', tone: 'negative', note: 'Vorjahr', visibleToStudent: true, visibleToParent: true, createdAt: old });
  db.insert('penalties', { id: 'pen_alt_offen', studentId: 'user_yusuf', classId: 'class_3', type: 'money', amount: 5, reason: 'offen', status: 'approved', createdAt: old });
  db.insert('penalties', { id: 'pen_alt_erledigt', studentId: 'user_yusuf', classId: 'class_3', type: 'pages', amount: 1, reason: 'erledigt', status: 'settled', createdAt: old });
  db.insert('announcements', { id: 'ann_alt', title: 'Vorjahr', body: 'alt', audience: { type: 'class', classId: 'class_3' }, authorId: 'user_lehrer', createdAt: old });

  // Auswertung fürs laufende Schuljahr bleibt unverändert.
  const after = (await teacher('GET', '/students/user_yusuf/standing')).data.data;
  assert.deepEqual(after.attendance, before.attendance);
  assert.deepEqual(after.homework, before.homework);
  assert.deepEqual(after.behavior, before.behavior);
  // Mit ausdrücklichem Zeitraum kommt die Lehrkraft weiterhin an das Vorjahr.
  const win = (await teacher('GET', `/students/user_yusuf/standing?from=${startYear}-01-01&to=${startYear}-08-31`)).data.data;
  assert.equal(win.attendance.unexcused, 1);
  assert.equal(win.behavior.hinweis, 1);

  // Schüler: Vorjahr unsichtbar, Offenes (unbezahlte Strafe) bleibt.
  assert.equal((await student('GET', '/me/attendance')).data.stats.sessions, attBefore);
  assert.equal((await student('GET', '/assignments')).data.assignments.some((a) => a.id === 'asg_alt'), false);
  assert.equal((await student('GET', '/behavior')).data.records.some((r) => r.id === 'beh_alt'), false);
  assert.equal((await student('GET', '/announcements')).data.announcements.some((a) => a.id === 'ann_alt'), false);
  const pens = (await student('GET', '/penalties')).data.penalties.map((p) => p.id);
  assert.equal(pens.includes('pen_alt_offen'), true, 'offene Strafe bleibt sichtbar');
  assert.equal(pens.includes('pen_alt_erledigt'), false);
  // Eltern ebenso.
  assert.equal((await parent('GET', '/behavior')).data.records.some((r) => r.id === 'beh_alt'), false);
  // Lehrkraft sieht alles weiterhin.
  assert.equal((await teacher('GET', '/behavior?studentId=user_yusuf')).data.records.some((r) => r.id === 'beh_alt'), true);
  assert.equal((await teacher('GET', '/assignments')).data.assignments.some((a) => a.id === 'asg_alt'), true);
  assert.equal((await teacher('GET', '/penalties')).data.penalties.some((p) => p.id === 'pen_alt_erledigt'), true);
  assert.equal((await teacher('GET', '/announcements')).data.announcements.some((a) => a.id === 'ann_alt'), true);
});

test('Eine Person, mehrere Rollen: gleiche personId, Klassenwechsel der Schüler-Rolle mit Verlauf, Löschen samt Rollen', async () => {
  const { db } = await import('../store.js');
  const admin = await loginAs('admin@dbz.de');
  const users = () => admin('GET', '/admin/users').then((r) => r.data.users);

  // Eine neue Person bekommt zwei zusätzliche Rollen.
  const made = await admin('POST', '/admin/users', { name: 'Mehrfach Person', email: 'mehrfach@example.org', password: 'demo1234', role: 'klassenlehrer', classIds: ['class_3'] });
  assert.equal(made.status, 200);
  const mainId = (await users()).find((u) => u.email === 'mehrfach@example.org').id;
  const asStudent = (await admin('POST', `/admin/users/${mainId}/roles`, { role: 'schueler', classIds: [] })).data.account;
  const asLead = (await admin('POST', `/admin/users/${mainId}/roles`, { role: 'leitung' })).data.account;

  // Alle drei Konten gehören zur selben Person -- egal, von welchem Konto man ausgeht.
  const mine = (await users()).filter((u) => [mainId, asStudent.id, asLead.id].includes(u.id));
  assert.equal(mine.length, 3);
  assert.deepEqual([...new Set(mine.map((u) => u.personId))], [mainId]);
  // Ein gewöhnliches Konto ist seine eigene Person.
  const yusuf = (await users()).find((u) => u.id === 'user_yusuf');
  assert.equal(yusuf.personId, 'user_yusuf');

  // Klasse der Schüler-Rolle: läuft über den Klassenwechsel mit Verlauf, Zusatzkurse bleiben.
  const kurs = (await admin('POST', '/admin/classes', { name: 'Kurs Rollen-Test', kind: 'extra' })).data.class;
  db.all('users').find((u) => u.id === asStudent.id).classIds = [kurs.id];
  const patched = await admin('PATCH', `/admin/users/${mainId}/roles/${asStudent.id}`, { classIds: ['class_3'] });
  assert.equal(patched.status, 200);
  assert.deepEqual(patched.data.account.classIds.sort(), ['class_3', kurs.id].sort(), 'Zusatzkurs bleibt erhalten');
  const history = db.all('enrollments').filter((e) => e.studentId === asStudent.id);
  assert.equal(history.filter((e) => e.classId === 'class_3' && !e.to).length, 1, 'Wechsel steht im Klassenverlauf');

  // Wer in einer seiner Rollen angemeldet ist, kann die eigene Person nicht löschen.
  const self = await loginAs('mehrfach@example.org');
  assert.equal((await self('POST', `/me/switch/${asLead.id}`)).status, 200);
  const own = await self('POST', '/admin/users/bulk-delete', { ids: [mainId] });
  assert.equal(own.data.results[0].ok, false, 'eigene Person bleibt geschützt');
  assert.ok(db.all('users').some((u) => u.id === mainId));

  // Löschen der Person: erst nach Deaktivieren; alle Konten auf einmal gemeldet, keines bleibt zurück.
  const active = await admin('POST', '/admin/users/bulk-delete', { ids: [mainId] });
  assert.equal(active.data.results[0].ok, false, 'aktive Person wird nicht gelöscht');
  assert.equal((await admin('PATCH', `/admin/users/${mainId}`, { status: 'disabled' })).status, 200);
  const del = await admin('POST', '/admin/users/bulk-delete', { ids: [mainId, asStudent.id, asLead.id] });
  assert.equal(del.status, 200);
  assert.deepEqual(del.data.results.map((r) => r.ok), [true, true, true]);
  assert.equal(db.all('users').some((u) => [mainId, asStudent.id, asLead.id].includes(u.id)), false);
});

test('Sammel-Versetzen: nur Leitung/Administrator, nur Schüler, nur Stammklassen, mit Verlauf', async () => {
  const { db } = await import('../store.js');
  const admin = await loginAs('admin@dbz.de');
  const teacher = await loginAs('lehrer@dbz.de');
  const ziel = (await admin('POST', '/admin/classes', { name: 'Klasse Sammel' })).data.class;
  const kurs = (await admin('POST', '/admin/classes', { name: 'Kurs Sammel', kind: 'extra' })).data.class;

  assert.equal((await teacher('POST', '/admin/users/bulk-class', { ids: ['user_yusuf'], classId: ziel.id })).status, 403);
  assert.equal((await admin('POST', '/admin/users/bulk-class', { ids: ['user_yusuf'], classId: kurs.id })).status, 400, 'Zusatzkurs ist keine Stammklasse');
  assert.equal((await admin('POST', '/admin/users/bulk-class', { ids: ['user_yusuf'], classId: 'gibt-es-nicht' })).status, 400);
  assert.equal((await admin('POST', '/admin/users/bulk-class', { ids: ['user_yusuf'], classId: ziel.id, reason: 'quatsch' })).status, 400);

  const yusuf = db.all('users').find((u) => u.id === 'user_yusuf');
  const from = yusuf.classIds.find((c) => c !== kurs.id);
  yusuf.classIds = [...yusuf.classIds, kurs.id];
  const r = await admin('POST', '/admin/users/bulk-class', { ids: ['user_yusuf', 'user_lehrer', 'gibt-es-nicht'], classId: ziel.id, reason: 'promotion' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.results.map((x) => x.ok), [true, false, false], 'Lehrkraft und Unbekanntes werden übersprungen');
  assert.deepEqual(yusuf.classIds, [ziel.id, kurs.id], 'neue Stammklasse, Zusatzkurs bleibt');
  const hist = db.all('enrollments').filter((e) => e.studentId === 'user_yusuf');
  assert.equal(hist.find((e) => e.classId === ziel.id && !e.to)?.reason, 'promotion');
  assert.ok(hist.find((e) => e.classId === from)?.to, 'alte Klasse ist im Verlauf abgeschlossen');
  // Zweiter Aufruf ändert nichts und legt keinen weiteren Eintrag an.
  const again = await admin('POST', '/admin/users/bulk-class', { ids: ['user_yusuf'], classId: ziel.id });
  assert.equal(again.data.results[0].unchanged, true);
  assert.equal(db.all('enrollments').filter((e) => e.studentId === 'user_yusuf' && e.classId === ziel.id).length, 1);
  // Aufräumen für nachfolgende Tests.
  await admin('POST', '/admin/users/bulk-class', { ids: ['user_yusuf'], classId: from });
});

test('Anwesenheit nachtragen: Vorschau, Entschuldigungen, unentschuldigt nur an erfassten Tagen, rückgängig', async () => {
  const { db } = await import('../store.js');
  const admin = await loginAs('admin@dbz.de');
  const student = await loginAs('schueler@dbz.de');
  const klass = (await admin('POST', '/admin/classes', { name: 'Klasse Nachtrag', weekday: 6 })).data.class;
  // Zwei Schüler seit Anfang September in der Klasse (laut Klassenverlauf).
  const mk = async (name) => {
    const u = (await admin('POST', '/admin/users', { name, email: `${name.toLowerCase()}@example.org`, password: 'demo1234', role: 'schueler' })).data.user;
    db.insert('enrollments', { id: `enr_${u.id}`, studentId: u.id, classId: klass.id, from: '2025-09-01', to: null, reason: 'start', by: null });
    db.all('users').find((x) => x.id === u.id).classIds = [klass.id];
    return u.id;
  };
  const a = await mk('Nachtrag A');
  const b = await mk('Nachtrag B');
  // Ein Neuer, erst seit 2025-10-01 in der Klasse.
  const c = await mk('Nachtrag C');
  db.all('enrollments').find((e) => e.studentId === c).from = '2025-10-01';

  // Samstage im September 2025: 6., 13., 20., 27.
  // Am 13.9. hat A eingecheckt (Tag wurde erfasst), am 20.9. meldet B sich krank, A offen.
  const s13 = (await admin('POST', `/classes/${klass.id}/days`, { date: '2025-09-13' })).data.session;
  db.insert('attendance', { id: 'att_bf_a', sessionId: s13.id, classId: klass.id, studentId: a, status: 'present', source: 'checkin', updatedAt: new Date().toISOString() });
  db.insert('absence_requests', { id: 'abs_bf_b', studentId: b, classId: klass.id, requestType: 'absent', reasonCategory: 'krankheit', sessionDate: '2025-09-13', status: 'approved', createdAt: '2025-09-12T10:00:00Z' });
  db.insert('absence_requests', { id: 'abs_bf_open', studentId: a, classId: klass.id, requestType: 'absent', reasonCategory: 'sonstiges', sessionDate: '2025-09-20', status: 'pending', createdAt: '2025-09-19T10:00:00Z' });

  const body = { from: '2025-09-01', to: '2025-09-30' };
  assert.equal((await student('POST', `/classes/${klass.id}/backfill`, body)).status, 403);
  assert.equal((await admin('POST', `/classes/${klass.id}/backfill`, { from: '2025-09-01', to: '2099-01-01' })).status, 400);

  const preview = (await admin('POST', `/classes/${klass.id}/backfill`, body)).data;
  assert.equal(preview.dryRun, true);
  assert.deepEqual(preview.days.map((d) => d.date), ['2025-09-06', '2025-09-13', '2025-09-20', '2025-09-27']);
  const d13 = preview.days.find((d) => d.date === '2025-09-13');
  assert.equal(d13.existing, 1);
  assert.deepEqual(d13.counts, { excused: 1, unexcused: 0, leftEarly: 0, present: 0 }, 'B entschuldigt, C noch nicht in der Klasse');
  const d20 = preview.days.find((d) => d.date === '2025-09-20');
  assert.equal(d20.taken, false);
  assert.equal(d20.counts.unexcused, 0, 'Tag ohne jeden Eintrag: niemand wird unentschuldigt');
  assert.equal(d20.pendingSkipped, 1, 'offene Entschuldigung wird nur auf Wunsch übernommen');
  assert.equal(db.all('attendance').filter((x) => x.classId === klass.id).length, 1, 'Vorschau schreibt nichts');

  // Offene Entschuldigungen übernehmen, Ferientag 27.9. abwählen.
  const done = (await admin('POST', `/classes/${klass.id}/backfill`, { ...body, dryRun: false, pendingAsExcused: true, dates: ['2025-09-06', '2025-09-13', '2025-09-20'] })).data;
  assert.equal(done.ok, true);
  assert.equal(done.days, 3);
  const recs = db.all('attendance').filter((x) => x.classId === klass.id);
  assert.equal(recs.find((x) => x.studentId === b && x.sessionId === s13.id)?.status, 'excused');
  assert.equal(recs.find((x) => x.studentId === b && x.sessionId === s13.id)?.note, 'Krank');
  assert.equal(recs.find((x) => x.id === 'att_bf_a').status, 'present', 'vorhandener Eintrag unverändert');
  const s20 = db.all('sessions').find((x) => x.classId === klass.id && x.date === '2025-09-20');
  assert.equal(recs.find((x) => x.studentId === a && x.sessionId === s20.id)?.status, 'excused');
  assert.equal(db.all('sessions').some((x) => x.classId === klass.id && x.date === '2025-09-27'), false, 'abgewählter Tag bleibt weg');

  // Nachtrag unentschuldigt: ein erfasster Tag, an dem jemand ohne Meldung fehlte.
  const s6 = db.all('sessions').find((x) => x.classId === klass.id && x.date === '2025-09-06');
  db.insert('attendance', { id: 'att_bf_a6', sessionId: s6.id, classId: klass.id, studentId: a, status: 'present', source: 'checkin', updatedAt: new Date().toISOString() });
  const second = (await admin('POST', `/classes/${klass.id}/backfill`, { from: '2025-09-06', to: '2025-09-06', dryRun: false })).data;
  assert.equal(second.entries, 1);
  assert.equal(db.all('attendance').find((x) => x.sessionId === s6.id && x.studentId === b)?.status, 'unexcused');

  // Rückgängig: der erste Nachtrag verschwindet samt neu angelegter, leerer Tage.
  const list = (await admin('GET', `/classes/${klass.id}/backfill`)).data.backfills;
  assert.equal(list.length, 2);
  const undo = (await admin('DELETE', `/classes/${klass.id}/backfill/${done.batch}`)).data;
  assert.equal(undo.ok, true);
  assert.equal(db.all('attendance').some((x) => x.backfillBatch === done.batch), false);
  assert.equal(db.all('sessions').some((x) => x.id === s20.id), false, 'leerer, nachgetragener Tag entfernt');
  assert.ok(db.all('sessions').some((x) => x.id === s6.id), 'Tag mit anderen Einträgen bleibt');
  assert.equal((await admin('DELETE', `/classes/${klass.id}/backfill/${done.batch}`)).status, 404, 'nicht doppelt');
});

test('Anwesenheit nachtragen: Mitglied ab erstem eigenen Eintrag, auch wenn das Konto später angelegt wurde', async () => {
  const { db } = await import('../store.js');
  const admin = await loginAs('admin@dbz.de');
  const klass = (await admin('POST', '/admin/classes', { name: 'Klasse Erster Eintrag', weekday: 6 })).data.class;
  const u = (await admin('POST', '/admin/users', { name: 'Spaet Angelegt', email: 'spaet@example.org', password: 'demo1234', role: 'schueler', classIds: [klass.id] })).data.user;
  const other = (await admin('POST', '/admin/users', { name: 'Anderer', email: 'anderer@example.org', password: 'demo1234', role: 'schueler', classIds: [klass.id] })).data.user;
  // Konto heute angelegt, aber schon im Oktober 2025 eingecheckt.
  const sOct = (await admin('POST', `/classes/${klass.id}/days`, { date: '2025-10-04' })).data.session;
  db.insert('attendance', { id: 'att_first_seen', sessionId: sOct.id, classId: klass.id, studentId: u.id, status: 'present', source: 'checkin', updatedAt: new Date().toISOString() });
  const sOct11 = (await admin('POST', `/classes/${klass.id}/days`, { date: '2025-10-11' })).data.session;
  db.insert('attendance', { id: 'att_first_seen2', sessionId: sOct11.id, classId: klass.id, studentId: other.id, status: 'present', source: 'checkin', updatedAt: new Date().toISOString() });
  const preview = (await admin('POST', `/classes/${klass.id}/backfill`, { from: '2025-09-27', to: '2025-10-11' })).data;
  const byDate = Object.fromEntries(preview.days.map((d) => [d.date, d]));
  assert.equal(byDate['2025-10-11'].counts.unexcused, 1, 'ab dem ersten Eintrag Mitglied: fehlt am 11.10.');
  assert.equal(byDate['2025-10-04'].counts.unexcused, 0, '„Anderer" war am 4.10. noch nicht nachweisbar dabei');
  assert.equal(byDate['2025-09-27'].open, 0, 'vor dem ersten Eintrag gehört niemand dazu');
});

test('Allgemeiner Link: Klassenlehrkraft nimmt offene Anmeldung in die eigene Klasse auf (mit Klassenverlauf)', async () => {
  const { db } = await import('../store.js');
  const teacher = await loginAs('lehrer@dbz.de');
  const student = await loginAs('schueler@dbz.de');
  const admin = await loginAs('admin@dbz.de');
  const fremd = (await admin('POST', '/admin/classes', { name: 'Fremde Klasse' })).data.class;
  const isDemoTeacher = Boolean(db.all('users').find((u) => u.email === 'lehrer@dbz.de').isDemo);
  db.insert('users', { id: 'user_probe', name: 'Probe Schüler', email: 'probe@example.org', role: 'schueler', status: 'pending', classIds: [], isDemo: isDemoTeacher, createdAt: new Date().toISOString(), profile: { street: 'Geheimweg', phone: '0170' } });

  assert.equal((await student('GET', '/classes/pending-students')).status, 403);
  const list = (await teacher('GET', '/classes/pending-students')).data.students;
  const row = list.find((x) => x.id === 'user_probe');
  assert.ok(row);
  assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'id', 'name'], 'keine Adresse/Telefon für Lehrkräfte');

  assert.equal((await teacher('POST', `/classes/${fremd.id}/take-pending/user_probe`)).status, 403, 'nur eigene Klasse');
  const ok = await teacher('POST', '/classes/class_3/take-pending/user_probe');
  assert.equal(ok.status, 200);
  const u = db.all('users').find((x) => x.id === 'user_probe');
  assert.equal(u.status, 'active');
  assert.deepEqual(u.classIds, ['class_3']);
  const enr = db.all('enrollments').find((e) => e.studentId === 'user_probe');
  assert.equal(enr?.reason, 'joined');
  assert.equal((await teacher('POST', '/classes/class_3/take-pending/user_probe')).status, 404, 'nicht doppelt');
});

test('Aufnahmen: Lehrkraft behält, Speicherübersicht nur für Admin, Aufräumen nur bewertete und nicht behaltene', async () => {
  const { db } = await import('../store.js');
  const admin = await loginAs('admin@dbz.de');
  const teacher = await loginAs('lehrer@dbz.de');
  const leitung = await loginAs('leitung@dbz.de');
  const old = new Date(Date.now() - 40 * 86400000).toISOString();
  const mkFile = (id, extra = {}) => ({ id, filename: `file_${id}_ab12.webm`, originalName: `${id}.webm`, mediaType: 'audio/webm', size: 1000, ...extra });
  db.insert('submissions', { id: 'sub_store_a', assignmentId: 'x', classId: 'class_3', studentId: 'user_yusuf', status: 'passed', submittedAt: old, reviewedAt: old, files: [mkFile('keepme'), mkFile('dropme')] });
  db.insert('submissions', { id: 'sub_store_b', assignmentId: 'x', classId: 'class_3', studentId: 'user_yusuf', status: 'submitted', submittedAt: old, files: [mkFile('ungraded')] });
  db.insert('submissions', { id: 'sub_store_c', assignmentId: 'x', classId: 'class_3', studentId: 'user_yusuf', status: 'passed', submittedAt: old, reviewedAt: new Date().toISOString(), files: [mkFile('fresh')] });

  // Lehrkraft der Klasse behält eine Aufnahme.
  assert.equal((await teacher('POST', '/submissions/sub_store_a/file/keepme/keep', { keep: true })).status, 200);
  assert.equal(db.all('submissions').find((x) => x.id === 'sub_store_a').files[0].retainPermanently, true);

  // Übersicht: nur Systemadministrator.
  assert.equal((await leitung('GET', '/admin/storage')).status, 403);
  const st = (await admin('GET', '/admin/storage?days=30')).data;
  assert.ok(st.totalCount >= 4);
  assert.ok(st.areas.some((a) => a.area === 'submissions' && a.kinds.audio.count >= 4));
  assert.equal(st.cleanable.count, 1, 'nur die bewertete, nicht behaltene, ältere Aufnahme');

  // Aufräumen: Bestätigung nötig, dann nur „dropme“.
  assert.equal((await admin('POST', '/admin/storage/cleanup', { olderThanDays: 30, confirm: 'ja' })).status, 400);
  const r = (await admin('POST', '/admin/storage/cleanup', { olderThanDays: 30, confirm: 'AUFRÄUMEN' })).data;
  assert.equal(r.count, 1);
  const a = db.all('submissions').find((x) => x.id === 'sub_store_a');
  assert.equal(a.files.find((f) => f.id === 'dropme').deleted, true);
  assert.equal(a.files.find((f) => f.id === 'dropme').filename, undefined, 'Name entfernt, damit die Löschliste den Platz freigibt');
  assert.equal(a.files.find((f) => f.id === 'keepme').deleted, undefined, 'behaltene bleibt');
  assert.ok(db.all('file_trash').some((t) => t.filename === 'file_dropme_ab12.webm'), 'Datei liegt 30 Tage in der Löschliste');
  assert.equal(db.all('submissions').find((x) => x.id === 'sub_store_b').files[0].deleted, undefined, 'unbewertete bleibt');
  assert.equal(db.all('submissions').find((x) => x.id === 'sub_store_c').files[0].deleted, undefined, 'frisch bewertete bleibt');
});

test('Schülernummer und Ausweis: feste Nummer, Prüfung per QR zeigt nur das Nötigste', async () => {
  const { db } = await import('../store.js');
  const admin = await loginAs('admin@dbz.de');
  const student = await loginAs('schueler@dbz.de');
  const teacher = await loginAs('lehrer@dbz.de');

  assert.equal((await teacher('GET', '/me/pass')).status, 403, 'nur für Schüler');
  const pass = (await student('GET', '/me/pass')).data;
  assert.match(pass.studentNumber, /^DBZ-\d{4}-\d{4}$/);
  assert.ok(pass.token.length >= 20);
  assert.match(pass.schoolYear, /^\d{4}\/\d{2}$/);
  // Nummer bleibt fest.
  assert.equal((await student('GET', '/me/pass')).data.studentNumber, pass.studentNumber);
  // Alle Schüler haben eine Nummer, keine doppelt.
  await admin('GET', '/admin/users');
  const nums = db.all('users').filter((u) => ['schueler', 'klassensprecher'].includes(u.role) && u.status === 'active').map((u) => u.studentNumber);
  assert.ok(nums.every(Boolean));
  assert.equal(new Set(nums).size, nums.length);
  // Der Prüf-Schlüssel geht nie über die Nutzerlisten hinaus.
  assert.doesNotMatch(JSON.stringify((await admin('GET', '/admin/users')).data), new RegExp(pass.token));

  // Öffentliche Prüfung: nur gültig, Kurzname, Nummer, Schuljahr.
  const res = await fetch(`${base}/api/pass/${pass.token}`);
  const v = await res.json();
  assert.equal(v.valid, true);
  assert.deepEqual(Object.keys(v).sort(), ['name', 'orgName', 'schoolYear', 'studentNumber', 'valid']);
  assert.equal((await fetch(`${base}/api/pass/falsch-falsch-falsch-falsch`)).status, 404);
  // Deaktiviert -> ungültig.
  const u = db.all('users').find((x) => x.passToken === pass.token);
  u.status = 'disabled';
  assert.equal((await (await fetch(`${base}/api/pass/${pass.token}`)).json()).valid, false);
  u.status = 'active';
});

test('Impressum-Angaben: öffentlich lesbar, nur der Administrator ändert sie', async () => {
  const admin = await loginAs('admin@dbz.de');
  const leitung = await loginAs('leitung@dbz.de');
  const pub = await (await fetch(`${base}/api/legal`)).json();
  assert.equal(pub.legal.street, 'Am Moosfeld 11');
  assert.equal(pub.legal.zip, '81829');
  assert.equal((await leitung('PATCH', '/org', { legal: { email: 'info@example.org' } })).status, 403);
  assert.equal((await admin('PATCH', '/org', { legal: { email: 'keine-adresse' } })).status, 400);
  assert.equal((await admin('PATCH', '/org', { legal: { phone: 12 } })).status, 400);
  assert.equal((await admin('PATCH', '/org', { legal: { email: 'info@example.org', register: 'Amtsgericht München, VR 1' } })).status, 200);
  const after = (await (await fetch(`${base}/api/legal`)).json()).legal;
  assert.equal(after.email, 'info@example.org');
  assert.equal(after.street, 'Am Moosfeld 11', 'andere Angaben bleiben');
  assert.equal((await admin('GET', '/org')).status, 200);
});

test('Sicherung prüfen ohne Wiederherstellen; neue Passwörter mindestens 8 Zeichen', async () => {
  const { backupNow, listBackups } = await import('../backup.js');
  const { db } = await import('../store.js');
  const admin = await loginAs('admin@dbz.de');
  const leitung = await loginAs('leitung@dbz.de');
  await backupNow('event', 'pruefung');
  const name = (await listBackups())[0].name;
  const usersBefore = db.all('users').length;
  assert.equal((await leitung('POST', `/admin/backups/${name}/verify`)).status, 403);
  const v = (await admin('POST', `/admin/backups/${name}/verify`)).data;
  assert.equal(v.ok, true);
  assert.ok(v.counts.find((c) => c.key === 'users').backup > 0);
  assert.equal(db.all('users').length, usersBefore, 'nichts verändert');
  assert.equal((await admin('POST', '/admin/backups/gibt-es-nicht.json.gz/verify')).status, 404);

  const short = await admin('POST', '/admin/users', { name: 'Kurz PW', email: 'kurz@example.org', password: 'abc1234', role: 'schueler' });
  assert.equal(short.status, 400);
  assert.match(short.data.error, /8 Zeichen/);
  assert.equal((await admin('POST', '/admin/users', { name: 'Lang PW', email: 'lang@example.org', password: 'abcd1234', role: 'schueler' })).status, 200);
});
