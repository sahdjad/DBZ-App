// QuranProvider – gekapselte, austauschbare Datenquelle für Qur'an-Text,
// Übersetzung und Rezitator-Audio (docs/INTEGRATIONS.md §11/§12).
//
// WICHTIG: Es wird KEIN Qur'an-Text in der App hartcodiert. Der Text wird zur
// Laufzeit aus einer geprüften, frei nutzbaren Quelle geladen und gecacht. Um die
// Quelle zu wechseln, muss nur dieses Modul angepasst werden.
//
// Standardquelle: AlQuran Cloud (api.alquran.cloud).
//   - Arabisch (Uthmani):        quran-uthmani   (Text gemeinfrei, Tanzil-Projekt)
//   - Deutsche Übersetzung:      de.bubenheim    (Bubenheim & Elyas)
//   - Rezitator-Audio:           ar.alafasy      (Mishary Alafasy)

import fs from 'node:fs';
import path from 'node:path';
import { SURAHS, surahByN } from '../quran.js';

const BASE = process.env.QURAN_API_BASE || 'https://api.alquran.cloud/v1';
const ED_ARABIC = process.env.QURAN_ED_ARABIC || 'quran-uthmani';
const ED_TRANSLATION = process.env.QURAN_ED_TRANSLATION || 'de.bubenheim';
const ED_AUDIO = process.env.QURAN_ED_AUDIO || 'ar.alafasy';

const CACHE_DIR = path.join(process.env.DBZ_DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data'), 'quran-cache');
const memo = new Map();

function cacheKey(n, translation, reciter) {
  return `${n}_${translation}_${reciter}`;
}

function readDiskCache(key) {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    /* ignore */
  }
  return null;
}

function writeDiskCache(key, data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(data));
  } catch {
    /* Cache ist optional */
  }
}

export function listSurahs() {
  return SURAHS;
}

/**
 * Lädt eine Sure mit Arabisch + Übersetzung + Audio. Cache-first (Speicher, Platte),
 * dann externe Quelle. Wirft bei Nichterreichbarkeit einen Fehler mit code 'PROVIDER_UNAVAILABLE'.
 */
export async function getSurah(n, { translation = ED_TRANSLATION, reciter = ED_AUDIO } = {}) {
  const num = Number(n);
  const meta = surahByN(num);
  if (!meta) {
    const e = new Error('Unbekannte Sure');
    e.code = 'NOT_FOUND';
    throw e;
  }
  const key = cacheKey(num, translation, reciter);
  if (memo.has(key)) return memo.get(key);
  const disk = readDiskCache(key);
  if (disk) {
    memo.set(key, disk);
    return disk;
  }

  const editions = [ED_ARABIC, translation, reciter].join(',');
  const url = `${BASE}/surah/${num}/editions/${editions}`;
  let json;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch (err) {
    const e = new Error('Qur\'an-Datenquelle nicht erreichbar');
    e.code = 'PROVIDER_UNAVAILABLE';
    e.cause = err;
    throw e;
  }

  const parts = json?.data || [];
  const arabicE = parts.find((p) => p.edition?.identifier === ED_ARABIC) || parts[0];
  const transE = parts.find((p) => p.edition?.type === 'translation') || parts[1];
  // Audio-Editionen tragen type 'versebyverse'; wir erkennen sie an der ID bzw.
  // daran, dass die Ayat ein 'audio'-Feld besitzen.
  const audioE =
    parts.find((p) => p.edition?.identifier === reciter) ||
    parts.find((p) => p.ayahs?.some((a) => a.audio));

  const ayahs = (arabicE?.ayahs || []).map((a, i) => ({
    n: a.numberInSurah,
    arabic: a.text,
    translation: transE?.ayahs?.[i]?.text || '',
    audio: audioE?.ayahs?.[i]?.audio || null,
  }));

  const data = {
    number: num,
    name: meta.name,
    ayahCount: meta.ayat,
    // Offenbarungsort aus der Quelle (Meccan/Medinan) – für die Sura-Info.
    revelationType: arabicE?.revelationType || null,
    bismillah: num !== 1 && num !== 9, // Al-Fatihah enthält Basmala als Ayah, At-Tawbah hat keine
    translationName: transE?.edition?.name || translation,
    reciterName: audioE?.edition?.englishName || reciter,
    ayahs,
  };
  memo.set(key, data);
  writeDiskCache(key, data);
  return data;
}
