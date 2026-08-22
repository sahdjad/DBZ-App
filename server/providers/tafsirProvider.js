// TafsirProvider – gekapselte, austauschbare Quelle für Tafsir pro Ayah.
//
// Standardquelle: quran.com API v4 (frei, ohne Schlüssel). Pro Ayah abrufbar,
// Ergebnis wird gecacht (Speicher + Platte). Um Quelle/Ausgaben zu ändern, nur
// dieses Modul anpassen.

import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.TAFSIR_API_BASE || 'https://api.quran.com/api/v4';

// Verfügbare, geprüfte Ausgaben.
// Hinweis zu 'de': Ein deutscher *Tafsir* ist frei nicht verfügbar. Wir bieten
// daher eine deutschsprachige, sinngemäße *Übersetzung der Ayah* (Bubenheim) –
// im Frontend klar als Übersetzung (kein Tafsir) gekennzeichnet.
export const TAFSIR_EDITIONS = {
  saadi: { id: 91, name: 'as-Saʿdī', language: 'ar', dir: 'rtl' },
  ibnkathir: { id: 169, name: 'Ibn Kathīr (gekürzt)', language: 'en', dir: 'ltr' },
  de: { id: 27, name: 'Deutsch · Bubenheim', language: 'de', dir: 'ltr', kind: 'translation' },
};

const CACHE_DIR = path.join(
  process.env.DBZ_DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data'),
  'tafsir-cache',
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
    /* Cache ist optional */
  }
}

export function listTafsirEditions() {
  return Object.entries(TAFSIR_EDITIONS).map(([key, e]) => ({ key, name: e.name, language: e.language, kind: e.kind || 'tafsir' }));
}

/**
 * Lädt den Tafsir zu einer Ayah in der gewünschten Ausgabe. Cache-first.
 * Wirft bei Nichterreichbarkeit einen Fehler mit code 'PROVIDER_UNAVAILABLE'.
 */
export async function getTafsir(surah, ayah, editionKey = 'saadi') {
  const ed = TAFSIR_EDITIONS[editionKey] || TAFSIR_EDITIONS.saadi;
  const s = Number(surah);
  const a = Number(ayah);
  if (!(s >= 1 && s <= 114) || !(a >= 1)) {
    const e = new Error('Ungültige Ayah');
    e.code = 'NOT_FOUND';
    throw e;
  }
  const key = `${editionKey}_${s}_${a}`;
  if (memo.has(key)) return memo.get(key);
  const disk = readDisk(key);
  if (disk) {
    memo.set(key, disk);
    return disk;
  }

  // Tafsir -> tafsirs-Endpunkt; Übersetzung (de) -> verses-Endpunkt.
  const url = ed.kind === 'translation'
    ? `${BASE}/verses/by_key/${s}:${a}?translations=${ed.id}`
    : `${BASE}/tafsirs/${ed.id}/by_ayah/${s}:${a}`;
  let json;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch (err) {
    const e = new Error('Tafsir-Quelle nicht erreichbar');
    e.code = 'PROVIDER_UNAVAILABLE';
    e.cause = err;
    throw e;
  }

  const text = ed.kind === 'translation'
    ? (json?.verse?.translations?.[0]?.text || '')
    : (json?.tafsir?.text || '');
  const data = {
    surah: s,
    ayah: a,
    edition: editionKey,
    editionName: ed.name,
    language: ed.language,
    dir: ed.dir,
    kind: ed.kind || 'tafsir',
    text,
  };
  memo.set(key, data);
  writeDisk(key, data);
  return data;
}
