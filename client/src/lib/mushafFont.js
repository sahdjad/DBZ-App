// Seitenschriften des Muṣḥaf al-Madīnah (King Fahd Complex, QCF V2, Druck
// 1421H): JEDE der 604 Seiten hat eine eigene Schrift, in der jedes Wort der
// Seite ein eigenes Zeichen ist (scripts/build-mushaf.mjs, unverändert
// eingebunden unter /mushaf/qpc-v2/fonts). Ohne GENAU diese Schrift wäre die
// Seite falsch -- deshalb wird eine Seite erst gezeigt, wenn ihre Schrift
// geladen ist (nie mit Ersatzschrift).
//
// Speicher: höchstens MAX_FONTS Seitenschriften bleiben im Dokument; die am
// längsten nicht gezeigten werden entfernt (beim nächsten Mal kommen sie
// sofort aus dem Browser-/Offline-Speicher).
const BASE = '/mushaf/qpc-v2/fonts';
const MAX_FONTS = 24;
const pad = (p) => String(p).padStart(3, '0');

export const pageFontFamily = (p) => `qpc2-p${p}`;
export const BASMALA_FONT = 'qpc2-bsml';

const faces = new Map(); // page -> FontFace (geladen)
const promises = new Map(); // page -> Promise<boolean>
const used = new Map(); // page -> letzter Zugriff (für die Auslagerung)
let pinned = new Set(); // gerade angezeigte Seiten -- nie auslagern

function evict() {
  if (faces.size <= MAX_FONTS) return;
  const old = [...used.entries()].filter(([p]) => faces.has(p) && !pinned.has(p)).sort((a, b) => a[1] - b[1]);
  for (const [p] of old) {
    if (faces.size <= MAX_FONTS) break;
    try { document.fonts.delete(faces.get(p)); } catch { /* egal */ }
    faces.delete(p);
    promises.delete(p);
  }
}

function load(key, family, url) {
  if (promises.has(key)) return promises.get(key);
  const pr = (async () => {
    const face = new FontFace(family, `url('${url}')`, { display: 'block' });
    await face.load();
    document.fonts.add(face);
    faces.set(key, face);
    return true;
  })().catch(() => { promises.delete(key); return false; });
  promises.set(key, pr);
  return pr;
}

/** Seitenschrift laden. true = geladen, false = nicht erreichbar. */
export function ensurePageFont(page) {
  const p = Number(page);
  if (!(p >= 1 && p <= 604) || typeof FontFace !== 'function') return Promise.resolve(false);
  used.set(p, Date.now());
  return load(p, pageFontFamily(p), `${BASE}/p${pad(p)}.woff2`).then((ok) => { if (ok) evict(); return ok; });
}
export const isPageFontLoaded = (page) => faces.has(Number(page));

/** Schrift der Basmala-Zeilen (QCF2BSML). */
export function ensureBasmalaFont() {
  if (typeof FontFace !== 'function') return Promise.resolve(false);
  return load('bsml', BASMALA_FONT, `${BASE}/QPC2BSML.ttf`);
}
export const isBasmalaFontLoaded = () => faces.has('bsml');

/** Diese Seiten werden gerade angezeigt (bleiben geladen). */
export function pinPageFonts(pages) {
  pinned = new Set(pages.map(Number));
  for (const p of pinned) used.set(p, Date.now());
}
