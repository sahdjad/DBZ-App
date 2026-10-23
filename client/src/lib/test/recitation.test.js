// Tests der KI-Rezitation (freie Rezitation im ganzen Qur'an, gemeinsame
// Sitzung für „Text versteckt"/„Text sichtbar").
//
// fixtures/asr-transcripts.json: ECHTE, unveränderte Ergebnisse der On-Device-
// Erkennung dieser App (NVIDIA FastConformer, lib/asr/streamingCtc.js) auf
// öffentlichen Testaufnahmen (Tilawa-Testkorpus, github.com/yazinsai/tilawa,
// MIT) -- inklusive aller Erkennungsfehler (z. B. „المصدر" als Störwort).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildQuranIndex } from '../recitation/quranIndex.js';
import { locate } from '../recitation/locator.js';
import { RecitationTracker, KIND } from '../recitation/tracker.js';
import { normalize } from '../hifzEngine.js';

const index = buildQuranIndex(JSON.parse(fs.readFileSync(new URL('../../../public/quran/index-v1.json', import.meta.url), 'utf8')));
const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/asr-transcripts.json', import.meta.url), 'utf8'));
const words = (s, a1, a2 = a1) => { const [f, t] = index.ayahRange(s, a1, a2); const out = []; for (let g = f; g < t; g++) out.push(index.token[g]); return out; };

test('Index: 6236 Ayat, 77.430 Wörter, Seiten wie im Medina-Mushaf', () => {
  assert.equal(index.total, 77430);
  assert.equal(index.pageOf(index.wordOf(1, 1)), 1);
  assert.equal(index.pageOf(index.wordOf(2, 1)), 2);
  assert.equal(index.pageOf(index.wordOf(67, 1)), 562);
  assert.equal(index.pageOf(index.wordOf(10, 106)), 220);
  assert.equal(index.pageOf(index.wordOf(10, 107)), 221);
  assert.equal(index.pageOf(index.wordOf(114, 6)), 604);
  assert.deepEqual(index.pageRange(1), [0, 29]);
  assert.equal(index.id(index.wordOf(67, 1, 3)), '67:1:3');
  // Basmala gehört (außer bei Al-Fatiha) nicht zur ersten Ayah
  assert.equal(words(67, 1)[0], 'تبارك');
});

test('Stellensuche: echte Erkennung findet die richtige Stelle (8 Aufnahmen)', () => {
  for (const [name, { expect: [s, a1, a2], commits }] of Object.entries(fixtures)) {
    const tr = new RecitationTracker(index);
    commits.forEach((text, i) => tr.accept({ id: `${name}:${i}`, text }));
    assert.equal(tr.phase, 'tracking', `${name}: Stelle gefunden`);
    const [from, to] = index.ayahRange(s, a1, a2);
    const outside = [...tr.marks.keys()].filter((g) => g < from - 2 || g >= to + 2);
    assert.deepEqual(outside, [], `${name}: nichts an falscher Stelle markiert`);
    let recited = 0;
    for (let g = from; g < to; g++) if ([KIND.MEMORY, KIND.READ].includes(tr.marks.get(g))) recited++;
    assert.ok(recited / (to - from) >= 0.75, `${name}: ${recited}/${to - from} Wörter erkannt`);
  }
});

test('Stellensuche: wiederholte Formulierung ist mehrdeutig statt geraten', () => {
  // „فبأي آلاء ربكما تكذبان" kommt in Ar-Rahman 31-mal vor.
  const r = locate(index, words(55, 13));
  assert.notEqual(r.status, 'found');
  // Mit der Ayah davor ist die Stelle eindeutig.
  const r2 = locate(index, [...words(55, 12), ...words(55, 13)]);
  assert.equal(r2.status, 'found');
  assert.equal(index.verseKey(r2.best.end - 1), '55:13');
});

test('Stellensuche: zu wenig Gehörtes reicht nicht', () => {
  assert.equal(locate(index, ['الله']).status, 'none');
  assert.equal(locate(index, normalize('بسم الله الرحمن الرحيم').split(' ')).status, 'ambiguous'); // 1:1 und 27:30
});

