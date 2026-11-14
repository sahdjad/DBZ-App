// Datensicherung im Supabase-Betrieb -- gegen einen nachgebauten Supabase-
// Dienst (REST-Tabelle + Storage), weil die echte Produktion aus Tests nicht
// erreichbar ist. Prüft: eigener privater Bucket, komprimierte Ablage,
// einmal täglich, Begrenzung, Wiederherstellung schreibt nach Supabase zurück.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dbz-sbbackup-'));
const fake = { row: null, buckets: {}, calls: [] };
let supa;

before(async () => {
  supa = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, 'http://x');
      const p = decodeURIComponent(url.pathname);
      fake.calls.push(`${req.method} ${p}`);
      const json = (code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (req.headers.authorization !== 'Bearer service-key') return json(401, { message: 'unauthorized' });
      if (p === '/rest/v1/app_state') {
        if (req.method === 'GET') return json(200, fake.row ? [{ data: fake.row }] : []);
        fake.row = JSON.parse(body.toString()).data;
        return json(201, {});
      }
      if (p === '/storage/v1/bucket' && req.method === 'POST') {
        const b = JSON.parse(body.toString());
        if (fake.buckets[b.id]) return json(409, { message: 'The resource already exists' });
        fake.buckets[b.id] = { public: b.public, objects: {} };
        return json(200, { name: b.id });
      }
      let m = /^\/storage\/v1\/object\/list\/([^/]+)$/.exec(p);
      if (m && req.method === 'POST') {
        const b = fake.buckets[m[1]];
        if (!b) return json(404, {});
        return json(200, Object.keys(b.objects).sort().map((name) => ({ name, updated_at: '2026-01-01T00:00:00Z', metadata: { size: b.objects[name].length } })));
      }
      m = /^\/storage\/v1\/object\/([^/]+)$/.exec(p);
      if (m && req.method === 'DELETE') {
        for (const n of JSON.parse(body.toString()).prefixes) delete fake.buckets[m[1]]?.objects[n];
        return json(200, []);
      }
      m = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(p);
      if (m) {
        const b = fake.buckets[m[1]];
        if (!b) return json(404, {});
        if (req.method === 'POST') { b.objects[m[2]] = body; return json(200, { Key: m[2] }); }
        if (req.method === 'GET') {
          if (!b.objects[m[2]]) return json(404, {});
          res.writeHead(200, { 'content-type': 'application/gzip' });
          return res.end(b.objects[m[2]]);
        }
      }
      json(404, { message: 'not found' });
    });
  });
  await new Promise((r) => supa.listen(0, '127.0.0.1', r));
  process.env.DBZ_DATA_DIR = TMP;
  process.env.JWT_SECRET = 'test-secret-backup-supabase-0123456789';
  process.env.SUPABASE_URL = `http://127.0.0.1:${supa.address().port}`;
  process.env.SUPABASE_SERVICE_KEY = 'service-key';
});

after(() => {
  supa?.close();
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
  assert.equal(fake.row.classes.length, 0);
  db.restore(await loadBackup(ev.name));
  await flushStore();
  assert.equal(fake.row.classes[0].name, 'Klasse 1', 'wiederhergestellter Stand ist dauerhaft gespeichert');

  // Begrenzung auch im Bucket.
  for (let i = 1; i <= 35; i++) fake.buckets['dbz-backups'].objects[`daily-2025-02-${String(i).padStart(2, '0')}.json.gz`] = stored;
  await backupNow('event', 'x');
  assert.equal((await listBackups()).filter((b) => b.kind === 'daily').length, 30);
  // Uploads der Nutzer werden nie angefasst (anderer Bucket).
  assert.equal(fake.calls.some((c) => c.includes('/object/uploads')), false);
});
