// Liste gespeicherter KI-Übungen („Auswendig rezitieren") -- für die Person
// selbst (Verlauf im Auswendig-Tab) und für Lehrkräfte (Lernstand, Hifz.jsx).
// Nur Zahlen/Stellen, nie Audio; keine Bewertung.
import { Check } from 'lucide-react';

export const fmtDuration = (s) => (s >= 60 ? `${Math.floor(s / 60)} Min. ${s % 60} s` : `${s} s`);

/** „Al-Mulk 1–4" bzw. „Al-Fatihah 7 – Al-Baqarah 4" aus zwei Schlüsseln „s:a". */
export function fmtRange(from, to, surahName) {
  if (!from) return null;
  const [s1, a1] = from.split(':');
  const [s2, a2] = (to || from).split(':');
  if (s1 === s2) return a1 === a2 ? `${surahName(Number(s1))} ${a1}` : `${surahName(Number(s1))} ${a1}–${a2}`;
  return `${surahName(Number(s1))} ${a1} – ${surahName(Number(s2))} ${a2}`;
}

export function RecitationSessionList({ sessions, surahName, showName = false }) {
  return (
    <ul className="divide-y divide-line">
      {sessions.map((s) => (
        <li key={s.id} className="py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-subhead text-ivory truncate">{showName && <span data-noi18n>{s.userName} · </span>}{fmtRange(s.from, s.to, surahName) || 'Keine Stelle erkannt'}</span>
            <span className="text-caption text-sage-muted shrink-0">{new Date(s.startedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
          </div>
          <div className="text-caption text-sage-muted mt-0.5 flex flex-wrap gap-x-3">
            <span>{s.scope?.kind === 'focused' ? `Gezielt: ${s.scope.label || ''}` : 'Frei'}</span>
            <span>{`${s.counts.memory} auswendig`}</span>
            {s.counts.read > 0 && <span>{`${s.counts.read} mitgelesen`}</span>}
            {s.counts.assisted > 0 && <span>{`${s.counts.assisted} nach Hilfe`}</span>}
            {s.counts.missed > 0 && <span className="text-status-absent">{`${s.counts.missed} ausgelassen`}</span>}
            <span>{fmtDuration(s.activeSec || 0)}</span>
            {s.complete && <span className="inline-flex items-center gap-0.5 text-status-present"><Check size={12} /> fertig</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
