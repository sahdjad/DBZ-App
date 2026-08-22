// Integrationstests der DBZ-API: Auth, Rollen-Scope, QR-Check-in, Abgaben.
// Nutzt eine isolierte Datenverzeichnis-Instanz (DBZ_DATA_DIR) und den
// eingebauten fetch-Client. Keine externen Test-Abhängigkeiten.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dbz-test-'));
process.env.DBZ_DATA_DIR = TMP;
process.env.JWT_SECRET = 'test-secret';
process.env.EXPOSE_RESET_LINK = '1'; // nur für Tests: Reset-Link in der Antwort

let server;
let base;

before(async () => {
  const { seed } = await import('../seed.js');
  const { createApp } = await import('../app.js');
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

// Kleiner Client, der das Auth-Cookie mitführt.
function client() {
  let cookie = '';
  return async (method, path, body) => {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (body) headers['content-type'] = 'application/json';
    const res = await fetch(base + '/api' + path, {
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

async function loginAs(email) {
  const c = client();
  const r = await c('POST', '/auth/login', { email, password: 'demo1234' });
  assert.equal(r.status, 200, `Login ${email} sollte funktionieren`);
  return c;
}

test('Push: Status liefert Schlüssel, An-/Abmelden funktioniert', async () => {
  const c = await loginAs('schueler@dbz.de');
  const st = await c('GET', '/push/status');
  assert.equal(st.status, 200);
  assert.equal(st.data.enabled, true);
  assert.equal(Buffer.from(st.data.publicKey.replace(/-/g, '+').replace(/_/g, '/'), 'base64').length, 65, 'VAPID-Public = 65 Byte P-256-Punkt');
  assert.equal(st.data.subscribed, false);

  // Anmelden mit einem gültigen (simulierten) Browser-Abo.
  const crypto = await import('node:crypto');
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const b64 = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sub = { endpoint: 'https://example.com/push/abc', keys: { p256dh: b64(ecdh.getPublicKey()), auth: b64(crypto.randomBytes(16)) } };
  assert.equal((await c('POST', '/push/subscribe', { subscription: sub })).status, 200);
  assert.equal((await c('GET', '/push/status')).data.subscribed, true);

  // Ungültiges Abo -> 400.
  assert.equal((await c('POST', '/push/subscribe', { subscription: { endpoint: 'x' } })).status, 400);

  // Abmelden.
  assert.equal((await c('POST', '/push/unsubscribe', { endpoint: sub.endpoint })).status, 200);
  assert.equal((await c('GET', '/push/status')).data.subscribed, false);
});

test('Push: Nutzlast ist für den Browser entschlüsselbar (RFC 8291)', async () => {
  const crypto = await import('node:crypto');
  const { encryptPayload } = await import('../webpush.js');
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const uaPub = ecdh.getPublicKey();
  const auth = crypto.randomBytes(16);
  const b64 = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const msg = JSON.stringify({ title: 'DBZ', body: 'Test ✓', url: '/nachrichten' });
  const body = encryptPayload(Buffer.from(msg, 'utf8'), b64(uaPub), b64(auth));

  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPub = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const shared = ecdh.computeSecret(asPub);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const dec = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  dec.setAuthTag(ct.subarray(ct.length - 16));
  let pt = Buffer.concat([dec.update(ct.subarray(0, ct.length - 16)), dec.final()]);
  let i = pt.length - 1; while (i >= 0 && pt[i] === 0) i--; if (pt[i] === 2) i--; pt = pt.subarray(0, i + 1);
  assert.equal(pt.toString('utf8'), msg);
});

test('Badges je Kategorie + Nachricht zurückrufen (serverseitige Rollenprüfung)', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const student = await loginAs('schueler@dbz.de');
  const recipientId = (await student('GET', '/auth/me')).data.user.id;

  // Lehrer schreibt dem Schüler -> ungelesen-Zähler beim Schüler.
  const send = await teacher('POST', '/threads', { recipientId, body: 'Test Nachricht' });
  assert.equal(send.status, 200);
  const threadId = send.data.threadId;
  let b = (await student('GET', '/badges')).data;
  assert.ok(b.messages >= 1 && b.total >= 1, 'Schüler hat ungelesene Nachricht');

  const mid = (await teacher('GET', `/threads/${threadId}`)).data.thread.messages[0].id;

  // Schüler darf NICHT zurückrufen (serverseitig 403).
  assert.equal((await student('POST', `/threads/${threadId}/messages/${mid}/recall`, {})).status, 403);

  // Lehrer ruft eigene Nachricht zurück -> ersetzt + Zähler des Schülers sinkt.
  const rec = await teacher('POST', `/threads/${threadId}/messages/${mid}/recall`, {});
  assert.equal(rec.status, 200);
  assert.equal(rec.data.message.recalled, true);
  b = (await student('GET', '/badges')).data;
  assert.equal(b.messages, 0, 'Zurückgerufene Nachricht zählt nicht mehr');

  // Empfänger sieht statt Inhalt nur den Zurückgerufen-Zustand.
  const th = (await student('GET', `/threads/${threadId}`)).data.thread;
  assert.equal(th.messages[0].recalled, true);
  assert.equal(th.messages[0].body, '');
});

test('Zeugnis: Fachnoten, überschreibbarer Durchschnitt und Klassenübersicht', async () => {
  const leitung = await loginAs('leitung@dbz.de');
  const teacher = await loginAs('lehrer@dbz.de');
  const student = await loginAs('schueler@dbz.de');
  const studentId = (await student('GET', '/auth/me')).data.user.id;

  const per = await leitung('POST', '/report-periods', { name: 'Testhalbjahr' });
  assert.equal(per.status, 200);
  const periodId = per.data.period.id;

  const rep = await teacher('POST', '/reports', { studentId, periodId });
  assert.equal(rep.status, 200);
  const rid = rep.data.report.id;
  assert.ok(Array.isArray(rep.data.report.grades));

  // Noten: Qur'an=2, Tajwid=1 -> Durchschnitt 1,5.
  const patched = await teacher('PATCH', `/reports/${rid}`, { grades: [{ subject: 'quran', grade: 2 }, { subject: 'tajwid', grade: 1 }] });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.report.average, 1.5);
  assert.equal(patched.data.report.effectiveAverage, 1.5);

  // Durchschnitt überschreiben -> effektiv 2,0; berechneter bleibt 1,5.
  const ov = await teacher('PATCH', `/reports/${rid}`, { averageOverride: 2 });
  assert.equal(ov.data.report.effectiveAverage, 2);
  assert.equal(ov.data.report.average, 1.5);

  // Klassenübersicht (Lehrkraft) enthält den Schüler mit Ø 2,0.
  const ovw = await teacher('GET', `/reports/overview?periodId=${periodId}`);
  assert.equal(ovw.status, 200);
  const row = ovw.data.rows.find((r) => r.studentId === studentId);
  assert.ok(row && row.effectiveAverage === 2);

  // Schüler darf die Klassenübersicht NICHT abrufen.
  assert.equal((await student('GET', `/reports/overview?periodId=${periodId}`)).status, 403);
});

test('falsches Passwort wird abgelehnt', async () => {
  const c = client();
  const r = await c('POST', '/auth/login', { email: 'schueler@dbz.de', password: 'falsch' });
  assert.equal(r.status, 401);
});

test('Schüler sieht nur eigene Aufgaben und kann sich nicht als Admin ausgeben', async () => {
  const c = await loginAs('schueler@dbz.de');
  const me = await c('GET', '/auth/me');
  assert.equal(me.data.user.role, 'schueler');

  const asg = await c('GET', '/assignments');
  assert.ok(Array.isArray(asg.data.assignments));
  assert.ok(asg.data.assignments.length >= 1);

  // Admin-Route ist für Schüler gesperrt (serverseitig).
  const admin = await c('GET', '/admin/users');
  assert.equal(admin.status, 403);
});

test('QR-Check-in: Serverzeit, korrekter Status, kein Doppel-Check-in', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const today = await teacher('GET', '/sessions/today');
  const session = today.data.sessions[0];
  assert.ok(session, 'heutige Sitzung sollte existieren');

  await teacher('POST', `/sessions/${session.id}/start`);
  const qr = await teacher('POST', `/sessions/${session.id}/qr`);
  assert.equal(qr.status, 200);
  assert.ok(qr.data.token);

  const student = await loginAs('schueler@dbz.de');
  const chk = await student('POST', '/checkin', { token: qr.data.token });
  assert.equal(chk.status, 200);
  assert.ok(['present', 'late'].includes(chk.data.status));

  // Zweiter Check-in erzeugt keinen neuen Datensatz.
  const again = await student('POST', '/checkin', { token: qr.data.token });
  assert.equal(again.data.already, true);

  // Falscher Token wird abgelehnt.
  const bad = await student('POST', '/checkin', { token: 'ungueltig' });
  assert.equal(bad.status, 400);
});

test('Abwesenheitsantrag: Schüler stellt, kann ihn nicht selbst genehmigen, Lehrer entscheidet', async () => {
  const student = await loginAs('schueler@dbz.de');
  const create = await student('POST', '/absence-requests', {
    requestType: 'absent',
    reasonCategory: 'krankheit',
    comment: 'Erkältung',
  });
  assert.equal(create.status, 200);
  const id = create.data.request.id;

  // Schüler darf nicht entscheiden.
  const selfDecide = await student('POST', `/absence-requests/${id}/decide`, { decision: 'approve' });
  assert.equal(selfDecide.status, 403);

  // Lehrer genehmigt.
  const teacher = await loginAs('lehrer@dbz.de');
  const decide = await teacher('POST', `/absence-requests/${id}/decide`, { decision: 'approve' });
  assert.equal(decide.status, 200);
  assert.equal(decide.data.status, 'approved');
});

test('Hausaufgabe: Textabgabe funktioniert und erscheint in der Korrekturqueue', async () => {
  const student = await loginAs('schueler@dbz.de');
  const list = await student('GET', '/assignments');
  const asgId = list.data.assignments[0].id;

  // Textabgabe (multipart mit Feld "text")
  const form = new FormData();
  form.set('text', 'Meine schriftliche Abgabe.');
  const res = await fetch(base + '/api/assignments/' + asgId + '/submit', {
    method: 'POST',
    headers: { cookie: await cookieFor('schueler@dbz.de') },
    body: form,
  });
  assert.equal(res.status, 200);

  const teacher = await loginAs('lehrer@dbz.de');
  const queue = await teacher('GET', '/review-queue');
  assert.ok(queue.data.submissions.some((s) => s.assignmentId === asgId));
});

test('Vertretungslehrer/Fremde können fremde Klassen nicht verwalten', async () => {
  // Eltern dürfen keine Anwesenheitsübersicht einer Klasse abrufen.
  const eltern = await loginAs('eltern@dbz.de');
  const r = await eltern('GET', '/classes/class_3/attendance-overview');
  assert.equal(r.status, 403);
});

test('Passwort ändern: falsches aktuelles Passwort abgelehnt, danach neues gültig', async () => {
  const c = await loginAs('leitung@dbz.de');
  // falsches aktuelles Passwort
  const wrong = await c('PATCH', '/me/password', { currentPassword: 'falsch', newPassword: 'neuespw' });
  assert.equal(wrong.status, 400);
  // korrekt ändern
  const ok = await c('PATCH', '/me/password', { currentPassword: 'demo1234', newPassword: 'neuespw123' });
  assert.equal(ok.status, 200);
  // altes Passwort funktioniert nicht mehr, neues schon
  const oldLogin = client();
  assert.equal((await oldLogin('POST', '/auth/login', { email: 'leitung@dbz.de', password: 'demo1234' })).status, 401);
  const newLogin = client();
  assert.equal((await newLogin('POST', '/auth/login', { email: 'leitung@dbz.de', password: 'neuespw123' })).status, 200);
  // zurücksetzen, damit andere Tests unberührt bleiben
  await newLogin('PATCH', '/me/password', { currentPassword: 'neuespw123', newPassword: 'demo1234' });
});

test('Verhalten: Sichtbarkeit für Schüler und Eltern wird durchgesetzt', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const visible = await teacher('POST', '/behavior', {
    studentId: 'user_yusuf', classId: 'class_3', category: 'adab', tone: 'positive',
    note: 'Sehr gutes Benehmen', visibleToStudent: true, visibleToParent: true,
  });
  assert.equal(visible.status, 200);
  const hidden = await teacher('POST', '/behavior', {
    studentId: 'user_yusuf', classId: 'class_3', category: 'participation', tone: 'negative',
    note: 'Interne Notiz', visibleToStudent: false, visibleToParent: false,
  });
  assert.equal(hidden.status, 200);

  // Schüler sieht nur den sichtbaren Vermerk
  const student = await loginAs('schueler@dbz.de');
  const sList = await student('GET', '/behavior');
  assert.ok(sList.data.records.some((r) => r.note === 'Sehr gutes Benehmen'));
  assert.ok(!sList.data.records.some((r) => r.note === 'Interne Notiz'));

  // Eltern sehen den für Eltern freigegebenen Vermerk des eigenen Kindes
  const parent = await loginAs('eltern@dbz.de');
  const pList = await parent('GET', '/behavior?studentId=user_yusuf');
  assert.ok(pList.data.records.some((r) => r.note === 'Sehr gutes Benehmen'));
  // Eltern dürfen keine fremden Kinder abfragen
  const forbidden = await parent('GET', '/behavior?studentId=user_amina');
  assert.equal(forbidden.status, 403);
});

test('Schülerprofil: Lehrer und eigenes Elternteil dürfen, Fremde nicht', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const t = await teacher('GET', '/students/user_yusuf/profile');
  assert.equal(t.status, 200);
  assert.equal(t.data.student.name, 'Yusuf');
  assert.ok(t.data.attendance && Array.isArray(t.data.assignments));

  const parent = await loginAs('eltern@dbz.de');
  assert.equal((await parent('GET', '/students/user_yusuf/profile')).status, 200);
  // fremdes Kind: kein Zugriff
  assert.equal((await parent('GET', '/students/user_amina/profile')).status, 403);
});

test('Strafen: Klassensprecher erfasst (pending), Lehrer genehmigt, Schüler sieht, dann erledigt', async () => {
  const sprecher = await loginAs('sprecher@dbz.de');
  const create = await sprecher('POST', '/penalties', {
    classId: 'class_3', studentId: 'user_yusuf', type: 'pages', amount: 5, reason: 'Hausaufgabe vergessen',
  });
  assert.equal(create.status, 200);
  assert.equal(create.data.penalty.status, 'pending');
  const id = create.data.penalty.id;

  // Schüler darf keine Strafe erfassen und sieht die noch nicht genehmigte nicht.
  const student = await loginAs('schueler@dbz.de');
  assert.equal(
    (await student('POST', '/penalties', { classId: 'class_3', studentId: 'user_yusuf', type: 'pages', amount: 1, reason: 'x' })).status,
    403,
  );
  assert.ok(!(await student('GET', '/penalties')).data.penalties.some((p) => p.id === id));

  // Lehrer genehmigt -> offen.
  const teacher = await loginAs('lehrer@dbz.de');
  const appr = await teacher('POST', `/penalties/${id}/approve`);
  assert.equal(appr.status, 200);
  assert.equal(appr.data.penalty.status, 'approved');

  // Jetzt sieht der Schüler die offene Strafe.
  const s2 = await loginAs('schueler@dbz.de');
  assert.ok((await s2('GET', '/penalties')).data.penalties.some((p) => p.id === id && p.status === 'approved'));

  // Lehrer verbucht als erledigt.
  const settle = await teacher('POST', `/penalties/${id}/settle`);
  assert.equal(settle.status, 200);
  assert.equal(settle.data.penalty.status, 'settled');
});

test('Strafen: Lehrer erfasst direkt genehmigt; ungültiger Schüler wird abgelehnt', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const direct = await teacher('POST', '/penalties', {
    classId: 'class_3', studentId: 'user_yusuf', type: 'money', amount: 2, reason: 'Direkt',
  });
  assert.equal(direct.status, 200);
  assert.equal(direct.data.penalty.status, 'approved');

  const bad = await teacher('POST', '/penalties', {
    classId: 'class_3', studentId: 'user_nobody', type: 'money', amount: 2, reason: 'x',
  });
  assert.equal(bad.status, 400);
});

