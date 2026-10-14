// Rote Markierung: Schüler hat an einem Tag mehrere Audio-Hausaufgaben abgegeben.
import { AlertTriangle } from 'lucide-react';

const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

export default function SameDayWarning({ sameDay }) {
  if (!sameDay?.length) return null;
  return (
    <div className="mt-2 rounded-lg border border-status-absent/50 bg-status-absent/10 px-3 py-2 text-xs text-status-absent space-y-0.5">
      {sameDay.map((d) => (
        <div key={`${d.day}-${d.kind}`} className="flex items-start gap-1.5">
          <AlertTriangle size={14} className="shrink-0 mt-px" />
          <span>Am {fmtDay(d.day)} mehrere {d.kind === 'schrift' ? 'schriftliche' : 'Audio-'}Hausaufgaben abgegeben – zusammen mit: {d.with.join(', ')}</span>
        </div>
      ))}
    </div>
  );
}
