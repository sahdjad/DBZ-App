// Tadschwid-Auszeichnung einer Ayah (quran.com „text_uthmani_tajweed",
// <tajweed class=…>…</tajweed>) in Wörter zerlegen -- für die Tadschwid-
// Ansicht der Muṣḥaf-Seite, deren Wörter nach Sure:Ayah:Wortnummer zugeordnet
// werden. Pausenzeichen (ۖ ۗ ۚ …) gehören zum vorangehenden Wort.
// Gibt null zurück, wenn die Zerlegung nicht eindeutig ist (dann bleibt die
// Ayah ungefärbt -- nie ein Wort mit der Farbe eines anderen).
const LETTER = /[ء-يٱ]/;

export function splitTajweedAyah(html) {
  if (!html) return null;
  const clean = html.replace(/<span class=["']?end["']?>.*?<\/span>/g, '').trim();
  const tokens = [];
  let cur = '';
  let inTag = false;
  let depth = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '<') {
      inTag = true;
      depth += clean[i + 1] === '/' ? -1 : 1;
    } else if (ch === '>') inTag = false;
    if (ch === ' ' && !inTag && depth === 0) {
      if (cur) tokens.push(cur);
      cur = '';
      continue;
    }
    if (ch === ' ' && !inTag && depth !== 0) return null; // Auszeichnung über Wortgrenze: nicht eindeutig
    cur += ch;
  }
  if (cur) tokens.push(cur);
  const words = [];
  for (const t of tokens) {
    const text = t.replace(/<[^>]*>/g, '');
    if (!LETTER.test(text) && words.length) words[words.length - 1] += ` ${t}`;
    else words.push(t);
  }
  return words;
}
