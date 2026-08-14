import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, GraduationCap, Clock } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Spinner } from '../components/ui.jsx';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const key = (d) => d.toISOString().slice(0, 10);
const sameDay = (a, b) => key(a) === key(b);

// Montag-basierter Wochentagsindex (0 = Mo ... 6 = So)
const mondayIndex = (d) => (d.getDay() + 6) % 7;

export default function Kalender() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [events, setEvents] = useState(null);

  // 6-Wochen-Raster ab dem Montag vor dem Monatsersten
  const grid = useMemo(() => {
    const start = new Date(cursor);
    start.setDate(1 - mondayIndex(start));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  useEffect(() => {
    setEvents(null);
    const from = key(grid[0]);
    const to = key(grid[41]);
    api.get(`/calendar?from=${from}&to=${to}`).then((d) => setEvents(d.events)).catch(() => setEvents([]));
  }, [grid]);

  const byDate = useMemo(() => {
    const m = {};
    (events || []).forEach((e) => {
      (m[e.date] ||= []).push(e);
    });
    return m;
  }, [events]);

  const monthName = cursor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const move = (delta) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  const selectedEvents = byDate[key(selected)] || [];

  return (
    <AppLayout title="Kalender">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => move(-1)} className="p-2 rounded-lg text-sage hover:text-ivory hover:bg-black/5" aria-label="Vorheriger Monat">
            <ChevronLeft size={20} />
          </button>
          <h2 className="font-display text-lg text-ivory capitalize">{monthName}</h2>
          <button onClick={() => move(1)} className="p-2 rounded-lg text-sage hover:text-ivory hover:bg-black/5" aria-label="Nächster Monat">
            <ChevronRight size={20} />
          </button>
        </div>

        {!events ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[11px] font-mono text-sage-muted py-1">{w}</div>
            ))}
            {grid.map((d) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const evs = byDate[key(d)] || [];
              const isToday = sameDay(d, today);
              const isSel = sameDay(d, selected);
              return (
                <button
                  key={key(d)}
                  onClick={() => setSelected(new Date(d))}
                  className={[
                    'aspect-square rounded-lg flex flex-col items-center justify-center gap-1 text-sm transition border',
                    isSel ? 'border-mint bg-mint/10' : 'border-transparent hover:bg-black/5',
                    inMonth ? 'text-ivory' : 'text-sage-muted/50',
                  ].join(' ')}
                >
                  <span className={isToday ? 'h-6 w-6 grid place-items-center rounded-full bg-mint text-sidebar font-semibold' : ''}>
                    {d.getDate()}
                  </span>
                  <span className="flex gap-0.5 h-1.5">
                    {evs.some((e) => e.type === 'lesson') && <span className="h-1.5 w-1.5 rounded-full bg-mint" />}
                    {evs.some((e) => e.type === 'deadline') && <span className="h-1.5 w-1.5 rounded-full bg-status-late" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-4 mt-4 text-xs text-sage-muted">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-mint" /> Unterricht</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-status-late" /> Abgabefrist</span>
        </div>
      </Card>

      <Card className="p-5 mt-4">
        <CardHeader title={selected.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })} icon={CalendarDays} />
        <div className="divide-y divide-black/5">
          {selectedEvents.length === 0 ? (
            <p className="p-4 text-sage-muted text-sm">Keine Termine an diesem Tag.</p>
          ) : (
            selectedEvents.map((e, i) => (
              <div key={i} className="py-3 flex items-center gap-3">
                <span className={`grid place-items-center h-9 w-9 rounded-lg ${e.type === 'lesson' ? 'bg-mint/15 text-mint' : 'bg-status-late/15 text-status-late'}`}>
                  {e.type === 'lesson' ? <GraduationCap size={18} /> : <Clock size={18} />}
                </span>
                <div>
                  <div className="text-ivory">{e.title}</div>
                  <div className="text-xs text-sage-muted">
                    {e.type === 'lesson' ? 'Unterricht' : 'Abgabefrist'} · {e.time}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </AppLayout>
  );
}
