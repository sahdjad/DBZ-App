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

test('Verknüpfte Konten: mit Passwort verbinden, gebündelte Badges, Wechsel ohne Passwort', async () => {
  // Zwei eigene Konten derselben Person anlegen (Lehrkraft + Schüler).
  const admin = await loginAs('admin@dbz.de');
  const stamp = Date.now();
  const acctA = (await admin('POST', '/admin/users', { name: 'Doppel-Konto A', email: `dka-${stamp}@dbz.de`, password: 'demo1234', role: 'vertretung', classIds: ['class_3'] })).data.user;
  const acctB = (await admin('POST', '/admin/users', { name: 'Doppel-Konto B', email: `dkb-${stamp}@dbz.de`, password: 'demo1234', role: 'schueler', classIds: ['class_3'] })).data.user;

  // NUR die Verwaltung verknüpft: Admin verbindet beide Konten.
  const linked = await admin('POST', '/admin/link-accounts', { emailA: `dka-${stamp}@dbz.de`, emailB: `dkb-${stamp}@dbz.de` });
  assert.equal(linked.status, 200);

  // In Konto A einloggen.
  const a = await loginAs(`dka-${stamp}@dbz.de`);

  // Eine Lehrkraft/Schüler kann sich NICHT selbst verknüpfen.
  const selfLink = await a('POST', '/me/link-account', { email: `dkb-${stamp}@dbz.de`, password: 'demo1234' });
  assert.equal(selfLink.status, 403, 'Selbst-Verknüpfen ist nur der Verwaltung erlaubt');

  // Verknüpftes Konto erscheint in der Liste.
  const list = await a('GET', '/me/linked-accounts');
  assert.ok(list.data.accounts.some((x) => x.id === acctB.id), 'Konto B ist verknüpft');

  // Badges liefern die verknüpften Konten mit.
  const badges = await a('GET', '/badges');
  assert.ok(Array.isArray(badges.data.linked), 'Badges enthalten linked-Liste');
  assert.equal(typeof badges.data.grandTotal, 'number');

  // Wechsel zu Konto B ohne erneutes Passwort (Verknüpfung genügt).
  const sw = await a('POST', `/me/switch/${acctB.id}`, {});
  assert.equal(sw.status, 200);
  assert.equal(sw.data.user.id, acctB.id);

  // Fremdes, nicht verknüpftes Konto lässt sich NICHT anspringen.
  const yusufId = (await (await loginAs('schueler@dbz.de'))('GET', '/auth/me')).data.user.id;
  const c = await loginAs(`dka-${stamp}@dbz.de`);
  const blocked = await c('POST', `/me/switch/${yusufId}`, {});
  assert.equal(blocked.status, 403);
});

test('Genehmigungen: Leitung legt Klasse an -> erst nach Bestätigung des System-Admins wirksam', async () => {
  const admin = await loginAs('admin@dbz.de'); // super_admin
  // Ein Leitungs-Konto erzeugen (durch super_admin -> sofort wirksam).
  const stamp = Date.now();
  const leitEmail = `leit-${stamp}@dbz.de`;
  const mk = await admin('POST', '/admin/users', { name: 'Br. Leitung 2', email: leitEmail, password: 'demo1234', role: 'leitung' });
  assert.equal(mk.status, 200);
  assert.ok(mk.data.user, 'super_admin legt sofort an (kein pending)');

  // Leitung legt eine Klasse an -> nur ein Antrag (pending), noch keine Klasse.
  const leitung = await loginAs(leitEmail);
  const before = (await leitung('GET', '/classes')).data.classes.length;
  const req = await leitung('POST', '/admin/classes', { name: `Testklasse ${stamp}`, weekday: 6 });
  assert.equal(req.status, 200);
  assert.equal(req.data.pending, true, 'Leitung-Änderung ist zunächst nur ein Antrag');
  const after = (await leitung('GET', '/classes')).data.classes.length;
  assert.equal(after, before, 'Klasse existiert noch nicht');

  // super_admin sieht den Antrag und bestätigt ihn.
  const queue = (await admin('GET', '/admin/change-requests')).data.requests;
  const mine = queue.find((r) => r.summary.includes(`Testklasse ${stamp}`));
  assert.ok(mine, 'Antrag erscheint in der Genehmigungs-Liste');
  const ok = await admin('POST', `/admin/change-requests/${mine.id}/approve`, {});
  assert.equal(ok.status, 200);

  // Jetzt existiert die Klasse.
  const now = (await admin('GET', '/classes')).data.classes;
  assert.ok(now.some((c) => c.name === `Testklasse ${stamp}`), 'Klasse ist nach Bestätigung da');

  // Leitung darf NICHT selbst genehmigen.
  const req2 = await leitung('POST', '/admin/classes', { name: `Zweite ${stamp}`, weekday: 6 });
  const cr2 = (await admin('GET', '/admin/change-requests')).data.requests.find((r) => r.summary.includes(`Zweite ${stamp}`));
  const forbidden = await leitung('POST', `/admin/change-requests/${cr2.id}/approve`, {});
  assert.equal(forbidden.status, 403, 'Leitung kann nicht selbst bestätigen');
});

test('Kalender-Abo: persönlicher iCal-Link liefert gültigen Feed, falsches Token 404', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const tok = await teacher('GET', '/me/calendar-token');
  assert.equal(tok.status, 200);
  assert.ok(/\/api\/calendar\/cal_[^/]+\.ics$/.test(tok.data.url), 'URL zeigt auf den .ics-Feed');
  assert.ok(tok.data.webcal.startsWith('webcal:'), 'webcal-Variante vorhanden');

  // Öffentlicher Feed (ohne Login) liefert gültiges iCal.
  const feed = await fetch(tok.data.url.replace(/^https?:\/\/[^/]+/, base));
  assert.equal(feed.status, 200);
  assert.match(feed.headers.get('content-type') || '', /text\/calendar/);
  const body = await feed.text();
  assert.ok(body.startsWith('BEGIN:VCALENDAR'), 'iCal-Kopf vorhanden');
  assert.ok(body.includes('END:VCALENDAR'), 'iCal-Ende vorhanden');

  // Unbekanntes Token -> 404.
  const bad = await fetch(base + '/api/calendar/cal_unbekannt.ics');
  assert.equal(bad.status, 404);
});