test('Eltern↔Kind: Verknüpfung per Familien-Code, falscher Code abgelehnt, Zugriff erst danach', async () => {
  // Lehrer holt den Familien-Code eines (noch nicht verknüpften) Schülers.
  const teacher = await loginAs('lehrer@dbz.de');
  const codeRes = await teacher('GET', '/students/user_amina/family-code');
  assert.equal(codeRes.status, 200);
  const code = codeRes.data.code;
  assert.ok(code && code.length >= 6);

  const parent = await loginAs('eltern@dbz.de');
  // Vor Verknüpfung: kein Zugriff auf Aminas Profil.
  assert.equal((await parent('GET', '/students/user_amina/profile')).status, 403);
  // Falscher Code wird abgelehnt.
  assert.equal((await parent('POST', '/family/link', { code: 'XXXXXX' })).status, 404);
  // Richtiger Code verknüpft.
  const link = await parent('POST', '/family/link', { code });
  assert.equal(link.status, 200);
  assert.equal(link.data.child.id, 'user_amina');
  // Doppelte Verknüpfung wird abgelehnt.
  assert.equal((await parent('POST', '/family/link', { code })).status, 400);
  // Jetzt Zugriff auf Aminas Profil und Kind erscheint in der Liste.
  assert.equal((await parent('GET', '/students/user_amina/profile')).status, 200);
  assert.ok((await parent('GET', '/family/children')).data.children.some((c) => c.id === 'user_amina'));

  // Wieder lösen -> erneut kein Zugriff.
  assert.equal((await parent('POST', '/family/unlink', { childId: 'user_amina' })).status, 200);
  assert.equal((await parent('GET', '/students/user_amina/profile')).status, 403);
});

