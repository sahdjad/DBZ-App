// Baut die Muṣḥaf-Seiten der App: Muṣḥaf al-Madīnah, Ḥafṣ ʿan ʿĀṣim, Druck
// 1421H (KFGQPC „QCF V2"), 604 Seiten à 15 Zeilen -- Wörter als Glyphen der
// offiziellen Seitenschriften des King Fahd Complex (eine Schrift je Seite).
//
//   node scripts/build-mushaf.mjs <mushaf-layout-Repo> <qpc-v2-15-lines.db>
//
// Quellen (beide aus quran.com/Quran Foundation-Daten abgeleitet, unabhängig
// voneinander aufbereitet):
//  1. github.com/zonetecde/mushaf-layout (Zweig v2, mushaf/QPC2 + fonts/QPC2):
//     Seiten, Zeilen, Wörter mit QCF-V2-Glyphen; Seitenschriften unverändert.
//  2. QUL (Tarteel) „QCF V2 (1421H print)" Layout-Datenbank (pages-Tabelle:
//     Zeilentyp, zentriert, Wortbereich) -- dient als Gegenprobe jeder Zeile.
// Zusätzlich wird jedes Wort gegen den Tanzil-Text des Qur'an-Index
// (client/public/quran/index-v2.json) geprüft.
//
// Ausgabe: client/public/mushaf/qpc-v2/{pages/NNN.json, fonts/…, meta.json}.
// Jede Abweichung bricht ab -- es wird nie eine unvollständige Seite geschrieben.
// Danach: python3 scripts/check-mushaf-fonts.py (prüft jeden Glyphen gegen die
// Zeichentabelle seiner Seitenschrift).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { normalize } from '../client/src/lib/hifzEngine.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [srcRepo, qulDb] = process.argv.slice(2);
if (!srcRepo || !qulDb) throw new Error('Aufruf: node scripts/build-mushaf.mjs <mushaf-layout-Repo> <qpc-v2-15-lines.db>');
const OUT = path.join(root, 'client/public/mushaf/qpc-v2');
const pad = (n) => String(n).padStart(3, '0');
const fail = (msg) => { throw new Error(msg); };
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arabicNumber = (n) => String(n).replace(/\d/g, (d) => ARABIC_DIGITS[d]);
const isNumber = (t) => /^[٠-٩]+$/.test(t);

// ---- Tanzil-Index (Wortfolge je Ayah) ------------------------------------------
const ix = JSON.parse(fs.readFileSync(path.join(root, 'client/public/quran/index-v2.json'), 'utf8'));
const ayahWords = new Map(); // "s:a" -> [token|alt, …]
{
  let ga = 0;
  for (let s = 1; s <= 114; s++) for (let a = 1; a <= ix.surahAyat[s - 1]; a++) ayahWords.set(`${s}:${a}`, ix.ayat[ga++].split(' '));
}

// ---- QUL-Gegenprobe ------------------------------------------------------------
const db = new DatabaseSync(qulDb, { readOnly: true });
const qulInfo = db.prepare('select * from info').get();
if (!/V2/.test(qulInfo.name) || qulInfo.number_of_pages !== 604 || qulInfo.lines_per_page !== 15) fail(`Falsche QUL-Ausgabe: ${JSON.stringify(qulInfo)}`);
const qul = new Map(); // page -> [rows]
for (const r of db.prepare('select * from pages order by page_number, line_number').all()) {
  if (!qul.has(r.page_number)) qul.set(r.page_number, []);
  qul.get(r.page_number).push(r);
}
const QUL_TYPE = { 'surah-header': 'surah_name', basmala: 'basmallah', text: 'ayah' };

// ---- Geprüfte Text-Ausnahmen (nur das Begleit-Unicode, nie die Glyphen) -----------
// 11:13:3: Quelle schreibt „افْتَرَاهُ" -- im Muṣḥaf (und bei Tanzil) „ٱفْتَرَىٰهُ".
const TEXT_FIX = { '11:13:3': ['افْتَرَاهُ ۖ', 'ٱفْتَرَىٰهُ ۖ'] };
// 12:39:1/12:41:1: „يَـٰصَـٰحِبَىِ" und Tanzils „يَٰصَىٰحِبَىِ" sind dieselbe
// Schreibung (kleines Alif mit Tatweel bzw. auf Alif maqṣūra) -- nur anders kodiert.
const SAME_SPELLING = new Set(['12:39:1', '12:41:1']);

