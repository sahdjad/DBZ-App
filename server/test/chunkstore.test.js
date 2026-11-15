// Aufgeteilte Ablage in Supabase: einmalige, kontrollierte Umstellung vom alten
// Ein-Dokument-Verfahren; danach werden nur geänderte Blöcke gespeichert.
// Jeder „Serverstart" läuft in einem eigenen Prozess gegen denselben
// nachgebauten Supabase-Dienst (helpers/fake-supabase.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startFakeSupabase } from './helpers/fake-supabase.js';
import { createChunker } from '../chunkstore.js';

const CHILD = fileURLToPath(new URL('./helpers/store-child.mjs', import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dbz-chunks-'));
let fake;

before(async () => { fake = await startFakeSupabase(); });
after(() => { fake?.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

function start(action = 'read', env = {}) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [CHILD, action], {
      env: { ...process.env, DBZ_DATA_DIR: TMP, JWT_SECRET: 'x'.repeat(40), SUPABASE_URL: fake.url, SUPABASE_SERVICE_KEY: 'service-key', DBZ_RECOVERY_MS: '200', ...env },
      timeout: 60000,
    }, (err, stdout, stderr) => {
      const line = stdout.split('\n').find((l) => l.startsWith('RESULT '));
      if (!line) return reject(new Error(`kein Ergebnis: ${err?.message || ''}\n${stdout}\n${stderr}`));
      resolve({ ...JSON.parse(line.slice(7)), log: stdout + stderr });
    });
  });
}

const legacy = () => ({
  organizations: [{ id: 'org', name: 'Schule' }],
  users: Array.from({ length: 1203 }, (_, i) => ({ id: `u${i}`, name: `Person ${i}`, role: i ? 'schueler' : 'super_admin', classIds: ['c1'], nested: { a: [1, 2, { b: 'ä' }] } })),
  classes: [{ id: 'c1', name: 'Klasse 1' }, { id: 'c2', name: 'Klasse 2' }],
  notifications: Array.from({ length: 2600 }, (_, i) => ({ id: `n${i}`, userId: `u${i % 50}`, title: 'Hinweis', read: i % 2 === 0, createdAt: '2026-01-01T00:00:00.000Z' })),
  attendance: [],
  meta: { seeded: true, zahl: 7 },
});

