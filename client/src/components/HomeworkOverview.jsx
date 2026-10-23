// Hausaufgaben-Übersicht pro Woche: je Schüler nur Name + "x von y".
// Rot = Frist vorbei und noch nicht alles abgegeben. Antippen klappt die
// Abgaben (Audios, Text, Bewerten) des Schülers auf.
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { Card, Spinner, EmptyState } from './ui.jsx';

const addDays = (key, n) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDay = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
const fmtDue = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'ohne Frist');
// Status nie nur über Farbe: Symbol + Wort
const CHIP = {
  done: ['Abgegeben', 'bg-status-present/12 text-status-present', '✓ '],
  open: ['Offen', 'bg-subtle text-sage-muted', ''],
  missed: ['Fehlt', 'bg-status-absent/10 text-status-absent', '✕ '],
  revision: ['Überarbeiten', 'bg-gold/15 text-gold', '↺ '],
};
const BAR = { done: 'bg-status-present', missed: 'bg-status-absent', revision: 'bg-gold', open: 'bg-line' };
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
  const [onlyMissing, setOnlyMissing] = useState(false);

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

  const students = data.students.filter((st) => !onlyMissing || st.missed > 0);
  const chip = (it) => {
    const m = CHIP[it.state] || CHIP.open;
    return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${m[1]}`}>{m[2]}{m[0]}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Werkzeugleiste: Klasse + Woche */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {data.classes.length > 1 ? (
          <select className="input w-auto" value={data.classId || ''} onChange={(e) => { setClassId(e.target.value); setOpenId(null); }} aria-label="Klasse">
            {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : <div className="text-title3 font-semibold text-ivory" data-noi18n>{data.classes[0]?.name}</div>}
        <div className="flex items-center gap-0.5 rounded-full bg-card border border-line/70 shadow-card p-0.5">
          <button type="button" aria-label="Vorige Woche" onClick={() => { setWeek(addDays(data.weekStart, -7)); setOpenId(null); }} className="grid place-items-center h-9 w-9 rounded-full hover:bg-hover text-mint-light dark:text-mint"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => { setWeek(''); setOpenId(null); }} className="text-subhead font-medium text-ivory px-2 min-w-[10rem] text-center" title="Zur aktuellen Woche">
            {isThisWeek ? 'Diese Woche' : 'Woche'} · {fmtDay(data.weekStart)}–{fmtDay(data.weekEnd)}
          </button>
          <button type="button" aria-label="Nächste Woche" onClick={() => { setWeek(addDays(data.weekStart, 7)); setOpenId(null); }} className="grid place-items-center h-9 w-9 rounded-full hover:bg-hover text-mint-light dark:text-mint"><ChevronRight size={18} /></button>
        </div>
      </div>

      {data.assignments.length === 0 ? (
        <Card><EmptyState icon={ClipboardCheck} title="Keine Hausaufgaben" text="In dieser Woche sind keine Hausaufgaben fällig." /></Card>
      ) : (
        <>
          {s && (
            <Card className="grid grid-cols-2 md:grid-cols-4 divide-line/70 [&>*]:p-4 md:divide-x">
              <Stat label="Vollständig" value={`${s.studentsComplete} von ${s.studentsTotal}`} hint="Schüler mit allen Hausaufgaben" tone="mint" />
              <Stat label="Abgaben gesamt" value={`${s.done} von ${s.expected}`} hint="abgegebene Hausaufgaben" />
              <Stat label="Zu bewerten" value={s.toReview} hint="warten auf Korrektur" tone={s.toReview ? 'gold' : null} />
              <Stat label="Frist verpasst" value={s.missedStudents} hint="Schüler (rot markiert)" tone={s.missedStudents ? 'red' : null} />
            </Card>
          )}

          <ol className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-footnote text-sage-muted">
            {data.assignments.map((a, i) => (
              <li key={a.id}><span className="font-semibold text-ivory">{i + 1}.</span> <span data-noi18n>{a.title}</span> · {fmtDue(a.dueAt)}</li>
            ))}
          </ol>

          {s.missedStudents > 0 && (
            <label className="flex items-center gap-2 text-subhead text-sage px-1 cursor-pointer select-none">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--c-mint))]" />
              Nur zeigen, wer nicht abgegeben hat ({s.missedStudents})
            </label>
          )}

          {/* iPhone: Liste, antippen klappt die Abgaben auf */}
          <div className="md:hidden bg-card border border-line/70 rounded-2xl shadow-card overflow-hidden divide-y divide-line/70">
            {students.map((st) => {
              const red = st.missed > 0;
              const complete = st.total > 0 && st.done === st.total;
              const open = openId === st.id;
              return (
                <div key={st.id} className={red ? 'shadow-[inset_3px_0_0_rgb(var(--c-absent))]' : ''}>
                  <button type="button" onClick={() => setOpenId(open ? null : st.id)} aria-expanded={open}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-hover">
                    <span className="min-w-0 flex-1">
                      <span className={`block text-body truncate ${red ? 'text-status-absent font-semibold' : 'text-ivory font-medium'}`} data-noi18n>{st.name}</span>
                      <span className="flex gap-1 mt-1.5" aria-hidden="true">
                        {st.items.map((it) => (
                          <span key={it.assignmentId} className={`h-1.5 w-5 rounded-full ${BAR[it.state] || 'bg-line'}`} />
                        ))}
                      </span>
                      {red && <span className="block text-footnote text-status-absent mt-1">fehlt: {st.items.filter((i) => i.state === 'missed' || i.state === 'revision').map((i) => titles[i.assignmentId]).join(', ')}</span>}
                    </span>
                    {st.sameDay && <AlertTriangle size={15} className="text-status-absent shrink-0" aria-label="Mehrere Hausaufgaben am selben Tag" />}
                    {st.toReview > 0 && <span className="text-caption font-semibold rounded-full bg-gold/15 text-gold px-2 py-0.5 shrink-0">{st.toReview} zu bewerten</span>}
                    <span className={`text-subhead font-semibold tabular-nums shrink-0 ${red ? 'text-status-absent' : complete ? 'text-status-present' : 'text-sage'}`}>{st.done} von {st.total}</span>
                    {open ? <ChevronUp size={16} className="text-sage-muted shrink-0" /> : <ChevronDown size={16} className="text-sage-muted shrink-0" />}
                  </button>
                  {open && <Details st={st} titles={titles} chip={chip} renderSubmission={renderSubmission} load={load} />}
                </div>
              );
            })}
          </div>

          {/* iPad & Mac: Matrix Schüler × Hausaufgaben */}
          <Card className="hidden md:block overflow-x-auto">
            <table className="w-full text-subhead">
              <thead>
                <tr className="text-left text-footnote text-sage-muted border-b border-line/70 bg-subtle/50">
                  <th className="py-2.5 px-4 font-medium">Schüler</th>
                  {data.assignments.map((a, i) => (
                    <th key={a.id} className="py-2.5 px-2 font-medium text-center whitespace-nowrap" title={a.title}>Nr. {i + 1}</th>
                  ))}
                  <th className="py-2.5 px-3 font-medium text-right">Erledigt</th>
                  <th className="py-2.5 pr-3 w-10"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {students.map((st) => {
                  const red = st.missed > 0;
                  const complete = st.total > 0 && st.done === st.total;
                  const open = openId === st.id;
                  const byId = Object.fromEntries(st.items.map((it) => [it.assignmentId, it]));
                  return [
                    <tr key={st.id} onClick={() => setOpenId(open ? null : st.id)}
                      className={`border-b border-line/60 cursor-pointer hover:bg-hover/60 ${open ? 'bg-mint/[0.05]' : ''} ${red ? 'shadow-[inset_3px_0_0_rgb(var(--c-absent))]' : ''}`}>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${red ? 'text-status-absent' : 'text-ivory'}`} data-noi18n>{st.name}</span>
                          {st.sameDay && <AlertTriangle size={14} className="text-status-absent" aria-label="Mehrere Hausaufgaben am selben Tag" />}
                          {st.toReview > 0 && <span className="text-caption font-semibold rounded-full bg-gold/15 text-gold px-2 py-0.5">{st.toReview} zu bewerten</span>}
                        </div>
                      </td>
                      {data.assignments.map((a) => (
                        <td key={a.id} className="py-2 px-2 text-center">{byId[a.id] ? chip(byId[a.id]) : <span className="text-sage-muted/50">–</span>}</td>
                      ))}
                      <td className={`py-2.5 px-3 text-right font-semibold tabular-nums whitespace-nowrap ${red ? 'text-status-absent' : complete ? 'text-status-present' : 'text-sage'}`}>{st.done} von {st.total}</td>
                      <td className="py-2.5 pr-3 text-right">{open ? <ChevronUp size={16} className="inline text-sage-muted" /> : <ChevronDown size={16} className="inline text-sage-muted" />}</td>
                    </tr>,
                    open && (
                      <tr key={`${st.id}-d`} className="border-b border-line/60 bg-subtle/30">
                        <td colSpan={data.assignments.length + 3} className="p-0"><Details st={st} titles={titles} chip={chip} renderSubmission={renderSubmission} load={load} wide /></td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
      <p className="text-footnote text-sage-muted flex items-start gap-1.5 px-1"><ClipboardCheck size={14} className="shrink-0 mt-0.5" /> Rot = Frist vorbei und nicht abgegeben – danach kann der Schüler nichts mehr hochladen. Die Woche richtet sich nach der Frist der Hausaufgabe. Wie viele Hausaufgaben es pro Woche gibt, bestimmst du einfach durch das, was du aufgibst.</p>
    </div>
  );
}

// Abgaben eines Schülers (aufgeklappt): je Hausaufgabe Status + Inhalt/Bewerten.
function Details({ st, titles, chip, renderSubmission, load, wide = false }) {
  return (
    <div className={`border-t border-line/60 px-4 py-3 ${wide ? 'grid gap-4 lg:grid-cols-2' : 'space-y-4'}`}>
      {st.items.map((it) => (
        <div key={it.assignmentId} className="space-y-2 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-subhead font-medium text-ivory truncate" data-noi18n>{titles[it.assignmentId]}</span>
            {chip(it)}
          </div>
          {it.submission && renderSubmission(it.submission, load)}
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, hint, tone }) {
  const color = tone === 'mint' ? 'text-status-present' : tone === 'gold' ? 'text-gold' : tone === 'red' ? 'text-status-absent' : 'text-ivory';
  return (
    <div className="min-w-0">
      <div className={`text-title2 font-semibold tabular-nums leading-none ${color}`}>{value}</div>
      <div className="text-footnote font-medium text-sage mt-1.5">{label}</div>
      <div className="text-caption text-sage-muted leading-tight">{hint}</div>
    </div>
  );
}
