// Wandelt eine bereits geprüfte, bereits angezeigte Mushaf-SEITE (dieselbe
// Quelle wie in QuranReader.jsx/MushafReader: /quran/page/:p, quran.com API
// v4 "verses/by_page") in das Abschnittsformat der Hifz-Engine
// (client/src/lib/hifzEngine.js) um. Reine, ohne Netzwerkzugriff testbare
// Funktion – die Seite selbst wird vom aufrufenden Code geladen.
//
// Erfindet keine Wortkoordinaten: „line" ist die ECHTE gedruckte Mushaf-
// Zeilennummer dieser Seite (line_number aus der Quelle) – nicht mehr eine
// künstliche Gruppierung wie zuvor. „position" ist die Wortnummer innerhalb
// der Ayah, gezählt in Lesereihenfolge auf dieser Seite (dieselbe Zählweise,
// die auch das Wort-Mitlesen beim Audio in MushafReader nutzt).
import { cleanQuran } from './quranText.js';

export class EmptyPassageError extends Error {}

export function pageToHifzPassage(pageData) {
  const words = [];
  const counter = {};
  for (const line of pageData.lines || []) {
    for (const w of line.words || []) {
      if (w.e) continue; // Ayah-Endzeichen ist kein zu rezitierendes Wort
      const [s, a] = w.v.split(':').map(Number);
      counter[w.v] = (counter[w.v] || 0) + 1;
      words.push({
        id: `${w.v}:${counter[w.v]}`,
        surah: s,
        ayah: a,
        position: counter[w.v],
        line: line.n,
        text: cleanQuran(w.t),
        glyph: w.g || null, // nur fürs Rendering (echte Seitenschrift), nicht Teil der Engine-Validierung
      });
    }
  }
  if (!words.length) throw new EmptyPassageError('Kein Text auf dieser Seite gefunden.');

  return {
    id: `hifz:page:${pageData.page}`,
    title: `Seite ${pageData.page}`,
    edition: pageData.font === 'v1' ? 'KFGQPC Uthmanic HAFS v1 (offizielle Mushaf-Seitenschrift)' : 'quran-uthmani',
    riwaya: "Hafs ʿan ʿĀṣim",
    source: 'quran.com API v4 (verses/by_page) · dieselbe Seite wie in der Mushaf-Lese-Ansicht',
    page: pageData.page,
    juz: pageData.juz,
    words,
  };
}
