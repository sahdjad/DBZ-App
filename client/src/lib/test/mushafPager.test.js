// Blättern im Muṣḥaf-Leser: Doppelseiten, Feder, Entscheidung beim Loslassen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  spreadOf, spreadPages, unitOf, unitCount, unitPages, pageOfUnit, autoSpread,
  springAt, noOvershoot, springDone, rubber, velocity, releaseDir, OMEGA,
} from '../mushafPager.js';

test('Doppelseiten wie gedruckt: ungerade rechts, gerade links, 302 Paare', () => {
  assert.deepEqual(spreadPages(1), [1, 2]);
  assert.deepEqual(spreadPages(124), [247, 248]);
  assert.deepEqual(spreadPages(302), [603, 604]);
  assert.equal(unitCount(true), 302);
  assert.equal(unitCount(false), 604);
  for (let p = 1; p <= 604; p++) {
    const s = spreadOf(p);
    assert.ok(spreadPages(s).includes(p), `Seite ${p} in ihrer Doppelseite`);
    assert.equal(spreadPages(s)[0] % 2, 1, 'rechts steht die ungerade Seite');
    assert.equal(unitOf(p, false), p);
    assert.deepEqual(unitPages(p, false), [p]);
  }
  // vorwärts: erste Seite der neuen Doppelseite, rückwärts: die letzte
  assert.equal(pageOfUnit(125, true, 1), 249);
  assert.equal(pageOfUnit(123, true, -1), 246);
  assert.equal(pageOfUnit(17, false, -1), 17);
});

test('Doppelseite automatisch nur auf großen Bildschirmen im Querformat', () => {
  assert.equal(autoSpread(390, 844), false, 'iPhone hoch');
  assert.equal(autoSpread(844, 390), false, 'iPhone quer');
  assert.equal(autoSpread(820, 1180), false, 'iPad Air hoch');
  assert.equal(autoSpread(1180, 820), true, 'iPad Air quer');
  assert.equal(autoSpread(1024, 1366), false, 'iPad Pro 12,9 hoch');
  assert.equal(autoSpread(1366, 1024), true, 'iPad Pro 12,9 quer');
  assert.equal(autoSpread(1133, 744), true, 'iPad mini quer');
  assert.equal(autoSpread(1440, 900), true, 'MacBook');
  assert.equal(autoSpread(1000, 1000), false, 'quadratisches Fenster: Seiten würden zu klein');
});

test('Feder: kommt ohne Überschwingen zur Ruhe -- auch bei schnellem Wisch', () => {
  for (const [x0, v] of [[-390, 0], [-390, 3], [-200, 5], [-20, 2.5], [300, -4], [120, 0.8], [-50, -1]]) {
    const v0 = noOvershoot(x0, v, OMEGA);
    let t = 0;
    let f = springAt(x0, v0, 0);
    assert.equal(Math.round(f.x * 1000) / 1000, x0, 'startet an der Stelle des Fingers');
    while (!springDone(f) && t < 3000) {
      t += 1;
      f = springAt(x0, v0, t);
      assert.ok(Math.sign(f.x) === Math.sign(x0) || Math.abs(f.x) < 0.5, `kein Überschwingen (x0=${x0}, v=${v}, t=${t}, x=${f.x})`);
    }
    assert.ok(t < 700, `zur Ruhe nach ${t} ms`);
  }
  // Fingertempo wird übernommen, solange es nicht überschwingt
  assert.equal(noOvershoot(-390, 2), 2);
  assert.equal(noOvershoot(-20, 2.5), 20 * OMEGA);
  assert.equal(noOvershoot(-390, -1), -1, 'Bewegung vom Ziel weg bleibt erhalten');
});

test('Rand: Widerstand wächst, bleibt unter der Seitenbreite', () => {
  assert.equal(rubber(0, 400), 0);
  assert.ok(rubber(100, 400) < 100 && rubber(100, 400) > 0);
  assert.ok(rubber(-400, 400) > -400 && rubber(-400, 400) < 0);
  assert.ok(rubber(4000, 400) < 400);
});

test('Fingertempo aus den letzten 100 ms', () => {
  const s = [{ t: 0, x: 0 }, { t: 50, x: 10 }, { t: 100, x: 40 }, { t: 116, x: 60 }];
  assert.ok(Math.abs(velocity(s, 120) - (60 - 10) / 66) < 1e-9);
  assert.equal(velocity(s, 300), 0, 'angehalten vor dem Loslassen');
  assert.equal(velocity([{ t: 0, x: 0 }], 10), 0);
});

test('Loslassen: Weg, Tempo, Richtung und Nachbarseite entscheiden', () => {
  const W = 414;
  assert.equal(releaseDir(0, 0, W), 0);
  assert.equal(releaseDir(80, 0.05, W), 0, 'kurz gezogen, langsam: zurück');
  assert.equal(releaseDir(230, 0.05, W), 1, 'über die Mitte gezogen: weiter');
  assert.equal(releaseDir(-230, -0.02, W), -1, 'zurückblättern');
  assert.equal(releaseDir(40, 0.9, W), 1, 'kurzer schneller Wisch: weiter');
  assert.equal(releaseDir(-40, -0.9, W), -1);
  assert.equal(releaseDir(300, -0.8, W), 0, 'Richtung umgekehrt: zurück');
  assert.equal(releaseDir(6, 2, W), 0, 'zu kurz für einen Wisch (Tippen)');
  assert.equal(releaseDir(300, 1, W, { canNext: false }), 0, 'letzte Seite: nicht weiter');
  assert.equal(releaseDir(-300, -1, W, { canPrev: false }), 0, 'erste Seite: nicht zurück');
  // schnelles Weiterblättern: die Seite ist vom vorigen Wisch noch unterwegs
  // (liegt 0,6 Breiten vor dem Ziel), der Finger wischt erneut vorwärts
  assert.equal(releaseDir(-0.6 * W, 1.2, W, { finger: { moved: 90, against: 0 } }), 1, 'nächster Wisch zählt');
  assert.equal(releaseDir(-0.6 * W, -1.2, W, { finger: { moved: 90, against: 0 } }), -1, 'zurückgewischt');
  // erst zur vorigen Seite gezogen, dann zurückgeschnippt: bleibt
  assert.equal(releaseDir(-80, 1.1, W, { finger: { moved: 220, against: 150 } }), 0);
  // langsam: nächstgelegene Seite
  assert.equal(releaseDir(-0.56 * W, 0.02, W, { finger: { moved: 100, against: 0 } }), -1);
  assert.equal(releaseDir(-0.3 * W, 0.02, W, { finger: { moved: 100, against: 0 } }), 0);
});
