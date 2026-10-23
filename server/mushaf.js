// Eingebaute Muṣḥaf-Seiten (Muṣḥaf al-Madīnah 1421H, KFGQPC QCF V2) aus
// client/public/mushaf/qpc-v2 -- erzeugt und geprüft von scripts/build-mushaf.mjs.
// Die App lädt Seiten und Schriften direkt als statische Dateien; der Server
// braucht sie nur für Sprünge (Sure -> Seite) und die frühere Seiten-API.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'public', 'mushaf', 'qpc-v2');
let meta = null;
const pages = new Map();

export function mushafMeta() {
  if (!meta) meta = JSON.parse(fs.readFileSync(path.join(DIR, 'meta.json'), 'utf8'));
  return meta;
}

/** Seite 1..604 (eingebaute Daten). Wirft 'NOT_FOUND'. */
export function mushafPage(page) {
  const p = Number(page);
  if (!(Number.isInteger(p) && p >= 1 && p <= 604)) {
    const e = new Error('Unbekannte Seite');
    e.code = 'NOT_FOUND';
    throw e;
  }
  if (!pages.has(p)) pages.set(p, JSON.parse(fs.readFileSync(path.join(DIR, 'pages', `${String(p).padStart(3, '0')}.json`), 'utf8')));
  return pages.get(p);
}

/** Seite, auf der Ayah 1 einer Sure steht. */
export function surahStartPage(surah) {
  const n = Number(surah);
  if (!(Number.isInteger(n) && n >= 1 && n <= 114)) {
    const e = new Error('Unbekannte Sure');
    e.code = 'NOT_FOUND';
    throw e;
  }
  return mushafMeta().surahStartPage[n - 1];
}

// Frühere Form von /api/quran/page/:p (ältere, noch geöffnete App-Versionen):
// nur Textzeilen, Sure-Köpfe als „starts", ohne Seitenschrift (font: null) --
// diese Versionen zeigen dann den richtigen Text dieser Seite als Fließtext.
export function legacyPage(page) {
  const d = mushafPage(page);
  const starts = {};
  let head = null;
  const lines = [];
  for (const l of d.lines) {
    if (l.type === 'surah') { head = { surah: l.surah, name: l.name, bismillah: false }; continue; }
    if (l.type === 'basmala') { if (head) head.bismillah = true; continue; }
    if (head) { starts[l.words[0].v] = head; head = null; }
    lines.push({ n: l.n, words: l.words.map((w) => ({ t: w.t, tj: w.t, v: w.v, ...(w.e ? { e: true } : { p: w.p }) })) });
  }
  return { page: d.page, juz: null, firstVerse: d.firstVerse, lastVerse: d.lastVerse, surahs: d.surahs, starts, lines, fontPage: d.page, font: null };
}
