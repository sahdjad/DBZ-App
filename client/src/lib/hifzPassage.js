// Wandelt bereits geprüften, bereits angezeigten DBZ-Qur'an-Text (dieselbe
// Quelle wie in QuranReader.jsx: /quran/surah/:n, Tanzil-Projekt "quran-uthmani")
// in das Abschnittsformat der Hifz-Engine (client/src/lib/hifzEngine.js).
//
// Erfindet keine Wortkoordinaten: „line" ist hier eine Zeilen-GRUPPE je Ayah
// innerhalb des gewählten Abschnitts (nicht die gedruckte Mushaf-Seitenzeile –
// dafür fehlen echte Positionsdaten, siehe README des Hifz-Moduls Punkt 9).
// „position" ist die Wortnummer innerhalb der Ayah, gezählt am selben
// Originaltext, der auch in der Lese-Ansicht erscheint.
import { api } from './api.js';
import { cleanQuran } from './quranText.js';

const MAX_WORDS = 8000; // deckt auch die längste Sure (al-Baqara) vollständig ab

export class PassageTooLargeError extends Error {}
export class EmptyPassageError extends Error {}

export async function buildHifzPassage({ surahFrom, ayahFrom, surahTo, ayahTo, title }) {
  const surahCache = new Map();
  const getSurah = async (n) => {
    if (!surahCache.has(n)) surahCache.set(n, await api.get(`/quran/surah/${n}`).then((d) => d.surah));
    return surahCache.get(n);
  };

  const words = [];
  let line = 0;
  let bismillah = false;
  for (let s = Number(surahFrom); s <= Number(surahTo); s++) {
    const surah = await getSurah(s);
    const fromA = s === Number(surahFrom) ? Number(ayahFrom) : 1;
    const toA = s === Number(surahTo) ? Number(ayahTo) : surah.ayahCount;
    // Die Basmala wird – wie in der Lese-Ansicht – nur dekorativ angezeigt,
    // nie als zu erkennendes Wort erwartet (kein eigener Ayah-Vers).
    if (s === Number(surahFrom) && fromA === 1 && surah.bismillah) bismillah = true;
    for (const ayah of surah.ayahs) {
      if (ayah.n < fromA || ayah.n > toA) continue;
      line += 1;
      const tokens = cleanQuran(ayah.arabic).trim().split(/\s+/).filter(Boolean);
      tokens.forEach((text, i) => {
        words.push({ id: `${s}:${ayah.n}:${i + 1}`, surah: s, ayah: ayah.n, position: i + 1, line, text });
      });
      if (words.length > MAX_WORDS) {
        throw new PassageTooLargeError(`Dieser Abschnitt hat mehr als ${MAX_WORDS} Wörter und ist für die Auswendig-Übung zu groß. Bitte einen kürzeren Bereich wählen.`);
      }
    }
  }
  if (!words.length) throw new EmptyPassageError('Kein Text im gewählten Bereich gefunden.');

  return {
    id: `hifz:${surahFrom}:${ayahFrom}-${surahTo}:${ayahTo}`,
    title: title || (surahFrom === surahTo ? `Sure ${surahFrom}, Ayah ${ayahFrom}–${ayahTo}` : `Sure ${surahFrom}–${surahTo}`),
    edition: 'quran-uthmani (Tanzil-Projekt)',
    riwaya: "Hafs ʿan ʿĀṣim",
    source: 'AlQuran Cloud API · derselbe Text, der auch in der Lese-Ansicht der DBZ-App angezeigt wird',
    bismillah,
    words,
  };
}
