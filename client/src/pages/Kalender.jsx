import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, GraduationCap, Clock, Plus, Trash2, X } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Spinner, useToast } from '../components/ui.jsx';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const key = (d) => {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return t.toISOString().slice(0, 10);
};
const sameDay = (a, b) => key(a) === key(b);
const mondayIndex = (d) => (d.getDay() + 6) % 7;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const CATS = {
  dbz: { label: 'DBZ', color: '#15653F' },
  personal: { label: 'Privat', color: '#7C3AED' },
  school: { label: 'Schule', color: '#2563EB' },
  work: { label: 'Arbeit', color: '#B45309' },
  sport: { label: 'Sport', color: '#0D9488' },
  other: { label: 'Sonstiges', color: '#64748B' },
};
function eventColor(e) {
  if (e.type === 'lesson') return '#15653F';
  if (e.type === 'deadline') return '#B45309';
  return CATS[e.category]?.color || '#64748B';
}
function eventLabel(e) {
  if (e.type === 'lesson') return 'Unterricht';
  if (e.type === 'deadline') return 'Abgabefrist';
  return CATS[e.category]?.label || 'Termin';
}

export default function Kalender() {
  const toast = useToast();
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState('month'); // month | week | day | year
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [selected, setSelected] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [events, setEvents] = useState(null);
  const [editing, setEditing] = useState(null); // Termin-Objekt oder {} für neu

  // Sichtbarer Bereich je Ansicht
  const range = useMemo(() => {
    if (view === 'day') return { from: cursor, to: cursor };
    if (view === 'week') {
      const start = addDays(cursor, -mondayIndex(cursor));
      return { from: start, to: addDays(start, 6) };
    }
    if (view === 'year') {
      return { from: new Date(cursor.getFullYear(), 0, 1), to: new Date(cursor.getFullYear(), 11, 31) };
    }
    // month: 6-Wochen-Raster
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = addDays(first, -mondayIndex(first));
    return { from: start, to: addDays(start, 41) };
  }, [view, cursor]);

  const reload = () => {
    setEvents(null);
    api.get(`/calendar?from=${key(range.from)}&to=${key(range.to)}`).then((d) => setEvents(d.events)).catch(() => setEvents([]));
  };
  useEffect(reload, [range.from, range.to]); // eslint-disable-line

  const byDate = useMemo(() => {
    const m = {};
    (events || []).forEach((e) => { (m[e.date] ||= []).push(e); });
    return m;
  }, [events]);

  const move = (delta) => {
    if (view === 'day') setCursor(addDays(cursor, delta));
    else if (view === 'week') setCursor(addDays(cursor, delta * 7));
    else if (view === 'year') setCursor(new Date(cursor.getFullYear() + delta, cursor.getMonth(), 1));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  };
  const goToday = () => { setCursor(new Date()); setSelected(new Date()); };

  const title = useMemo(() => {
    if (view === 'year') return String(cursor.getFullYear());
    if (view === 'day') return cursor.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (view === 'week') {
      const start = addDays(cursor, -mondayIndex(cursor));
      const end = addDays(start, 6);
      return `${start.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return cursor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  }, [view, cursor]);

  const openNew = (date) => setEditing({ date: key(date || selected), category: 'personal', allDay: true });
  const openEdit = (e) => { if (e.type === 'personal') setEditing({ ...e }); };

  const save = async (form) => {
    try {
      if (form.id) await api.patch(`/events/${form.id}`, form);
      else await api.post('/events', form);
      toast.push('Gespeichert', 'success');
      setEditing(null);
      reload();
    } catch (err) { toast.push(err.message, 'error'); }
  };
  const remove = async (id) => {
    try { await api.del(`/events/${id}`); toast.push('Gelöscht', 'success'); setEditing(null); reload(); }
    catch (err) { toast.push(err.message, 'error'); }
  };

  return (
    <AppLayout title="Kalender">
      <Card className="p-4 sm:p-5">
        {/* Kopfzeile */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-1">
            <button onClick={() => move(-1)} className="p-2 rounded-lg text-sage hover:text-ivory hover:bg-subtle" aria-label="Zurück"><ChevronLeft size={20} /></button>
            <button onClick={() => move(1)} className="p-2 rounded-lg text-sage hover:text-ivory hover:bg-subtle" aria-label="Weiter"><ChevronRight size={20} /></button>
          </div>
          <h2 className="font-display text-lg text-ivory capitalize mr-auto">{title}</h2>
          <button onClick={goToday} className="text-sm px-3 py-1.5 rounded-lg border border-line text-sage hover:bg-hover">Heute</button>
          <div className="flex rounded-lg border border-line overflow-hidden">
            {[['year', 'Jahr'], ['month', 'Monat'], ['week', 'Woche'], ['day', 'Tag']].map(([v, l]) => (
              <button key={v} onClick={() => setView(v)} className={`text-sm px-3 py-1.5 ${view === v ? 'bg-mint text-onaccent' : 'text-sage hover:bg-hover'}`}>{l}</button>
            ))}
          </div>
          <Button size="sm" onClick={() => openNew()}><Plus size={16} /> Termin</Button>
        </div>

        {!events ? <Spinner /> : (
          <>
            {view === 'month' && <MonthView cursor={cursor} today={today} selected={selected} setSelected={setSelected} byDate={byDate} onAdd={openNew} />}
            {view === 'week' && <WeekView cursor={cursor} today={today} byDate={byDate} onPick={(d) => { setCursor(d); setView('day'); }} onEvent={openEdit} />}
            {view === 'day' && <DayView cursor={cursor} byDate={byDate} onEvent={openEdit} onAdd={openNew} />}
            {view === 'year' && <YearView cursor={cursor} today={today} byDate={byDate} onPickMonth={(m) => { setCursor(new Date(cursor.getFullYear(), m, 1)); setView('month'); }} />}
          </>
        )}

        <Legend />
      </Card>

      {view === 'month' && events && (
        <Card className="p-5 mt-4">
          <div className="flex items-center justify-between">
            <CardHeader title={selected.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })} icon={CalendarDays} />
            <Button size="sm" variant="outline" onClick={() => openNew(selected)}><Plus size={16} /></Button>
          </div>
          <DayAgenda events={byDate[key(selected)] || []} onEvent={openEdit} />
        </Card>
      )}

      {editing && <EventModal init={editing} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />}
    </AppLayout>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 mt-4 text-xs text-sage-muted">
      <span className="flex items-center gap-1.5"><Dot c="#15653F" /> Unterricht</span>
      <span className="flex items-center gap-1.5"><Dot c="#B45309" /> Abgabefrist</span>
      <span className="flex items-center gap-1.5"><Dot c="#7C3AED" /> eigene Termine</span>
    </div>
  );
}
const Dot = ({ c }) => <span className="h-2 w-2 rounded-full" style={{ background: c }} />;

function MonthView({ cursor, today, selected, setSelected, byDate, onAdd }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = addDays(first, -mondayIndex(first));
  const grid = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 gap-1">
      {WEEKDAYS.map((w) => <div key={w} className="text-center text-[11px] font-mono text-sage-muted py-1">{w}</div>)}
      {grid.map((d) => {
        const inMonth = d.getMonth() === cursor.getMonth();
        const evs = byDate[key(d)] || [];
        const isToday = sameDay(d, today);
        const isSel = sameDay(d, selected);
        return (
          <button key={key(d)} onDoubleClick={() => onAdd(d)} onClick={() => setSelected(new Date(d))}
            className={['min-h-[52px] rounded-lg flex flex-col items-center py-1.5 gap-1 text-sm transition border',
              isSel ? 'border-mint bg-mint/10' : 'border-transparent hover:bg-subtle',
              inMonth ? 'text-ivory' : 'text-sage-muted/50'].join(' ')}>
            <span className={isToday ? 'h-6 w-6 grid place-items-center rounded-full bg-mint text-onaccent font-semibold' : ''}>{d.getDate()}</span>
            <span className="flex flex-wrap justify-center gap-0.5 px-1">
              {evs.slice(0, 4).map((e, i) => <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: eventColor(e) }} />)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WeekView({ cursor, today, byDate, onPick, onEvent }) {
  const start = addDays(cursor, -mondayIndex(cursor));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {days.map((d) => {
        const evs = byDate[key(d)] || [];
        const isToday = sameDay(d, today);
        return (
          <div key={key(d)} className="rounded-lg border border-line p-2 min-h-[120px]">
            <button onClick={() => onPick(d)} className="w-full text-left mb-1.5">
              <div className="text-[11px] font-mono text-sage-muted">{WEEKDAYS[mondayIndex(d)]}</div>
              <div className={`text-sm ${isToday ? 'text-mint font-semibold' : 'text-ivory'}`}>{d.getDate()}.{d.getMonth() + 1}.</div>
            </button>
            <div className="space-y-1">
              {evs.map((e, i) => <EventChip key={i} e={e} onClick={() => onEvent(e)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ cursor, byDate, onEvent, onAdd }) {
  const evs = byDate[key(cursor)] || [];
  return (
    <div>
      <div className="flex justify-end mb-2">
        <Button size="sm" variant="outline" onClick={() => onAdd(cursor)}><Plus size={16} /> Termin</Button>
      </div>
      <DayAgenda events={evs} onEvent={onEvent} />
    </div>
  );
}

function YearView({ cursor, today, byDate, onPickMonth }) {
  const year = cursor.getFullYear();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 12 }, (_, m) => {
        const first = new Date(year, m, 1);
        const start = addDays(first, -mondayIndex(first));
        const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
        return (
          <button key={m} onClick={() => onPickMonth(m)} className="rounded-lg border border-line p-2 hover:bg-hover text-left">
            <div className="text-sm text-ivory mb-1 capitalize">{first.toLocaleDateString('de-DE', { month: 'long' })}</div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((d) => {
                const inMonth = d.getMonth() === m;
                const has = (byDate[key(d)] || []).length > 0;
                const isToday = sameDay(d, today);
                return (
                  <span key={key(d)} className={`h-4 grid place-items-center text-[9px] rounded ${isToday ? 'bg-mint text-onaccent' : inMonth ? 'text-sage' : 'text-sage-muted/40'}`}>
                    <span className="relative">{d.getDate()}{has && inMonth && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-mint" />}</span>
                  </span>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function EventChip({ e, onClick }) {
  const c = eventColor(e);
  return (
    <button onClick={onClick} className="w-full text-left text-[11px] rounded px-1.5 py-1 flex items-center gap-1 truncate" style={{ background: `${c}1a`, color: c }}>
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c }} />
      <span className="truncate">{e.time && !e.allDay ? `${e.time} ` : ''}{e.title}</span>
    </button>
  );
}

function DayAgenda({ events, onEvent }) {
  if (events.length === 0) return <p className="p-4 text-sage-muted text-sm">Keine Termine an diesem Tag.</p>;
  return (
    <div className="divide-y divide-line">
      {events.map((e, i) => {
        const c = eventColor(e);
        const editable = e.type === 'personal';
        return (
          <button key={i} onClick={() => onEvent(e)} disabled={!editable}
            className={`w-full text-left py-3 flex items-center gap-3 ${editable ? 'hover:bg-hover rounded-lg px-1' : ''}`}>
            <span className="grid place-items-center h-9 w-9 rounded-lg shrink-0" style={{ background: `${c}22`, color: c }}>
              {e.type === 'lesson' ? <GraduationCap size={18} /> : e.type === 'deadline' ? <Clock size={18} /> : <CalendarDays size={18} />}
            </span>
            <div className="min-w-0">
              <div className="text-ivory truncate">{e.title}</div>
              <div className="text-xs text-sage-muted">
                {eventLabel(e)}{e.allDay ? ' · ganztägig' : e.time ? ` · ${e.time}` : ''}{e.recurring ? ' · wiederkehrend' : ''}
                {e.note ? ` · ${e.note}` : ''}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function EventModal({ init, onClose, onSave, onDelete }) {
  const [f, setF] = useState({
    id: init.id || null,
    title: init.title || '',
    date: init.date,
    allDay: init.allDay !== false,
    startTime: init.startTime || '',
    endTime: init.endTime || '',
    category: init.category || 'personal',
    note: init.note || '',
    repeat: init.recurring ? (init.recurrence?.freq || 'weekly') : 'none',
    until: init.recurrence?.until || '',
  });
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  const submit = () => {
    const payload = {
      id: f.id, title: f.title, date: f.date, allDay: f.allDay,
      startTime: f.allDay ? null : f.startTime || null,
      endTime: f.allDay ? null : f.endTime || null,
      category: f.category, note: f.note,
      recurrence: f.repeat === 'none' ? null : { freq: f.repeat, until: f.until || null },
    };
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg text-ivory">{f.id ? 'Termin bearbeiten' : 'Neuer Termin'}</h3>
          <button onClick={onClose} className="text-sage hover:text-ivory"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <label className="block"><span className="text-sm text-sage">Titel</span>
            <input className="input mt-1" value={f.title} onChange={(e) => set({ title: e.target.value })} autoFocus placeholder="z. B. Fußballtraining" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm text-sage">Datum</span>
              <input type="date" className="input mt-1" value={f.date} onChange={(e) => set({ date: e.target.value })} /></label>
            <label className="block"><span className="text-sm text-sage">Kategorie</span>
              <select className="input mt-1" value={f.category} onChange={(e) => set({ category: e.target.value })}>
                {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select></label>
          </div>
          <label className="flex items-center gap-2 text-sm text-sage">
            <input type="checkbox" checked={f.allDay} onChange={(e) => set({ allDay: e.target.checked })} /> Ganztägig
          </label>
          {!f.allDay && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="text-sm text-sage">Von</span>
                <input type="time" className="input mt-1" value={f.startTime} onChange={(e) => set({ startTime: e.target.value })} /></label>
              <label className="block"><span className="text-sm text-sage">Bis</span>
                <input type="time" className="input mt-1" value={f.endTime} onChange={(e) => set({ endTime: e.target.value })} /></label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm text-sage">Wiederholung</span>
              <select className="input mt-1" value={f.repeat} onChange={(e) => set({ repeat: e.target.value })}>
                <option value="none">Keine</option>
                <option value="daily">Täglich</option>
                <option value="weekly">Wöchentlich</option>
                <option value="monthly">Monatlich</option>
              </select></label>
            {f.repeat !== 'none' && (
              <label className="block"><span className="text-sm text-sage">Bis (optional)</span>
                <input type="date" className="input mt-1" value={f.until} onChange={(e) => set({ until: e.target.value })} /></label>
            )}
          </div>
          <label className="block"><span className="text-sm text-sage">Notiz (optional)</span>
            <input className="input mt-1" value={f.note} onChange={(e) => set({ note: e.target.value })} /></label>
        </div>
        <div className="flex items-center gap-2 mt-5">
          {f.id && <Button variant="ghost" onClick={() => onDelete(f.id)}><Trash2 size={16} /></Button>}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button onClick={submit} disabled={!f.title.trim() || !f.date}>Speichern</Button>
        </div>
      </Card>
    </div>
  );
}
