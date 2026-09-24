// Lädt die offizielle Mushaf-Seitenschrift (KFGQPC HAFS v1) je Seite nach.
// Die Glyphen liegen im „Private Use Area"-Bereich – ohne die passende
// Schrift würden sie als wirre Ersatzzeichen erscheinen. Wird von der
// Mushaf-Lese-Ansicht UND dem Auswendig-Modus (echte Seitenansicht) geteilt,
// damit beide dieselbe, bereits geladene Schrift wiederverwenden.
const loadedFontPages = new Set();
const fontPromises = new Map();

export function ensurePageFont(page) {
  const p = Number(page);
  if (!(p >= 1 && p <= 604)) return Promise.resolve(false);
  if (loadedFontPages.has(p)) return Promise.resolve(true);
  if (fontPromises.has(p)) return fontPromises.get(p);
  let pr;
  try {
    const ff = new FontFace(`qcf-p${p}`, `url('/api/quran/font/v1/${p}') format('woff2')`, { display: 'swap' });
    pr = ff.load().then((f) => { document.fonts.add(f); loadedFontPages.add(p); return true; }).catch(() => false);
  } catch { pr = Promise.resolve(false); }
  fontPromises.set(p, pr);
  return pr;
}

export const isPageFontLoaded = (page) => loadedFontPages.has(Number(page));
