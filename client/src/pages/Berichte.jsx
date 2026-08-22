import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ChevronLeft, Printer, GraduationCap, Table2, Sparkles, Wand2 } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, StatusBadge, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { GRADE_OPTIONS, gradeLabel, avgLabel } from '../lib/grades.js';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' }) : '');
const rate = (a) => (a.sessions ? Math.round(((a.present + a.late) / a.sessions) * 100) : 0);
const subjectName = (subjects, id) => subjects.find((s) => s.id === id)?.name || id;

// Monatsauswahl für die Auswertung (Gesamt + letzte 6 Monate).
function monthOptions() {
  const opts = [{ value: '', label: 'Gesamter Zeitraum' }];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) });
  }
  return opts;
}
const MONTHS = monthOptions();

export default function Berichte() {
  const { user } = useAuth();
  return <AppLayout title="Zeugnisse">{MANAGER.includes(user.role) ? <ManagerView /> : <ReadView role={user.role} />}</AppLayout>;
}

// Fachnoten + Durchschnitt (Anzeige).
function GradesTable({ grades, subjects, effectiveAverage, averageOverride }) {
  const withGrades = (grades || []).filter((g) => g.grade != null);
  if (!withGrades.length && effectiveAverage == null) return null;
  return (
    <div className="rounded-lg border border-line bg-subtle p-4">
      <div className="text-sm text-ivory mb-2 inline-flex items-center gap-1.5"><GraduationCap size={15} /> Fachnoten</div>
      <div className="divide-y divide-line">
        {withGrades.map((g) => (
          <div key={g.subject} className="py-1.5 flex items-center justify-between text-sm">
            <span className="text-sage">{subjectName(subjects, g.subject)}</span>
            <span className="text-ivory font-mono">{gradeLabel(g.grade)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-line flex items-center justify-between">
        <span className="text-sm text-ivory">Gesamtdurchschnitt{averageOverride != null ? ' (angepasst)' : ''}</span>
        <span className="text-lg font-mono text-mint-light">{avgLabel(effectiveAverage)}</span>
      </div>
    </div>
  );
}

function ReportView({ report, subjects = [] }) {
  const d = report.data;
  return (
    <div className="space-y-4">
      <GradesTable grades={report.grades} subjects={subjects} effectiveAverage={report.effectiveAverage} averageOverride={report.averageOverride} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Anwesenheitsquote" value={`${rate(d.attendance)}%`} />
        <Stat label="Verspätungen" value={d.attendance.late} />
        <Stat label="Unentschuldigt" value={d.attendance.unexcused} tone={d.attendance.unexcused ? 'absent' : 'mint'} />
        <Stat label="Aufgaben bestanden" value={`${d.homework.passed}/${d.homework.total}`} />
        <Stat label="Verpasste Aufgaben" value={d.homework.missed} tone={d.homework.missed ? 'late' : 'mint'} />
        <Stat label="Eingereichte Audios" value={d.audios?.count ?? 0} />
        <Stat label="Aktivitäten / Spiele" value={d.activities?.count ?? 0} />
        <Stat label="Verhalten (+ / Hinweis)" value={`${d.behavior.positive} / ${d.behavior.hinweis}`} />
      </div>
      {report.teacherComment && (
        <div className="rounded-lg border border-line bg-subtle p-4">
          <div className="text-sm text-ivory mb-1">Kommentar der Lehrkraft</div>
          <p className="text-sage whitespace-pre-line">{report.teacherComment}</p>
        </div>
      )}
    </div>
  );
}

// Noten-Editor (Lehrkraft): Fachnote je Fach + berechneter Ø + Override.
function GradesEditor({ subjects, grades, onChange, computedAvg, override, onOverride }) {
  const setGrade = (subject, value) => {
    const v = value === '' ? null : Number(value);
    onChange((subjects || []).map((s) => {
      const cur = grades.find((g) => g.subject === s.id);
      return s.id === subject ? { subject: s.id, grade: v } : { subject: s.id, grade: cur ? cur.grade : null };
    }));
  };
  const gradeOf = (id) => grades.find((g) => g.subject === id)?.grade ?? '';
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="text-sm text-ivory mb-3 inline-flex items-center gap-1.5"><GraduationCap size={16} /> Fachnoten</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {subjects.map((s) => (
          <label key={s.id} className="flex items-center justify-between gap-2">
            <span className="text-sm text-sage">{s.name}</span>
            <select className="input w-28 py-1.5 text-sm" value={gradeOf(s.id)} onChange={(e) => setGrade(s.id, e.target.value)}>
              <option value="">–</option>
              {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-sage-muted">Berechneter Durchschnitt: </span>
          <span className="font-mono text-ivory">{avgLabel(computedAvg)}</span>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-sage">Ø überschreiben</span>
          <input type="number" min={1} max={6} step={0.1} className="input w-24 py-1.5 text-sm text-center"
            placeholder="auto" value={override ?? ''} onChange={(e) => onOverride(e.target.value === '' ? null : Number(e.target.value))} />
        </label>
      </div>
      <p className="text-[11px] text-sage-muted mt-2">Leer lassen = automatischer Durchschnitt. Ein eingetragener Wert überschreibt ihn im Zeugnis.</p>
    </div>
  );
}

function Stat({ label, value, tone = 'mint' }) {
  const colors = { mint: 'text-mint-light', late: 'text-status-late', absent: 'text-status-absent' };
  return (
    <div className="rounded-lg border border-line bg-subtle p-4">
      <div className={`font-mono text-xl ${colors[tone] || colors.mint}`}>{value}</div>
      <div className="text-xs text-sage-muted mt-1">{label}</div>
    </div>
  );
}

// --- Lehrer/Verwaltung -------------------------------------------------------
// Automatischer Leistungsstand + Notenvorschlag (nur Vorschlag – Lehrkraft entscheidet).
function StandingPanel({ standing, onApplyAverage }) {
  if (!standing) return null;
  if (!standing.available) {
    return <div className="rounded-lg border border-line bg-subtle p-4 text-sm text-sage-muted inline-flex items-center gap-2"><Sparkles size={15} /> {standing.summary}</div>;
  }
  return (
    <div className="rounded-lg border border-mint/30 bg-mint/[0.05] p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-sm text-ivory inline-flex items-center gap-1.5"><Sparkles size={16} className="text-mint-light" /> Automatischer Notenvorschlag</div>
        <div className="text-right leading-none">
          <div className="text-2xl font-mono text-mint-light">{gradeLabel(standing.suggestedGradeHalf)}</div>
          <div className="text-[10px] text-sage-muted mt-0.5">rechnerisch {avgLabel(standing.suggestedGrade)}</div>
        </div>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {standing.dimensions.filter((d) => d.grade != null).map((d) => (
          <div key={d.key} className="flex items-start justify-between gap-2 text-xs">
            <span className="text-sage min-w-0"><span className="text-ivory">{d.label}</span> · {d.detail}</span>
            <span className="font-mono text-ivory shrink-0">{avgLabel(d.grade)}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-sage-muted mt-3">{standing.summary} Der Vorschlag ist unverbindlich – du entscheidest.</p>
      <div className="mt-3">
        <Button size="sm" variant="outline" onClick={() => onApplyAverage(standing.suggestedGradeHalf)}><Wand2 size={14} /> Als Gesamt-Ø übernehmen</Button>
      </div>
    </div>
  );
}

const liveAverage = (grades) => {
  const vals = (grades || []).map((g) => g.grade).filter((v) => typeof v === 'number');
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
};

function ManagerView() {
  const toast = useToast();
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState('');
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [reports, setReports] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [active, setActive] = useState(null);
  const [comment, setComment] = useState('');
  const [grades, setGrades] = useState([]);
  const [override, setOverride] = useState(null);
  const [standing, setStanding] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('students'); // students | overview
  const [month, setMonth] = useState(''); // '' = Gesamt, sonst YYYY-MM

  const loadReports = () => api.get('/reports').then((d) => setReports(d.reports));
  const loadStanding = (studentId, m = month) => {
    setStanding(null);
    const q = m ? `?month=${m}` : '';
    api.get(`/students/${studentId}/standing${q}`).then((d) => setStanding(d.standing)).catch(() => {});
  };
  // Monat gewechselt & Bericht offen -> Leistungsstand für den Monat neu laden.
  useEffect(() => { if (active) loadStanding(active.studentId); /* eslint-disable-next-line */ }, [month]);
  useEffect(() => {
    api.get('/report-periods').then((d) => { setPeriods(d.periods); setPeriodId(d.periods[0]?.id || ''); });
    api.get('/classes').then((d) => { setClasses(d.classes); setClassId(d.classes[0]?.id || ''); });
    api.get('/subjects').then((d) => setSubjects(d.subjects)).catch(() => {});
    loadReports();
  }, []);
  useEffect(() => {
    if (classId) api.get(`/classes/${classId}/students`).then((d) => setStudents(d.students));
  }, [classId]);

  const openReport = async (studentId) => {
    try {
      const { report } = await api.post('/reports', { studentId, periodId });
      setActive(report);
      setComment(report.teacherComment || '');
      setGrades(report.grades || []);
      setOverride(report.averageOverride ?? null);
      loadStanding(studentId);
      loadReports();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  const save = async (status) => {
    setBusy(true);
    try {
      const { report } = await api.patch(`/reports/${active.id}`, { teacherComment: comment, grades, averageOverride: override, status });
      setActive(report);
      setGrades(report.grades || []);
      setOverride(report.averageOverride ?? null);
      toast.push(status === 'released' ? 'Zeugnis freigegeben' : 'Entwurf gespeichert', 'success');
      loadReports();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const statusOf = (studentId) => reports.find((r) => r.studentId === studentId && r.periodId === periodId)?.status;

  if (active) {
    const computedAvg = liveAverage(grades);
    return (
      <div>
        <button onClick={() => setActive(null)} className="inline-flex items-center gap-2 text-sm text-sage-muted hover:text-ivory mb-4">
          <ChevronLeft size={16} /> Zur Übersicht
        </button>
        <Card className="p-5">
          <CardHeader
            title={active.studentName}
            subtitle={active.periodName}
            icon={FileText}
            action={<StatusBadge status={active.status === 'released' ? 'approved' : 'draft'} />}
          />
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-sage-muted">Auswertungs­zeitraum:</span>
              <select className="input w-auto py-1.5 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <StandingPanel standing={standing} onApplyAverage={(g) => setOverride(g)} />
            <GradesEditor subjects={subjects} grades={grades} onChange={setGrades} computedAvg={computedAvg} override={override} onOverride={setOverride} />
            <ReportView report={{ ...active, teacherComment: '', grades: [] }} subjects={subjects} />
            <label className="block">
              <span className="text-sm text-sage">Kommentar der Lehrkraft</span>
              <textarea className="input mt-1" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => save('draft')} disabled={busy}>Entwurf speichern</Button>
              <Button onClick={() => save('released')} disabled={busy}>Freigeben</Button>
              <Button as={Link} to={`/bericht/${active.id}/druck`} variant="ghost"><Printer size={18} /> PDF / Drucken</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <select className="input w-auto" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {classes.length > 1 && (
          <select className="input w-auto" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {tab === 'overview' && (
          <select className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} title="Auswertungszeitraum">
            {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        )}
        <div className="ml-auto inline-flex rounded-lg border border-line overflow-hidden">
          <button onClick={() => setTab('students')} className={`px-3 py-1.5 text-sm ${tab === 'students' ? 'bg-mint/10 text-mint-light' : 'text-sage-muted'}`}>Schüler</button>
          <button onClick={() => setTab('overview')} className={`px-3 py-1.5 text-sm inline-flex items-center gap-1 ${tab === 'overview' ? 'bg-mint/10 text-mint-light' : 'text-sage-muted'}`}><Table2 size={14} /> Klassenübersicht</button>
        </div>
      </div>

      {tab === 'overview' ? (
        <ClassOverview periodId={periodId} classId={classes.length > 1 ? classId : ''} month={month} onOpen={openReport} />
      ) : (
        <Card className="p-5">
          <CardHeader title="Schüler" subtitle="Zeugnis erstellen oder öffnen" icon={FileText} />
          <div className="divide-y divide-line">
            {students.map((s) => (
              <div key={s.id} className="py-3 flex items-center justify-between gap-3">
                <span className="text-ivory">{s.name}</span>
                <div className="flex items-center gap-2">
                  {statusOf(s.id) && <StatusBadge status={statusOf(s.id) === 'released' ? 'approved' : 'draft'} />}
                  <Button size="sm" variant="outline" onClick={() => openReport(s.id)}>
                    {statusOf(s.id) ? 'Öffnen' : 'Erstellen'}
                  </Button>
                </div>
              </div>
            ))}
            {students.length === 0 && <p className="p-4 text-sage-muted text-sm">Keine Schüler in dieser Klasse.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

// Klassenübersicht (Leitung/Lehrkraft): alle Schüler mit Ø-Note + Status.
function ClassOverview({ periodId, classId, month, onOpen }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!periodId) return;
    const q = new URLSearchParams({ periodId, ...(classId ? { classId } : {}), ...(month ? { month } : {}) });
    api.get(`/reports/overview?${q}`).then((d) => setRows(d.rows)).catch(() => setRows([]));
  }, [periodId, classId, month]);

  if (!rows) return <Spinner />;
  if (!rows.length) return <Card className="p-6 text-sage-muted text-sm">Keine Schüler für diese Auswahl.</Card>;
  const withAvg = rows.filter((r) => r.effectiveAverage != null);
  const classAvg = withAvg.length ? Math.round((withAvg.reduce((a, r) => a + r.effectiveAverage, 0) / withAvg.length) * 100) / 100 : null;

  return (
    <Card className="p-5">
      <CardHeader title="Klassenübersicht" subtitle={`Ø der Klasse: ${avgLabel(classAvg)}`} icon={Table2} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-sage-muted border-b border-line">
              <th className="py-2 font-medium">Schüler/in</th>
              <th className="py-2 font-medium">Klasse</th>
              <th className="py-2 font-medium text-center">Vorschlag</th>
              <th className="py-2 font-medium text-center">Ø-Note</th>
              <th className="py-2 font-medium text-center">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.studentId}>
                <td className="py-2 text-ivory">{r.studentName}</td>
                <td className="py-2 text-sage-muted">{r.className}</td>
                <td className="py-2 text-center font-mono text-mint-light" title="Automatischer Notenvorschlag">{gradeLabel(r.suggestedGrade)}</td>
                <td className="py-2 text-center font-mono text-ivory">{avgLabel(r.effectiveAverage)}</td>
                <td className="py-2 text-center">
                  {r.status ? <StatusBadge status={r.status === 'released' ? 'approved' : 'draft'} /> : <span className="text-sage-muted">–</span>}
                </td>
                <td className="py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => onOpen(r.studentId)}>{r.status ? 'Öffnen' : 'Erstellen'}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// --- Schüler / Eltern --------------------------------------------------------
function ReadView() {
  const [reports, setReports] = useState(null);
  const [active, setActive] = useState(null);
  const [subjects, setSubjects] = useState([]);

  useEffect(() => {
    api.get('/reports').then((d) => setReports(d.reports));
    api.get('/subjects').then((d) => setSubjects(d.subjects)).catch(() => {});
  }, []);

  if (active) {
    return (
      <div>
        <button onClick={() => setActive(null)} className="inline-flex items-center gap-2 text-sm text-sage-muted hover:text-ivory mb-4">
          <ChevronLeft size={16} /> Zurück
        </button>
        <Card className="p-5">
          <CardHeader
            title={active.periodName}
            subtitle={active.studentName}
            icon={FileText}
            action={<Button as={Link} to={`/bericht/${active.id}/druck`} variant="outline" size="sm"><Printer size={16} /> PDF</Button>}
          />
          <div className="p-4"><ReportView report={active} subjects={subjects} /></div>
        </Card>
      </div>
    );
  }

  if (!reports) return <Spinner />;
  if (reports.length === 0) return <Card className="p-6 text-sage-muted">Noch keine freigegebenen Berichte.</Card>;
  return (
    <div className="space-y-2">
      {reports.map((r) => (
        <Card key={r.id} className="p-4 hover:bg-hover transition flex items-center justify-between gap-3 cursor-pointer" onClick={() => setActive(r)}>
          <div>
            <div className="text-ivory">{r.periodName}</div>
            <div className="text-xs text-sage-muted">{r.studentName} · freigegeben {fmt(r.releasedAt)}</div>
          </div>
          <Badge tone="present">Freigegeben</Badge>
        </Card>
      ))}
    </div>
  );
}
