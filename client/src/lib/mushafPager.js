// Blättern im Muṣḥaf-Leser (components/mushaf/MushafShell.jsx): die reinen
// Rechenteile ohne DOM -- Seitengeometrie, Doppelseiten, Feder, Entscheidung
// beim Loslassen. Geprüft in test/mushafPager.test.js.

// ---- Geometrie der gedruckten Seite (em der Seitenschrift) -----------------
// Gemessen über alle 8.790 Zeilen (scripts/check-mushaf-widths.mjs): längste
// Zeile 16,22 em. Zeilenabstand so, dass 15 Zeilen das Seitenverhältnis des
// Drucks ergeben.
export const PAGE_EM = 16.4;
export const SLOT_EM = 1.72;
export const LINES = 15;
export const RESERVE = 72; // Höhe für Rand oben (Sure/Juzʼ) und unten (Hizb/Seitenzahl)
export const RESERVE_FRAMED = 100; // dazu Luft über und unter dem Seitenrahmen
export const FRAME_INSET = 20; // seitlicher Rahmen um die Seite (je Seite)
export const GUTTER = 14; // halber Abstand zwischen den Seiten einer Doppelseite
export const PANE_GAP = 24; // Abstand zwischen zwei Seiten beim Blättern

// ---- Doppelseite -------------------------------------------------------------
// Wie im gedruckten Muṣḥaf liegen 1|2, 3|4 … 603|604 nebeneinander: die
// ungerade Seite rechts, die gerade links.
export const spreadOf = (page) => Math.ceil(page / 2);
export const spreadPages = (s) => [2 * s - 1, 2 * s]; // [rechts, links]
export const unitCount = (spread) => (spread ? 302 : 604);
export const unitOf = (page, spread) => (spread ? spreadOf(page) : page);
export const unitPages = (unit, spread) => (spread ? spreadPages(unit) : [unit]);
/** Seite, die nach dem Blättern gilt: vorwärts die erste der neuen Einheit, rückwärts die letzte. */
export function pageOfUnit(unit, spread, dir = 1) {
  if (!spread) return unit;
  const [right, left] = spreadPages(unit);
  return dir < 0 ? left : right;
}

/** Seitengröße (px Schrift) für eine Fläche w×h -- wie MushafPage sie berechnet. */
export function fitSize(w, h, { framed = false } = {}) {
  const availW = Math.min(w, 900) - 20 - (framed ? FRAME_INSET : 0);
  const availH = Math.max(320, h - (framed ? RESERVE_FRAMED : RESERVE));
  return Math.min(availW / PAGE_EM, availH / (LINES * SLOT_EM));
}

/**
 * Doppelseite automatisch? Nur auf großen Bildschirmen (iPad, Mac) und nur,
 * wenn jede der beiden Seiten fast so groß bleibt wie eine Einzelseite --
 * also im Querformat, nicht im Hochformat. Handys zeigen immer eine Seite.
 */
export function autoSpread(w, h) {
  if (!(w > 0 && h > 0) || Math.min(w, h) < 600) return false;
  const single = fitSize(w, h, { framed: true });
  const double = fitSize(w / 2 - GUTTER, h, { framed: true });
  return double >= single * 0.85;
}

// ---- Bewegung ----------------------------------------------------------------
// Kritisch gedämpfte Feder: kommt so schnell wie möglich zur Ruhe, ohne über
// das Ziel hinauszuschwingen. x = Abstand zum Ziel (px), v = px/ms.
export const OMEGA = 0.02; // 1/ms -- 95 % des Wegs nach rund 240 ms

/** Anfangsgeschwindigkeit so begrenzen, dass die Feder nicht überschwingt. */
export function noOvershoot(x0, v0, w = OMEGA) {
  if (x0 > 0) return Math.max(v0, -w * x0);
  if (x0 < 0) return Math.min(v0, -w * x0);
  return 0;
}

/** Lage und Geschwindigkeit der Feder t ms nach dem Start. */
export function springAt(x0, v0, t, w = OMEGA) {
  const b = v0 + w * x0;
  const e = Math.exp(-w * t);
  const x = (x0 + b * t) * e;
  return { x, v: (b - w * (x0 + b * t)) * e };
}
export const springDone = ({ x, v }) => Math.abs(x) < 0.5 && Math.abs(v) < 0.02;

/** Über den Rand hinaus gezogen: zunehmender Widerstand (wie iOS). */
export function rubber(over, dim, c = 0.55) {
  if (!over || !(dim > 0)) return 0;
  return Math.sign(over) * (1 - 1 / ((Math.abs(over) * c) / dim + 1)) * dim;
}

/** Fingergeschwindigkeit (px/ms) aus den Positionen der letzten 100 ms. */
export function velocity(samples, now) {
  const recent = samples.filter((s) => now - s.t <= 100);
  if (recent.length < 2) return 0;
  const a = recent[0];
  const b = recent[recent.length - 1];
  if (now - b.t > 60) return 0; // vor dem Loslassen angehalten
  return (b.x - a.x) / Math.max(8, b.t - a.t);
}

export const FLICK = 0.3; // px/ms: schneller Wisch blättert auch bei kurzem Weg

/**
 * Loslassen: +1 (nächste Seite), -1 (vorige) oder 0 (zurückfedern).
 * offset: Lage der Seite gegenüber der Ausgangsseite (px, + = Richtung nächste
 * Seite), v: Fingertempo px/ms, width: Breite einer Seite.
 * finger: { moved, against } -- Weg des Fingers in dieser Geste und wie weit er
 * zwischendurch entgegen der Wischrichtung lief (px).
 *  - Schneller Wisch: eine Seite in Wischrichtung. Auch wenn die Seite vom
 *    vorigen Wisch noch unterwegs war (schnelles Weiterblättern) -- nur nicht,
 *    wenn der Finger erst in die andere Richtung gezogen hat (dann zurück).
 *  - Langsam losgelassen: die Seite, die der Lage (mit kurzem Nachlauf) am
 *    nächsten ist.
 * Nie mehr als eine Seite, nie über den Anfang/das Ende hinaus.
 */
export function releaseDir(offset, v, width, { canNext = true, canPrev = true, finger = null } = {}) {
  const ok = (d) => (d > 0 ? canNext : d < 0 ? canPrev : true);
  const moved = finger ? finger.moved : Math.abs(offset);
  if (Math.abs(v) >= FLICK && moved >= 10) {
    const f = Math.sign(v);
    if (offset * f > 0) return ok(f) ? f : 0;
    return finger && finger.against < 12 && ok(f) ? f : 0;
  }
  const dir = Math.max(-1, Math.min(1, Math.round((offset + v * 100) / width))) || 0;
  return ok(dir) ? dir : 0;
}