test('Nachrichten: Schüler↔Lehrer erreicht BEIDE Lehrkräfte der Klasse (Gruppenthread)', async () => {
  // Zweite Lehrkraft (Vertretung) derselben Klasse anlegen.
  const admin = await loginAs('admin@dbz.de');
  const created = await admin('POST', '/admin/users', {
    name: 'Ustadha Maryam', email: `co-${Date.now()}@dbz.de`, password: 'demo1234',
    role: 'vertretung', classIds: ['class_3'],
  });
  assert.equal(created.status, 200);
  const coTeacherEmail = created.data.user.email;

  const student = await loginAs('schueler@dbz.de');
  const teacher = await loginAs('lehrer@dbz.de');
  const teacherId = (await teacher('GET', '/auth/me')).data.user.id;

  // Schüler schreibt EINER Lehrkraft -> Thread umfasst beide Lehrkräfte.
  const send = await student('POST', '/threads', { recipientId: teacherId, body: 'Assalamu alaikum, eine Frage zur Hausaufgabe.' });
  assert.equal(send.status, 200);
  const threadId = send.data.threadId;
  const thr = (await student('GET', `/threads/${threadId}`)).data.thread;
  assert.equal(thr.group, true, 'Thread ist ein Gruppenthread');

  // Beide Lehrkräfte sehen den Thread und können ihn öffnen.
  const coTeacher = await loginAs(coTeacherEmail);
  const coThreads = (await coTeacher('GET', '/threads')).data.threads;
  assert.ok(coThreads.some((t) => t.id === threadId), 'Co-Lehrkraft sieht den Thread');

  // Co-Lehrkraft antwortet -> Schüler UND die erste Lehrkraft sehen die Antwort.
  const reply = await coTeacher('POST', `/threads/${threadId}/messages`, { body: 'Wa alaikum salam, gerne!' });
  assert.equal(reply.status, 200);
  const studentView = (await student('GET', `/threads/${threadId}`)).data.thread;
  assert.ok(studentView.messages.some((m) => m.body === 'Wa alaikum salam, gerne!'), 'Schüler sieht die Antwort der Co-Lehrkraft');
  const firstTeacherBadges = (await teacher('GET', '/badges')).data;
  assert.ok(firstTeacherBadges.messages >= 1, 'Erste Lehrkraft wird über die Antwort benachrichtigt');
});

test('Klassensprecher: Lehrer ernennt/entfernt direkt (eigene Klasse), fremde Klasse geht nicht; Klassensprecher bleibt voll funktionsfähiger Schüler', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const student = await loginAs('schueler@dbz.de');
  const studentId = (await student('GET', '/auth/me')).data.user.id;

  // Fremde Klasse anlegen mit anderem Lehrer -> darf nicht befördern.
  const admin = await loginAs('admin@dbz.de');
  const otherClass = await admin('POST', '/admin/classes', { name: 'Klasse X-Test' });
  const otherTeacherEmail = `other-${Date.now()}@dbz.de`;
  await admin('POST', '/admin/users', { name: 'Anderer Lehrer', email: otherTeacherEmail, password: 'demo1234', role: 'klassenlehrer', classIds: [otherClass.data.class.id] });
  const otherTeacher = await loginAs(otherTeacherEmail);
  const denied = await otherTeacher('POST', `/students/${studentId}/klassensprecher`, { promote: true });
  assert.equal(denied.status, 403);

  // Eigener Lehrer darf ernennen.
  const promote = await teacher('POST', `/students/${studentId}/klassensprecher`, { promote: true });
  assert.equal(promote.status, 200);
  assert.equal(promote.data.user.role, 'klassensprecher');

  // Klassensprecher bleibt voll funktionsfähiger Schüler: Check-in, Aufgaben, Nachrichten weiterhin möglich.
  const sprecher = await loginAs('schueler@dbz.de');
  const assignments = await sprecher('GET', '/assignments');
  assert.equal(assignments.status, 200);
  const contacts = await sprecher('GET', '/message-contacts');
  assert.ok(contacts.data.contacts.length > 0, 'Klassensprecher kann weiterhin Nachrichten schreiben');
  const rosterAfter = await teacher('GET', `/classes/class_3/roster`);
  assert.ok(rosterAfter.data.rows.some((r) => r.id === studentId), 'Klassensprecher taucht weiter in der Klassenliste auf');

  // Zurückstufen.
  const demote = await teacher('POST', `/students/${studentId}/klassensprecher`, { promote: false });
  assert.equal(demote.status, 200);
  assert.equal(demote.data.user.role, 'schueler');
});

test('Klassensprecher: sieht Heute-Status der Klasse (lesend), fremde Klasse nicht; normaler Schüler auch nicht', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const student = await loginAs('schueler@dbz.de');
  const studentId = (await student('GET', '/auth/me')).data.user.id;
  await teacher('POST', `/students/${studentId}/klassensprecher`, { promote: true });

  const sprecher = await loginAs('schueler@dbz.de');
  const status = await sprecher('GET', '/classes/class_3/today-status');
  assert.equal(status.status, 200);
  assert.ok(status.data.rows.some((r) => r.id === studentId), 'Klassensprecher sieht sich selbst in der Heute-Übersicht');
  assert.ok(status.data.rows.every((r) => 'status' in r), 'jede Zeile hat einen Status (grün/rot-Anzeige)');

  // Normaler Schüler (nicht Klassensprecher) darf die Klassenübersicht nicht sehen.
  const admin = await loginAs('admin@dbz.de');
  const otherEmail = `other-student-${Date.now()}@dbz.de`;
  await admin('POST', '/admin/users', { name: 'Anderer Schüler', email: otherEmail, password: 'demo1234', role: 'schueler', classIds: ['class_3'] });
  const otherStudent = await loginAs(otherEmail);
  const denied = await otherStudent('GET', '/classes/class_3/today-status');
  assert.equal(denied.status, 403);

  await teacher('POST', `/students/${studentId}/klassensprecher`, { promote: false });
});