test('Familien-Code: Fremde (anderes Elternteil) bekommt den Code eines Kindes nicht', async () => {
  const parent = await loginAs('eltern@dbz.de');
  // Eltern dürfen den Code nicht über die Verwalter-Route abrufen.
  assert.equal((await parent('GET', '/students/user_yusuf/family-code')).status, 403);
});

test('Nachrichten: Bild-Anhang senden & abrufen, Reaktion umschalten, Fremde gesperrt', async () => {
  const teacher = await loginAs('lehrer@dbz.de');

  // Thread mit Bild-Anhang starten (multipart).
  const form = new FormData();
  form.set('recipientId', 'user_yusuf');
  form.set('body', 'Schau dir das an');
  form.set('file', new Blob([Buffer.from('PNGDATA')], { type: 'image/png' }), 'bild.png');
  const res = await fetch(base + '/api/threads', {
    method: 'POST',
    headers: { cookie: await cookieFor('lehrer@dbz.de') },
    body: form,
  });
  assert.equal(res.status, 200);
  const { threadId } = await res.json();

  // Nachricht mit Datei erscheint; interner Dateiname wird NICHT mitgesendet.
  const th = await teacher('GET', `/threads/${threadId}`);
  const msg = th.data.thread.messages.find((m) => m.file);
  assert.ok(msg && msg.file.kind === 'image');
  assert.equal(msg.file.filename, undefined);

  // Anhang ist für Teilnehmer abrufbar …
  const dl = await fetch(base + `/api/threads/${threadId}/messages/${msg.id}/file`, {
    headers: { cookie: await cookieFor('lehrer@dbz.de') },
  });
  assert.equal(dl.status, 200);
  // … aber nicht für Fremde.
  const forbidden = await fetch(base + `/api/threads/${threadId}/messages/${msg.id}/file`, {
    headers: { cookie: await cookieFor('sprecher@dbz.de') },
  });
  assert.equal(forbidden.status, 403);

  // Reaktion setzen und wieder entfernen (umschalten).
  const r1 = await teacher('POST', `/threads/${threadId}/messages/${msg.id}/react`, { emoji: '👍' });
  assert.ok(Array.isArray(r1.data.reactions['👍']) && r1.data.reactions['👍'].length === 1);
  const r2 = await teacher('POST', `/threads/${threadId}/messages/${msg.id}/react`, { emoji: '👍' });
  assert.equal(r2.data.reactions['👍'], undefined);
  // Ungültige Reaktion wird abgelehnt.
  assert.equal((await teacher('POST', `/threads/${threadId}/messages/${msg.id}/react`, { emoji: '💣' })).status, 400);

  // Reine Textnachricht (JSON) funktioniert weiterhin.
  const textMsg = await teacher('POST', `/threads/${threadId}/messages`, { body: 'nur Text' });
  assert.equal(textMsg.status, 200);
  assert.equal(textMsg.data.message.body, 'nur Text');
});