test('Rechner: Reihenfolge bleibt, nur Geändertes wird gespeichert, Neuordnung und Löschen stimmen', () => {
  const data = { a: Array.from({ length: 1200 }, (_, i) => ({ id: i })), leer: [], meta: { x: 1 }, zahlen: [1, 2, 3] };
  const c = createChunker({ prefix: 'k:', chunkSize: 500 });
  const first = c.plan(data);
  assert.deepEqual(first.changed.map((r) => r.id).sort(), ['k:_meta', 'k:a:0', 'k:a:1', 'k:a:2', 'k:leer:0']);
  c.commit(first);
  assert.equal(c.plan(data).changed.length, 0, 'ohne Änderung nichts zu speichern');

  data.a.push({ id: 'neu' }); // Anhängen: nur der letzte Block
  let p = c.plan(data); assert.deepEqual(p.changed.map((r) => r.id), ['k:a:2']); c.commit(p);
  data.a[3].x = 1; // Ändern eines alten Eintrags: nur dessen Block
  p = c.plan(data); assert.deepEqual(p.changed.map((r) => r.id), ['k:a:0']); c.commit(p);
  data.a.splice(600, 1); // Löschen: nur der betroffene Block, Laufnummern der anderen bleiben
  p = c.plan(data); assert.deepEqual(p.changed.map((r) => r.id), ['k:a:1']); c.commit(p);
  data.meta.x = 2; data.zahlen.push(4); // Nicht-Listen liegen gemeinsam in _meta
  p = c.plan(data); assert.deepEqual(p.changed.map((r) => r.id), ['k:_meta']); c.commit(p);

  // Zusammensetzen aus den gespeicherten Zeilen ergibt denselben Stand in derselben Reihenfolge.
  const rows = new Map();
  const c2 = createChunker({ prefix: 'k:', chunkSize: 500 });
  for (const r of c2.plan(data).changed) rows.set(r.id, JSON.parse(r.json));
  rows.set('k:_manifest', { version: 1 });
  const list = [...rows].map(([id, d]) => ({ id, data: d }));
  const back = createChunker({ prefix: 'k:', chunkSize: 500 }).assemble(list);
  assert.deepEqual(back, data);
  assert.equal(createChunker({ prefix: 'k:' }).assemble(list.filter((r) => r.id !== 'k:_manifest')), null, 'ohne Kennzeichen gilt der Bestand nicht als aufgeteilt');

  // Vorn einfügen / ersetzen: Sammlung wird neu nummeriert, überzählige Blöcke werden geleert.
  const c3 = createChunker({ prefix: 'k:', chunkSize: 500 });
  const d3 = c3.assemble(list);
  assert.equal(c3.plan(d3).changed.length, 0, 'frisch geladen = nichts zu speichern');
  d3.a.unshift({ id: 'vorn' });
  d3.a.length = 400;
  const p3 = c3.plan(d3);
  const m3 = new Map(p3.changed.map((r) => [r.id, JSON.parse(r.json)]));
  assert.equal(m3.get('k:a:0').items.length, 400);
  assert.equal(m3.get('k:a:0').items[0][1].id, 'vorn');
  assert.deepEqual(m3.get('k:a:1'), { items: [] });
  assert.deepEqual(m3.get('k:a:2'), { items: [] });
});

test('Umstellung: altes Dokument -> Blöcke, kontrolliert; alte Zeile bleibt; danach kleine Schreibvorgänge', async () => {
  fake.row = legacy();
  const legacyBefore = JSON.stringify(fake.row);

  const first = await start();
  assert.equal(first.layout, 'chunks');
  assert.match(first.log, /Ablage umgestellt/);
  assert.equal(first.counts.users, 1203);
  assert.equal(JSON.stringify(fake.row), legacyBefore, 'alte Ein-Dokument-Zeile unverändert');
  assert.equal(fake.rows['dbz:_manifest'].version, 1);
  assert.deepEqual(Object.keys(fake.rows).filter((k) => k.startsWith('dbz:users:')).sort(), ['dbz:users:0', 'dbz:users:1', 'dbz:users:2']);
  const st = fake.state();
  assert.deepEqual(st.users.map((u) => u.id), legacy().users.map((u) => u.id), 'Reihenfolge erhalten');
  assert.deepEqual(st.users[5].nested, { a: [1, 2, { b: 'ä' }] });
  assert.deepEqual(st.meta, { seeded: true, zahl: 7 });
  const whole = JSON.stringify(legacy()).length;

  // Zweiter Start: lädt aus den Blöcken, schreibt nichts (auch nicht bei commit ohne Änderung).
  fake.writes.length = 0; fake.bytesWritten = 0;
  const second = await start('noop-commit');
  assert.equal(second.layout, 'chunks');
  assert.doesNotMatch(second.log, /Ablage umgestellt/);
  assert.deepEqual(second.userNames, first.userNames);
  assert.deepEqual(second.noteIds, first.noteIds);
  assert.equal(fake.writes.length, 0, 'unveränderter Bestand wird nicht erneut gespeichert');

  // Eine neue Benachrichtigung: genau ein Block, ein Bruchteil des Ganzen.
  const third = await start('add-note');
  assert.deepEqual(fake.writes.flat(), ['dbz:notifications:5']);
  assert.ok(fake.bytesWritten < whole / 20, `geschrieben ${fake.bytesWritten} von ${whole} Zeichen`);
  assert.equal(third.counts.notifications, 2601);

  // Einen alten Eintrag ändern: nur dessen Block.
  fake.writes.length = 0;
  await start('edit-first-user');
  assert.deepEqual(fake.writes.flat(), ['dbz:users:0']);
  assert.equal(fake.state().users[0].name, 'Geändert');

  // Löschen bleibt gelöscht -- auch nach einem weiteren Start.
  fake.writes.length = 0;
  await start('delete-class');
  assert.deepEqual(fake.writes.flat(), ['dbz:classes:0']);
  const later = await start();
  assert.deepEqual(later.classNames, ['Klasse 2']);
  assert.equal(later.counts.notifications, 2601);
  assert.equal(later.userNames[0], 'Geändert');
  assert.equal(JSON.stringify(fake.row), legacyBefore, 'alte Zeile bis zuletzt unberührt');
});

