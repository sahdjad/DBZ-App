// Qur'an-weite Stellensuche: Wo im ganzen Qur'an passt das zuletzt Gehörte?
//
// Grundlage sind ausschließlich echte, endgültige Erkennungsergebnisse (die
// Wörter, die das Modell festgeschrieben hat). Gesucht wird eine Folge von
// Mushaf-Wörtern, die zu einer Folge gehörter Wörter passt -- mit denselben
// Vergleichsregeln wie beim Mitlesen (hifzEngine.js) und kleiner Toleranz
// für ein überzähliges oder verschlucktes Wort.
//
// Bewusst vorsichtig: gefunden ist eine Stelle erst, wenn sie
//  - lang genug ist (mehrere Wörter, kurze Wörter zählen halb),
//  - bis an das zuletzt Gehörte heranreicht (die Person ist JETZT dort), und
//  - eindeutig ist (keine zweite Stelle passt fast genauso gut).
// Wiederholte Formulierungen (z. B. „فبأي آلاء ربكما تكذبان") ergeben deshalb
// „mehrdeutig" -- dann wird auf weitere Wörter gewartet bzw. die Auswahl
// angeboten, statt auf die erste passende Ayah zu springen.
import { phonetic, matchesWord, closeEnough } from '../hifzEngine.js';

export const LOCATE_DEFAULTS = Object.freeze({
  minScore: 3.5, // ~4 Wörter (kurze Wörter zählen halb)
  margin: 1.5, // so viel besser als die zweitbeste Stelle
  tailSlack: 2, // höchstens so viele gehörte Wörter nach dem Treffer (Störwörter)
  maxCandidates: 6,
});

const weight = (token) => (token.length >= 3 ? 1 : 0.5);

/**
 * @param index  buildQuranIndex(...)
 * @param heard  normalisierte gehörte Wörter (älteste zuerst)
 * @param opts   { range: [from, to) global, minScore, margin, tailSlack }
 * @returns {{ status: 'found'|'ambiguous'|'none', best?, candidates }}
 *   Kandidat: { start, end, words:[g...], heardFrom, heardTo, score }
 *   end = nächstes erwartetes Wort (global, exklusiv)
 */
export function locate(index, heard, opts = {}) {
  const o = { ...LOCATE_DEFAULTS, ...opts };
  const [from, to] = o.range || [0, index.total];
  const n = heard.length;
  const W = (i) => ({ token: index.token[i], alt: index.alt[i] });
  const ok = (j, i) => j >= 0 && j < n && i >= from && i < to && heard[j].length >= 1 && matchesWord(heard[j], W(i));
  // Von der Erkennung in zwei Teile zerlegtes Wort („يا" + „ايها" = ياايها).
  const split = (j, i) => j >= 0 && j + 1 < n && i >= from && i < to
    && [index.token[i], index.alt[i]].some((t) => t.length >= 4 && closeEnough(heard[j] + heard[j + 1], t));
  const runs = [];
  const seeded = new Set(); // (j, i) bereits als Anker probiert

  for (let j = 0; j < n; j++) {
    if (heard[j].length < 3) continue; // kurze Wörter taugen nicht als Anker
    const list = index.byKey.get(phonetic(heard[j]));
    if (!list) continue;
    for (const i0 of list) {
      if (i0 < from || i0 >= to) continue;
      seeded.add(j * 100000 + i0);
      // Schon von einem früheren Anker derselben Folge erfasst? (Nur wenn das
      // Wort davor selbst als Anker probiert wurde -- kurze oder anders
      // getrennte Wörter wie „قل" oder „ي أيها" sind nie Anker.)
      if (seeded.has((j - 1) * 100000 + i0 - 1) && ok(j - 1, i0 - 1)) continue;
      let jj = j, ii = i0, score = 0, errors = 0, misses = 0;
      const words = [];
      // Rückwärts: Wörter direkt davor, die selbst kein Anker sein konnten
      // (kurz, anders getrennt) -- ohne Toleranz.
      let bj = j - 1, bi = i0 - 1;
      const before = [];
      while (bi >= from) {
        if (ok(bj, bi)) { before.unshift(bi); score += weight(heard[bj]); bj--; bi--; continue; }
        if (split(bj - 1, bi)) { before.unshift(bi); score += 1; bj -= 2; bi--; continue; }
        break;
      }
      const heardFrom = bj + 1;
      while (jj < n && ii < to) {
        if (ok(jj, ii)) { words.push(ii); score += weight(heard[jj]); jj++; ii++; misses = 0; continue; }
        if (split(jj, ii)) { words.push(ii); score += 1; jj += 2; ii++; misses = 0; continue; }
        if (misses || errors >= Math.max(1, Math.floor(words.length / 4))) break;
        // Ein oder zwei überzählige gehörte Wörter (Störlaut, Neuansatz) ...
        if (ok(jj + 1, ii)) { jj++; errors++; misses++; continue; }
        if (ok(jj + 2, ii)) { jj += 2; errors++; misses++; continue; }
        // ... oder ein verschlucktes/ausgelassenes Mushaf-Wort.
        if (ok(jj, ii + 1)) { ii++; errors++; misses++; continue; }
        break;
      }
      score -= 0.5 * errors;
      const all = [...before, ...words];
      if (all.length >= 2) runs.push({ start: all[0], end: all[all.length - 1] + 1, words: all, heardFrom, heardTo: jj, score });
    }
  }
  if (!runs.length) return { status: 'none', candidates: [] };

  // Nur Stellen, die bis zum zuletzt Gehörten reichen; je Ort (Ende ±3 Wörter)
  // der beste Lauf.
  const live = runs.filter((r) => n - r.heardTo <= o.tailSlack).sort((a, b) => b.score - a.score);
  const places = [];
  for (const r of live) {
    if (places.some((p) => Math.abs(p.end - r.end) <= 3)) continue;
    places.push(r);
    if (places.length >= o.maxCandidates) break;
  }
  const best = places[0];
  if (!best || best.score < o.minScore) return { status: 'none', candidates: places };
  const second = places[1];
  if (second && second.score > best.score - o.margin) return { status: 'ambiguous', candidates: places.filter((p) => p.score > best.score - o.margin) };
  return { status: 'found', best, candidates: places };
}
