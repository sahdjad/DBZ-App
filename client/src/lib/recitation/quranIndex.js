// Qur'an-weiter Wortindex für „Auswendig rezitieren" (freie Rezitation):
// alle 77.430 Wörter in Lesereihenfolge, je mit Sure/Ayah/Wortnummer, Seite
// und Vergleichsform. Quelle: client/public/quran/index-v2.json (gebaut von
// scripts/build-quran-index.mjs). Nur Vergleichsformen -- angezeigt wird immer
// der Originaltext der Mushaf-Seite.
//
// Ein Wort heißt hier global über seine Nummer `g` (0..77429). Die Wort-ID
// `s:a:k` (k = Wortnummer in der Ayah, ab 1) ist dieselbe wie die der
// Muṣḥaf-Seite (Feld p in client/public/mushaf/qpc-v2, scripts/build-mushaf.mjs;
// einzige Ausnahme 37:130 „إِلْ يَاسِينَ": dort Feld x/xn).
import { phonetic } from '../hifzEngine.js';

export const INDEX_URL = '/quran/index-v2.json';

export function buildQuranIndex(data) {
  if (!data || data.v !== 2 || data.ayat?.length !== 6236) throw new Error('Qur\'an-Index ungültig.');
  const total = data.words;
  const surah = new Uint8Array(total);
  const ayah = new Uint16Array(total);
  const pos = new Uint16Array(total);
  const ayahNo = new Uint16Array(total); // globale Ayah-Nr. 1..6236
  const token = new Array(total);
  const alt = new Array(total);
  const ayahFirst = new Uint32Array(6237); // globale Ayah -> erstes Wort (6236 = Ende)
  const ayahPage = new Uint16Array(6237);
  const surahFirstAyah = new Uint16Array(116); // Sure -> globale Nr. ihrer ersten Ayah
  const pageStart = data.pageStart;

  let g = 0;
  let ga = 0;
  let page = 1;
  for (let s = 1; s <= 114; s++) {
    surahFirstAyah[s] = ga + 1;
    for (let a = 1; a <= data.surahAyat[s - 1]; a++) {
      ga++;
      while (page < 604 && pageStart[page] <= ga) page++;
      ayahPage[ga] = page;
      ayahFirst[ga] = g;
      const toks = data.ayat[ga - 1].split(' ');
      for (let k = 0; k < toks.length; k++) {
        const [t, al] = toks[k].split('|');
        surah[g] = s; ayah[g] = a; pos[g] = k + 1; ayahNo[g] = ga;
        token[g] = t; alt[g] = al || t;
        g++;
      }
    }
  }
  if (g !== total || ga !== 6236) throw new Error('Qur\'an-Index unvollständig.');
  surahFirstAyah[115] = 6237;

  // Invertierter Index über die Lautform: schnelle Kandidatensuche.
  const byKey = new Map();
  const add = (key, i) => {
    if (!key || key.length < 2) return;
    let list = byKey.get(key);
    if (!list) { list = []; byKey.set(key, list); }
    if (list[list.length - 1] !== i) list.push(i);
  };
  for (let i = 0; i < total; i++) {
    add(phonetic(token[i]), i);
    if (alt[i] !== token[i]) add(phonetic(alt[i]), i);
  }

  const globalAyah = (s, a) => surahFirstAyah[s] + a - 1;
  const firstWordOfPage = (p) => ayahFirst[pageStart[p - 1]];
  const index = {
    total,
    surah, ayah, pos, ayahNo, token, alt, byKey, pageStart,
    surahAyat: data.surahAyat,
    juzStart: data.juzStart,
    id: (i) => `${surah[i]}:${ayah[i]}:${pos[i]}`,
    verseKey: (i) => `${surah[i]}:${ayah[i]}`,
    pageOf: (i) => ayahPage[ayahNo[i]],
    globalAyah,
    /** Erstes Wort einer Ayah (global). */
    wordOf: (s, a, k = 1) => ayahFirst[globalAyah(s, a)] + k - 1,
    /** Bereich [from, to) der Wörter einer Seite. */
    pageRange: (p) => [firstWordOfPage(p), p >= 604 ? total : firstWordOfPage(p + 1)],
    surahRange: (s) => [ayahFirst[surahFirstAyah[s]], s >= 114 ? total : ayahFirst[surahFirstAyah[s + 1]]],
    juzRange: (j) => [ayahFirst[data.juzStart[j - 1]], j >= 30 ? total : ayahFirst[data.juzStart[j]]],
    /** Bereich [from, to) von Sure s, Ayah a1 bis a2 (inklusive). */
    ayahRange: (s, a1, a2) => {
      const from = ayahFirst[globalAyah(s, a1)];
      const ga2 = globalAyah(s, a2);
      return [from, ga2 >= 6236 ? total : ayahFirst[ga2 + 1]];
    },
    /** Passt die Ayah-Grenze? (Wort ist das letzte seiner Ayah) */
    isAyahEnd: (i) => i + 1 >= total || ayahNo[i + 1] !== ayahNo[i],

    // ---- Navigation (Inhaltsverzeichnis, Seitenränder) ----
    meccan: data.meccan || [],
    /** Seite einer Ayah. */
    pageOfAyah: (s, a) => ayahPage[globalAyah(s, a)],
    surahStartPage: (s) => ayahPage[surahFirstAyah[s]],
    juzStartPage: (j) => ayahPage[data.juzStart[j - 1]],
    /** Viertel (Rubʿ al-Hizb) 1..240: { n, surah, ayah, page, preview, juz, hizb, quarter } */
    quarters: (data.hizbStart || []).map((ga, i) => {
      let s = 1;
      while (s < 114 && surahFirstAyah[s + 1] <= ga) s++;
      return { n: i + 1, surah: s, ayah: ga - surahFirstAyah[s] + 1, page: ayahPage[ga], preview: data.hizbPreview?.[i] || '', juz: Math.floor(i / 8) + 1, hizb: Math.floor(i / 4) + 1, quarter: (i % 4) + 1 };
    }),
    /** Juzʼ, Hizb und Viertel am Anfang einer Seite. */
    pageInfo: (p) => {
      const ga = pageStart[p - 1];
      let j = 1;
      while (j < 30 && data.juzStart[j] <= ga) j++;
      const hs = data.hizbStart || [];
      let q = 0;
      while (q + 1 < hs.length && hs[q + 1] <= ga) q++;
      let s = 1;
      while (s < 114 && surahFirstAyah[s + 1] <= ga) s++;
      return { juz: j, hizb: Math.floor(q / 4) + 1, quarter: (q % 4) + 1, surah: s, ayah: ga - surahFirstAyah[s] + 1 };
    },
  };
  return index;
}

let loading = null;
/** Lädt den Index einmal (Browser); danach aus dem Speicher. */
export function loadQuranIndex(fetchImpl = globalThis.fetch) {
  if (!loading) {
    loading = fetchImpl(INDEX_URL, { credentials: 'same-origin' })
      .then((r) => { if (!r.ok) throw new Error(`Qur'an-Index konnte nicht geladen werden (${r.status})`); return r.json(); })
      .then(buildQuranIndex)
      .catch((err) => { loading = null; throw err; });
  }
  return loading;
}