test('Probezeit: nur Klassenlehrkraft setzt/sieht sie, Admin/Leitung sehen sie nicht in der Klassenliste', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const student = await loginAs('schueler@dbz.de');
  const studentId = (await student('GET', '/auth/me')).data.user.id;

  // Admin/Leitung dürfen nicht setzen (bewusst nur Klassenlehrkraft).
  const admin = await loginAs('admin@dbz.de');
  const deniedForAdmin = await admin('POST', `/students/${studentId}/probation`, { probation: true });
  assert.equal(deniedForAdmin.status, 403);

  const set = await teacher('POST', `/students/${studentId}/probation`, { probation: true });
  assert.equal(set.status, 200);
  assert.equal(set.data.probation, true);

  // Klassenlehrkraft sieht es in der Klassenliste.
  const teacherRoster = await teacher('GET', '/classes/class_3/roster');
  const row = teacherRoster.data.rows.find((r) => r.id === studentId);
  assert.equal(row.probation, true, 'Klassenlehrkraft sieht die Probezeit-Markierung');

  // Admin/Leitung sehen das Feld in der Klassenliste NICHT (auch wenn sie Zugriff auf die Liste haben).
  const adminRoster = await admin('GET', '/classes/class_3/roster');
  const adminRow = adminRoster.data.rows.find((r) => r.id === studentId);
  assert.equal('probation' in adminRow, false, 'Probezeit ist nur in der Lehreransicht sichtbar, nicht für Admin/Leitung');

  // Auch über die allgemeine Nutzerliste (Admin-Verwaltung) leakt es nicht.
  const adminUsers = await admin('GET', '/admin/users');
  const adminUserRow = adminUsers.data.users.find((u) => u.id === studentId);
  assert.equal('probation' in adminUserRow, false, 'Probezeit leakt nicht über publicUser()');

  await teacher('POST', `/students/${studentId}/probation`, { probation: false });
});

test('Nachrichten: Schüler kann Leitung schreiben, ALLE Leitungs-/Admin-Konten teilen sich den Thread', async () => {
  // Zweite Leitung anlegen (mehrere Leitungspersonen -> geteiltes Postfach).
  const admin = await loginAs('admin@dbz.de');
  const created = await admin('POST', '/admin/users', {
    name: 'Zweite Leitung', email: `leitung2-${Date.now()}@dbz.de`, password: 'demo1234', role: 'leitung',
  });
  assert.equal(created.status, 200);
  const secondLeitungEmail = created.data.user.email;

  const student = await loginAs('schueler@dbz.de');
  const contacts = (await student('GET', '/message-contacts')).data.contacts;
  const firstLeitung = contacts.find((c) => c.roleLabel === 'DBZ-Leitung');
  assert.ok(firstLeitung, 'Leitung steht in der Kontaktliste des Schülers');

  const send = await student('POST', '/threads', { recipientId: firstLeitung.id, body: 'Assalamu alaikum, ich habe eine Frage.' });
  assert.equal(send.status, 200);
  const threadId = send.data.threadId;
  const studentThread = (await student('GET', `/threads/${threadId}`)).data.thread;
  assert.equal(studentThread.otherName, 'DBZ-Leitung', 'Thread-Titel zeigt einheitlich "DBZ-Leitung"');

  // Die zweite, ursprünglich gar nicht angeschriebene Leitung sieht denselben Thread mit.
  const secondLeitung = await loginAs(secondLeitungEmail);
  const secondThreads = (await secondLeitung('GET', '/threads')).data.threads;
  assert.ok(secondThreads.some((t) => t.id === threadId), 'Zweite Leitung sieht den Thread, obwohl nicht direkt angeschrieben');

  // Zweite Leitung antwortet -> Schüler sieht die Antwort, Postfach ist geteilt.
  const reply = await secondLeitung('POST', `/threads/${threadId}/messages`, { body: 'Wa alaikum salam, wie kann ich helfen?' });
  assert.equal(reply.status, 200);
  const studentView = (await student('GET', `/threads/${threadId}`)).data.thread;
  assert.ok(studentView.messages.some((m) => m.body === 'Wa alaikum salam, wie kann ich helfen?'));
});

test('Notenvorschlag: gute Daten -> gute Note, schlechte Daten -> schlechte Note', async () => {
  const { computeStanding } = await import('../domain.js');
  const good = computeStanding({
    homework: { total: 10, passed: 10, submitted: 0, revision: 0, missed: 0, open: 0 },
    attendance: { sessions: 20, present: 20, late: 0, excused: 0, unexcused: 0 },
    behavior: { positive: 3, hinweis: 0 },
    exams: { count: 2, avgPercent: 95 },
  });
  assert.equal(good.available, true);
  assert.ok(good.suggestedGrade <= 1.5, `gute Note erwartet, war ${good.suggestedGrade}`);

  const bad = computeStanding({
    homework: { total: 10, passed: 0, submitted: 0, revision: 0, missed: 10, open: 0 },
    attendance: { sessions: 20, present: 8, late: 2, excused: 2, unexcused: 8 },
    behavior: { positive: 0, hinweis: 4 },
    exams: { count: 1, avgPercent: 25 },
  });
  assert.ok(bad.suggestedGrade >= 4.5, `schlechte Note erwartet, war ${bad.suggestedGrade}`);

  // Ohne Daten: kein Vorschlag.
  const none = computeStanding({ homework: { total: 0 }, attendance: { sessions: 0 }, behavior: {}, exams: { count: 0 } });
  assert.equal(none.available, false);
});

test('Aktivitäten fließen in den Leistungsstand ein + Monatsfilter', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const student = await loginAs('schueler@dbz.de');
  const sid = (await student('GET', '/auth/me')).data.user.id;

  const act = await teacher('POST', '/activities', { studentId: sid, title: 'Vokabelquiz', category: 'spiel', points: 9, maxPoints: 10 });
  assert.equal(act.status, 200);
  assert.equal(act.data.activity.percent, 90);

  const now = new Date();
  const cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const st = await teacher('GET', `/students/${sid}/standing?month=${cm}`);
  assert.equal(st.data.data.activities.scoredCount, 1);
  assert.equal(st.data.data.activities.avgPercent, 90);
  const dim = st.data.standing.dimensions.find((d) => d.key === 'activities');
  assert.ok(dim && dim.grade != null, 'Aktivitäten liefern einen Notenbeitrag');

  // Lange zurückliegender Monat -> keine Aktivität im Fenster.
  const past = await teacher('GET', `/students/${sid}/standing?month=2000-01`);
  assert.equal(past.data.data.activities.count, 0);

  // Schüler sieht die eigene Aktivität (Leseansicht) und kann keine anlegen.
  const mine = await student('GET', '/activities');
  assert.equal(mine.status, 200);
  assert.ok(mine.data.activities.some((a) => a.title === 'Vokabelquiz'));
  assert.equal((await student('POST', '/activities', { studentId: sid, title: 'X' })).status, 403);
});