// ---- Bekannter Quellfehler: verrutschtes Endzeichen -------------------------------
// Die QCF-Glyphen einer Seite sind in gedruckter Lesereihenfolge nummeriert.
// Steht ein allein stehendes Endzeichen VOR Wörtern seiner eigenen Ayah (in der
// Quelle einmal: 84:21 auf Seite 589, Zeile 13 statt 14), gehört es hinter das
// letzte Wort dieser Ayah -- das belegen Glyph-Nummer und QUL-Zeilenzählung.
const repairs = [];
function repairEndMarkers(raw) {
  const text = raw.lines.filter((l) => l.type === 'text');
  for (const line of text) {
    for (let i = 0; i < line.words.length; i++) {
      const w = line.words[i];
      if (!isNumber(w.word)) continue;
      const v = w.location.split(':').slice(0, 2).join(':');
      const all = text.flatMap((l) => l.words.map((x) => ({ l, x })));
      const at = all.findIndex((o) => o.x === w);
      const later = all.slice(at + 1).filter((o) => !isNumber(o.x.word) && o.x.location.startsWith(`${v}:`));
      if (!later.length) continue;
      const lastWord = later[later.length - 1];
      const cp = (str) => [...str.replace(/\s/g, '')].map((c) => c.codePointAt(0));
      const before = cp(lastWord.x.qpcV2).pop();
      if (cp(w.qpcV2)[0] !== before + 1) fail(`Seite ${raw.page}: Endzeichen ${w.location} verrutscht, Glyph passt nicht`);
      line.words.splice(i, 1);
      lastWord.x.word += ` ${w.word}`;
      lastWord.x.qpcV2 += ` ${w.qpcV2}`;
      repairs.push(`Seite ${raw.page}: Endzeichen ${v} von Zeile ${line.line} hinter ${lastWord.x.location} (Zeile ${lastWord.l.line}) gesetzt`);
      i--;
    }
  }
}

// ---- Zeilenfehler der Quelle (durch Glyphbreiten belegt) -------------------------
// Die KFGQPC-Glyphen sind dem gedruckten Muṣḥaf entnommen: jede gedruckte Zeile
// ergibt mit ihnen (ohne Zusatzabstand) dieselbe Breite. Gemessen über alle
// 8.790 Zeilen (scripts/check-mushaf-widths.mjs) liegen alle Zeilen innerhalb
// weniger Prozent -- außer fünf Zeilenpaaren, die alle ein Wort aus mehreren
// Glyphen enthalten („بَعْدَ مَا", „مَّرْقَدِنَا ۜ ۗ", „ذَرْعًۭا"). Dort steht in
// der Quelle EIN Wort in der falschen Zeile (+12…18 % / −9…15 %). Die unten
// genannte Verschiebung bringt beide Zeilen jeweils auf ±1 % (Seiten 177, 400,
// 443 stimmen damit auch mit QUL überein).
const LINE_FIX = [
  { page: 27, from: 14, to: 15, word: '2:181:5', text: 'فَإِنَّمَآ' },
  { page: 177, from: 11, to: 12, word: '8:6:10', text: 'وَهُمْ' },
  { page: 400, from: 5, to: 6, word: '29:33:11', text: 'وَقَالُوا۟' },
  { page: 443, from: 12, to: 13, word: '36:52:10', text: 'ٱلرَّحْمَـٰنُ' },
  // „بَعْدَ مَا" (13:37) ist im Druck auf zwei Zeilen verteilt: „بَعْدَ" am Ende
  // von Zeile 6, „مَا" am Anfang von Zeile 7.
  { page: 254, splitAt: 7, into: 6, word: '13:37:8', text: 'بَعْدَ مَا' },
];
function applyLineFixes(p, lines) {
  for (const f of LINE_FIX.filter((x) => x.page === p)) {
    const byN = (n) => lines.find((l) => l.n === n && l.type === 'text') || fail(`Zeilenkorrektur S. ${p}: Zeile ${n} fehlt`);
    const loc = (w) => `${w.v}:${w.p}`;
    if (f.splitAt) {
      const B = byN(f.splitAt);
      const A = byN(f.into);
      const w = B.words[0];
      const gl = [...w.g.replace(/\s/g, '')];
      if (loc(w) !== f.word || normalize(w.t) !== normalize(f.text) || gl.length !== 2) fail(`Zeilenkorrektur S. ${p}: Quelle hat sich geändert (${loc(w)} ${w.t})`);
      const [t1, t2] = w.t.split(' ');
      A.words.push({ ...w, t: t1, g: gl[0], part: 1 });
      B.words[0] = { ...w, t: t2, g: gl[1], part: 2 };
      repairs.push(`Seite ${p}: „${f.text}" (${f.word}) wie im Druck auf Zeile ${f.into}/${f.splitAt} verteilt`);
      continue;
    }
    const A = byN(f.from);
    const B = byN(f.to);
    const w = A.words[A.words.length - 1];
    if (w.e || normalize(w.t) !== normalize(f.text) || loc(w) !== f.word) {
      fail(`Zeilenkorrektur S. ${p}: Quelle hat sich geändert (${loc(w)} ${w.t})`);
    }
    A.words.pop();
    B.words.unshift(w);
    repairs.push(`Seite ${p}: „${w.t}" (${loc(w)}) von Zeile ${f.from} an den Anfang von Zeile ${f.to}`);
  }
}