test('Klassenliste: Kennzahlen je Schüler, nur für Verwalter', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const r = await teacher('GET', '/classes/class_3/roster');
  assert.equal(r.status, 200);
  assert.equal(r.data.class.id, 'class_3');
  const yusuf = r.data.rows.find((x) => x.id === 'user_yusuf');
  assert.ok(yusuf, 'Yusuf in der Liste');
  // erwartete Kennzahl-Felder vorhanden
  for (const key of ['attendanceRate', 'unexcused', 'openAssignments', 'overdueAssignments', 'penaltyMoney', 'penaltyPages', 'negativeBehavior']) {
    assert.ok(key in yusuf, `Feld ${key} fehlt`);
  }

  // Schüler dürfen die Klassenliste nicht abrufen.
  const student = await loginAs('schueler@dbz.de');
  assert.equal((await student('GET', '/classes/class_3/roster')).status, 403);
});

test('Leitungs-Überblick: Kennzahlen aggregiert, nur für Leitung/Admin', async () => {
  const leitung = await loginAs('leitung@dbz.de');
  const r = await leitung('GET', '/leadership/overview');
  assert.equal(r.status, 200);
  assert.ok(r.data.counts.students >= 1, 'Schülerzahl');
  assert.ok(Array.isArray(r.data.classes) && r.data.classes.some((c) => c.id === 'class_3'));
  for (const key of ['pendingApprovals', 'openMoney', 'openPages', 'openCount']) {
    assert.ok(key in r.data.penalties, `Feld ${key} fehlt`);
  }

  // Lehrer (kein Admin) darf nicht.
  const teacher = await loginAs('lehrer@dbz.de');
  assert.equal((await teacher('GET', '/leadership/overview')).status, 403);
});

