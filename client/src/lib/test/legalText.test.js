// Entscheidung des Betreibers (22.11.2026): Der Chat ist ein geschlossener
// Schul-Chat – kein Blockieren, Schüler/Eltern löschen keine Nachrichten. Das
// muss von Anfang an in Datenschutzerklärung und Einwilligung stehen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\s+/g, ' ');

test('Datenschutzerklärung und Einwilligung nennen: geschlossener Chat, kein Blockieren, kein Löschen', () => {
  const legal = read('../../pages/Rechtliches.jsx');
  assert.match(legal, /geschlossener Schul-Chat/);
  assert.match(legal, /nicht blockieren/);
  assert.match(legal, /Eltern können Nachrichten <b[^>]*>nicht löschen/);
  const consent = read('../../components/Consent.jsx');
  assert.match(consent, /Blockieren ist nicht möglich, und Schüler und Eltern können Nachrichten nicht löschen/);
});
