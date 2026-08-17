import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ChevronLeft, Printer } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, StatusBadge, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' }) : '');
const rate = (a) => (a.sessions ? Math.round(((a.present + a.late) / a.sessions) * 100) : 0);

export default function Berichte() {
  const { user } = useAuth();
  return <AppLayout title="Berichte">{MANAGER.includes(user.role) ? <ManagerView /> : <ReadView role={user.role} />}</AppLayout>;
}

function ReportView({ report }) {
  const d = report.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Anwesenheitsquote" value={`${rate(d.attendance)}%`} />
        <Stat label="Verspätungen" value={d.attendance.late} />
        <Stat label="Unentschuldigt" value={d.attendance.unexcused} tone={d.attendance.unexcused ? 'absent' : 'mint'} />
        <Stat label="Aufgaben bestanden" value={`${d.homework.passed}/${d.homework.total}`} />
        <Stat label="Verpasste Aufgaben" value={d.homework.missed} tone={d.homework.missed ? 'late' : 'mint'} />
        <Stat label="Verhalten (+ / Hinweis)" value={`${d.behavior.positive} / ${d.behavior.hinweis}`} />
      </div>
      {report.teacherComment && (
        <div className="rounded-lg border border-black/10 bg-black/[0.03] p-4">
          <div className="text-sm text-ivory mb-1">Kommentar der Lehrkraft</div>
          <p className="text-sage whitespace-pre-line">{report.teacherComment}</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'mint' }) {
  const colors = { mint: 'text-mint-light', late: 'text-status-late', absent: 'text-status-absent' };
  return (
    <div className="rounded-lg border border-black/10 bg-black/[0.03] p-4">
      <div className={`font-mono text-xl ${colors[tone] || colors.mint}`}>{value}</div>
      <div className="text-xs text-sage-muted mt-1">{label}</div>
    </div>
  );
}

// --- Lehrer/Verwaltung -------------------------------------------------------
function ManagerView() {
  const toast = useToast();
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState('');
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [reports, setReports] = useState([]);
  const [active, setActive] = useState(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const loadReports = () => api.get('/reports').then((d) => setReports(d.reports));
  useEffect(() => {
    api.get('/report-periods').then((d) => { setPeriods(d.periods); setPeriodId(d.periods[0]?.id || ''); });
    api.get('/classes').then((d) => { setClasses(d.classes); setClassId(d.classes[0]?.id || ''); });
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
      loadReports();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  const save = async (status) => {
    setBusy(true);
    try {
      const { report } = await api.patch(`/reports/${active.id}`, { teacherComment: comment, status });
      setActive(report);
      toast.push(status === 'released' ? 'Bericht freigegeben' : 'Entwurf gespeichert', 'success');
      loadReports();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const statusOf = (studentId) => reports.find((r) => r.studentId === studentId && r.periodId === periodId)?.status;

  if (active) {
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
            <ReportView report={{ ...active, teacherComment: '' }} />
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
      <div className="flex gap-2 flex-wrap">
        <select className="input w-auto" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {classes.length > 1 && (
          <select className="input w-auto" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      <Card className="p-5">
        <CardHeader title="Schüler" subtitle="Bericht erstellen oder öffnen" icon={FileText} />
        <div className="divide-y divide-black/5">
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
    </div>
  );
}

// --- Schüler / Eltern --------------------------------------------------------
function ReadView() {
  const [reports, setReports] = useState(null);
  const [active, setActive] = useState(null);

  useEffect(() => { api.get('/reports').then((d) => setReports(d.reports)); }, []);

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
          <div className="p-4"><ReportView report={active} /></div>
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