test('Kalender: eigener Termin mit Wiederholung erscheint, ist privat, editier-/löschbar', async () => {
  const student = await loginAs('schueler@dbz.de');
  const create = await student('POST', '/events', {
    title: 'Fußball', date: '2026-09-01', allDay: false, startTime: '17:00', endTime: '18:30',
    category: 'sport', recurrence: { freq: 'weekly', until: '2026-09-30' },
  });
  assert.equal(create.status, 200);
  const id = create.data.event.id;

  // Im Kalender-Bereich als mehrere Vorkommen (wöchentlich) sichtbar.
  const cal = await student('GET', '/calendar?from=2026-09-01&to=2026-09-30');
  const mine = cal.data.events.filter((e) => e.type === 'personal' && e.id === id);
  assert.ok(mine.length >= 4, 'mind. 4 wöchentliche Vorkommen');
  assert.equal(mine[0].category, 'sport');

  // Privat: ein anderer Nutzer sieht den Termin nicht.
  const other = await loginAs('lehrer@dbz.de');
  const calOther = await other('GET', '/calendar?from=2026-09-01&to=2026-09-30');
  assert.ok(!calOther.data.events.some((e) => e.id === id));
  // … und darf ihn nicht löschen.
  assert.equal((await other('DELETE', `/events/${id}`)).status, 404);

  // Bearbeiten & löschen durch den Besitzer.
  const patched = await student('PATCH', `/events/${id}`, { title: 'Fußballtraining' });
  assert.equal(patched.data.event.title, 'Fußballtraining');
  assert.equal((await student('DELETE', `/events/${id}`)).status, 200);
});

test("Qur'an: Ayah-Notiz setzen legt Lesezeichen an und ist privat", async () => {
  const student = await loginAs('schueler@dbz.de');
  const set = await student('POST', '/quran/notes', { surah: 1, ayah: 2, note: 'Ghunnah beachten' });
  assert.equal(set.status, 200);
  assert.equal(set.data.bookmark.note, 'Ghunnah beachten');

  // Notiz erscheint in den eigenen Lesezeichen.
  const me = await student('GET', '/quran/me');
  assert.ok(me.data.bookmarks.some((b) => b.surah === 1 && b.ayah === 2 && b.note === 'Ghunnah beachten'));

  // Ein anderer Nutzer sieht die Notiz nicht.
  const other = await loginAs('lehrer@dbz.de');
  const meOther = await other('GET', '/quran/me');
  assert.ok(!meOther.data.bookmarks.some((b) => b.note === 'Ghunnah beachten'));
});

test("Qur'an: Tafsir-Ausgaben verfügbar, ungültige Ayah abgewiesen", async () => {
  const student = await loginAs('schueler@dbz.de');
  const eds = await student('GET', '/quran/tafsir-editions');
  assert.equal(eds.status, 200);
  assert.ok(eds.data.editions.some((e) => e.key === 'saadi'));
  assert.ok(eds.data.editions.some((e) => e.key === 'ibnkathir'));

  // Ungültige Sure -> 404 (ohne externen Abruf).
  const bad = await student('GET', '/quran/tafsir/999/1');
  assert.equal(bad.status, 404);
  // Tadschwid: ungültige Sure ebenfalls 404 (ohne externen Abruf).
  assert.equal((await student('GET', '/quran/tajweed/999')).status, 404);

  // Rezitatoren: nur solche mit durchgehender Datei + Zeitmarken.
  const recs = await student('GET', '/quran/reciters');
  assert.equal(recs.status, 200);
  assert.ok(recs.data.reciters.some((r) => r.id === 'ar.alafasy'));
  assert.ok(recs.data.reciters.length >= 5);
  // Durchgehendes Audio: ungültige Sure -> 404 (ohne externen Abruf).
  assert.equal((await student('GET', '/quran/audio/999')).status, 404);
});

test('Kalender: Schüler sieht Unterrichtstermine und Hausaufgaben-Frist', async () => {
  const student = await loginAs('schueler@dbz.de');
  const r = await student('GET', '/calendar?from=2026-08-01&to=2026-08-31');
  assert.equal(r.status, 200);
  assert.ok(r.data.events.some((e) => e.type === 'lesson'), 'mind. ein Unterrichtstermin');
  assert.ok(r.data.events.some((e) => e.type === 'deadline'), 'mind. eine Frist');
});

