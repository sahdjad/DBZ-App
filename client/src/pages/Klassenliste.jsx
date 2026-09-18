import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Star } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, Spinner, useToast } from '../components/ui.jsx';

function rateColor(r) {
  if (r === null) return 'text-sage-muted';
  if (r >= 90) return 'text-status-present';
  if (r >= 75) return 'text-status-late';
  return 'text-status-absent';
}

export default function Klassenliste() {
  const navigate = useNavigate();
  const toast = useToast();
  const [classes, setClasses] = useState(null);
  const [classId, setClassId] = useState('');
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api.get('/classes').then((d) => {
      setClasses(d.classes);
      setClassId(d.classes[0]?.id || '');
    });
  }, []);

  const load = () => api.get(`/classes/${classId}/roster`).then(setData).catch(() => setData({ rows: [] }));
  useEffect(() => {
    if (!classId) return;
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const toggleKlassensprecher = async (e, row) => {
    e.stopPropagation();
    const promote = row.role !== 'klassensprecher';
    setBusyId(row.id);
    try {
      await api.post(`/students/${row.id}/klassensprecher`, { promote });
      toast.push(promote ? `${row.name} ist jetzt Klassensprecher(in)` : `${row.name} ist wieder regulärer Schüler`, 'success');
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

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
                  <tr className="text-left text-sage-muted border-b border-line">
                    <th className="py-3 px-4 font-medium">Name</th>
                    <th className="py-3 px-3 font-medium text-center" title="Anwesenheitsquote">Anw.</th>
                    <th className="py-3 px-3 font-medium text-center" title="Unentschuldigte Fehltage">Unent.</th>
                    <th className="py-3 px-3 font-medium text-center" title="Verspätung gesamt (Minuten)">Versp.</th>
                    <th className="py-3 px-3 font-medium text-center" title="Erledigte von gesamten Hausaufgaben">Erledigt</th>
                    <th className="py-3 px-3 font-medium text-center" title="Offene Aufgaben (davon überfällig)">Offen</th>
                    <th className="py-3 px-3 font-medium text-center" title="Offene Strafen">Strafen</th>
                    <th className="py-3 px-3 font-medium text-center" title="Negative Verhaltensvermerke">Vermerke</th>
                    <th className="py-3 px-3 font-medium text-center">Klassensprecher</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/profil/${r.id}`)}
                      className="border-b border-line last:border-0 hover:bg-hover cursor-pointer"
                    >
                      <td className="py-3 px-4 text-ivory whitespace-nowrap">
                        {r.name}
                        {r.role === 'klassensprecher' && <Star size={13} className="inline ml-1.5 -mt-0.5 text-gold" aria-label="Klassensprecher(in)" />}
                      </td>
                      <td className={`py-3 px-3 text-center font-mono ${rateColor(r.attendanceRate)}`}>
                        {r.attendanceRate === null ? '–' : `${r.attendanceRate}%`}
                      </td>
                      <td className={`py-3 px-3 text-center font-mono ${r.unexcused > 0 ? 'text-status-absent' : 'text-sage-muted'}`}>
                        {r.unexcused}
                      </td>
                      <td className={`py-3 px-3 text-center font-mono ${r.totalMinutesLate > 0 ? 'text-status-late' : 'text-sage-muted'}`}>
                        {r.totalMinutesLate > 0 ? `${r.totalMinutesLate}′` : '–'}
                      </td>
                      <td className="py-3 px-3 text-center font-mono">
                        <span className={r.doneAssignments > 0 ? 'text-status-present' : 'text-sage-muted'}>{r.doneAssignments}</span>
                        <span className="text-sage-muted">/{r.totalAssignments}</span>
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
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={(e) => toggleKlassensprecher(e, r)}
                          disabled={busyId === r.id}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition ${r.role === 'klassensprecher' ? 'border-gold/40 text-gold bg-gold/10 hover:bg-gold/15' : 'border-line text-sage hover:bg-subtle'}`}
                        >
                          {r.role === 'klassensprecher' ? 'Entfernen' : 'Ernennen'}
                        </button>
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
