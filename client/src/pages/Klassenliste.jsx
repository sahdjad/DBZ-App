import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Star, CircleDot, Link2, Copy, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, Button, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

const TEACHER_ROLES = ['klassenlehrer', 'vertretung'];
const INVITE_ROLE_LABELS = { schueler: 'Schüler', klassensprecher: 'Klassensprecher(in)', eltern: 'Eltern' };

// Lehrkräfte können hier – ohne Umweg über die Verwaltung – einen
// Registrierungslink für die eigene Klasse erzeugen (Schüler/Klassensprecher/
// Eltern). Der Server erzwingt ohnehin, dass Lehrkräfte nur für ihre eigene
// Klasse einladen dürfen (siehe /admin/invites in api.js).
function ClassInviteCard({ classId, className }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [invites, setInvites] = useState(null);
  const [form, setForm] = useState({ role: 'schueler', expiresInDays: 14, maxUses: 30 });
  const [created, setCreated] = useState(null);

  const load = () => api.get('/admin/invites').then((d) => setInvites(d.invites.filter((i) => i.className === className)));
  useEffect(() => {
    if (!open) return;
    setCreated(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId]);

  const create = async () => {
    try {
      const payload = { role: form.role, classId, expiresInDays: Number(form.expiresInDays), maxUses: Number(form.maxUses) };
      const { token } = await api.post('/admin/invites', payload);
      setCreated(`${window.location.origin}/#/registrieren?token=${token}`);
      toast.push('Einladungslink erstellt', 'success');
      load();
    } catch (err) { toast.push(err.message, 'error'); }
  };
  const revoke = async (id) => { try { await api.post(`/admin/invites/${id}/revoke`); load(); } catch (err) { toast.push(err.message, 'error'); } };
  const copy = (link) => { navigator.clipboard?.writeText(link); toast.push('Link kopiert', 'success'); };
  const statusColor = (s) => (s === 'aktiv' ? 'text-status-present' : s === 'aufgebraucht' ? 'text-sage-muted' : 'text-status-late');

  return (
    <Card className="p-0 overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between p-4 text-left">
        <span className="flex items-center gap-2 text-ivory font-medium"><Link2 size={17} /> Anmeldelink für {className}</span>
        {open ? <ChevronUp size={16} className="text-sage-muted" /> : <ChevronDown size={16} className="text-sage-muted" />}
      </button>
      {open && (
        <div className="p-4 pt-4 space-y-4 border-t border-line">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <label className="block">
              <span className="text-sm text-sage">Rolle</span>
              <select className="input mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {Object.entries(INVITE_ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-sage">Gültig (Tage)</span>
              <input type="number" className="input mt-1" value={form.expiresInDays} onChange={(e) => setForm({ ...form, expiresInDays: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm text-sage">Max. Nutzungen</span>
              <input type="number" className="input mt-1" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
            </label>
            <Button onClick={create}><Link2 size={16} /> Link erstellen</Button>
          </div>

          {created && (
            <div className="rounded-lg border border-mint/30 bg-mint/5 p-3">
              <div className="text-sm text-sage mb-2">Diesen Link teilen (z. B. per WhatsApp):</div>
              <div className="flex gap-2">
                <input readOnly className="input font-mono text-xs" value={created} onFocus={(e) => e.target.select()} />
                <Button variant="outline" onClick={() => copy(created)}><Copy size={16} /> Kopieren</Button>
              </div>
            </div>
          )}

          {invites === null ? <Spinner /> : invites.length === 0 ? (
            <p className="text-xs text-sage-muted">Noch keine Einladungen für diese Klasse.</p>
          ) : (
            <div className="space-y-1.5">
              {invites.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-2 text-xs border-b border-line pb-1.5 last:border-0">
                  <span className="text-sage">{i.roleLabel} · genutzt {i.usedCount}/{i.maxUses} · bis {new Date(i.expiresAt).toLocaleDateString('de-DE')}</span>
                  <span className="flex items-center gap-2">
                    <span className={statusColor(i.status)}>{i.status}</span>
                    {i.status === 'aktiv' && (
                      <Button size="sm" variant="ghost" onClick={() => revoke(i.id)}><XCircle size={14} /> Sperren</Button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function rateColor(r) {
  if (r === null) return 'text-sage-muted';
  if (r >= 90) return 'text-status-present';
  if (r >= 75) return 'text-status-late';
  return 'text-status-absent';
}

export default function Klassenliste() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const isTeacher = TEACHER_ROLES.includes(user.role);
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

  const toggleProbation = async (e, row) => {
    e.stopPropagation();
    const probation = !row.probation;
    setBusyId(row.id);
    try {
      await api.post(`/students/${row.id}/probation`, { probation });
      toast.push(probation ? `${row.name} auf Probezeit gesetzt` : `${row.name}: Probezeit beendet`, 'success');
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

  const currentClass = classes?.find((c) => c.id === classId);

  return (
    <AppLayout title="Klassenliste">
      <div className="space-y-4">
        {isTeacher && currentClass && <ClassInviteCard classId={classId} className={currentClass.name} />}
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
                    {isTeacher && <th className="py-3 px-3 font-medium text-center">Probezeit</th>}
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
                        {r.probation && <CircleDot size={10} className="inline mr-1.5 -mt-0.5 text-blue-400" aria-label="Probezeit" />}
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
                      {isTeacher && (
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={(e) => toggleProbation(e, r)}
                            disabled={busyId === r.id}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition ${r.probation ? 'border-blue-400/40 text-blue-400 bg-blue-400/10 hover:bg-blue-400/15' : 'border-line text-sage hover:bg-subtle'}`}
                          >
                            {r.probation ? 'Beenden' : 'Markieren'}
                          </button>
                        </td>
                      )}
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
