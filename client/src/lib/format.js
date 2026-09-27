// Kleine Anzeige-Helfer, die mehrere Seiten teilen.

// "zuletzt online" kurz und menschlich (nur für Mitarbeitende sichtbar).
export function lastSeenLabel(iso) {
  if (!iso) return 'noch nie';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 3) return 'gerade online';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  if (d < 14) return `vor ${d} Tag${d === 1 ? '' : 'en'}`;
  return new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });
}
