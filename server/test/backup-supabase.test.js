// Datensicherung im Supabase-Betrieb -- gegen einen nachgebauten Supabase-
// Dienst (REST-Tabelle + Storage), weil die echte Produktion aus Tests nicht
// erreichbar ist. Prüft: eigener privater Bucket, komprimierte Ablage,
// einmal täglich, Begrenzung, Wiederherstellung schreibt nach Supabase zurück.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFakeSupabase } from './helpers/fake-supabase.js';
import zlib from 'node:zlib';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dbz-sbbackup-'));
let fake;

before(async () => {
  fake = await startFakeSupabase();
  process.env.DBZ_DATA_DIR = TMP;
  process.env.JWT_SECRET = 'test-secret-backup-supabase-0123456789';
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_KEY = 'service-key';
});

after(() => {
  fake?.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('Supabase: Sicherung im eigenen privaten Bucket, einmal täglich, wiederherstellbar', async () => {
  const { initStore, flushStore, db } = await import('../store.js');
  const { ensureDailyBackup, backupNow, listBackups, loadBackup } = await import('../backup.js');
  await initStore();
  assert.equal(db.backend, 'supabase');

  // Leerer Bestand wird nicht gesichert (würde sonst eine gute Sicherung verdrängen).
  assert.equal((await backupNow('daily')).skipped, 'leer');

  db.insert('users', { id: 'u1', name: 'Echt', email: 'echt@example.org', role: 'super_admin', passwordHash: 'x' });
  db.insert('classes', { id: 'c1', name: 'Klasse 1' });
  await flushStore();

  const d = await ensureDailyBackup();
  assert.equal(d.ok, true);
  assert.deepEqual(Object.keys(fake.buckets), ['dbz-backups'], 'eigener Bucket, getrennt von den Uploads');
  assert.equal(fake.buckets['dbz-backups'].public, false, 'Bucket ist privat');
  const stored = fake.buckets['dbz-backups'].objects[d.name];
  assert.ok(stored, 'Datei liegt im Bucket');
  assert.equal(JSON.parse(zlib.gunzipSync(stored).toString()).users[0].id, 'u1', 'gzip-komprimiertes JSON');
  assert.equal((await ensureDailyBackup()).existed, true);
  assert.equal(Object.keys(fake.buckets['dbz-backups'].objects).length, 1, 'kein zweites Schreiben am selben Tag');

  // Vor einer Löschung sichern, löschen, zurückholen -> steht wieder in Supabase.
  const ev = await backupNow('event', 'vor-loeschung');
  assert.equal(ev.ok, true);
  db.all('classes').length = 0;
  db.commit();
  await flushStore();
  assert.equal(fake.state().classes.length, 0);
  db.restore(await loadBackup(ev.name));
  await flushStore();
  assert.equal(fake.state().classes[0].name, 'Klasse 1', 'wiederhergestellter Stand ist dauerhaft gespeichert');

  // Begrenzung auch im Bucket.
  for (let i = 1; i <= 35; i++) fake.buckets['dbz-backups'].objects[`daily-2025-02-${String(i).padStart(2, '0')}.json.gz`] = stored;
  await backupNow('event', 'x');
  assert.equal((await listBackups()).filter((b) => b.kind === 'daily').length, 30);
  // Uploads der Nutzer werden nie angefasst (anderer Bucket).
  assert.equal(fake.calls.some((c) => c.includes('/object/uploads')), false);
});

test('Supabase: Upload-Fehler wird gemeldet, nichts wird als abgegeben gespeichert', async () => {
  const { db, UPLOAD_DIR } = await import('../store.js');
  const { ensureFileBucket } = await import('../files.js');
  const { createApp } = await import('../app.js');
  const { hashPassword } = await import('../auth.js');
  await ensureFileBucket();
  db.insert('users', { id: 's1', name: 'Kind', email: 'kind@example.org', role: 'schueler', classIds: ['c1'], status: 'active', passwordHash: await hashPassword('geheim12') });
  db.insert('assignments', { id: 'a1', classId: 'c1', title: 'Audio', type: 'audio', status: 'published', createdAt: new Date().toISOString() });
  const srv = createApp().listen(0);
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  try {
    const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'kind@example.org', password: 'geheim12' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const form = () => { const f = new FormData(); f.append('files', new Blob([Buffer.from('RIFFxxxxWAVE')], { type: 'audio/wav' }), 'a.wav'); return f; };

    fake.failUploads = true;
    const bad = await fetch(base + '/assignments/a1/submit', { method: 'POST', headers: { cookie }, body: form() });
    assert.equal(bad.status, 503);
    assert.match((await bad.json()).error, /nicht gespeichert/);
    assert.equal(db.all('submissions').length, 0, 'keine Abgabe ohne dauerhaft gespeicherte Datei');
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(fs.readdirSync(UPLOAD_DIR), [], 'auch lokal bleibt nichts liegen');

    fake.failUploads = false;
    const ok = await fetch(base + '/assignments/a1/submit', { method: 'POST', headers: { cookie }, body: form() });
    assert.equal(ok.status, 200);
    const name = db.all('submissions')[0].files[0].filename;
    assert.ok(fake.buckets.uploads.objects[name], 'Datei liegt dauerhaft in Supabase');

    // Abgelehnte Anfrage: die schon hochgeladene Datei wird auch in Supabase wieder entfernt.
    const count = Object.keys(fake.buckets.uploads.objects).length;
    const rej = await fetch(base + '/assignments/gibt-es-nicht/submit', { method: 'POST', headers: { cookie }, body: form() });
    assert.ok(rej.status >= 400);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(Object.keys(fake.buckets.uploads.objects).length, count);
  } finally { srv.close(); }
});