test('Bericht: Lehrer erstellt und gibt frei, erst danach für Eltern sichtbar', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const gen = await teacher('POST', '/reports', { studentId: 'user_yusuf', periodId: 'period_probation' });
  assert.equal(gen.status, 200);
  const id = gen.data.report.id;
  assert.ok(gen.data.report.data.attendance, 'Kennzahlen vorhanden');

  // Vor Freigabe: Eltern sehen ihn nicht
  const parent = await loginAs('eltern@dbz.de');
  assert.ok(!(await parent('GET', '/reports')).data.reports.some((r) => r.id === id));

  // Kommentar + Freigabe
  await teacher('PATCH', `/reports/${id}`, { teacherComment: 'Guter Fortschritt.', status: 'released' });

  // Jetzt sehen Eltern den freigegebenen Bericht
  const parent2 = await loginAs('eltern@dbz.de');
  const seen = await parent2('GET', '/reports');
  assert.ok(seen.data.reports.some((r) => r.id === id && r.status === 'released'));
});

test('Prüfung: Auto-Korrektur, Freitext-Bewertung, Ergebnis erst nach Freigabe', async () => {
  const student = await loginAs('schueler@dbz.de');
  // Prüfung ohne Lösungen sichtbar
  const detail = await student('GET', '/exams/exam_demo');
  assert.equal(detail.status, 200);
  assert.ok(!JSON.stringify(detail.data.exam.questions).includes('correct'), 'keine Lösungen an Schüler');

  await student('POST', '/exams/exam_demo/attempt');
  const submit = await student('POST', '/exams/exam_demo/submit', {
    answers: [
      { questionId: 'q0', selected: ['o0_1'] }, // richtig (1 P)
      { questionId: 'q1', selected: ['o1_0', 'o1_1', 'o1_2'] }, // richtig (2 P)
      { questionId: 'q2', text: 'Tawhid ist die Einheit Allahs.' },
    ],
  });
  assert.equal(submit.status, 200);

  // Vor Freigabe kein Ergebnis
  const beforeRelease = await student('GET', '/exams');
  const ex = beforeRelease.data.exams.find((e) => e.id === 'exam_demo');
  assert.equal(ex.studentStatus, 'submitted');
  assert.equal(ex.result, null);

  // Lehrer bewertet Freitext (3 P) und gibt frei
  const teacher = await loginAs('lehrer@dbz.de');
  const attempts = await teacher('GET', '/exams/exam_demo/attempts');
  const att = attempts.data.attempts.find((a) => a.studentId === 'user_yusuf');
  assert.ok(att);
  const grade = await teacher('POST', `/attempts/${att.id}/grade`, { awarded: { q2: 3 }, release: true });
  assert.equal(grade.status, 200);
  assert.equal(grade.data.scores.total, 6); // 1 + 2 + 3
  assert.equal(grade.data.scores.max, 6);

  // Schüler sieht jetzt das freigegebene Ergebnis
  const after = await loginAs('schueler@dbz.de');
  const ex2 = (await after('GET', '/exams')).data.exams.find((e) => e.id === 'exam_demo');
  assert.equal(ex2.studentStatus, 'released');
  assert.equal(ex2.result.total, 6);
  assert.equal(ex2.result.passed, true);
});

test('Hifz: Lehrer erfasst bestandene Rezitation, Fortschritt zählt, Eltern sehen', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const rec = await teacher('POST', '/quran-goals/goal_demo/attempt', {
    tajwid: 8, pronunciation: 9, fluency: 7, memorization: 9, errorCount: 2, passed: true, note: 'MashaAllah',
  });
  assert.equal(rec.status, 200);
  assert.equal(rec.data.goal.status, 'passed');

  // Schüler sieht Fortschritt (15 Ayat der letzten 3 Suren)
  const student = await loginAs('schueler@dbz.de');
  const mine = await student('GET', '/quran-goals');
  assert.equal(mine.data.summary.memorizedAyat, 15);
  assert.ok(mine.data.goals.some((g) => g.id === 'goal_demo' && g.status === 'passed'));

  // Eltern dürfen nur eigenes Kind abfragen
  const parent = await loginAs('eltern@dbz.de');
  assert.equal((await parent('GET', '/quran-goals?studentId=user_amina')).status, 403);
  assert.equal((await parent('GET', '/quran-goals?studentId=user_yusuf')).status, 200);
});

test('Ankündigungen: Leitung an alle, Lehrer nur eigene Klasse', async () => {
  const leitung = await loginAs('leitung@dbz.de');
  const all = await leitung('POST', '/announcements', {
    title: 'Ferienbeginn', body: 'Die Sommerferien beginnen nächste Woche.', audience: { type: 'all' },
  });
  assert.equal(all.status, 200);

  // Schüler sieht die Ankündigung an alle
  const student = await loginAs('schueler@dbz.de');
  const seen = await student('GET', '/announcements');
  assert.ok(seen.data.announcements.some((a) => a.title === 'Ferienbeginn'));

  // Lehrer darf NICHT an alle, aber an die eigene Klasse
  const teacher = await loginAs('lehrer@dbz.de');
  assert.equal((await teacher('POST', '/announcements', { title: 'X', body: 'Y', audience: { type: 'all' } })).status, 403);
  const cls = await teacher('POST', '/announcements', { title: 'Test morgen', body: 'Bitte lernen.', audience: { type: 'class', classId: 'class_3' } });
  assert.equal(cls.status, 200);

  // Schüler der Klasse sieht auch die Klassen-Ankündigung
  const student2 = await loginAs('schueler@dbz.de');
  assert.ok((await student2('GET', '/announcements')).data.announcements.some((a) => a.title === 'Test morgen'));
});

