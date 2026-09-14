// AyahAudioProvider – Rezitatoren, die es NICHT als durchgehende Sure-Datei mit
// Wort-Zeitmarken gibt (quran.com), sondern nur Ayah-für-Ayah. Quelle:
// cdn.islamic.network (alquran.cloud), das die App-CSP bereits erlaubt.
//
// Wiedergabe: Der Client spielt die Ayah-Dateien nacheinander ab und hebt die
// laufende Ayah hervor (kein Wort-Mitlesen – dafür gibt es keine Zeitmarken).

const CDN = 'https://cdn.islamic.network/quran/audio';

// Geprüft erreichbar (HTTP 200) – Bitrate je Edition wie verfügbar.
export const AYAH_RECITERS = [
  { id: 'aa.ajmi', edition: 'ar.ahmedajamy', br: 128, name: 'Ahmad Al-Ajmi' },
  { id: 'aa.hudhaify', edition: 'ar.hudhaify', br: 128, name: 'Ali Al-Hudhaifi (Medina)' },
  { id: 'aa.ayyoub', edition: 'ar.muhammadayyoub', br: 128, name: 'Muhammad Ayyoub (Medina)' },
  { id: 'aa.maher', edition: 'ar.mahermuaiqly', br: 128, name: 'Maher Al-Muaiqly' },
  { id: 'aa.basfar', edition: 'ar.abdullahbasfar', br: 64, name: 'Abdullah Basfar' },
  { id: 'aa.jibreel', edition: 'ar.muhammadjibreel', br: 128, name: 'Muhammad Jibreel' },
];

// Ayah-Anzahl je Sure (Hafs/Kufa-Zählung, Summe 6236) – für die globale
// Ayah-Nummer, die cdn.islamic.network verwendet.
const AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

function globalStart(surah) {
  let n = 0;
  for (let i = 0; i < surah - 1; i++) n += AYAH_COUNTS[i];
  return n;
}

/** Liefert die Ayah-Audio-URLs einer Sure für einen Ayah-Rezitator. */
export function getAyahAudio(surah, reciterId) {
  const s = Number(surah);
  if (!(s >= 1 && s <= 114)) {
    const e = new Error('Unbekannte Sure');
    e.code = 'NOT_FOUND';
    throw e;
  }
  const r = AYAH_RECITERS.find((x) => x.id === reciterId) || AYAH_RECITERS[0];
  const count = AYAH_COUNTS[s - 1];
  const start = globalStart(s);
  const ayahs = [];
  for (let a = 1; a <= count; a++) {
    ayahs.push({ n: a, url: `${CDN}/${r.br}/${r.edition}/${start + a}.mp3` });
  }
  return { reciter: r.id, reciterName: r.name, mode: 'ayah', surah: s, ayahs };
}
