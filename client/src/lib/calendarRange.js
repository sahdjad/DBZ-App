// Gemeinsam für den Kalender und das Vorladen (App.jsx): Datumsschlüssel und
// der 6-Wochen-Bereich der Monatsansicht. Gleiche URL => vorgeladene Termine
// stehen beim ersten Öffnen des Kalenders sofort da.
export const dateKey = (d) => {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return t.toISOString().slice(0, 10);
};

/** Monatsraster: Montag vor dem Monatsersten + 41 Tage. */
export function monthGrid(d) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const from = new Date(first);
  from.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const to = new Date(from);
  to.setDate(from.getDate() + 41);
  return { from, to };
}

export const calendarUrl = ({ from, to }) => `/calendar?from=${dateKey(from)}&to=${dateKey(to)}`;
