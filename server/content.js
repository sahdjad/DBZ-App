// Statische DBZ-Fachdaten und Standardkonfiguration.
// Dynamische Daten (Nutzer, Klassen, Sitzungen, ...) liegen im Datastore.

// Fächerkatalog laut docs/PRODUCT.md §6.
export const SUBJECTS = [
  { id: 'quran', name: "Qur'an-Lesen", category: 'quran' },
  { id: 'tajwid', name: 'Tajwid', category: 'quran' },
  { id: 'hifz', name: 'Hifz', category: 'quran' },
  { id: 'murajaah', name: "Muraja'ah", category: 'quran' },
  { id: 'aqidah', name: 'Aqidah / Tawhid', category: 'islam' },
  { id: 'fiqh', name: 'Fiqh (Salah / Wudu)', category: 'islam' },
  { id: 'sirah', name: 'Sirah', category: 'islam' },
  { id: 'adhkar', name: 'Adhkar', category: 'islam' },
];

export function findSubject(id) {
  return SUBJECTS.find((s) => s.id === id) || null;
}

// Standard-Organisationseinstellungen (docs/PRODUCT.md §10, SOCIAL_MEDIA.md).
// Werden beim Seed in die `organizations`-Collection geschrieben und sind danach
// über den Admin-Bereich ohne neues Release änderbar.
export const DEFAULT_ORG = {
  id: 'org_dbz',
  name: 'Deen Bildungszentrum',
  shortName: 'DBZ',
  primaryColor: '#1F7A44',
  // Verspätungsgrenze: ab wie vielen Minuten nach Sitzungsbeginn gilt "verspätet".
  // Spec: OPEN_QUESTIONS.md #5 (TBD) – hier zentral konfigurierbar, Default 5.
  lateAfterMinutes: 5,
  // QR-Check-in-Token-Lebensdauer in Sekunden (docs/INTEGRATIONS.md §7).
  qrTokenTtlSeconds: 300,
  // Aufbewahrung von Audio-Abgaben in Tagen (docs/DATA_RETENTION.md).
  // 0 = deaktiviert (Standard, bis das DBZ die Frist organisatorisch festlegt).
  audioRetentionDays: 0,
  // Gewichte für den automatischen Notenvorschlag (im Admin einstellbar).
  gradeWeights: { homework: 0.35, attendance: 0.25, behavior: 0.1, exams: 0.15, activities: 0.15 },
  socialLinks: {
    youtube: 'https://www.youtube.com/channel/UChiz3gfEtMvqb6pFkeZir6Q',
    instagram: 'https://www.instagram.com/deen.bildungszentrum/',
    tiktok: 'https://www.tiktok.com/@dbzmuenchen',
  },
  status: 'active',
};

// Reason-Kategorien für Abwesenheitsanträge (bewusst allgemein gehalten,
// docs/SECURITY_PRIVACY.md §12: keine unnötigen medizinischen Details).
export const ABSENCE_REASONS = ['krankheit', 'familiaer', 'reise', 'termin', 'sonstiges'];

// Kategorien für Verhaltens-/Tarbiyah-Vermerke (docs/DATABASE.md behavior_records).
export const BEHAVIOR_CATEGORIES = [
  { id: 'adab', label: 'Adab / Benehmen' },
  { id: 'participation', label: 'Mitarbeit' },
  { id: 'punctuality', label: 'Pünktlichkeit' },
  { id: 'homework', label: 'Hausaufgaben' },
  { id: 'quran', label: "Qur'an / Hifz" },
  { id: 'behavior', label: 'Verhalten allgemein' },
];
