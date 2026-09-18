import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Download, Users2 } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Ring, StatusBadge, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '–');

export default function Anwesenheit() {
  const { user } = useAuth();
  return (
    <AppLayout title="Anwesenheit">
      {MANAGER.includes(user.role) ? (
        <ManagerView />
      ) : user.role === 'klassensprecher' ? (
        <div className="space-y-4">
          <TodayStatus classId={(user.classIds || [])[0]} />
          <SelfView />
        </div>
      ) : (
        <SelfView />
      )}
    </AppLayout>
  );
}

// Für den Klassensprecher: wer ist heute grün (da), wer rot (fehlt/zu spät),
// wer krank gemeldet und vom Lehrer bestätigt ist – auf einen Blick, ohne dass
// er selbst etwas ändern kann (nur lesend, entlastet die Lehrkraft).
function TodayStatus({ classId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!classId) return;
    api.get(`/classes/${classId}/today-status`).then(setData).catch(() => setData({ rows: [] }));
  }, [classId]);

  if (!data) return <Spinner />;
  const green = ['present', 'excused'];
  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader title="Heute" subtitle={data.hasSession ? 'Wer ist da, wer nicht' : 'Noch kein Check-in geöffnet'} icon={Users2} />
      <ul className="divide-y divide-line px-1">
        {data.rows.length === 0 ? (
          <p className="p-4 text-sage-muted text-sm">Keine Schüler in dieser Klasse.</p>
        ) : data.rows.map((r) => (
          <li key={r.id} className="py-2.5 px-3 flex items-center justify-between gap-3">
            <span className="text-ivory text-sm flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${green.includes(r.status) ? 'bg-status-present' : r.status === 'open' ? 'bg-subtle border border-line' : 'bg-status-absent'}`} />
              {r.name}
            </span>
            <span className="flex items-center gap-2">
              {r.minutesLate > 0 && <span className="font-mono text-status-late text-xs">{r.minutesLate} Min</span>}
              <StatusBadge status={r.status} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function rate(a) {
  return a.sessions ? Math.round(((a.present + a.late) / a.sessions) * 100) : 0;
}

function SelfView() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get('/me/attendance').then((d) => setStats(d.stats)); }, []);
  if (!stats) return <Spinner />;
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-center gap-6 flex-wrap">
          <Ring value={rate(stats)} size={110} stroke={9} label={`${rate(stats)}%`} sublabel="Anwesend" />
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <Row label="Sitzungen" value={stats.sessions} />
            <Row label="Anwesend" value={stats.present} />
            <Row label="Verspätet" value={stats.late} />
            <Row label="Entschuldigt" value={stats.excused} />
            <Row label="Unentschuldigt" value={stats.unexcused} />
            <Row label="Verspätung gesamt" value={`${stats.totalMinutesLate || 0} Min`} />
          </div>
        </div>
      </Card>
      <AttendanceDetail records={stats.records || []} />
    </div>
  );
}

// Einzelnachweis: wann genau war ich verspätet/abwesend und wie viele Minuten.
function AttendanceDetail({ records }) {
  const [showAll, setShowAll] = useState(false);
  const issues = records.filter((r) => r.status !== 'present');
  const shown = showAll ? records : issues;
  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader
        title="Einzelnachweis"
        subtitle={showAll ? 'Alle Sitzungen' : 'Verspätungen & Fehlzeiten'}
        icon={CalendarCheck}
      />
      <div className="p-4">
        <div className="flex justify-end mb-3">
          <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Nur Auffälligkeiten' : 'Alle Sitzungen zeigen'}
          </Button>
        </div>
        {shown.length === 0 ? (
          <p className="text-sage-muted text-sm py-2">Keine Verspätungen oder Fehlzeiten – weiter so, maschallah! 🌟</p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((r, i) => (
              <li key={i} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-ivory text-sm">{fmtDate(r.date)}</div>
                  {r.note && <div className="text-[11px] text-sage-muted">{r.note}</div>}
                </div>
                <div className="flex items-center gap-3">
                  {r.status === 'late' && r.minutesLate > 0 && (
                    <span className="font-mono text-status-late text-sm">{r.minutesLate} Min</span>
                  )}
                  <StatusBadge status={r.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-sage-muted">{label}</span>
      <span className="font-mono text-ivory">{value}</span>
    </div>
  );
}

function ManagerView() {
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState(null);

  useEffect(() => {
    api.get('/classes').then((d) => {
      setClasses(d.classes);
      setClassId(d.classes[0]?.id || '');
    });
  }, []);
  useEffect(() => {
    if (!classId) return;
    setRows(null);
    api.get(`/classes/${classId}/attendance-overview`).then((d) => setRows(d.rows));
  }, [classId]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        {classes.length > 1 ? (
          <select className="input w-auto" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : <span />}
        {classId && (
          <Button variant="outline" size="sm"
            onClick={() => api.download(`/export/attendance.csv?classId=${classId}`, `anwesenheit_${classId}.csv`).catch((e) => toast.push(e.message, 'error'))}>
            <Download size={16} /> CSV exportieren
          </Button>
        )}
      </div>
      <Card className="p-0 overflow-hidden">
        <CardHeader title="Klassenübersicht" subtitle="Anwesenheit pro Schüler" icon={CalendarCheck} />
        {!rows ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-sage-muted border-b border-line">
                  <th className="p-3 font-medium">Schüler</th>
                  <th className="p-3 font-medium">Quote</th>
                  <th className="p-3 font-medium">Anw.</th>
                  <th className="p-3 font-medium">Versp.</th>
                  <th className="p-3 font-medium">Versp. gesamt</th>
                  <th className="p-3 font-medium">Entsch.</th>
                  <th className="p-3 font-medium">Unentsch.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line">
                    <td className="p-3"><Link to={`/profil/${r.id}`} className="text-ivory hover:text-mint-light hover:underline">{r.name}</Link></td>
                    <td className="p-3 font-mono">{rate(r)}%</td>
                    <td className="p-3">{r.present}</td>
                    <td className="p-3">{r.late}</td>
                    <td className="p-3 font-mono">{r.totalMinutesLate || 0} Min</td>
                    <td className="p-3">{r.excused}</td>
                    <td className="p-3">{r.unexcused > 0 ? <StatusBadge status="unexcused" /> : r.unexcused}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="p-4 text-sage-muted">Keine Schüler in dieser Klasse.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
