// Farbe für „x von y Hausaufgaben erledigt", sobald eine Frist verpasst ist:
// je mehr abgegeben, desto näher an Grün.
//   nichts abgegeben          -> rot
//   weniger als die Hälfte    -> orange (z. B. 1 von 3)
//   mindestens die Hälfte     -> gelb   (z. B. 1 von 2, 2 von 3)
//   alles abgegeben           -> grün (wie bisher)
// Ist noch keine Frist vorbei, bleibt es neutral („noch offen").
// Die Farbe ergänzt nur die Zahl „x von y" -- nie Farbe allein.
export function homeworkTone(done, total, missed) {
  if (total > 0 && done >= total) return 'complete';
  if (!missed) return 'open';
  if (done <= 0) return 'none';
  return done / total < 0.5 ? 'low' : 'high';
}

// Tailwind-Klassen je Stufe: Text, Balken am Rand (CSS-Farbe), Legende.
// Gelb: Balken/Punkt kräftig (--c-half), Text dunkler (--c-late), damit er lesbar bleibt.
export const TONE = {
  complete: { text: 'text-status-present', edge: null, dot: 'bg-status-present', label: 'alles abgegeben' },
  open: { text: 'text-sage', edge: null, dot: 'bg-line', label: 'noch offen' },
  none: { text: 'text-status-absent', edge: 'shadow-[inset_3px_0_0_rgb(var(--c-absent))]', dot: 'bg-status-absent', label: 'nichts abgegeben' },
  low: { text: 'text-status-partial', edge: 'shadow-[inset_3px_0_0_rgb(var(--c-partial))]', dot: 'bg-status-partial', label: 'weniger als die Hälfte' },
  high: { text: 'text-status-late', edge: 'shadow-[inset_3px_0_0_rgb(var(--c-half))]', dot: 'bg-[rgb(var(--c-half))]', label: 'mindestens die Hälfte' },
};