test('Rückweg: DBZ_STORE_LAYOUT=single lädt weiterhin das alte Dokument', async () => {
  const r = await start('read', { DBZ_STORE_LAYOUT: 'single' });
  assert.equal(r.layout, 'single');
  assert.equal(r.userNames[0], 'Person 0', 'Stand vom Umstellungstag');
  assert.equal(r.classNames.length, 2);
  // Im Rückweg-Betrieb wird ins Dokument geschrieben. Ein späterer normaler
  // Start darf deshalb NICHT die alten Blöcke laden, sondern stellt neu um.
  await start('edit-first-user', { DBZ_STORE_LAYOUT: 'single' });
  assert.equal(fake.row.users[0].name, 'Geändert');
  fake.row = { ...fake.row, classes: [{ id: 'c9', name: 'Im Rückweg angelegt' }] };
  const back = await start();
  assert.equal(back.layout, 'chunks');
  assert.match(back.log, /Ablage umgestellt/);
  assert.deepEqual(back.classNames, ['Im Rückweg angelegt'], 'Stand aus dem Dokument, nicht aus veralteten Blöcken');
  assert.equal(back.counts.notifications, 2600);
});

test('Abbruch während der Umstellung: es bleibt beim alten Dokument, nichts geht verloren; nächster Start holt es nach', async () => {
  for (const k of Object.keys(fake.rows)) delete fake.rows[k];
  fake.row = legacy();
  // Reste eines früheren, abgebrochenen Versuchs mit FALSCHEN Daten:
  fake.rows['dbz:users:9'] = { items: [[9000, { id: 'geist', name: 'Darf nie auftauchen' }]] };
  fake.rows['dbz:classes:0'] = { items: [[0, { id: 'alt', name: 'Veraltet' }]] };

  fake.failWrites = true;
  const failed = await start('read');
  assert.equal(failed.layout, 'single');
  assert.match(failed.log, /Umstellung auf Blöcke nicht abgeschlossen/);
  assert.equal(failed.counts.users, 1203, 'App läuft mit dem echten Bestand weiter');
  assert.equal(fake.rows['dbz:_manifest'], undefined, 'kein Kennzeichen ohne bestandene Kontrolle');
  fake.failWrites = false;

  const ok = await start();
  assert.equal(ok.layout, 'chunks');
  assert.equal(ok.counts.users, 1203);
  assert.equal(ok.userNames.includes('Darf nie auftauchen'), false, 'Reste des alten Versuchs wurden geleert');
  assert.deepEqual(ok.classNames, ['Klasse 1', 'Klasse 2']);
  const again = await start();
  assert.equal(again.userNames.includes('Darf nie auftauchen'), false);
  assert.equal(again.counts.users, 1203);
});

test('Leeres Projekt: startet direkt aufgeteilt', async () => {
  for (const k of Object.keys(fake.rows)) delete fake.rows[k];
  const r = await start();
  assert.equal(r.layout, 'chunks');
  assert.equal(fake.rows['dbz:_manifest'].version, 1);
  assert.equal(fake.row, null, 'keine Ein-Dokument-Zeile mehr nötig');
});