// ---- Seiten bauen + prüfen --------------------------------------------------------
const stats = { fixed: [], multi: [], qulDiff: [], splitWords: [], quarters: 0, words: 0, ends: 0, lines: 0, centered: 0, headers: 0, basmala: 0, textMismatch: [] };
let expectWordId = 1; // QUL-Wortnummern laufen über den ganzen Qur'an (Wörter + Endzeichen)
let lastLoc = [1, 1, 0]; // zuletzt gesehenes Wort (Sure, Ayah, Nr.) -> Reihenfolge
const seenEnd = new Set();
const tzNext = new Map(); // "s:a" -> nächstes Tanzil-Wort (1-basiert)
const surahHeaderPage = new Array(115).fill(0);
const pageFirstAyah = []; // Seite -> "s:a" des ersten Worts
const pages = [];

for (let p = 1; p <= 604; p++) {
  const raw = JSON.parse(fs.readFileSync(path.join(srcRepo, 'mushaf/QPC2', `page-${pad(p)}.json`), 'utf8'));
  repairEndMarkers(raw);
  const rows = qul.get(p) || [];
  const nLines = p <= 2 ? 8 : 15;
  if (raw.page !== p || raw.lines.length !== nLines || rows.length !== nLines) fail(`Seite ${p}: ${raw.lines.length}/${rows.length} Zeilen statt ${nLines}`);
  const lines = [];
  const surahsOnPage = new Set();
  for (let i = 0; i < nLines; i++) {
    const L = raw.lines[i];
    const q = rows[i];
    if (L.line !== i + 1 || q.line_number !== i + 1) fail(`Seite ${p}: Zeilennummer ${L.line}/${q.line_number} statt ${i + 1}`);
    if (QUL_TYPE[L.type] !== q.line_type) fail(`Seite ${p} Zeile ${i + 1}: Typ ${L.type} ≠ QUL ${q.line_type}`);
    const n = i + 1;
    if (L.type === 'surah-header') {
      const s = Number(L.surah);
      if (s !== q.surah_number || surahHeaderPage[s]) fail(`Seite ${p} Zeile ${n}: Sure-Kopf ${L.surah} (QUL ${q.surah_number})`);
      surahHeaderPage[s] = p;
      stats.headers++;
      lines.push({ n, type: 'surah', surah: s, name: L.text.replace(/^سورة\s+/, '') });
      continue;
    }
    if (L.type === 'basmala') {
      if (L.qpcV2 !== 'ﭑﭒﭓ') fail(`Seite ${p} Zeile ${n}: unbekannte Basmala-Glyphen`);
      stats.basmala++;
      lines.push({ n, type: 'basmala', g: L.qpcV2 });
      continue;
    }
    // Textzeile: Wörter (Endzeichen getrennt, wie gedruckt eigenes Zeichen).
    const words = [];
    let units = 0; // Zähleinheiten wie bei QUL
    const split = []; // Wörter mit Leerzeichen im Text (für die Gegenprobe)
    for (const w of L.words) {
      const [s, a, k] = w.location.split(':').map(Number);
      const v = `${s}:${a}`;
      const expected = ayahWords.get(v) || fail(`Seite ${p}: unbekannte Ayah ${v}`);
      surahsOnPage.add(s);
      const tz = tzNext.get(v) || 1; // nächstes Tanzil-Wort dieser Ayah
      if (isNumber(w.word)) { // Endzeichen allein am Zeilenanfang (eigene Position)
        if (w.word !== arabicNumber(a) || k !== lastLoc[2] + 1 || /\s/.test(w.qpcV2)) fail(`Seite ${p}: Endzeichen ${w.location} ungültig`);
        if (seenEnd.has(v) || lastLoc[0] !== s || lastLoc[1] !== a || tz !== expected.length + 1) fail(`Seite ${p}: Endzeichen ${v} an falscher Stelle`);
        seenEnd.add(v);
        words.push({ t: w.word, g: w.qpcV2, v, e: 1 });
        stats.ends++;
        units++;
        continue;
      }
      // Reihenfolge: nächstes Wort derselben Ayah oder erstes Wort der nächsten.
      const [ls, la, lk] = lastLoc;
      const next = (s === ls && a === la && k === lk + 1)
        || (k === 1 && seenEnd.has(`${ls}:${la}`) && ((s === ls && a === la + 1) || (s === ls + 1 && a === 1)));
      if (!next) fail(`Seite ${p}: Wort ${w.location} folgt nicht auf ${lastLoc.join(':')}`);
      lastLoc = [s, a, k];
      // Endzeichen in derselben Zeile ist im Datensatz an das letzte Wort gehängt.
      let text = w.word;
      if (TEXT_FIX[w.location]) {
        const [from, to] = TEXT_FIX[w.location];
        if (!text.startsWith(from)) fail(`Text-Korrektur ${w.location}: Quelle hat sich geändert`);
        text = to + text.slice(from.length);
        stats.fixed.push(`${w.location}: ${from} → ${to}`);
      }
      let glyph = w.qpcV2;
      let endText = null;
      let endGlyph = null;
      const m = /^(.*\S)\s+([٠-٩]+)$/.exec(text);
      if (m) {
        const cut = glyph.lastIndexOf(' ');
        const gs = [glyph.slice(0, cut), glyph.slice(cut + 1)];
        if (cut < 1 || [...gs[1]].length !== 1 || m[2] !== arabicNumber(a)) fail(`Seite ${p}: Endzeichen-Glyph ${w.location} ungültig`);
        [text, endText] = [m[1], m[2]];
        [glyph, endGlyph] = gs;
      }
      // Viertel-Zeichen ۞ (Rubʿ al-Ḥizb) vor dem ersten Wort eines Viertels:
      // eigener Glyph, bleibt beim Wort (wie gedruckt).
      const quarter = /^۞\s+/.test(text);
      if (quarter) {
        if (k !== 1 || [...glyph.replace(/\s/g, '')].length < 2) fail(`Seite ${p}: Viertel-Zeichen bei ${w.location} ungültig`);
      } else if (/\s/.test(glyph) && !/\s/.test(text)) fail(`Seite ${p}: Leerzeichen im Glyph von ${w.location}`);
      if (!glyph) fail(`Seite ${p}: Glyph fehlt bei ${w.location}`);
      // Text gegen Tanzil (Vergleichsform ohne Vokale; Pausenzeichen zählen
      // nicht). Ein Wort mit Leerzeichen (z. B. „بَعْدَ مَا", „إِلْ يَاسِينَ") ist
      // dort ein oder mehrere Wörter -- x/xn halten die Zuordnung fest, die der
      // Auswendig-Modus braucht (Wortnummer im Qur'an-Index).
      const parts = text.split(/\s+/).filter((x) => /[\u0621-\u064A\u0671]/.test(x));
      units += parts.length;
      if (parts.length > 1) split.push(`${w.location} „${text}"`);
      const same = (str, i) => {
        if (i < 1 || i > expected.length) return false;
        const [token, alt = token] = expected[i - 1].split('|');
        const n1 = normalize(str);
        const n2 = normalize(str, { dagger: 'drop' }) || n1;
        return [token, alt].includes(n1) || [token, alt].includes(n2);
      };
      let xn = 0;
      if (same(parts.join(''), tz) || SAME_SPELLING.has(w.location)) xn = 1;
      else if (parts.length > 1 && parts.every((x, i) => same(x, tz + i))) xn = parts.length;
      else stats.textMismatch.push(`${w.location} ${text} ≠ ${expected[tz - 1] || '–'}`);
      tzNext.set(v, tz + Math.max(1, xn));
      if (endText && tz + Math.max(1, xn) !== expected.length + 1) fail(`Seite ${p}: Endzeichen nach ${w.location}, aber Tanzil-Ayah hat ${expected.length} Wörter`);
      words.push({ t: text, g: glyph, v, p: k, ...(tz !== k ? { x: tz } : {}), ...(xn > 1 ? { xn } : {}), ...(quarter ? { q: 1 } : {}) });
      if (xn > 1) stats.multi.push(`${w.location} → Tanzil ${v}:${tz}-${tz + xn - 1}`);
      if (quarter) stats.quarters++;
      stats.words++;
      if (endText) {
        if (seenEnd.has(v)) fail(`Seite ${p}: Endzeichen ${v} doppelt`);
        seenEnd.add(v);
        words.push({ t: endText, g: endGlyph, v, e: 1 });
        stats.ends++;
        units++;
      }
    }
    if (!words.length) fail(`Seite ${p} Zeile ${n}: leere Textzeile`);
    if (split.length) stats.splitWords.push(`S. ${p} Z. ${n}: ${split.join(', ')}`);
    const line = { n, type: 'text', words };
    if (q.is_centered === 1) { line.c = 1; stats.centered++; }
    lines.push(line);
    stats.lines++;
  }
  applyLineFixes(p, lines);
  // QUL-Gegenprobe jeder Zeile (Zähleinheiten fortlaufend über den Qur'an).
  for (const line of lines) {
    if (line.type !== 'text') continue;
    const q = rows[line.n - 1];
    const units = line.words.reduce((u, w) => u + (w.e ? 1 : w.t.split(/\s+/).filter((x) => /[\u0621-\u064A\u0671]/.test(x)).length), 0);
    const qulUnits = q.last_word_id - q.first_word_id + 1;
    if (q.first_word_id !== expectWordId || qulUnits !== units) {
      stats.qulDiff.push(`S. ${p} Z. ${line.n}: hier ${units}, QUL ${qulUnits}${q.first_word_id !== expectWordId ? ` (QUL beginnt bei ${q.first_word_id}, erwartet ${expectWordId})` : ''}`);
    }
    expectWordId = q.last_word_id + 1;
  }
  const textWords = lines.filter((l) => l.type === 'text').flatMap((l) => l.words);
  // Glyph-Nummern müssen in Lesereihenfolge streng steigen (Reihenfolge-Beweis).
  let lastCp = 0;
  for (const w of textWords) for (const ch of w.g.replace(/\s/g, '')) {
    const c = ch.codePointAt(0);
    if (c <= lastCp) fail(`Seite ${p}: Glyph-Reihenfolge verletzt bei ${w.v}`);
    lastCp = c;
  }
  if (!textWords.length) fail(`Seite ${p}: keine Wörter`);
  const first = textWords[0];
  if (first.e || first.p !== 1) fail(`Seite ${p} beginnt mitten in einer Ayah (${first.v}:${first.p})`);
  pageFirstAyah.push(first.v);
  pages.push({
    page: p,
    edition: 'qpc-v2',
    firstVerse: first.v,
    lastVerse: textWords[textWords.length - 1].v,
    surahs: [...surahsOnPage],
    lines,
  });
}

