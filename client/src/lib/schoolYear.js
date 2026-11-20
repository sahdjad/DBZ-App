// Schuljahr (September bis August): Auswahl für Auswertungen. Wert „sy:2025“
// steht für 1.9.2025 bis 31.8.2026; der Server versteht ?schoolYear=2025.
export function currentSchoolYear(now = new Date()) {
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}
export const schoolYearLabel = (y) => `${y}/${String(y + 1).slice(2)}`;
/** Frühere Schuljahre (ohne das laufende), neuestes zuerst. */
export function pastSchoolYears(count = 2, now = new Date()) {
  const y = currentSchoolYear(now);
  return Array.from({ length: count }, (_, i) => y - 1 - i);
}
/** Auswahlwert („“, „YYYY-MM“ oder „sy:YYYY“) -> Abfrage-Parameter. */
export function periodQuery(value) {
  if (!value) return {};
  if (value.startsWith('sy:')) return { schoolYear: value.slice(3) };
  return { month: value };
}