test('Admin: Nutzer verwalten – deaktivieren sperrt Login, Super-Admin geschützt', async () => {
  const leitung = await loginAs('leitung@dbz.de');
  // Konto deaktivieren
  const dis = await leitung('PATCH', '/admin/users/user_amina', { status: 'disabled' });
  assert.equal(dis.status, 200);
  const login = client();
  assert.equal((await login('POST', '/auth/login', { email: 'amina@dbz.de', password: 'demo1234' })).status, 403);
  // Wieder aktivieren
  await leitung('PATCH', '/admin/users/user_amina', { status: 'active' });

  // Eltern mit Kind verknüpfen (idempotent)
  const link = await leitung('PATCH', '/admin/users/user_eltern', { childIds: ['user_yusuf', 'user_amina'] });
  assert.equal(link.status, 200);
  assert.deepEqual(link.data.user.childIds, ['user_yusuf', 'user_amina']);

  // Leitung darf den System-Administrator NICHT bearbeiten
  assert.equal((await leitung('PATCH', '/admin/users/user_admin', { name: 'X' })).status, 403);
});

test('Materialien: Lehrer teilt für Klasse, Schüler sieht; schulweit nur Leitung', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const m = await teacher('POST', '/materials', {
    title: 'Tajwid-Regeln (Notiz)', materialType: 'note', body: 'Bitte Merkblatt lesen.', classId: 'class_3', subjectId: 'tajwid',
  });
  assert.equal(m.status, 200);
  // Lehrer darf NICHT schulweit
  assert.equal((await teacher('POST', '/materials', { title: 'X', materialType: 'note', body: 'y' })).status, 403);

  // Schüler der Klasse sieht das Material
  const student = await loginAs('schueler@dbz.de');
  const seen = await student('GET', '/materials');
  assert.ok(seen.data.materials.some((x) => x.title === 'Tajwid-Regeln (Notiz)'));

  // Leitung darf schulweit
  const leitung = await loginAs('leitung@dbz.de');
  assert.equal((await leitung('POST', '/materials', { title: 'Schulordnung', materialType: 'link', url: 'https://example.org' })).status, 200);
  // Schüler sieht auch schulweites Material
  const student2 = await loginAs('schueler@dbz.de');
  assert.ok((await student2('GET', '/materials')).data.materials.some((x) => x.title === 'Schulordnung'));
});

test('Qur\'an: Surenliste liefert 114 Suren mit Ayah-Anzahl', async () => {
  const c = await loginAs('schueler@dbz.de');
  const r = await c('GET', '/quran/surahs');
  assert.equal(r.status, 200);
  assert.equal(r.data.surahs.length, 114);
  assert.equal(r.data.surahs[0].name, 'Al-Fatihah');
  assert.equal(r.data.surahs[0].ayat, 7);
});

test('Nachrichten: Eltern↔Lehrer erlaubt, Schüler↔Schüler verboten', async () => {
  // Eltern startet Thread mit Lehrer
  const parent = await loginAs('eltern@dbz.de');
  const start = await parent('POST', '/threads', { recipientId: 'user_lehrer', body: 'Wie geht es Yusuf?' });
  assert.equal(start.status, 200);
  const threadId = start.data.threadId;

  // Schüler darf NICHT einem anderen Schüler schreiben
  const student = await loginAs('schueler@dbz.de');
  assert.equal((await student('POST', '/threads', { recipientId: 'user_amina', body: 'hi' })).status, 403);
  // Schüler darf seinem Lehrer schreiben
  assert.equal((await student('POST', '/threads', { recipientId: 'user_lehrer', body: 'Frage zur Aufgabe' })).status, 200);

  // Lehrer sieht den Thread und antwortet; Eltern sehen die Antwort
  const teacher = await loginAs('lehrer@dbz.de');
  assert.ok((await teacher('GET', '/threads')).data.threads.some((t) => t.id === threadId));
  const reply = await teacher('POST', `/threads/${threadId}/messages`, { body: 'Alhamdulillah, sehr gut.' });
  assert.equal(reply.status, 200);
  const parent2 = await loginAs('eltern@dbz.de');
  const view = await parent2('GET', `/threads/${threadId}`);
  assert.ok(view.data.thread.messages.some((m) => m.body === 'Alhamdulillah, sehr gut.'));
});

test('CSV-Export: Anwesenheit für Verwalter, gesperrt für Schüler', async () => {
  const cookie = await cookieFor('lehrer@dbz.de');
  const res = await fetch(`${base}/api/export/attendance.csv?classId=class_3`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/csv/);
  const text = await res.text();
  assert.ok(text.includes('Quote %'), 'CSV-Kopfzeile vorhanden');
  assert.ok(text.includes('Yusuf'), 'Schülerzeile vorhanden');

  // Schüler darf nicht exportieren
  const student = await loginAs('schueler@dbz.de');
  assert.equal((await student('GET', '/export/attendance.csv?classId=class_3')).status, 403);
});

test('Qur\'an: Lesezeichen umschalten und "zuletzt gelesen" merken', async () => {
  const c = await loginAs('schueler@dbz.de');
  await c('POST', '/quran/last-read', { surah: 114 });
  const add = await c('POST', '/quran/bookmarks', { surah: 114, ayah: 1, note: 'schön' });
  assert.ok(add.data.bookmark);
  let me = await c('GET', '/quran/me');
  assert.equal(me.data.lastRead.surah, 114);
  assert.ok(me.data.bookmarks.some((b) => b.surah === 114 && b.ayah === 1));
  // erneutes Setzen an gleicher Stelle entfernt es (Toggle)
  const toggle = await c('POST', '/quran/bookmarks', { surah: 114, ayah: 1 });
  assert.equal(toggle.data.removed, true);
  me = await c('GET', '/quran/me');
  assert.ok(!me.data.bookmarks.some((b) => b.surah === 114 && b.ayah === 1));
});

