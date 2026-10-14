// Hausaufgaben-Übersicht pro Woche: je Schüler nur Name + "x von y".
// Rot = Frist vorbei und noch nicht alles abgegeben. Antippen klappt die
// Abgaben (Audios, Text, Bewerten) des Schülers auf.
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { Card, Spinner } from './ui.jsx';

const addDays = (key, n) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDay = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
const fmtDue = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'ohne Frist');
const STATE = {
  done: ['abgegeben', 'text-mint'],
  open: ['noch offen', 'text-sage-muted'],
  missed: ['nicht abgegeben', 'text-status-absent'],
  revision: ['zur Überarbeitung', 'text-gold'],
};

export default function HomeworkOverview({ renderSubmission }) {
  const [classId, setClassId] = useState('');
  const [week, setWeek] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = () => {
    const q = new URLSearchParams();
    if (classId) q.set('classId', classId);
    if (week) q.set('week', week);
    return api.get(`/homework-overview?${q}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  };
  useEffect(() => { setData(null); load(); /* eslint-disable-next-line */ }, [classId, week]);

  if (error) return <Card className="p-6 text-sm text-status-absent">{error}</Card>;
  if (!data) return <Spinner />;
  const s = data.summary;
  const titles = Object.fromEntries(data.assignments.map((a) => [a.id, a.title]));
  const isThisWeek = new Date(`${data.weekStart}T00:00:00`) <= new Date() && new Date() < new Date(`${addDays(data.weekEnd, 1)}T00:00:00`);

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {data.classes.length > 1 ? (
            <select className="input w-auto py-1.5" value={data.classId || ''} onChange={(e) => { setClassId(e.target.value); setOpenId(null); }} aria-label="Klasse">
              {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : <div className="text-ivory font-medium">{data.classes[0]?.name}</div>}
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Vorige Woche" onClick={() => { setWeek(addDays(data.weekStart, -7)); setOpenId(null); }} className="p-2 rounded-lg hover:bg-hover text-sage"><ChevronLeft size={18} /></button>
            <button type="button" onClick={() => { setWeek(''); setOpenId(null); }} className="text-sm text-ivory px-1 min-w-[9.5rem] text-center">
              {isThisWeek ? 'Diese Woche' : 'Woche'} · {fmtDay(data.weekStart)}–{fmtDay(data.weekEnd)}
            </button>
            <button type="button" aria-label="Nächste Woche" onClick={() => { setWeek(addDays(data.weekStart, 7)); setOpenId(null); }} className="p-2 rounded-lg hover:bg-hover text-sage"><ChevronRight size={18} /></button>
          </div>
        </div>
        {s && data.assignments.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Vollständig" value={`${s.studentsComplete} von ${s.studentsTotal}`} hint="Schüler mit allen Hausaufgaben" tone="mint" />
            <Stat label="Abgaben gesamt" value={`${s.done} von ${s.expected}`} hint="abgegebene Hausaufgaben" />
            <Stat label="Zu bewerten" value={s.toReview} hint="warten auf Korrektur" tone={s.toReview ? 'gold' : null} />
            <Stat label="Frist verpasst" value={s.missedStudents} hint="Schüler (rot markiert)" tone={s.missedStudents ? 'red' : null} />
          </div>
        )}
        {data.assignments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.assignments.map((a, i) => (
              <span key={a.id} className="rounded-full border border-line px-2.5 py-1 text-xs text-sage">
                {i + 1}. {a.title} · <span className="text-sage-muted">{fmtDue(a.dueAt)}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      {data.assignments.length === 0 ? (
        <Card className="p-6 text-sm text-sage-muted">In dieser Woche sind keine Hausaufgaben fällig.</Card>
      ) : (
        <div className="space-y-2">
          {data.students.map((st) => {
            const red = st.missed > 0;
            const complete = st.total > 0 && st.done === st.total;
            const open = openId === st.id;
            return (
              <Card key={st.id} className={`p-0 overflow-hidden ${red ? 'border-status-absent/60 bg-status-absent/[0.06]' : ''}`}>
                <button type="button" onClick={() => setOpenId(open ? null : st.id)} aria-expanded={open}
                  className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-hover">
                  <span className={`min-w-0 flex-1 truncate ${red ? 'text-status-absent font-medium' : 'text-ivory'}`}>{st.name}</span>
                  {st.sameDay && <AlertTriangle size={15} className="text-status-absent shrink-0" aria-label="Mehrere Hausaufgaben am selben Tag" />}
                  {st.toReview > 0 && <span className="text-[11px] rounded-full bg-gold/15 text-gold px-2 py-0.5 shrink-0">{st.toReview} zu bewerten</span>}
                  <span className={`text-sm font-semibold tabular-nums shrink-0 ${red ? 'text-status-absent' : complete ? 'text-mint' : 'text-sage'}`}>
                    {st.done} von {st.total}
                  </span>
                  {complete && <CheckCircle2 size={16} className="text-mint shrink-0" />}
                  {open ? <ChevronUp size={16} className="text-sage-muted shrink-0" /> : <ChevronDown size={16} className="text-sage-muted shrink-0" />}
                </button>
                {open && (
                  <div className="border-t border-line p-3 space-y-3">
                    {st.items.map((it) => (
                      <div key={it.assignmentId} className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-ivory truncate">{titles[it.assignmentId]}</span>
                          <span className={`text-xs shrink-0 ${STATE[it.state][1]}`}>{STATE[it.state][0]}</span>
                        </div>
                        {it.submission && renderSubmission(it.submission, load)}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-xs text-sage-muted flex items-center gap-1.5"><ClipboardCheck size={14} /> Die Woche richtet sich nach der Frist der Hausaufgabe. Wie viele Hausaufgaben es pro Woche gibt, bestimmst du einfach durch das, was du aufgibst.</p>
    </div>
  );
}

function Stat({ label, value, hint, tone }) {
  const color = tone === 'mint' ? 'text-mint' : tone === 'gold' ? 'text-gold' : tone === 'red' ? 'text-status-absent' : 'text-ivory';
  return (
    <div className="rounded-xl border border-line bg-subtle/40 px-3 py-2">
      <div className="text-[11px] text-sage-muted">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] text-sage-muted leading-tight">{hint}</div>
    </div>
  );
}
