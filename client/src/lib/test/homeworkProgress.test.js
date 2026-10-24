import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeworkTone } from '../homeworkProgress.js';

test('Hausaufgaben: Farbe nach Anteil, sobald eine Frist verpasst ist', () => {
  assert.equal(homeworkTone(0, 3, 3), 'none', '0 von 3: rot');
  assert.equal(homeworkTone(1, 3, 2), 'low', '1 von 3: orange');
  assert.equal(homeworkTone(2, 3, 1), 'high', '2 von 3: gelb');
  assert.equal(homeworkTone(3, 3, 0), 'complete', '3 von 3: grün');
  assert.equal(homeworkTone(1, 2, 1), 'high', 'halb: gelb');
  assert.equal(homeworkTone(1, 4, 3), 'low');
  assert.equal(homeworkTone(0, 1, 1), 'none');
  assert.equal(homeworkTone(1, 3, 0), 'open', 'Frist noch nicht vorbei: neutral');
  assert.equal(homeworkTone(0, 0, 0), 'open');
});
