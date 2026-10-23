// Baut den Qur'an-weiten Suchindex für „Auswendig rezitieren" (freie
// Rezitation: die App findet selbst, wo man gerade rezitiert).
//
//   npm i --no-save quran-meta@7
//   node scripts/build-quran-index.mjs <quran-uthmani.json>
//
// Eingabe: Tanzil-Uthmani-Text (tanzil.net, z. B. über api.alquran.cloud
// „quran-uthmani" oder die quran.json der Tilawa-Release v0.2.0) als Liste
// [{ surah, ayah, text_uthmani }]. Seiten-/Juz-Grenzen (Medina-Mushaf, Hafs)
// aus quran-meta (MIT).
//
// Ausgabe: client/public/quran/index-v1.json -- NUR Vergleichsformen der Wörter
// (ohne Vokalzeichen, siehe normalize in hifzEngine.js), nie angezeigt. Der
// angezeigte Text kommt weiterhin unverändert aus der Mushaf-Seitenquelle.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PageList, JuzList } from 'quran-meta/hafs';
import { normalize } from '../client/src/lib/hifzEngine.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (src.length !== 6236) throw new Error(`6236 Ayat erwartet, ${src.length} gefunden`);

const BASMALA = 4;
const surahAyat = new Array(114).fill(0);
const ayat = src.map((x) => {
  surahAyat[x.surah - 1] = Math.max(surahAyat[x.surah - 1], x.ayah);
  // Nur echte Wörter: Pausenzeichen (ۚ ۖ ۗ …) stehen im Tanzil-Text als eigene Tokens.
  let words = x.text_uthmani.replace(/﻿/g, '').split(/\s+/).filter((t) => /[ء-يٱ]/.test(t));
  // Tanzil setzt die Basmala vor Ayah 1 jeder Sure (außer 1 und 9) -- sie ist
  // dort nicht Teil der Ayah (im Mushaf eigene Kopfzeile).
  if (x.ayah === 1 && x.surah !== 1 && x.surah !== 9) words = words.slice(BASMALA);
  return words.map((w) => {
    const token = normalize(w);
    const alt = normalize(w, { dagger: 'drop' }) || token;
    if (!token || token.includes(' ')) throw new Error(`Ungültiges Wort ${x.surah}:${x.ayah} ${w}`);
    return alt === token ? token : `${token}|${alt}`;
  }).join(' ');
});
const words = ayat.reduce((n, a) => n + a.split(' ').length, 0);
const out = {
  v: 1,
  source: 'Tanzil Quran Text (Uthmani, tanzil.net) -- nur normalisierte Vergleichsformen; Seiten/Juz: quran-meta (MIT), Medina-Mushaf Hafs',
  words,
  surahAyat,
  pageStart: PageList.slice(1, 605), // globale Ayah-Nr. (1..6236), mit der Seite 1..604 beginnt
  juzStart: JuzList.slice(1, 31),
  ayat,
};
if (out.pageStart.length !== 604 || out.juzStart.length !== 30) throw new Error('Seiten/Juz-Liste unvollständig');
fs.writeFileSync(path.join(root, 'client/public/quran/index-v1.json'), JSON.stringify(out));
console.log(`${words} Wörter, ${ayat.length} Ayat geschrieben`);