// ---- Vollständigkeit ---------------------------------------------------------------
const totalWords = ix.words;
for (const [v, list] of ayahWords) if (tzNext.get(v) !== list.length + 1) fail(`Ayah ${v}: ${(tzNext.get(v) || 1) - 1} von ${list.length} Tanzil-Wörtern zugeordnet`);
console.log(`Wörter, die mehreren Tanzil-Wörtern entsprechen: ${stats.multi.join(', ') || 'keine'}`);
if (seenEnd.size !== 6236 || stats.ends !== 6236) fail(`${seenEnd.size} Endzeichen statt 6236`);
const qulMax = db.prepare("select max(last_word_id) m from pages where line_type = 'ayah'").get().m;
if (!stats.qulDiff.length && expectWordId - 1 !== qulMax) fail(`QUL-Wortnummern: ${expectWordId - 1} geprüft, QUL bis ${qulMax}`);
if (stats.headers !== 114 || surahHeaderPage.slice(1).some((x) => !x)) fail('Nicht alle 114 Sure-Köpfe gefunden');
if (stats.basmala !== 112) fail(`${stats.basmala} Basmala-Zeilen statt 112`);
if (stats.textMismatch.length) fail(`Text weicht vom Tanzil-Text ab:\n${stats.textMismatch.slice(0, 40).join('\n')}`);

