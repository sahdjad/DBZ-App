// Darstellung pro Gerät: Textgröße und Schriftart (wie die iOS-Einstellungen
// „Anzeige & Textgröße“). Gespeichert in localStorage, sofort angewendet über
// data-Attribute am <html> (siehe index.css). Wirkt über die Root-Schriftgröße,
// das Layout fließt also echt um.

export const TEXT_SIZES = [
  { id: 's', label: 'Klein' },
  { id: 'm', label: 'Standard' },
  { id: 'l', label: 'Groß' },
  { id: 'xl', label: 'Sehr groß' },
];
export const FONTS = [
  { id: 'system', label: 'System', sample: 'Aa', css: 'var(--font-ui)' },
  { id: 'rounded', label: 'Rund', sample: 'Aa', css: "ui-rounded, 'SF Pro Rounded', -apple-system, sans-serif" },
  { id: 'serif', label: 'Serif', sample: 'Aa', css: "ui-serif, 'New York', Georgia, serif" },
];

const read = (k, fallback, allowed) => {
  try {
    const v = localStorage.getItem(k);
    return allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

export const getTextSize = () => read('dbz-text', 'm', TEXT_SIZES.map((t) => t.id));
export const getFont = () => read('dbz-font', 'system', FONTS.map((f) => f.id));

function apply() {
  const el = document.documentElement;
  const t = getTextSize();
  const f = getFont();
  if (t === 'm') delete el.dataset.text; else el.dataset.text = t;
  if (f === 'system') delete el.dataset.font; else el.dataset.font = f;
}

export function setTextSize(id) {
  try { localStorage.setItem('dbz-text', id); } catch { /* egal */ }
  apply();
}
export function setFont(id) {
  try { localStorage.setItem('dbz-font', id); } catch { /* egal */ }
  apply();
}
export const initDisplay = apply;
