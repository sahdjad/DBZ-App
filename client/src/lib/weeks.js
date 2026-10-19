// Kalenderwochen (ISO, Montag–Sonntag) für Listen, die nach Woche gruppiert
// werden – z. B. Hausaufgaben: „KW 43 · 19.–25.10.“.

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Montag der Woche (lokale Zeit) als „YYYY-MM-DD“.
export function mondayKey(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return keyOf(d);
}

// ISO-Kalenderwoche.
export function isoWeek(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); // Donnerstag derselben Woche
  const jan4 = new Date(d.getFullYear(), 0, 4, 12);
  return 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

export function weekInfo(monday) {
  const start = new Date(`${monday}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const dm = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  const thisWeek = mondayKey(new Date());
  const next = new Date(`${thisWeek}T12:00:00`);
  next.setDate(next.getDate() + 7);
  const last = new Date(`${thisWeek}T12:00:00`);
  last.setDate(last.getDate() - 7);
  const hint = monday === thisWeek ? 'Diese Woche' : monday === keyOf(next) ? 'Nächste Woche' : monday === keyOf(last) ? 'Letzte Woche' : '';
  return { kw: isoWeek(start), range: `${dm(start)} – ${dm(end)}`, year: start.getFullYear(), hint };
}

// Liste nach Woche gruppieren. dateOf(item) liefert das maßgebliche Datum;
// Einträge ohne Datum landen in einer Gruppe mit key = null.
export function groupByWeek(items, dateOf, { newestFirst = false } = {}) {
  const map = new Map();
  for (const it of items) {
    const d = dateOf(it);
    const key = d ? mondayKey(d) : null;
    if (!map.has(key)) map.set(key, { key, items: [] });
    map.get(key).items.push(it);
  }
  const arr = [...map.values()];
  arr.sort((a, b) => {
    if (a.key === null) return 1;
    if (b.key === null) return -1;
    return newestFirst ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key);
  });
  return arr;
}