// Seitenanfänge als globale Ayah-Nummer (für den Qur'an-Index).
const globalAyah = new Map();
{ let ga = 0; for (let s = 1; s <= 114; s++) for (let a = 1; a <= ix.surahAyat[s - 1]; a++) globalAyah.set(`${s}:${a}`, ++ga); }
const pageStart = pageFirstAyah.map((v) => globalAyah.get(v));
for (let i = 1; i < 604; i++) if (!(pageStart[i] > pageStart[i - 1])) fail(`Seitenanfänge nicht aufsteigend bei Seite ${i + 1}`);
const surahStartPage = []; // Seite mit Ayah 1 jeder Sure
for (let s = 1; s <= 114; s++) {
  const ga = globalAyah.get(`${s}:1`);
  let p = 1;
  while (p < 604 && pageStart[p] <= ga) p++;
  surahStartPage.push(p);
}

// ---- Schreiben ----------------------------------------------------------------------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'pages'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
for (const pg of pages) fs.writeFileSync(path.join(OUT, 'pages', `${pad(pg.page)}.json`), JSON.stringify(pg));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const fonts = {};
const copyFont = (from, name) => {
  const src = path.join(srcRepo, 'fonts/QPC2', from);
  fs.copyFileSync(src, path.join(OUT, 'fonts', name)); // unverändert (Nutzungsbedingungen KFGQPC)
  fonts[name] = sha(src);
};
for (let p = 1; p <= 604; p++) copyFont(`p${pad(p)}.woff2`, `p${pad(p)}.woff2`);
copyFont('QPC2BSML.ttf', 'QPC2BSML.ttf');
let srcCommit = null;
try { srcCommit = fs.readFileSync(path.join(srcRepo, '.git/HEAD'), 'utf8').trim(); if (srcCommit.startsWith('ref:')) srcCommit = fs.readFileSync(path.join(srcRepo, '.git', srcCommit.slice(5)), 'utf8').trim(); } catch { /* optional */ }
const meta = {
  edition: 'qpc-v2',
  title: 'Muṣḥaf al-Madīnah – Ḥafṣ ʿan ʿĀṣim – King Fahd Complex, Druck 1421H (QCF V2)',
  pages: 604,
  linesPerPage: 15,
  sources: {
    layout: `github.com/zonetecde/mushaf-layout @ ${srcCommit || '?'} (mushaf/QPC2, aus quran.com-Daten)`,
    check: `QUL (Tarteel) Layout-Datenbank „${qulInfo.name}"`,
    text: 'Tanzil Quran Text (Uthmani) – Gegenprobe jedes Worts',
    fonts: 'KFGQPC QCF V2 Seitenschriften + QCF2BSML, unverändert (© King Fahd Glorious Quran Printing Complex)',
  },
  counts: { words: stats.words, ayahEnds: stats.ends, textLines: stats.lines, centeredLines: stats.centered, surahHeaders: stats.headers, basmala: stats.basmala },
  pageStart,
  surahStartPage,
  surahHeaderPage: surahHeaderPage.slice(1),
  fonts,
};
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta));
console.log(`Korrigiert: ${[...repairs, ...stats.fixed].join('; ') || 'nichts'}`);
console.log(`Abweichungen zu QUL (${stats.qulDiff.length}):\n  ${stats.qulDiff.join('\n  ')}`);
console.log(`Wörter mit Leerzeichen im Text (geprüft):\n  ${stats.splitWords.join('\n  ')}`);
console.log(`OK: 604 Seiten, ${stats.words} Wörter, ${stats.ends} Endzeichen, ${stats.lines} Textzeilen (${stats.centered} zentriert), ${stats.headers} Sure-Köpfe, ${stats.basmala} Basmala`);
