// MushafPageProvider – klassische Medina-Mushaf-Seitenansicht (604 Seiten).
//
// Liefert je Seite die Wörter zeilenweise angeordnet (wie im gedruckten
// Mushaf: normal 15 Zeilen), inkl. Ayah-Endzeichen und Sure-Kopf/Basmala,
// wo eine neue Sure auf der Seite beginnt. Quelle: quran.com API v4
// (verses/by_page mit Wort-Zeilennummern). Cache-first (Speicher + Platte).

import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.QURAN_COM_API_BASE || 'https://api.quran.com/api/v4';

const CACHE_DIR = path.join(
  process.env.DBZ_DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data'),
  'mushaf-cache',
);
const memo = new Map();
let chaptersMemo = null;

function readDisk(key) {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch { /* ignore */ }
  return null;
}
function writeDisk(key, data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(data));
  } catch { /* Cache optional */ }
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Sure-Metadaten (arabischer Name, Seitenbereich, Basmala ja/nein) – einmal laden.
async function getChapters() {
  if (chaptersMemo) return chaptersMemo;
  const disk = readDisk('chapters_ar');
  if (disk) { chaptersMemo = disk; return disk; }
  const json = await fetchJson(`${BASE}/chapters?language=ar`);
  const map = {};
  for (const c of json.chapters || []) {
    map[c.id] = { name: c.name_arabic, pages: c.pages, bismillah: c.bismillah_pre !== false && c.id !== 1 };
  }
  chaptersMemo = map;
  writeDisk('chapters_ar', map);
  return map;
}

/**
 * Eine Mushaf-Seite (1..604) als Zeilenstruktur.
 * Wirft 'NOT_FOUND' bzw. 'PROVIDER_UNAVAILABLE'.
 */
export async function getMushafPage(page) {
  const p = Number(page);
  if (!(p >= 1 && p <= 604)) {
    const e = new Error('Unbekannte Seite');
    e.code = 'NOT_FOUND';
    throw e;
  }
  const key = `page_${p}`;
  if (memo.has(key)) return memo.get(key);
  const disk = readDisk(key);
  if (disk) { memo.set(key, disk); return disk; }

  let json, chapters;
  try {
    [json, chapters] = await Promise.all([
      fetchJson(`${BASE}/verses/by_page/${p}?words=true&word_fields=text_uthmani,line_number,char_type_name&fields=juz_number&per_page=60`),
      getChapters(),
    ]);
  } catch (err) {
    const e = new Error('Mushaf-Quelle nicht erreichbar');
    e.code = 'PROVIDER_UNAVAILABLE';
    e.cause = err;
    throw e;
  }

  const verses = json.verses || [];
  let juz = null;
  const seenSurah = new Set();
  const starts = {}; // verseKey "s:1" -> Sure-Kopf
  // Wörter zeilenweise (Lesereihenfolge) einsammeln.
  const lineMap = new Map(); // line -> [{ t, e, v }]
  for (const v of verses) {
    if (juz == null) juz = v.juz_number || null;
    const [s, a] = v.verse_key.split(':').map(Number);
    if (a === 1 && !seenSurah.has(s)) {
      seenSurah.add(s);
      const c = chapters[s] || {};
      starts[v.verse_key] = { surah: s, name: c.name || `Sure ${s}`, bismillah: !!c.bismillah };
    }
    for (const w of v.words || []) {
      const ln = w.line_number || 1;
      if (!lineMap.has(ln)) lineMap.set(ln, []);
      lineMap.get(ln).push({ t: w.text_uthmani || w.text || '', e: w.char_type_name === 'end', v: v.verse_key });
    }
  }
  const lines = [...lineMap.keys()].sort((a, b) => a - b).map((n) => ({ n, words: lineMap.get(n) }));

  const data = {
    page: p,
    juz,
    firstVerse: verses[0]?.verse_key || null,
    lastVerse: verses[verses.length - 1]?.verse_key || null,
    surahs: [...seenSurah],
    starts,
    lines,
  };
  memo.set(key, data);
  writeDisk(key, data);
  return data;
}

// Startseite einer Sure (für Sprung aus der Surenliste in die Seitenansicht).
export async function surahStartPage(surah) {
  const chapters = await getChapters();
  const c = chapters[Number(surah)];
  return c?.pages?.[0] || 1;
}
