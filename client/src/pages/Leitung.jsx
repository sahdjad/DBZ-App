import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gauge, Users, GraduationCap, UserCheck, Scale, HandCoins, FileText, AlertCircle } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Spinner } from '../components/ui.jsx';

function rateColor(r) {
  if (r === null || r === undefined) return 'text-sage-muted';
  if (r >= 90) return 'text-status-present';
  if (r >= 75) return 'text-status-late';
  return 'text-status-absent';
}

function Stat({ icon: Icon, label, value, tone, onClick }) {
  return (
    <Card className={`p-4 flex items-center gap-3 ${onClick ? 'cursor-pointer hover:bg-hover transition' : ''}`} onClick={onClick}>
      <span className={`grid place-items-center h-10 w-10 rounded-lg shrink-0 ${tone || 'bg-mint/15 text-mint'}`}>
        <Icon size={20} />
      </span>
      <div className="min-w-0">
        <div className="text-xl text-ivory font-mono leading-tight">{value}</div>
        <div className="text-xs text-sage-muted">{label}</div>
      </div>
    </Card>
  );
}

export default function Leitung() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);

  useEffect(() => { api.get('/leadership/overview').then(setD).catch(() => setD(null)); }, []);

  if (!d) return <AppLayout title="Leitung"><Spinner /></AppLayout>;
  const { counts, penalties, classes } = d;
  const hasPending = counts.pendingUsers > 0 || penalties.pendingApprovals > 0;

  return (
    <AppLayout title="Leitung – Überblick">
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat icon={Users} label="Klassen" value={counts.classes} />
          <Stat icon={GraduationCap} label="Schüler" value={counts.students} />
          <Stat icon={UserCheck} label="Eltern" value={counts.parents} />
          <Stat icon={Users} label="Lehrkräfte" value={counts.teachers} />
        </div>

        {/* Offene Vorgänge */}
        {hasPending && (
          <Card className="p-5">
            <CardHeader title="Offene Vorgänge" subtitle="Wartet auf Bearbeitung" icon={AlertCircle} />
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {counts.pendingUsers > 0 && (
                <button onClick={() => navigate('/admin')} className="flex items-center gap-3 rounded-xl border border-status-late/30 bg-status-late/10 px-4 py-3 text-left hover:bg-status-late/15 transition">
                  <UserCheck size={20} className="text-status-late" />
                  <div>
                    <div className="text-ivory">{counts.pendingUsers} Registrierung(en) freigeben</div>
                    <div className="text-xs text-sage-muted">Zur Verwaltung →</div>
                  </div>
                </button>
              )}
              {penalties.pendingApprovals > 0 && (
                <button onClick={() => navigate('/strafen')} className="flex items-center gap-3 rounded-xl border border-status-late/30 bg-status-late/10 px-4 py-3 text-left hover:bg-status-late/15 transition">
                  <Scale size={20} className="text-status-late" />
                  <div>
                    <div className="text-ivory">{penalties.pendingApprovals} Strafe(n) genehmigen</div>
                    <div className="text-xs text-sage-muted">Zu den Strafen →</div>
                  </div>
                </button>
              )}
            </div>
          </Card>
        )}

        {/* Strafen schulweit */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat icon={HandCoins} label="Offene Geldstrafen" value={`${penalties.openMoney} €`} tone="bg-status-late/15 text-status-late" onClick={() => navigate('/strafen')} />
          <Stat icon={FileText} label="Offene Seiten-Strafen" value={`${penalties.openPages}`} tone="bg-status-late/15 text-status-late" onClick={() => navigate('/strafen')} />
          <Stat icon={Scale} label="Offene Strafen gesamt" value={penalties.openCount} onClick={() => navigate('/strafen')} />
        </div>

        {/* Je Klasse */}
        <Card className="overflow-hidden">
          <CardHeader title="Je Klasse" subtitle="Anwesenheit & offene Strafen" icon={Gauge} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-sage-muted border-b border-black/10">
                  <th className="py-3 px-4 font-medium">Klasse</th>
                  <th className="py-3 px-3 font-medium text-center">Schüler</th>
                  <th className="py-3 px-3 font-medium text-center">Anw.</th>
                  <th className="py-3 px-3 font-medium text-center">Unent.</th>
                  <th className="py-3 px-3 font-medium text-center">Offene Strafen</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id} onClick={() => navigate('/klassenliste')} className="border-b border-black/5 last:border-0 hover:bg-hover cursor-pointer">
                    <td className="py-3 px-4 text-ivory whitespace-nowrap">{c.name}</td>
                    <td className="py-3 px-3 text-center font-mono">{c.students}</td>
                    <td className={`py-3 px-3 text-center font-mono ${rateColor(c.attendanceRate)}`}>{c.attendanceRate === null ? '–' : `${c.attendanceRate}%`}</td>
                    <td className={`py-3 px-3 text-center font-mono ${c.unexcused > 0 ? 'text-status-absent' : 'text-sage-muted'}`}>{c.unexcused}</td>
                    <td className="py-3 px-3 text-center font-mono whitespace-nowrap">
                      {c.openMoney === 0 && c.openPages === 0 ? (
                        <span className="text-sage-muted">–</span>
                      ) : (
                        <span className="text-status-late">
                          {c.openMoney > 0 && `${c.openMoney} €`}
                          {c.openMoney > 0 && c.openPages > 0 && ' · '}
                          {c.openPages > 0 && `${c.openPages} S.`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
