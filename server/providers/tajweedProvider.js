// TajweedProvider – arabischer Uthmani-Text mit Tadschwid-Regel-Markierungen
// pro Ayah, plus Seiten-/Juzʼ-Nummer (für die Mushaf-Ansicht).
//
// Quelle: quran.com API v4 (frei). Der Text kommt mit AUSGESCHRIEBENEN
// Regel-Klassen (z. B. <tajweed class=ham_wasl>…</tajweed>), die im Frontend
// eindeutig eingefärbt werden. Cache-first (Speicher + Platte).

import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.QURAN_COM_API_BASE || 'https://api.quran.com/api/v4';

const CACHE_DIR = path.join(
  process.env.DBZ_DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data'),
  'tajweed-cache',
);
const memo = new Map();

function readDisk(key) {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    /* ignore */
  }
  return null;
}
function writeDisk(key, data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(data));
  } catch {
    /* Cache optional */
  }
}

async function fetchPage(n, page) {
  const url = `${BASE}/verses/by_chapter/${n}?fields=text_uthmani_tajweed,page_number,juz_number&per_page=50&page=${page}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
  clearTimeout(t);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Lädt eine Sure als Ayah-Liste mit Tadschwid-HTML + Seite/Juzʼ.
 * Wirft 'NOT_FOUND' bzw. 'PROVIDER_UNAVAILABLE'.
 */
export async function getTajweedSurah(n) {
  const num = Number(n);
  if (!(num >= 1 && num <= 114)) {
    const e = new Error('Unbekannte Sure');
    e.code = 'NOT_FOUND';
    throw e;
  }
  const key = `tajweed_${num}`;
  if (memo.has(key)) return memo.get(key);
  const disk = readDisk(key);
  if (disk) {
    memo.set(key, disk);
    return disk;
  }

  const ayahs = [];
  try {
    let page = 1;
    // Sicherheitslimit: Al-Baqara hat 286 Ayat -> max ~6 Seiten à 50.
    for (let guard = 0; guard < 12; guard++) {
      const json = await fetchPage(num, page);
      for (const v of json.verses || []) {
        ayahs.push({
          n: v.verse_number,
          html: v.text_uthmani_tajweed || '',
          page: v.page_number || null,
          juz: v.juz_number || null,
        });
      }
      const pg = json.pagination || {};
      if (!pg.next_page || page >= (pg.total_pages || page)) break;
      page = pg.next_page;
    }
  } catch (err) {
    const e = new Error('Tadschwid-Quelle nicht erreichbar');
    e.code = 'PROVIDER_UNAVAILABLE';
    e.cause = err;
    throw e;
  }

  const data = { number: num, ayahs };
  memo.set(key, data);
  writeDisk(key, data);
  return data;
}