test('Strafen: Frist gesetzt, anpassen/umwandeln (Verwalter), Übersicht rollen-geschützt', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const student = await loginAs('schueler@dbz.de');
  const sid = (await student('GET', '/auth/me')).data.user.id;
  const classId = (await teacher('GET', '/classes')).data.classes[0].id;

  const cr = await teacher('POST', '/penalties', { classId, studentId: sid, type: 'money', amount: 2, reason: 'Verspätung' });
  assert.equal(cr.status, 200);
  assert.ok(cr.data.penalty.dueDate, 'Frist aus Org-Standard gesetzt');
  assert.equal(cr.data.penalty.effectiveAmount, 2);
  const pid = cr.data.penalty.id;

  // Umwandeln in Seiten (Alternative, wenn Schüler nicht zahlen kann).
  const up = await teacher('PATCH', `/penalties/${pid}`, { type: 'pages', amount: 10 });
  assert.equal(up.status, 200);
  assert.equal(up.data.penalty.type, 'pages');
  assert.equal(up.data.penalty.amount, 10);

  // Übersicht offener Beträge: Lehrkraft ja, Schüler nein.
  assert.equal((await teacher('GET', '/penalties/summary')).status, 200);
  assert.equal((await student('GET', '/penalties/summary')).status, 403);
});

test('Strafen: Schüler meldet Zahlung, Lehrkraft bestätigt (Freigabe-Workflow)', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const student = await loginAs('schueler@dbz.de');
  const sid = (await student('GET', '/auth/me')).data.user.id;
  const classId = (await teacher('GET', '/classes')).data.classes[0].id;
  const pid = (await teacher('POST', '/penalties', { classId, studentId: sid, type: 'money', amount: 5, reason: 'Zahlungstest' })).data.penalty.id;

  // Schüler meldet bezahlt -> payment_pending, zählt weiterhin als offen.
  const rq = await student('POST', `/penalties/${pid}/request-payment`, {});
  assert.equal(rq.status, 200);
  assert.equal(rq.data.penalty.status, 'payment_pending');
  assert.ok((await student('GET', '/penalties')).data.summary.money >= 5);

  // Nur der eigene Schüler darf melden (Lehrkraft nicht).
  assert.equal((await teacher('POST', `/penalties/${pid}/request-payment`, {})).status, 403);

  // Lehrkraft bestätigt -> offiziell erledigt.
  const cf = await teacher('POST', `/penalties/${pid}/confirm-payment`, {});
  assert.equal(cf.status, 200);
  assert.equal(cf.data.penalty.status, 'settled');
});

test('Notengewichte im Admin einstellbar (nur Leitung/Admin)', async () => {
  const leitung = await loginAs('leitung@dbz.de');
  const teacher = await loginAs('lehrer@dbz.de');
  // Lehrkraft (kein Admin/Leitung) darf die Gewichte NICHT ändern.
  assert.equal((await teacher('PATCH', '/org', { gradeWeights: { homework: 1 } })).status, 403);
  // Leitung setzt neue Gewichte -> werden gespeichert und zurückgegeben.
  const r = await leitung('PATCH', '/org', { gradeWeights: { homework: 0.5, attendance: 0.2, behavior: 0.1, exams: 0.1, activities: 0.1 } });
  assert.equal(r.status, 200);
  const org = (await leitung('GET', '/org')).data.org;
  assert.equal(org.gradeWeights.homework, 0.5);
  assert.equal(org.gradeWeights.attendance, 0.2);
});

