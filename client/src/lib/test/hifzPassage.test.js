import test from 'node:test';
import assert from 'node:assert/strict';
import { pageToHifzPassage, EmptyPassageError } from '../hifzPassage.js';
import { validatePassage } from '../hifzEngine.js';

// Neutrale, künstliche Seitendaten in der Form, wie /quran/page/:p sie liefert
// (server/providers/mushafPageProvider.js: lines[].words[] = {t,g,tj,e,v}).
const page = (overrides = {}) => ({
  page: 1,
  juz: 1,
  font: 'v1',
  lines: [
    { n: 1, words: [
      { t: 'كتاب', g: 'A', e: false, v: '1:1' },
      { t: 'قلم', g: 'B', e: false, v: '1:1' },
      { t: '١', g: '', e: true, v: '1:1' }, // Ayah-Endzeichen
    ] },
    { n: 2, words: [
      { t: 'باب', g: 'C', e: false, v: '1:2' },
      { t: '٢', g: '', e: true, v: '1:2' },
    ] },
  ],
  ...overrides,
});

test('page words become a valid, ordered passage (positions reset per Ayah)', () => {
  const p = pageToHifzPassage(page());
  assert.equal(p.words.length, 3);
  assert.deepEqual(p.words.map((w) => [w.ayah, w.position]), [[1, 1], [1, 2], [2, 1]]);
  assert.doesNotThrow(() => validatePassage(p));
});

test('Ayah-end marker words (e:true) are excluded from the trackable word list', () => {
  const p = pageToHifzPassage(page());
  assert.ok(p.words.every((w) => w.text !== '١' && w.text !== '٢'));
});

test('real printed line numbers are preserved, not synthesised', () => {
  const p = pageToHifzPassage(page());
  assert.deepEqual(p.words.map((w) => w.line), [1, 1, 2]);
});

test('glyph (page font character) travels through for rendering, not validated by the engine', () => {
  const p = pageToHifzPassage(page());
  assert.equal(p.words[0].glyph, 'A');
  const validated = validatePassage(p);
  assert.equal(validated.words[0].glyph, undefined); // Engine kennt nur die Kernfelder
});

test('empty page throws a clear error', () => {
  assert.throws(() => pageToHifzPassage(page({ lines: [] })), EmptyPassageError);
});

test('passage id/title reference the real page number', () => {
  const p = pageToHifzPassage(page({ page: 42 }));
  assert.equal(p.page, 42);
  assert.match(p.title, /42/);
});
