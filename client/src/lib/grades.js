// Zeugnisnoten (deutsches Notensystem, mit Halbnoten-Tendenzen).
export const GRADE_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];

const LABELS = {
  1: '1', 1.5: '1–2', 2: '2', 2.5: '2–3', 3: '3', 3.5: '3–4',
  4: '4', 4.5: '4–5', 5: '5', 5.5: '5–6', 6: '6',
};

export const gradeLabel = (v) => (v == null || v === '' ? '–' : (LABELS[v] ?? String(v)));

// Durchschnitt hübsch: eine Nachkommastelle mit Komma (z. B. „2,3").
export const avgLabel = (v) => (v == null ? '–' : Number(v).toFixed(1).replace('.', ','));

// Farbliche Einordnung (gut/mittel/schwach) für dezente Hervorhebung.
export const gradeTone = (v) => {
  if (v == null) return 'muted';
  if (v <= 2.5) return 'good';
  if (v <= 4.0) return 'mid';
  return 'weak';
};