test('Notenvorschlag-Endpunkt: nur Lehrkraft/Leitung, nicht Schüler', async () => {
  const teacher = await loginAs('lehrer@dbz.de');
  const student = await loginAs('schueler@dbz.de');
  const studentId = (await student('GET', '/auth/me')).data.user.id;
  const st = await teacher('GET', `/students/${studentId}/standing`);
  assert.equal(st.status, 200);
  assert.ok('standing' in st.data && 'data' in st.data);
  // Schüler darf den Vorschlag nicht abrufen.
  assert.equal((await student('GET', `/students/${studentId}/standing`)).status, 403);
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
    comment: 'Assalamu alaikum, mein Kind ist heute krank (Erkältung) und kann leider nicht am Unterricht teilnehmen.',
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

test('Abwesenheitsantrag: Grußformel allein reicht nicht als Begründung (auch wenn >= 30 Zeichen)', async () => {
  const student = await loginAs('schueler@dbz.de');
  const paddedGreeting = await student('POST', '/absence-requests', {
    requestType: 'absent', reasonCategory: 'krankheit',
    comment: 'As-salamu alaikum wa rahmatullahi wa barakatuh, liebe Lehrerin, vielen Dank, mit freundlichen Grüßen',
  });
  assert.equal(paddedGreeting.status, 400, 'Reine Grußformel ohne echten Grund wird abgelehnt');

  const realReason = await student('POST', '/absence-requests', {
    requestType: 'absent', reasonCategory: 'krankheit',
    comment: 'Assalamu alaikum, starke Bauchschmerzen und Fieber seit heute früh.',
  });
  assert.equal(realReason.status, 200, 'Kurze, aber echte Begründung wird akzeptiert');
});

test('Abwesenheitsantrag: Rückfrage in der App klären (nicht extern) - Antwort setzt Antrag zurück auf offen', async () => {
  const student = await loginAs('schueler@dbz.de');
  const create = await student('POST', '/absence-requests', {
    requestType: 'absent', reasonCategory: 'sonstiges',
    comment: 'Muss heute leider zu einem Termin, kann nicht am Unterricht teilnehmen.',
  });
  const id = create.data.request.id;

  const teacher = await loginAs('lehrer@dbz.de');
  const ask = await teacher('POST', `/absence-requests/${id}/decide`, { decision: 'needs_info' });
  assert.equal(ask.status, 200);
  assert.equal(ask.data.status, 'needs_info');

  const question = await teacher('POST', `/absence-requests/${id}/comments`, { body: 'Was für ein Termin genau?' });
  assert.equal(question.status, 200);

  // Schüler sieht die Rückfrage und antwortet -> Antrag geht zurück auf "pending".
  const listForStudent = await student('GET', '/absence-requests');
  const seen = listForStudent.data.requests.find((r) => r.id === id);
  assert.equal(seen.comments[0].body, 'Was für ein Termin genau?');

  const reply = await student('POST', `/absence-requests/${id}/comments`, { body: 'Arzttermin, ich schicke den Nachweis nach.' });
  assert.equal(reply.status, 200);
  assert.equal(reply.data.request.status, 'pending', 'Antwort setzt den Antrag automatisch zurück auf offen');

  const teacherView = await teacher('GET', '/absence-requests');
  const seenByTeacher = teacherView.data.requests.find((r) => r.id === id);
  assert.equal(seenByTeacher.status, 'pending');
  assert.equal(seenByTeacher.comments.length, 2);
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

test('Verhalten: Audio-Rückmeldung statt/zusätzlich zu Text', async () => {
  const form = new FormData();
  form.set('studentId', 'user_yusuf');
  form.set('classId', 'class_3');
  form.set('category', 'adab');
  form.set('tone', 'positive');
  form.set('visibleToStudent', 'true');
  form.set('visibleToParent', 'true');
  form.set('audio', new Blob([Buffer.from('AUDIO-FEEDBACK-DATA')], { type: 'audio/webm' }), 'rueckmeldung.webm');
  const res = await fetch(base + '/api/behavior', {
    method: 'POST',
    headers: { cookie: await cookieFor('lehrer@dbz.de') },
    body: form,
  });
  assert.equal(res.status, 200, 'Audio allein (ohne Text) reicht als Rückmeldung');
  const created = await res.json();
  assert.equal(created.record.visibleToStudent, true, 'boolean aus multipart/form-data korrekt ausgewertet (nicht der String "true")');

  const student = await loginAs('schueler@dbz.de');
  const list = await student('GET', '/behavior');
  const rec = list.data.records.find((r) => r.id === created.record.id);
  assert.ok(rec.hasAudio, 'Schüler sieht, dass eine Audio-Nachricht vorhanden ist');

  const audio = await student('GET', `/behavior/${rec.id}/audio`);
  assert.equal(audio.status, 200);
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
  // Fenster dynamisch (dieser + nächster Monat), da der Seed relativ zu heute plant.
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10);
  const r = await student('GET', `/calendar?from=${from}&to=${to}`);
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

  // Selbst-Registrierung (Schüler: Kontaktdaten fürs Sekretariat sind Pflicht)
  const profile = {
    firstName: 'Neuer', lastName: 'Schüler', birthDate: '2012-05-01', gender: 'maennlich',
    street: 'Musterweg', houseNumber: '1', zip: '12345', city: 'Musterstadt', phone: '0170123456',
    guardians: [
      { name: 'Mama Muster', phones: ['0170654321', '0170654322'], email: 'mama@muster.de' },
      { name: 'Papa Muster', phones: ['0170654323'], email: 'papa@muster.de' },
    ],
  };
  const reg = client();
  const r = await reg('POST', '/auth/register', { token, name: 'Neuer Schüler', email: 'neu@dbz.de', password: 'passwort1', ...profile });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, 'schueler');
  assert.deepEqual(r.data.user.classIds, ['class_3']);
  assert.equal(r.data.user.profile.city, 'Musterstadt');
  assert.equal(r.data.user.profile.guardians.length, 2, 'beide Elternteile gespeichert');
  assert.deepEqual(r.data.user.profile.guardians[0].phones, ['0170654321', '0170654322'], 'mehrere Nummern pro Erziehungsberechtigte/m');

  // Ohne Kontaktdaten scheitert die Registrierung
  const regNoProfile = client();
  const rNoProfile = await regNoProfile('POST', '/auth/register', { token, name: 'Ohne Daten', email: 'ohne@dbz.de', password: 'passwort1' });
  assert.equal(rNoProfile.status, 400);

  // maxUses aufgebraucht -> zweite Registrierung scheitert
  const reg2 = client();
  const r2 = await reg2('POST', '/auth/register', { token, name: 'X', email: 'x@dbz.de', password: 'passwort1', ...profile });
  assert.equal(r2.status, 400);
});

test('Einladung: Selbstzahler braucht keine Erziehungsberechtigten-Angaben', async () => {
  const leitung = await loginAs('leitung@dbz.de');
  const created = await leitung('POST', '/admin/invites', { role: 'schueler', classId: 'class_3', maxUses: 1, expiresInDays: 7 });
  const token = created.data.token;

  const selfPayerProfile = {
    firstName: 'Selbst', lastName: 'Zahler', birthDate: '2000-01-01', gender: 'weiblich',
    street: 'Musterweg', houseNumber: '3', zip: '99999', city: 'Musterstadt', phone: '0170999888',
    selfPayer: true,
  };
  const reg = client();
  const r = await reg('POST', '/auth/register', { token, name: 'Selbst Zahler', email: `selfpayer-${Date.now()}@dbz.de`, password: 'passwort1', ...selfPayerProfile });
  assert.equal(r.status, 200, 'Selbstzahler kommt ohne Erziehungsberechtigte/n durch');
  assert.equal(r.data.user.profile.selfPayer, true);
  assert.deepEqual(r.data.user.profile.guardians, []);
});

test('Offene Registrierung ohne Klasse: pending -> Leitung beantragt Zuweisung -> Admin bestätigt -> Login geht', async () => {
  const profile = {
    firstName: 'Wartender', lastName: 'Schüler', birthDate: '2011-03-15', gender: 'weiblich',
    street: 'Musterweg', houseNumber: '1', zip: '12345', city: 'Musterstadt', phone: '0170123456',
    guardians: [{ name: 'Mama Muster', phones: ['0170654321'], email: 'mama@muster.de' }],
  };
  const reg = client();
  const r = await reg('POST', '/auth/register-open', { name: 'Wartender Schüler', email: 'wartend@dbz.de', password: 'passwort1', ...profile });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);

  // Login schlägt fehl, solange keine Klasse zugewiesen ist.
  const loginAttempt = client();
  const failedLogin = await loginAttempt('POST', '/auth/login', { email: 'wartend@dbz.de', password: 'passwort1' });
  assert.equal(failedLogin.status, 403);

  const admin = await loginAs('admin@dbz.de');
  const pendingList = await admin('GET', '/admin/pending-registrations');
  assert.equal(pendingList.status, 200);
  const pendingUser = pendingList.data.users.find((u) => u.email === 'wartend@dbz.de');
  assert.ok(pendingUser);
  assert.equal(pendingUser.profile.city, 'Musterstadt');

  // Leitung darf zuweisen, braucht aber Admin-Bestätigung.
  const leitung = await loginAs('leitung@dbz.de');
  const proposed = await leitung('POST', `/admin/pending-registrations/${pendingUser.id}/assign`, { classId: 'class_3' });
  assert.equal(proposed.status, 200);
  assert.equal(proposed.data.pending, true);

  const stillBlocked = client();
  const stillFails = await stillBlocked('POST', '/auth/login', { email: 'wartend@dbz.de', password: 'passwort1' });
  assert.equal(stillFails.status, 403);

  const changeRequests = await admin('GET', '/admin/change-requests');
  const cr = changeRequests.data.requests.find((c) => c.type === 'assign_class' && c.payload.userId === pendingUser.id);
  assert.ok(cr);
  const approve = await admin('POST', `/admin/change-requests/${cr.id}/approve`, {});
  assert.equal(approve.status, 200);

  const finalLogin = client();
  const success = await finalLogin('POST', '/auth/login', { email: 'wartend@dbz.de', password: 'passwort1' });
  assert.equal(success.status, 200);
  assert.deepEqual(success.data.user.classIds, ['class_3']);
});

test('Offene Registrierung: Admin weist direkt zu (ohne Umweg über Genehmigung)', async () => {
  const profile = {
    firstName: 'Direkt', lastName: 'Zugewiesen', birthDate: '2010-09-20', gender: 'maennlich',
    street: 'Musterweg', houseNumber: '2', zip: '54321', city: 'Beispielstadt', phone: '0170111222',
    guardians: [{ name: 'Papa Muster', phones: ['0170333444'], email: 'papa@muster.de' }],
  };
  const reg = client();
  await reg('POST', '/auth/register-open', { name: 'Direkt Zugewiesen', email: 'direkt@dbz.de', password: 'passwort1', ...profile });

  const admin = await loginAs('admin@dbz.de');
  const pendingList = await admin('GET', '/admin/pending-registrations');
  const pendingUser = pendingList.data.users.find((u) => u.email === 'direkt@dbz.de');
  const assign = await admin('POST', `/admin/pending-registrations/${pendingUser.id}/assign`, { classId: 'class_3' });
  assert.equal(assign.status, 200);
  assert.equal(assign.data.ok, true);

  const login = client();
  const success = await login('POST', '/auth/login', { email: 'direkt@dbz.de', password: 'passwort1' });
  assert.equal(success.status, 200);
  assert.deepEqual(success.data.user.classIds, ['class_3']);
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
test('Materialien Massen-Upload: mehrere Dateien auf einmal, jede wird ein Material', async () => {
  const cookie = await cookieFor('lehrer@dbz.de');
  const form = new FormData();
  form.set('classId', 'class_3');
  form.append('files', new Blob([Buffer.from('%PDF-1.4 test a')], { type: 'application/pdf' }), 'Protokoll-A.pdf');
  form.append('files', new Blob([Buffer.from('%PDF-1.4 test b')], { type: 'application/pdf' }), 'Protokoll-B.pdf');
  const res = await fetch(base + '/api/materials/bulk', { method: 'POST', headers: { cookie }, body: form });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.count, 2, 'zwei Materialien angelegt');
  assert.ok(data.created.every((m) => m.materialType === 'file'));
  assert.ok(data.created.some((m) => m.title === 'Protokoll-A'), 'Titel = Dateiname ohne Endung');

  // Sie tauchen in der Materialliste der Klasse auf.
  const teacher = await loginAs('lehrer@dbz.de');
  const list = (await teacher('GET', '/materials?classId=class_3')).data.materials;
  assert.ok(list.filter((m) => ['Protokoll-A', 'Protokoll-B'].includes(m.title)).length === 2);

  // Schüler ohne Verwalterrolle darf den Massen-Upload NICHT.
  const sCookie = await cookieFor('schueler@dbz.de');
  const f2 = new FormData();
  f2.append('files', new Blob([Buffer.from('x')], { type: 'application/pdf' }), 'x.pdf');
  const forbidden = await fetch(base + '/api/materials/bulk', { method: 'POST', headers: { cookie: sCookie }, body: f2 });
  assert.equal(forbidden.status, 403);
});
test('Qurʼan-Rezitatoren: Liste enthält Chapter- und Ayah-Rezitatoren; Ayah-Audio liefert URLs', async () => {
  const student = await loginAs('schueler@dbz.de');
  const recs = (await student('GET', '/quran/reciters')).data.reciters;
  assert.ok(recs.some((r) => r.mode === 'chapter' && r.follow === true), 'Chapter-Rezitator mit Mitlesen vorhanden');
  const ayahRec = recs.find((r) => r.mode === 'ayah');
  assert.ok(ayahRec, 'mindestens ein Ayah-Rezitator');

  // Ayah-Audio für Al-Ichlas (112, 4 Ayat) -> 4 URLs auf cdn.islamic.network.
  const a = (await student('GET', `/quran/audio-ayahs/112?reciter=${ayahRec.id}`)).data.audio;
  assert.equal(a.mode, 'ayah');
  assert.equal(a.ayahs.length, 4);
  assert.match(a.ayahs[0].url, /^https:\/\/cdn\.islamic\.network\/quran\/audio\/\d+\/[a-z.]+\/\d+\.mp3$/);
  // Globale Ayah-Nummer von 112:1 muss 6222 sein.
  assert.ok(a.ayahs[0].url.endsWith('/6222.mp3'), 'korrekte globale Ayah-Nummer');

  // Keine Mujawwad-Rezitatoren mehr; Husary-Muʿallim bleibt erhalten.
  assert.ok(!recs.some((r) => /mujawwad/i.test(r.id) || /mujawwad/i.test(r.name)), 'keine Mujawwad-Rezitatoren');
  assert.ok(recs.some((r) => r.id === 'ar.husarymuallim'), 'Husary Muʿallim bleibt');
});
test('Qurʼan: Basmala wird aus Ayah 1 herausgelöst (außer Al-Fatiha)', async () => {
  const { stripLeadingBasmala } = await import('../providers/quranProvider.js');
  // An-Nisa 4:1 aus der Uthmani-Quelle (mit vorangestellter Basmala, Wasla ٱ).
  const nisa1 = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ يَٰٓأَيُّهَا ٱلنَّاسُ ٱتَّقُوا۟ رَبَّكُمُ';
  const out = stripLeadingBasmala(nisa1);
  assert.ok(out.startsWith('يَٰٓأَيُّهَا'), 'Basmala entfernt, Ayah beginnt mit dem echten Text');
  assert.ok(!out.includes('ٱلرَّحِيمِ'), 'kein Basmala-Rest');
  // Ohne vorangestellte Basmala bleibt der Text unverändert.
  const plain = 'يَٰٓأَيُّهَا ٱلنَّاسُ ٱتَّقُوا۟ رَبَّكُمُ';
  assert.equal(stripLeadingBasmala(plain), plain, 'ohne Basmala unverändert');
});
test('Mushaf-Seitenschrift: ungültige Seite 404, gültige liefert woff2', async () => {
  const bad = await fetch(base + '/api/quran/font/v1/0');
  assert.equal(bad.status, 404, 'ungültige Seite -> 404');
  const ok = await fetch(base + '/api/quran/font/v1/1');
  // Netz-tolerant: bei fehlender Verbindung liefert der Proxy 502.
  if (ok.status === 200) {
    assert.equal(ok.headers.get('content-type'), 'font/woff2');
    const buf = Buffer.from(await ok.arrayBuffer());
    assert.equal(buf.slice(0, 4).toString('latin1'), 'wOF2', 'gültige woff2-Signatur');
  } else {
    assert.equal(ok.status, 502, 'ohne Netz -> 502');
  }
});

// --- Helfer für Multipart-Tests ---------------------------------------------
async function loginCookie(email) {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234' }) });
  return res.headers.get('set-cookie').split(';')[0];
}
async function jreq(cookie, method, path, body) {
  const res = await fetch(base + '/api' + path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  return { status: res.status, data };
}
async function upload(cookie, path, fd) {
  const res = await fetch(base + '/api' + path, { method: 'POST', headers: { cookie }, body: fd });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  return { status: res.status, data };
}

test('Hifz: einfache Bewertung (Punkte+Extra), Mitarbeit-Summe, Audio-Abgabe', async () => {
  const t = await loginCookie('lehrer@dbz.de');
  const created = await jreq(t, 'POST', '/quran-goals', { studentId: 'user_yusuf', goalType: 'murajaah', surahFrom: 114, ayahFrom: 1, surahTo: 114, ayahTo: 6 });
  assert.equal(created.status, 200);
  const goalId = created.data.goal.id;
  const graded = await jreq(t, 'POST', `/quran-goals/${goalId}/attempt`, { points: 8, bonus: 2, feedback: 'Mashallah', passed: true });
  assert.equal(graded.status, 200);
  assert.equal(graded.data.attempt.points, 8);
  assert.equal(graded.data.attempt.bonus, 2);
  const list = await jreq(t, 'GET', '/quran-goals?studentId=user_yusuf');
  assert.ok(list.data.summary.mitarbeit.total >= 10, 'Mitarbeit-Summe enthält Punkte+Extra');

  // Schüler lädt eine Audio-Rezitation hoch (nur Audio erlaubt).
  const s = await loginCookie('schueler@dbz.de');
  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from('ID3audio')], { type: 'audio/mpeg' }), 'rez.mp3');
  const up = await upload(s, `/quran-goals/${goalId}/recording`, fd);
  assert.equal(up.status, 200);
  assert.ok(up.data.goal.recording, 'Aufnahme gespeichert');
  const fd2 = new FormData();
  fd2.append('file', new Blob([Buffer.from('x')], { type: 'application/pdf' }), 'x.pdf');
  assert.equal((await upload(s, `/quran-goals/${goalId}/recording`, fd2)).status, 400, 'nur Audio erlaubt');
});