test('Sicherheit: Schutz-Header werden gesetzt', async () => {
  const res = await fetch(`${base}/api/auth/me`);
  assert.ok(res.headers.get('content-security-policy'), 'CSP-Header vorhanden');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-powered-by'), null, 'x-powered-by ist entfernt');
});

test('Sicherheit: Login-Bruteforce wird nach mehreren Fehlversuchen gesperrt (429)', async () => {
  const c = client();
  for (let i = 0; i < 8; i++) {
    const r = await c('POST', '/auth/login', { email: 'bruteforce@x.de', password: 'falsch' });
    assert.equal(r.status, 401);
  }
  const blocked = await c('POST', '/auth/login', { email: 'bruteforce@x.de', password: 'falsch' });
  assert.equal(blocked.status, 429);
});

test('Einladung: erstellen, prüfen, registrieren; Rolle/Klasse aus Einladung', async () => {
  const leitung = await loginAs('leitung@dbz.de');
  const created = await leitung('POST', '/admin/invites', { role: 'schueler', classId: 'class_3', maxUses: 1, expiresInDays: 7 });
  assert.equal(created.status, 200);
  const token = created.data.token;
  assert.ok(token);

  // Öffentliche Prüfung ohne Login
  const pub = client();
  const check = await pub('GET', `/invite/${token}`);
  assert.equal(check.status, 200);
  assert.equal(check.data.role, 'schueler');
  assert.equal(check.data.className, 'Klasse 3');

  // Selbst-Registrierung
  const reg = client();
  const r = await reg('POST', '/auth/register', { token, name: 'Neuer Schüler', email: 'neu@dbz.de', password: 'passwort1' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, 'schueler');
  assert.deepEqual(r.data.user.classIds, ['class_3']);

  // maxUses aufgebraucht -> zweite Registrierung scheitert
  const reg2 = client();
  const r2 = await reg2('POST', '/auth/register', { token, name: 'X', email: 'x@dbz.de', password: 'passwort1' });
  assert.equal(r2.status, 400);
});

test('Einladung: Lehrkraft darf keine Leitung einladen', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const r = await teacher('POST', '/admin/invites', { role: 'leitung', classId: 'class_3' });
  assert.equal(r.status, 403);
});

test('Passwort-Reset durch Leitung: neues Passwort funktioniert', async () => {
  const leitung = await loginAs('leitung@dbz.de');
  const reset = await leitung('POST', '/admin/users/user_amina/reset-password', { newPassword: 'neuespw9' });
  assert.equal(reset.status, 200);
  const login = client();
  assert.equal((await login('POST', '/auth/login', { email: 'amina@dbz.de', password: 'neuespw9' })).status, 200);
  // zurücksetzen für andere Tests
  await leitung('POST', '/admin/users/user_amina/reset-password', { newPassword: 'demo1234' });
});

test('Passwort vergessen: Reset-Link erzeugen und Passwort neu setzen', async () => {
  const r = await client()('POST', '/auth/forgot-password', { email: 'amina@dbz.de' });
  assert.equal(r.status, 200);
  assert.ok(r.data.devLink, 'im log-Modus wird der Link geliefert');
  const token = r.data.devLink.split('token=')[1];

  const set = await client()('POST', '/auth/reset-password', { token, newPassword: 'resetpw1' });
  assert.equal(set.status, 200);
  assert.equal((await client()('POST', '/auth/login', { email: 'amina@dbz.de', password: 'resetpw1' })).status, 200);

  // gebrauchter Token funktioniert nicht erneut
  assert.equal((await client()('POST', '/auth/reset-password', { token, newPassword: 'x2' })).status, 400);
  // unbekannte E-Mail: 200 ohne Link (keine Enumeration)
  const unknown = await client()('POST', '/auth/forgot-password', { email: 'gibtsnicht@x.de' });
  assert.equal(unknown.status, 200);
  assert.ok(!unknown.data.devLink);

  // Passwort zurücksetzen für andere Tests
  const again = await client()('POST', '/auth/forgot-password', { email: 'amina@dbz.de' });
  await client()('POST', '/auth/reset-password', { token: again.data.devLink.split('token=')[1], newPassword: 'demo1234' });
});

test('Backup-Download nur für Leitung; Retention-Einstellung speicherbar', async () => {
  const cookie = await cookieFor('leitung@dbz.de');
  const res = await fetch(`${base}/api/admin/backup.json`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes('organizations'), 'Backup enthält Daten');

  const leitung = await loginAs('leitung@dbz.de');
  await leitung('PATCH', '/org', { audioRetentionDays: 45 });
  assert.equal((await leitung('GET', '/org')).data.org.audioRetentionDays, 45);
  await leitung('PATCH', '/org', { audioRetentionDays: 0 }); // wieder deaktivieren

  // Schüler darf kein Backup laden
  const student = await loginAs('schueler@dbz.de');
  assert.equal((await student('GET', '/admin/backup.json')).status, 403);
});

// Hilfsfunktion: einmaliges Login-Cookie besorgen (für FormData-Upload).
async function cookieFor(email) {
  const res = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo1234' }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}