test('Sitzung: Anzeige umschalten ändert nie Stand oder Position, nur die Zählweise', () => {
  const tr = new RecitationTracker(index);
  const w = words(67, 1, 2);
  tr.accept({ id: 'a', text: w.slice(0, 6).join(' ') });
  assert.equal(tr.phase, 'tracking');
  const cursor = tr.cursor;
  const marks = new Map(tr.marks);
  tr.setReading(true); // Text sichtbar
  assert.equal(tr.cursor, cursor);
  assert.deepEqual(new Map(tr.marks), marks);
  tr.accept({ id: 'b', text: w.slice(6, 9).join(' ') });
  assert.equal(tr.marks.get(cursor), KIND.READ, 'bei sichtbarem Text = mitgelesen');
  tr.setReading(false);
  const c2 = tr.cursor;
  tr.accept({ id: 'c', text: w.slice(9, 11).join(' ') });
  assert.equal(tr.marks.get(c2), KIND.MEMORY, 'bei verstecktem Text = auswendig');
  assert.equal(tr.marks.get(cursor), KIND.READ, 'Zurückschalten vergibt nachträglich nichts');
});

test('Sitzung: läuft über Seiten- und Surengrenzen ohne Neustart', () => {
  const tr = new RecitationTracker(index);
  const w = [...words(10, 106), ...words(10, 107)];
  for (let i = 0; i < w.length; i += 2) tr.accept({ id: `y${i}`, text: w.slice(i, i + 2).join(' ') });
  assert.equal(index.pageOf(tr.cursor), 221);
  assert.equal(index.verseKey(tr.cursor), '10:108');
  const t2 = new RecitationTracker(index);
  const v = [...words(113, 4, 5), ...words(114, 1, 3)];
  for (let i = 0; i < v.length; i += 3) t2.accept({ id: `z${i}`, text: v.slice(i, i + 3).join(' ') });
  assert.equal(index.verseKey(t2.cursor), '114:4');
});

test('Sitzung: Hilfen decken auf, zählen aber nie als auswendig', () => {
  const tr = new RecitationTracker(index, { scope: { kind: 'focused', from: index.wordOf(112, 1), to: index.ayahRange(112, 1, 4)[1], label: 'Al-Ikhlas' } });
  assert.equal(tr.phase, 'tracking');
  const first = tr.cursor;
  tr.hintNext();
  assert.ok(tr.hints.has(first));
  assert.equal(tr.marks.get(first), undefined, 'nur aufgedeckt, nicht rezitiert');
  tr.accept({ id: '1', text: words(112, 1).join(' ') });
  assert.equal(tr.marks.get(first), KIND.ASSISTED);
  assert.equal(tr.marks.get(first + 1), KIND.MEMORY);
  tr.hintAyah();
  assert.equal(tr.stats.ayahHints, 1);
  for (const [i, a] of [2, 3, 4].entries()) tr.accept({ id: `x${i}`, text: words(112, a).join(' ') });
  assert.equal(tr.phase, 'complete', 'gezielter Bereich endet am Bereichsende');
  const s = tr.summary();
  assert.equal(s.scope.kind, 'focused');
  assert.equal(s.from, '112:1');
  assert.equal(s.to, '112:4');
  assert.ok(s.counts.assisted >= 1 + words(112, 2).length);
});

test('Sitzung: ausgelassene Wörter werden markiert, nie als rezitiert gezählt', () => {
  const tr = new RecitationTracker(index);
  const w = words(67, 1, 2);
  tr.accept({ id: 'a', text: w.slice(0, 5).join(' ') });
  // Wörter 6-7 auslassen, dann korrekt weiter
  tr.accept({ id: 'b', text: w.slice(7, 12).join(' ') });
  const g6 = index.wordOf(67, 1, 6);
  assert.equal(tr.marks.get(g6), KIND.MISSED);
  assert.equal(tr.marks.get(index.wordOf(67, 1, 7)), KIND.MISSED);
  assert.equal(tr.summary().counts.missed, 2);
});

test('Sitzung: Sprung an eine andere Stelle wird erkannt (freie Rezitation)', () => {
  const tr = new RecitationTracker(index);
  tr.accept({ id: 'a', text: words(67, 1).join(' ') });
  assert.equal(index.verseKey(tr.cursor), '67:2');
  const w = words(36, 1, 3);
  for (let i = 0; i < w.length; i += 2) tr.accept({ id: `b${i}`, text: w.slice(i, i + 2).join(' ') });
  assert.equal(index.verseKey(tr.cursor), '36:4');
  assert.equal(tr.stats.relocations, 1);
  assert.equal(tr.marks.get(index.wordOf(67, 2)), undefined, 'übersprungene Stelle bleibt unberührt');
});

test('Sitzung: Mehrdeutigkeit -> Auswahl anbieten, Person wählt', () => {
  const tr = new RecitationTracker(index);
  tr.accept({ id: 'a', text: words(55, 13).join(' ') });
  assert.equal(tr.phase, 'searching');
  assert.ok(tr.candidates.length >= 2);
  tr.choose(0);
  assert.equal(tr.phase, 'tracking');
});