test('Prüfung: Datei-/Audio-Prüfung ohne Fragen + Antwort + korrigiert zurück', async () => {
  const t = await loginCookie('lehrer@dbz.de');
  const ex = await jreq(t, 'POST', '/exams', { classId: 'class_3', title: 'Datei-Prüfung', questions: [] });
  assert.equal(ex.status, 200, 'Prüfung ohne Fragen/Link erlaubt');
  const examId = ex.data.exam.id;
  const fd = new FormData();
  fd.append('files', new Blob([Buffer.from('%PDF-1.4')], { type: 'application/pdf' }), 'klausur.pdf');
  assert.equal((await upload(t, `/exams/${examId}/files`, fd)).status, 200);
  assert.equal((await jreq(t, 'POST', `/exams/${examId}/publish`)).status, 200);

  const s = await loginCookie('schueler@dbz.de');
  const fr = new FormData();
  fr.append('files', new Blob([Buffer.from('ID3')], { type: 'audio/mpeg' }), 'antwort.mp3');
  assert.equal((await upload(s, `/exams/${examId}/response`, fr)).status, 200);

  const atts = await jreq(t, 'GET', `/exams/${examId}/attempts`);
  const att = atts.data.attempts.find((a) => a.examId === examId);
  assert.ok(att && att.responseFiles?.length, 'Antwortdatei vorhanden');
  const rf = new FormData();
  rf.append('points', '8'); rf.append('maxPoints', '10'); rf.append('feedback', 'achte auf Madd');
  assert.equal((await upload(t, `/attempts/${att.id}/return`, rf)).status, 200);

  const view = await jreq(s, 'GET', `/exams/${examId}`);
  assert.equal(view.data.attempt.status, 'released');
  assert.equal(view.data.attempt.total, 8);
  assert.equal(view.data.attempt.feedback, 'achte auf Madd');
});

