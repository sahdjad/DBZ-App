import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Star, CircleDot, Link2, Copy, XCircle, ChevronDown, ChevronUp, UserMinus, RotateCcw, MoreHorizontal } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, Button, Spinner, useToast, ClassFolders, ChoiceDialog } from '../components/ui.jsx';
import { lastSeenLabel } from '../lib/format.js';
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

// "Klasse neu starten": Test-/Probedaten gezielt löschen, damit der echte
// Betrieb bei null beginnt. Schüler und Einstellungen bleiben erhalten; der
// Server legt vorher automatisch eine Sicherung an.
const RESET_SCOPES = [
  ['attendance', 'Anwesenheit & Unterrichtssitzungen', 'alle Check-ins, Verspätungen, Fehlzeiten, Sitzungen'],
  ['absences', 'Entschuldigungen & Krankmeldungen', 'alle Abwesenheitsmeldungen dieser Klasse'],
  ['assignments', 'Aufgaben & Abgaben', 'alle Hausaufgaben samt Abgaben und Bewertungen'],
  ['behavior', 'Verhalten & Mitarbeit', 'Verhaltens- und Mitarbeitseinträge'],
  ['penalties', 'Strafen', 'alle erfassten Strafen'],
  ['protocols', 'Protokolle', 'Unterrichtsprotokolle'],
];
function ClassResetCard({ classId, className, onDone }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [scopes, setScopes] = useState(['attendance', 'absences', 'assignments']);
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (k) => setScopes((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const run = async () => {
    setBusy(true);
    try {
      const { counts } = await api.post(`/classes/${classId}/reset-data`, { scopes, confirmName });
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      toast.push(`Klasse neu gestartet – ${total} Einträge gelöscht (Sicherung wurde angelegt)`, 'success');
      setOpen(false); setConfirmName('');
      onDone();
    } catch (err) { toast.push(err.message, 'error'); }
    finally { setBusy(false); }
  };
  return (
    <Card className="p-0 overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between p-4 text-left">
        <span className="flex items-center gap-2 text-ivory font-medium"><RotateCcw size={17} /> Klasse neu starten (Testdaten löschen)</span>
        {open ? <ChevronUp size={16} className="text-sage-muted" /> : <ChevronDown size={16} className="text-sage-muted" />}
      </button>
      {open && (
        <div className="p-4 space-y-3 border-t border-line">
          <p className="text-sm text-sage">
            Löscht die ausgewählten Daten von <b>{className}</b> endgültig – z. B. nach Probedurchläufen, damit der echte
            Unterricht bei null beginnt. Schüler, Klassenzuordnung, Materialien und Regeln bleiben erhalten. Vorher wird
            automatisch eine Sicherung angelegt.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {RESET_SCOPES.map(([k, l, d]) => (
              <label key={k} className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer ${scopes.includes(k) ? 'border-status-absent/50 bg-status-absent/5' : 'border-line'}`}>
                <input type="checkbox" className="mt-1" checked={scopes.includes(k)} onChange={() => toggle(k)} />
                <span><span className="block text-sm text-ivory">{l}</span><span className="block text-[11px] text-sage-muted">{d}</span></span>
              </label>
            ))}
          </div>
          <label className="block">
            <span className="text-sm text-sage">Zur Bestätigung den Klassennamen eingeben: <b>{className}</b></span>
            <input className="input mt-1" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={className} />
          </label>
          <Button variant="danger" loading={busy} disabled={!scopes.length || confirmName.trim() !== className} onClick={run}>
            <RotateCcw size={16} /> Ausgewählte Daten endgültig löschen
          </Button>
        </div>
      )}
    </Card>
  );
}

const ALL = '__all';
const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

// Ganze Koran-Schule alphabetisch (Leitung/Admin).
function SchoolRoster({ onBack }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  useEffect(() => { api.get('/school/roster').then((d) => setRows(d.rows)).catch(() => setRows([])); }, []);
  const list = (rows || []).filter((r) => (!type || (type === 'none' ? !r.classNames.length : r.classType === type))
    && (!q.trim() || [r.name, ...r.classNames].some((x) => x.toLowerCase().includes(q.trim().toLowerCase()))));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>← Alle Klassen</Button>
        <h2 className="text-lg text-ivory">Gesamte Koran-Schule</h2>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-muted" />
          <input className="input pl-9" placeholder="Name oder Klasse …" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter">
          <option value="">Alle</option>
          <option value="presence">Nur Präsenz</option>
          <option value="online">Nur Online</option>
          <option value="none">Ohne Klasse</option>
        </select>
        {rows && <span className="text-sm text-sage-muted">{list.length} Schüler</span>}
      </div>
      {!rows ? <Spinner /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-sage-muted border-b border-line">
                  <th className="py-3 px-4 font-medium">Name</th>
                  <th className="py-3 px-3 font-medium">Klasse</th>
                  <th className="py-3 px-3 font-medium">Form</th>
                  <th className="py-3 px-3 font-medium text-center">Anw.</th>
                  <th className="py-3 px-3 font-medium whitespace-nowrap">Zuletzt online</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} onClick={() => navigate(`/profil/${r.id}`)} className="border-b border-line last:border-0 hover:bg-hover cursor-pointer">
                    <td className="py-2.5 px-4 text-ivory whitespace-nowrap">{r.name}{r.role === 'klassensprecher' && <Star size={13} className="inline ml-1.5 -mt-0.5 text-gold" aria-label="Klassensprecher(in)" />}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">{r.classNames.join(', ') || <span className="text-status-late">ohne Klasse</span>}</td>
                    <td className="py-2.5 px-3">{r.classType === 'online' ? 'Online' : r.classType === 'presence' ? 'Präsenz' : '–'}</td>
                    <td className={`py-2.5 px-3 text-center font-mono ${rateColor(r.attendanceRate)}`}>{r.attendanceRate === null ? '–' : `${r.attendanceRate}%`}</td>
                    <td className="py-2.5 px-3 text-xs text-sage-muted whitespace-nowrap">{lastSeenLabel(r.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
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
  const isLeadership = ['leitung', 'super_admin'].includes(user.role);
  const [classes, setClasses] = useState(null);
  const [classId, setClassId] = useState('');
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [menuFor, setMenuFor] = useState(null); // Zeile, deren Aktionsmenü offen ist

  useEffect(() => {
    api.get('/classes').then((d) => {
      setClasses(d.classes);
      // Leitung/Admin wählen erst die Klasse (Ordner-Ansicht), Lehrkräfte starten direkt in ihrer Klasse.
      if (!isLeadership) setClassId(d.classes[0]?.id || '');
    });
  }, []);

  const load = () => api.get(`/classes/${classId}/roster`).then(setData).catch(() => setData({ rows: [] }));
  useEffect(() => {
    if (!classId || classId === ALL) return;
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

  // Nur aus DIESER Klasse entfernen, nicht das ganze Konto löschen -- der
  // Schüler bleibt (falls in weiteren Klassen) sonst erhalten.
  const removeFromClass = async (e, row) => {
    e.stopPropagation();
    if (!window.confirm(`${row.name} wirklich aus ${currentClass?.name} entfernen? Das Konto selbst bleibt bestehen.`)) return;
    setBusyId(row.id);
    try {
      await api.del(`/classes/${classId}/students/${row.id}`);
      toast.push(`${row.name} aus der Klasse entfernt`, 'success');
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

  if (isLeadership && (!classId || classId === ALL)) {
    const groups = (classes || []).map((c) => ({ id: c.id, name: c.name, count: c.studentCount, hint: `${c.type === 'online' ? 'Online' : 'Präsenz'} · ${WEEKDAY_SHORT[c.weekday] || ''} ${c.startTime || ''}–${c.endTime || ''}` }));
    return (
      <AppLayout title="Klassenliste">
        {!classes ? <Spinner /> : classId === ALL ? (
          <SchoolRoster onBack={() => setClassId('')} />
        ) : (
          <ClassFolders
            groups={groups}
            selected={null}
            onSelect={setClassId}
            extra={(
              <button type="button" onClick={() => setClassId(ALL)}
                className="text-left rounded-2xl border border-gold/40 bg-gold/10 p-4 hover:bg-gold/15 transition-all duration-200">
                <div className="text-ivory font-medium">Gesamte Koran-Schule</div>
                <div className="text-xs text-sage-muted mt-1">Alle Schüler alphabetisch, mit Klasse und Online/Präsenz</div>
              </button>
            )}
          />
        )}
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Klassenliste">
      <div className="space-y-4">
        {isLeadership && <ClassFolders groups={(classes || []).map((c) => ({ id: c.id, name: c.name }))} selected={classId} onSelect={(id) => { setClassId(id || ''); setData(null); }} />}
        {isTeacher && currentClass && <ClassInviteCard classId={classId} className={currentClass.name} />}
        {currentClass && ['klassenlehrer', 'vertretung', 'leitung', 'super_admin'].includes(user.role) && (
          <ClassResetCard classId={classId} className={currentClass.name} onDone={load} />
        )}
        <div className="flex flex-wrap items-center gap-3">
          {!isLeadership && classes && classes.length > 1 && (
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
            <p className="sm:hidden px-4 pt-3 text-[11px] text-sage-muted">Tabelle lässt sich seitlich scrollen →</p>
            <div className="overflow-x-auto" role="region" aria-label="Klassenliste, seitlich scrollbar" tabIndex={0}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-sage-muted border-b border-line">
                    <th className="py-3 px-4 font-medium">Name</th>
                    <th className="py-3 px-3 font-medium text-center"><abbr title="Anwesenheitsquote">Anw.</abbr></th>
                    <th className="py-3 px-3 font-medium text-center"><abbr title="Unentschuldigte Fehltage">Unent.</abbr></th>
                    <th className="py-3 px-3 font-medium text-center"><abbr title="Verspätung gesamt in Minuten">Versp.</abbr></th>
                    <th className="py-3 px-3 font-medium text-center"><abbr title="Erledigte von allen gestellten Hausaufgaben">Erledigt</abbr></th>
                    <th className="py-3 px-3 font-medium text-center"><abbr title="Offene Aufgaben, in Klammern die davon überfälligen">Offen</abbr></th>
                    <th className="py-3 px-3 font-medium text-center"><abbr title="Offene Strafen (Geld/Seiten)">Strafen</abbr></th>
                    <th className="py-3 px-3 font-medium text-center"><abbr title="Negative Verhaltensvermerke">Vermerke</abbr></th>
                    <th className="py-3 px-3 font-medium text-center whitespace-nowrap hidden xl:table-cell">Zuletzt online</th>
                    <th className="py-3 px-3 font-medium text-center"><span className="sr-only">Aktionen</span></th>
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
                        <Link
                          to={`/profil/${r.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline rounded"
                        >
                          {r.name}
                        </Link>
                        {r.role === 'klassensprecher' && <Star size={13} className="inline ml-1.5 -mt-0.5 text-gold" aria-label="Klassensprecher(in)" />}
                      </td>
                      <td className={`py-3 px-3 text-center font-mono ${rateColor(r.attendanceRate)}`} title={r.attendanceRate === null ? 'Noch keine Daten' : undefined}>
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
                      <td className="py-3 px-3 text-center text-xs text-sage-muted whitespace-nowrap hidden xl:table-cell">{lastSeenLabel(r.lastSeenAt)}</td>
                      <td className="py-2 px-2 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuFor(r); }}
                          disabled={busyId === r.id}
                          aria-label={`Aktionen für ${r.name}`}
                          className="grid place-items-center h-9 w-9 rounded-lg border border-line text-sage hover:bg-subtle transition"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {menuFor && (
          <ChoiceDialog
            title={menuFor.name}
            options={[
              { key: 'sprecher', label: menuFor.role === 'klassensprecher' ? 'Als Klassensprecher entfernen' : 'Zum Klassensprecher ernennen' },
              ...(isTeacher ? [
                { key: 'probation', label: menuFor.probation ? 'Probezeit beenden' : 'Probezeit markieren' },
                { key: 'remove', label: 'Aus der Klasse entfernen', description: 'Das Konto selbst bleibt bestehen.', variant: 'danger' },
              ] : []),
            ]}
            onClose={() => setMenuFor(null)}
            onChoose={(key) => {
              const row = menuFor;
              setMenuFor(null);
              const ev = { stopPropagation() {} };
              if (key === 'sprecher') toggleKlassensprecher(ev, row);
              else if (key === 'probation') toggleProbation(ev, row);
              else if (key === 'remove') removeFromClass(ev, row);
            }}
          />
        )}
        <p className="text-[11px] text-sage-muted">Tipp: Name antippen oder Zeile anklicken öffnet das Schülerprofil. Spalte „Offen" zeigt offene Aufgaben, die Zahl in Klammern die davon überfälligen. Abkürzungen in den Spaltenüberschriften zeigen beim Antippen/Hovern die volle Bezeichnung.</p>
      </div>
    </AppLayout>
  );
}
