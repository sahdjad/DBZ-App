// ChapterAudioProvider – EINE durchgehende Audiodatei pro Sure + Ayah-Zeitmarken.
//
// Warum: Einzelne Ayah-Dateien lassen sich nie wirklich lückenlos aneinander-
// reihen (jede Datei muss neu dekodiert/gestartet werden -> hörbare Pause).
// quran.com liefert pro Rezitator eine einzige Murattal-Aufnahme je Sure PLUS
// Millisekunden-Zeitmarken je Ayah. Damit spielt das Frontend eine einzige
// Datei ab (echte, ununterbrochene Rezitation wie auf YouTube) und springt für
// Bereich/Wiederholung/Hervorhebung nur an die passenden Zeitpunkte.
//
// Geschwindigkeit regelt das Frontend über audio.playbackRate (Tonhöhe bleibt
// dank preservesPitch natürlich). Cache-first (Speicher + Platte).

import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.QURAN_COM_API_BASE || 'https://api.quran.com/api/v4';

// Unsere Rezitator-IDs -> quran.com recitation_id (nur solche MIT Zeitmarken,
// damit die lückenlose Wiedergabe für ALLE angebotenen Rezitatoren gleich gut
// funktioniert). Reihenfolge = Anzeige-Reihenfolge.
export const CHAPTER_RECITERS = [
  { id: 'ar.alafasy', qid: 7, name: 'Mishary Al-Afasy' },
  { id: 'ar.husary', qid: 6, name: 'Mahmoud Al-Husary' },
  { id: 'ar.abdulbasitmurattal', qid: 2, name: 'Abdul Basit (Murattal)' },
  { id: 'ar.minshawi', qid: 9, name: 'Muhammad Al-Minshawi' },
  { id: 'ar.abdurrahmaansudais', qid: 3, name: 'Abdurrahman As-Sudais' },
  { id: 'ar.shaatree', qid: 4, name: 'Abu Bakr Ash-Shatri' },
  { id: 'ar.saoodshuraym', qid: 10, name: 'Saud Ash-Shuraim' },
];
const QID = Object.fromEntries(CHAPTER_RECITERS.map((r) => [r.id, r.qid]));
const DEFAULT_ID = 'ar.alafasy';

const CACHE_DIR = path.join(
  process.env.DBZ_DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data'),
  'audio-cache',
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

/**
 * Liefert für eine Sure die durchgehende Audiodatei eines Rezitators samt
 * Ayah-Zeitmarken (Millisekunden). Fällt bei unbekanntem Rezitator auf den
 * Standard zurück. Wirft 'NOT_FOUND' bzw. 'PROVIDER_UNAVAILABLE'.
 */
export async function getChapterAudio(surah, reciterId) {
  const num = Number(surah);
  if (!(num >= 1 && num <= 114)) {
    const e = new Error('Unbekannte Sure');
    e.code = 'NOT_FOUND';
    throw e;
  }
  const rid = QID[reciterId] ? reciterId : DEFAULT_ID;
  const qid = QID[rid];
  const key = `chapaudio_${qid}_${num}`;
  if (memo.has(key)) return memo.get(key);
  const disk = readDisk(key);
  if (disk) {
    memo.set(key, disk);
    return disk;
  }

  let json;
  try {
    json = await fetchJson(`${BASE}/chapter_recitations/${qid}/${num}?segments=true`);
  } catch (err) {
    const e = new Error('Audio-Quelle nicht erreichbar');
    e.code = 'PROVIDER_UNAVAILABLE';
    e.cause = err;
    throw e;
  }
  const af = json.audio_file || {};
  if (!af.audio_url) {
    const e = new Error('Keine Audiodatei');
    e.code = 'PROVIDER_UNAVAILABLE';
    throw e;
  }
  const ayahs = (af.timestamps || []).map((t) => ({
    n: Number(String(t.verse_key).split(':')[1]),
    from: t.timestamp_from | 0,
    to: t.timestamp_to | 0,
  }));
  const data = {
    reciter: rid,
    reciterId: qid,
    reciterName: (CHAPTER_RECITERS.find((r) => r.id === rid) || {}).name || rid,
    url: af.audio_url,
    ayahs,
  };
  memo.set(key, data);
  writeDisk(key, data);
  return data;
}