test('Ankündigungen: Leitung kann gezielt nur Präsenz- bzw. nur Online-Klassen ansprechen', async () => {
  const leitung = await loginAs('leitung@dbz.de');
  assert.equal((await leitung('POST', '/announcements', { title: 'Präsenz-Info', body: 'Nur Präsenzklassen', audience: { type: 'classType', classType: 'presence' } })).status, 200);
  assert.equal((await leitung('POST', '/announcements', { title: 'Online-Info', body: 'Nur Online', audience: { type: 'classType', classType: 'online' } })).status, 200);
  const student = await loginAs('schueler@dbz.de'); // class_3 = Präsenz
  const list = (await student('GET', '/announcements')).data.announcements;
  assert.ok(list.some((a) => a.title === 'Präsenz-Info'), 'Präsenzschüler sieht Präsenz-Ankündigung');
  assert.ok(!list.some((a) => a.title === 'Online-Info'), 'Präsenzschüler sieht Online-Ankündigung NICHT');

  // Lehrkraft darf keine schulweiten/Typ-Ankündigungen machen.
  const teacher = await loginAs('lehrer@dbz.de');
  assert.equal((await teacher('POST', '/announcements', { title: 'X', body: 'Y', audience: { type: 'classType', classType: 'presence' } })).status, 403);
  assert.equal((await teacher('POST', '/announcements', { title: 'X', body: 'Y', audience: { type: 'all' } })).status, 403);
});

