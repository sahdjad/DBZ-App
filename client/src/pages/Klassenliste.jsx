import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, Spinner } from '../components/ui.jsx';

function rateColor(r) {
  if (r === null) return 'text-sage-muted';
  if (r >= 90) return 'text-status-present';
  if (r >= 75) return 'text-status-late';
  return 'text-status-absent';
}

export default function Klassenliste() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState(null);
  const [classId, setClassId] = useState('');
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/classes').then((d) => {
      setClasses(d.classes);
      setClassId(d.classes[0]?.id || '');
    });
  }, []);

  useEffect(() => {
    if (!classId) return;
    setData(null);
    api.get(`/classes/${classId}/roster`).then(setData).catch(() => setData({ rows: [] }));
  }, [classId]);

  const rows = useMemo(() => {
    const list = data?.rows || [];
    const s = q.trim().toLowerCase();
    return s ? list.filter((r) => r.name.toLowerCase().includes(s)) : list;
  }, [data, q]);

  return (
    <AppLayout title="Klassenliste">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {classes && classes.length > 1 && (
            <select className="input w-auto" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-muted" />
            <input className="input pl-9" placeholder="Schüler suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {data && <span className="text-sm text-sage-muted">{rows.length} Schüler</span>}
        </div>

        {!data ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Card className="p-6 text-sage-muted text-sm">Keine Schüler gefunden.</Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-sage-muted border-b border-black/10">
                    <th className="py-3 px-4 font-medium">Name</th>
                    <th className="py-3 px-3 font-medium text-center" title="Anwesenheitsquote">Anw.</th>
                    <th className="py-3 px-3 font-medium text-center" title="Unentschuldigte Fehltage">Unent.</th>
                    <th className="py-3 px-3 font-medium text-center" title="Offene Aufgaben (davon überfällig)">Aufgaben</th>
                    <th className="py-3 px-3 font-medium text-center" title="Offene Strafen">Strafen</th>
                    <th className="py-3 px-3 font-medium text-center" title="Negative Verhaltensvermerke">Vermerke</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/profil/${r.id}`)}
                      className="border-b border-black/5 last:border-0 hover:bg-hover cursor-pointer"
                    >
                      <td className="py-3 px-4 text-ivory whitespace-nowrap">{r.name}</td>
                      <td className={`py-3 px-3 text-center font-mono ${rateColor(r.attendanceRate)}`}>
                        {r.attendanceRate === null ? '–' : `${r.attendanceRate}%`}
                      </td>
                      <td className={`py-3 px-3 text-center font-mono ${r.unexcused > 0 ? 'text-status-absent' : 'text-sage-muted'}`}>
                        {r.unexcused}
                      </td>
                      <td className="py-3 px-3 text-center font-mono">
                        <span className={r.openAssignments > 0 ? 'text-ivory' : 'text-sage-muted'}>{r.openAssignments}</span>
                        {r.overdueAssignments > 0 && <span className="text-status-absent"> ({r.overdueAssignments}!)</span>}
                      </td>
                      <td className="py-3 px-3 text-center font-mono whitespace-nowrap">
                        {r.penaltyMoney === 0 && r.penaltyPages === 0 ? (
                          <span className="text-sage-muted">–</span>
                        ) : (
                          <span className="text-status-late">
                            {r.penaltyMoney > 0 && `${r.penaltyMoney} €`}
                            {r.penaltyMoney > 0 && r.penaltyPages > 0 && ' · '}
                            {r.penaltyPages > 0 && `${r.penaltyPages} S.`}
                          </span>
                        )}
                      </td>
                      <td className={`py-3 px-3 text-center font-mono ${r.negativeBehavior > 0 ? 'text-status-late' : 'text-sage-muted'}`}>
                        {r.negativeBehavior}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        <p className="text-[11px] text-sage-muted">Tipp: Auf eine Zeile tippen öffnet das Schülerprofil. „Aufgaben" zeigt offene Aufgaben, in Klammern die überfälligen.</p>
      </div>
    </AppLayout>
  );
}
