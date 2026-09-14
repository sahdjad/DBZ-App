// MushafFontProvider – die offiziellen KFGQPC-Seitenschriften (HAFS v1).
//
// Der gedruckte Medina-Mushaf sieht deshalb „wie echte Seiten" aus, weil JEDE
// der 604 Seiten eine EIGENE Schriftdatei hat: die Glyphen sind so entworfen,
// dass jede Zeile die Breite exakt füllt (kein gestreckter Blocksatz, keine
// Lücken). quran.com/Aya nutzen genau diese Schriften.
//
// Da die App-CSP nur Schriften vom eigenen Server erlaubt (font-src 'self'),
// wird die Seitenschrift hier serverseitig geladen, zwischengespeichert und
// unter /api/quran/font/v1/:page ausgeliefert.

import fs from 'node:fs';
import path from 'node:path';

// Offizielle Quelle (quran.com CDN). Liefert font/woff2 je Seite (1..604).
const FONT_BASE =
  process.env.MUSHAF_FONT_BASE || 'https://static.qurancdn.com/fonts/quran/hafs/v1/woff2';

const CACHE_DIR = path.join(
  process.env.DBZ_DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data'),
  'mushaf-fonts',
);
const memo = new Map(); // page -> Buffer

/** Liefert die woff2-Seitenschrift (Buffer). Cache-first (Speicher + Platte). */
export async function getMushafFont(page) {
  const p = Number(page);
  if (!(p >= 1 && p <= 604)) {
    const e = new Error('Unbekannte Seite');
    e.code = 'NOT_FOUND';
    throw e;
  }
  if (memo.has(p)) return memo.get(p);

  const file = path.join(CACHE_DIR, `p${p}.woff2`);
  try {
    if (fs.existsSync(file)) {
      const buf = fs.readFileSync(file);
      if (buf && buf.length > 100) { memo.set(p, buf); return buf; }
    }
  } catch { /* Cache optional */ }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  let buf;
  try {
    const res = await fetch(`${FONT_BASE}/p${p}.woff2`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    const e = new Error('Seitenschrift nicht erreichbar');
    e.code = 'PROVIDER_UNAVAILABLE';
    e.cause = err;
    throw e;
  } finally {
    clearTimeout(t);
  }
  // woff2-Signatur „wOF2" prüfen, damit kein Fehler-HTML gecacht wird.
  if (!(buf.length > 100 && buf.slice(0, 4).toString('latin1') === 'wOF2')) {
    const e = new Error('Ungültige Schriftdatei');
    e.code = 'PROVIDER_UNAVAILABLE';
    throw e;
  }
  memo.set(p, buf);
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, buf);
  } catch { /* Cache optional */ }
  return buf;
}