test('Regeln & Strafenkatalog: sichtbar, pro Klasse anpassbar, Schüler read-only', async () => {
  const student = await loginCookie('schueler@dbz.de');
  const r = await jreq(student, 'GET', '/rules');
  assert.equal(r.status, 200);
  assert.ok(r.data.catalog.length >= 5, 'Katalog hat Kategorien');
  assert.ok(r.data.rules.text.length > 20, 'Regeltext vorhanden');
  assert.equal(r.data.catalog.flatMap((c) => c.items).find((i) => i.id === 'v_30').consequence, '2 € oder 1 Seite');

  // Lehrkraft passt Konsequenz NUR für die eigene Klasse an.
  const teacher = await loginCookie('lehrer@dbz.de');
  assert.equal((await jreq(teacher, 'PUT', '/rules/catalog/class_3', { overrides: { v_30: '2 Euro' } })).status, 200);
  const r2 = await jreq(student, 'GET', '/rules');
  const it = r2.data.catalog.flatMap((c) => c.items).find((i) => i.id === 'v_30');
  assert.equal(it.consequence, '2 Euro');
  assert.equal(it.classConsequence, '2 Euro');

  // Schüler darf nicht bearbeiten.
  assert.equal((await jreq(student, 'PUT', '/rules/catalog/class_3', { overrides: { v_30: '0' } })).status, 403);
  assert.equal((await jreq(student, 'PUT', '/rules/text/class_3', { text: 'hack' })).status, 403);
});

test('Check-in öffnen: bleibt bis zur Auto-Schließzeit offen', async () => {
  const teacher = await loginCookie('lehrer@dbz.de');
  const qr = await jreq(teacher, 'GET', '/classes/class_3/checkin-qr');
  assert.equal(qr.status, 200);
  const sid = qr.data.sessionId;
  assert.ok(sid, 'Sitzung vorhanden');
  assert.equal((await jreq(teacher, 'POST', `/sessions/${sid}/checkin-open`, {})).status, 200);
  const qr2 = await jreq(teacher, 'GET', '/classes/class_3/checkin-qr');
  assert.ok(qr2.data.checkinOpenUntil, 'Öffnungszeit gesetzt');
  assert.equal(qr2.data.window.open, true, 'Check-in ist danach offen');
});

test('Klassen-Zuordnung: Admin fügt Lehrkraft (Vertretung) hinzu und entfernt sie', async () => {
  const admin = await loginCookie('admin@dbz.de');
  const stamp = Date.now();
  const v = (await jreq(admin, 'POST', '/admin/users', { name: 'Vertretung X', email: `vx-${stamp}@dbz.de`, password: 'demo1234', role: 'vertretung', classIds: [] })).data.user;
  assert.equal((await jreq(admin, 'POST', '/admin/classes/class_3/teachers', { userId: v.id })).status, 200);
  const t = await jreq(admin, 'GET', '/admin/classes/class_3/teachers');
  assert.ok(t.data.assigned.some((x) => x.id === v.id), 'zugewiesen');
  assert.equal((await jreq(admin, 'DELETE', `/admin/classes/class_3/teachers/${v.id}`)).status, 200);
  const t2 = await jreq(admin, 'GET', '/admin/classes/class_3/teachers');
  assert.ok(!t2.data.assigned.some((x) => x.id === v.id), 'entfernt');
});

test('Nutzer löschen: Sammel-Löschung entfernt mehrere aktive Konten direkt, schützt eigenes Konto und letzten Admin', async () => {
  const admin = await loginAs('admin@dbz.de');
  const stamp = Date.now();
  const mkA = await admin('POST', '/admin/users', { name: 'Bulk A', email: `bulk-a-${stamp}@dbz.de`, password: 'demo1234', role: 'schueler' });
  const mkB = await admin('POST', '/admin/users', { name: 'Bulk B', email: `bulk-b-${stamp}@dbz.de`, password: 'demo1234', role: 'schueler' });
  assert.equal(mkA.status, 200);
  assert.equal(mkB.status, 200);
  const idA = mkA.data.user.id;
  const idB = mkB.data.user.id;
  assert.equal(mkA.data.user.status, 'active', 'Konten sind sofort aktiv (keine Deaktivierung nötig für Sammel-Löschung)');

  const del = await admin('POST', '/admin/users/bulk-delete', { ids: [idA, idB] });
  assert.equal(del.status, 200);
  assert.equal(del.data.results.length, 2);
  assert.ok(del.data.results.every((r) => r.ok), 'beide Konten erfolgreich gelöscht');

  const list = (await admin('GET', '/admin/users')).data.users;
  assert.ok(!list.some((u) => u.id === idA), 'Konto A ist vollständig entfernt');
  assert.ok(!list.some((u) => u.id === idB), 'Konto B ist vollständig entfernt');

  // Eigenes Konto und der letzte System-Administrator sind geschützt.
  const me = list.find((u) => u.email === 'admin@dbz.de');
  const guard = await admin('POST', '/admin/users/bulk-delete', { ids: [me.id] });
  assert.equal(guard.status, 200);
  assert.equal(guard.data.results[0].ok, false, 'eigenes Konto wird nicht gelöscht');
});

test('Demo-Konten: Reaktivierungs-Endpoint setzt deaktivierte Demo-Konten zurück auf aktiv', async () => {
  const admin = await loginAs('admin@dbz.de');
  const list = (await admin('GET', '/admin/users')).data.users;
  const leitung = list.find((u) => u.email === 'leitung@dbz.de');
  assert.ok(leitung, 'Demo-Konto leitung@dbz.de existiert');

  // Erst deaktivieren, um den Reaktivierungs-Fall zu erzeugen.
  const disable = await admin('PATCH', `/admin/users/${leitung.id}`, { status: 'disabled' });
  assert.equal(disable.status, 200);

  const reactivate = await admin('POST', '/admin/reactivate-demo-accounts', {});
  assert.equal(reactivate.status, 200);
  const leitungResult = reactivate.data.results.find((r) => r.email === 'leitung@dbz.de');
  assert.equal(leitungResult.ok, true);
  assert.equal(leitungResult.changed, true);

  const after = (await admin('GET', '/admin/users')).data.users.find((u) => u.id === leitung.id);
  assert.equal(after.status, 'active');

  // Nochmal aufrufen: schon aktiv -> changed:false.
  const again = await admin('POST', '/admin/reactivate-demo-accounts', {});
  const leitungAgain = again.data.results.find((r) => r.email === 'leitung@dbz.de');
  assert.equal(leitungAgain.changed, false);

  // Nur Leitung/Admin dürfen das.
  const teacher = await loginAs('lehrer@dbz.de');
  const forbidden = await teacher('POST', '/admin/reactivate-demo-accounts', {});
  assert.equal(forbidden.status, 403);
});
