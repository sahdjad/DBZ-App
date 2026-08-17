import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Download } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Ring, StatusBadge, Spinner } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const MANAGER = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];

export default function Anwesenheit() {
  const { user } = useAuth();
  return <AppLayout title="Anwesenheit">{MANAGER.includes(user.role) ? <ManagerView /> : <SelfView />}</AppLayout>;
}

function rate(a) {
  return a.sessions ? Math.round(((a.present + a.late) / a.sessions) * 100) : 0;
}

function SelfView() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get('/me/attendance').then((d) => setStats(d.stats)); }, []);
  if (!stats) return <Spinner />;
  return (
    <Card className="p-6">
      <div className="flex items-center gap-6 flex-wrap">
        <Ring value={rate(stats)} size={110} stroke={9} label={`${rate(stats)}%`} sublabel="Anwesend" />
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Row label="Sitzungen" value={stats.sessions} />
          <Row label="Anwesend" value={stats.present} />
          <Row label="Verspätet" value={stats.late} />
          <Row label="Entschuldigt" value={stats.excused} />
          <Row label="Unentschuldigt" value={stats.unexcused} />
          <Row label="Ø Verspätung" value={`${stats.avgMinutesLate} Min`} />
        </div>
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
          <Button as="a" href={`/api/export/attendance.csv?classId=${classId}`} variant="outline" size="sm">
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
                <tr className="text-left text-sage-muted border-b border-black/10">
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
                  <tr key={r.id} className="border-b border-black/5">
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
