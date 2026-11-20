import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Users2, School, Settings, ScrollText, Plus, Download, Mail, Copy, KeyRound, CheckCircle2, ShieldCheck, XCircle, Link2, UserCheck, RotateCcw, Search, ChevronRight, Check, Database, CalendarClock } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { Card, CardHeader, Button, Badge, Spinner, Avatar, ListGroup, EmptyState, Segmented, useToast } from '../components/ui.jsx';
import { mergePeople, classFilters } from '../lib/people.js';
import { lastSeenLabel } from '../lib/format.js';
import { PersonAdminPanel } from '../components/PersonAdmin.jsx';

const TABS = [
  ['users', 'Nutzer', Users2],
  ['pending', 'Neue Anmeldungen', UserCheck],
  ['invites', 'Einladungen', Mail],
  ['classes', 'Klassen', School],
  ['approvals', 'Genehmigungen', ShieldCheck],
  ['settings', 'Einstellungen', Settings],
  ['audit', 'Audit-Log', ScrollText],
];

export default function Admin() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'users');
  const isSuperAdmin = user?.role === 'super_admin';
  return (
    <AppLayout title="Verwaltung" wide>
      <div className="no-scrollbar flex gap-2 mb-5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap" role="tablist">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 h-9 text-footnote font-semibold transition-colors ${tab === k ? 'bg-mint text-onaccent' : 'bg-card border border-line/70 text-sage hover:bg-hover'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {tab === 'users' && <UsersTab />}
      {tab === 'pending' && <PendingTab />}
      {tab === 'invites' && <InvitesTab />}
      {tab === 'classes' && <ClassesTab />}
      {tab === 'approvals' && <ApprovalsTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'audit' && <AuditTab />}
    </AppLayout>
  );
}

// Genehmigungen: der System-Administrator bestätigt/lehnt Grundlagen-Änderungen
// der Leitung (neue Konten, neue Klassen). Die Leitung sieht hier ihre eigenen
// Anträge samt Status.
const CR_STATUS = {
  pending: ['Offen', 'late'], approved: ['Bestätigt', 'present'], executed: ['Ausgeführt', 'present'], rejected: ['Abgelehnt', 'absent'],
  failed: ['Fehlgeschlagen', 'absent'], expired: ['Abgelaufen', 'neutral'], withdrawn: ['Zurückgezogen', 'neutral'],
};
const ROLE_NAME = { super_admin: 'Administrator', leitung: 'DBZ-Leitung', klassenlehrer: 'Klassenlehrer', vertretung: 'Vertretung' };
// Was sich durch den Antrag ändert (Vorschau für die Entscheidung).
function crChange(r) {
  if (!r.preview) return null;
  if (r.type === 'remove_student') return `${r.preview.name}: ${r.preview.classNow || 'ohne Klasse'} → keine Stammklasse (Konto und Verlauf bleiben)`;
  if (r.type === 'deactivate_user') return `${r.preview.name}: Konto ${r.preview.statusNow === 'active' ? 'aktiv' : r.preview.statusNow} → deaktiviert (Daten bleiben, Anmeldung gesperrt)`;
  return null;
}
function RequestRow({ r, onDecide, onWithdraw }) {
  const [label, tone] = CR_STATUS[r.status] || [r.status, 'neutral'];
  const change = crChange(r);
  return (
    <li className="py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-ivory text-sm font-medium" data-noi18n>{r.summary}</span>
            {r.level >= 3 && <Badge tone="absent">kritisch</Badge>}
          </div>
          <div className="text-xs text-sage-muted">
            {r.typeLabel} · <span data-noi18n>{r.requestedByName}</span>{r.requestedByRole ? ` (${ROLE_NAME[r.requestedByRole] || r.requestedByRole})` : ''}
            {' · '}{new Date(r.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
          </div>
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>
      {r.reason && <div className="text-sm text-sage">Begründung: <span data-noi18n>{r.reason}</span></div>}
      {change && r.status === 'pending' && <div className="rounded-lg bg-subtle px-3 py-2 text-sm text-ivory" data-noi18n>{change}</div>}
      {r.error && <div className="text-xs text-sage-muted" data-noi18n>{r.error}</div>}
      {r.decidedByName && r.status !== 'pending' && <div className="text-xs text-sage-muted">Entschieden von <span data-noi18n>{r.decidedByName}</span></div>}
      {(r.canDecide || (r.mine && r.status === 'pending')) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {r.canDecide && <Button size="sm" onClick={() => onDecide(r, 'approve')}><CheckCircle2 size={16} /> Genehmigen</Button>}
          {r.canDecide && <Button size="sm" variant="outline" onClick={() => onDecide(r, 'reject')}><XCircle size={16} /> Ablehnen</Button>}
          {r.mine && r.status === 'pending' && <Button size="sm" variant="ghost" onClick={() => onWithdraw(r)}>Zurückziehen</Button>}
        </div>
      )}
    </li>
  );
}
function ApprovalsTab() {
  const toast = useToast();
  const [requests, setRequests] = useState(null);
  const load = () => api.get('/admin/change-requests').then((d) => setRequests(d.requests)).catch(() => setRequests([]));
  useEffect(() => { load(); }, []);

  const decide = async (r, action) => {
    let note = '';
    if (action === 'approve' && !window.confirm(`Genehmigen und sofort ausführen?\n\n${r.summary}`)) return;
    if (action === 'reject') { note = window.prompt('Ablehnen – kurze Begründung für die antragstellende Person (optional):', ''); if (note === null) return; }
    try {
      await api.post(`/admin/change-requests/${r.id}/${action}`, action === 'reject' ? { note } : {});
      toast.push(action === 'approve' ? 'Genehmigt und ausgeführt' : 'Abgelehnt', 'success');
    } catch (err) { toast.push(err.message, 'error'); }
    load();
  };
  const withdraw = async (r) => {
    try { await api.post(`/change-requests/${r.id}/withdraw`); toast.push('Antrag zurückgezogen', 'success'); load(); }
    catch (err) { toast.push(err.message, 'error'); }
  };

  if (!requests) return <Spinner />;
  const open = requests.filter((r) => r.canDecide);
  const rest = requests.filter((r) => !r.canDecide);
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <CardHeader title="Zu entscheiden" subtitle="Vor dem Ausführen wird erneut geprüft, ob die Daten noch stimmen" icon={ShieldCheck} />
        {open.length === 0 ? <p className="text-sage-muted text-sm">Nichts offen.</p> : (
          <ul className="divide-y divide-line">{open.map((r) => <RequestRow key={r.id} r={r} onDecide={decide} onWithdraw={withdraw} />)}</ul>
        )}
      </Card>
      {rest.length > 0 && (
        <Card className="p-4 sm:p-5">
          <CardHeader title="Verlauf und eigene Anträge" subtitle="Letzte 30 Tage" icon={ScrollText} />
          <ul className="divide-y divide-line">{rest.map((r) => <RequestRow key={r.id} r={r} onDecide={decide} onWithdraw={withdraw} />)}</ul>
        </Card>
      )}
    </div>
  );

}

const ROLES = [
  ['schueler', 'Schüler'],
  ['klassensprecher', 'Klassensprecher'],
  ['klassenlehrer', 'Klassenlehrer'],
  ['vertretung', 'Vertretungslehrer'],
  ['eltern', 'Eltern'],
  ['leitung', 'DBZ-Leitung'],
  ['super_admin', 'Administrator'],
];

// Admin verknüpft zwei beliebige Konten (z. B. dieselbe Person mit mehreren
// Rollen). Nur die Verwaltung darf das – Schüler können sich nicht selbst
// verknüpfen.
function LinkAccountsAdminCard() {
  const toast = useToast();
  const [f, setF] = useState({ emailA: '', emailB: '' });
  const [busy, setBusy] = useState(false);
  const link = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/admin/link-accounts', { emailA: f.emailA.trim(), emailB: f.emailB.trim() });
      toast.push('Konten verknüpft', 'success');
      setF({ emailA: '', emailB: '' });
    } catch (err) { toast.push(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader title="Konten verknüpfen" subtitle="Dieselbe Person mit mehreren Rollen zusammenführen (z. B. Schüler + Klassenlehrer + Leitung)" icon={Link2} />
      <form onSubmit={link} className="grid gap-2 sm:grid-cols-2">
        <input className="input" type="email" aria-label="E-Mail Konto 1" placeholder="E-Mail Konto 1" value={f.emailA} onChange={(e) => setF({ ...f, emailA: e.target.value })} required />
        <input className="input" type="email" aria-label="E-Mail Konto 2" placeholder="E-Mail Konto 2" value={f.emailB} onChange={(e) => setF({ ...f, emailB: e.target.value })} required />
        <div className="sm:col-span-2"><Button type="submit" disabled={busy}><Link2 size={16} /> Verknüpfen</Button></div>
      </form>
    </Card>
  );
}

// Offene Registrierungen ohne Klasse (z. B. neue Schüler vor Probeunterricht):
// Kontaktdaten prüfen, Klasse zuweisen (Leitung -> Antrag an Admin, Admin -> sofort)
// oder ablehnen.
function PendingTab() {
  const toast = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [list, setList] = useState(null);
  const [classes, setClasses] = useState([]);
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(null);

  const load = () => api.get('/admin/pending-registrations').then((d) => setList(d.users));
  useEffect(() => { load(); api.get('/classes').then((d) => setClasses(d.classes)); }, []);

  // picked[id] = { role, classIds }
  const pick = (id) => picked[id] || { role: 'schueler', classIds: [] };
  const setPick = (id, patch) => setPicked((p) => ({ ...p, [id]: { ...pick(id), ...patch } }));
  const assign = async (id) => {
    const { role, classIds } = pick(id);
    const studentRole = role === 'schueler' || role === 'klassensprecher';
    if (studentRole && classIds.length !== 1) { toast.push('Bitte zuerst eine Klasse auswählen', 'error'); return; }
    setBusy(id);
    try {
      const res = await api.post(`/admin/pending-registrations/${id}/assign`, { role, classIds });
      toast.push(res.pending ? 'Zur Bestätigung an den Administrator gesendet' : 'Freigeschaltet', 'success');
      load();
    } catch (err) { toast.push(err.message, 'error'); } finally { setBusy(null); }
  };

  const reject = async (id) => {
    if (!window.confirm('Diese Anmeldung wirklich ablehnen und löschen?')) return;
    setBusy(id);
    try {
      await api.post(`/admin/pending-registrations/${id}/reject`, {});
      toast.push('Abgelehnt', 'success');
      load();
    } catch (err) { toast.push(err.message, 'error'); } finally { setBusy(null); }
  };

  if (!list) return <Spinner />;
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader title="Neue Anmeldungen" subtitle="Ohne Einladung registriert – hier als Schüler (mit Klasse), Lehrkraft, Leitung … freischalten" icon={UserCheck} />
      {list.length === 0 ? (
        <p className="p-4 text-sage-muted text-sm">Keine offenen Anmeldungen.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((u) => (
            <li key={u.id} className="py-4">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <div>
                  <div className="text-ivory">{u.name}</div>
                  <div className="text-xs text-sage-muted">{u.email}</div>
                </div>
                {!isSuperAdmin && <Badge tone="late">braucht Admin-Bestätigung</Badge>}
              </div>
              {u.profile && (
                <div className="text-xs text-sage-muted mb-3 space-y-0.5">
                  {u.profile.birthDate && (
                    <div>
                      Geb. {new Date(u.profile.birthDate).toLocaleDateString('de-DE')}
                      {u.profile.gender ? ` · ${u.profile.gender}` : ''}
                    </div>
                  )}
                  <div>{u.profile.street} {u.profile.houseNumber}, {u.profile.zip} {u.profile.city}</div>
                  <div>Tel: {u.profile.phone}{u.profile.selfPayer ? ' · Selbstzahler' : ''}</div>
                  {u.profile.desiredLevel && <div>Gewünschte Einstufung: {u.profile.desiredLevel}</div>}
                  {!u.profile.selfPayer && u.profile.guardians?.map((g, i) => (
                    <div key={i}>Erziehungsberechtigte/r{u.profile.guardians.length > 1 ? ` ${i + 1}` : ''}: {g.name} · {g.phones?.join(' / ')}{g.email ? ` · ${g.email}` : ''}</div>
                  ))}
                  {u.profile.siblings && <div>Geschwister am DBZ: {u.profile.siblings}</div>}
                  {u.profile.notes && <div>Bemerkung: {u.profile.notes}</div>}
                </div>
              )}
              {(() => {
                const p = pick(u.id);
                const studentRole = p.role === 'schueler' || p.role === 'klassensprecher';
                const teacherRole = p.role === 'klassenlehrer' || p.role === 'vertretung';
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-sm text-sage">Freischalten als</label>
                      <select className="input py-1.5 w-auto text-sm" value={p.role} onChange={(e) => setPick(u.id, { role: e.target.value, classIds: [] })}>
                        {ROLES.filter(([v]) => isSuperAdmin || v !== 'super_admin').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      {studentRole && (
                        <select className="input py-1.5 w-auto text-sm" value={p.classIds[0] || ''} onChange={(e) => setPick(u.id, { classIds: e.target.value ? [e.target.value] : [] })}>
                          <option value="">– Klasse wählen –</option>
                          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      )}
                    </div>
                    {teacherRole && (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs text-sage-muted w-full">Unterrichtet in:</span>
                        {classes.map((c) => {
                          const on = p.classIds.includes(c.id);
                          return (
                            <button key={c.id} type="button" onClick={() => setPick(u.id, { classIds: on ? p.classIds.filter((x) => x !== c.id) : [...p.classIds, c.id] })}
                              className={['px-3 py-1 rounded-lg border text-sm', on ? 'border-mint bg-mint/10 text-ivory' : 'border-line text-sage'].join(' ')}>
                              {c.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" onClick={() => assign(u.id)} disabled={busy === u.id}><CheckCircle2 size={16} /> Freischalten</Button>
                      <Button size="sm" variant="outline" onClick={() => reject(u.id)} disabled={busy === u.id}><XCircle size={16} /> Ablehnen</Button>
                    </div>
                  </div>
                );
              })()}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Rollen-Abschnitte der Nutzerliste (Reihenfolge = Hierarchie).

function UsersTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [classes, setClasses] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'schueler', classId: '' });
  const [selected, setSelected] = useState([]);
  // Auswahl erst nach „Auswählen“ (wie in iOS) -- verhindert Fehlgriffe.
  const [selecting, setSelecting] = useState(false);
  const [confirmText, setConfirmText] = useState(null); // null = Lösch-Bestätigung zu
  const [bulkBusy, setBulkBusy] = useState(false);
  const [moveTo, setMoveTo] = useState('');
  const [moveReason, setMoveReason] = useState('transfer');
  const [q, setQ] = useState('');
  const [params] = useSearchParams();
  // Aus der Leitungs-Übersicht: gewünschte Gruppe direkt aufgeklappt (und ggf. nur ohne Klasse).
  const focusRole = params.get('rolle');
  const onlyUnassigned = params.get('ohneKlasse') === '1';
  const [roleFilter, setRoleFilter] = useState(() => (focusRole === 'klassenlehrer' ? 'teachers' : focusRole || 'all'));
  // Gruppierung der Liste: nach Klasse (Standard) oder nach Rolle.
  const [groupBy, setGroupBy] = useState(() => (focusRole ? 'role' : 'class'));
  const [classFilter, setClassFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [detailId, setDetailId] = useState(null);
  useEffect(() => {
    if (!detailId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDetailId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailId]);
  const [showDisabled, setShowDisabled] = useState(false);

  const load = () => api.get('/admin/users').then((d) => setUsers(d.users));
  useEffect(() => { load(); api.get('/classes').then((d) => setClasses(d.classes)); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/users', { ...form, classIds: form.classId ? [form.classId] : [] });
      toast.push(res.pending ? 'Zur Bestätigung an den Administrator gesendet' : 'Nutzer angelegt', 'success');
      setShow(false);
      setForm({ name: '', email: '', password: '', role: 'schueler', classId: '' });
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  const toggleOne = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const endSelection = () => { setSelecting(false); setSelected([]); setConfirmText(null); setMoveTo(''); };
  // Mehrere Personen deaktivieren (Anmeldung gesperrt, Daten bleiben) -- Voraussetzung fürs Löschen.
  const bulkDisable = async () => {
    const chosen = mergePeople(users).filter((p) => selected.includes(p.id) && p.status !== 'disabled');
    if (!chosen.length) return;
    if (!window.confirm(`${chosen.length} Person(en) deaktivieren? Die Anmeldung ist dann gesperrt, alle Daten bleiben erhalten.`)) return;
    setBulkBusy(true);
    let ok = 0; let firstError = null;
    for (const p of chosen) {
      try { await api.patch(`/admin/users/${p.id}`, { status: 'disabled' }); ok++; } catch (err) { firstError = firstError || err.message; }
    }
    toast.push(firstError ? `${ok} deaktiviert, ${chosen.length - ok} nicht möglich (${firstError})` : `${ok} deaktiviert`, firstError ? 'error' : 'success');
    setShowDisabled(true); // Ausgewählte bleiben sichtbar (z. B. um sie danach zu löschen)
    setBulkBusy(false);
    load();
  };
  const bulkDelete = async () => {
    if (!selected.length || confirmText?.trim().toUpperCase() !== 'LÖSCHEN') return;
    setBulkBusy(true);
    try {
      // Je Person alle Konten (Anmelde-Konto zuerst, die Rollenkonten gehen mit).
      const chosen = mergePeople(users).filter((p) => selected.includes(p.id));
      const { results } = await api.post('/admin/users/bulk-delete', { ids: chosen.flatMap((p) => p.accountIds) });
      const bad = new Map(results.filter((r) => !r.ok).map((r) => [r.id, r.error]));
      const failed = chosen.filter((p) => p.accountIds.some((id) => bad.has(id)));
      const okCount = chosen.length - failed.length;
      if (failed.length) {
        const why = bad.get(failed[0].accountIds.find((id) => bad.has(id)));
        toast.push(`${okCount} gelöscht, ${failed.length} nicht möglich (${why}${failed.length > 1 ? ' u. a.' : ''})`, okCount > 0 ? 'success' : 'error');
      } else {
        toast.push(`${okCount} Person(en) endgültig gelöscht`, 'success');
      }
      endSelection();
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  // Mehrere Schüler auf einmal in eine Stammklasse versetzen (mit Klassenverlauf).
  const bulkMove = async () => {
    if (!moveTo || !selected.length) return;
    const chosen = mergePeople(users).filter((p) => selected.includes(p.id));
    const ids = chosen.map((p) => p.roles.find((r) => (r.role === 'schueler' || r.role === 'klassensprecher') && r.status !== 'disabled')?.id).filter(Boolean);
    const skipped = chosen.length - ids.length;
    if (!ids.length) { toast.push('In der Auswahl ist kein Schüler', 'error'); return; }
    const target = classes.find((c) => c.id === moveTo)?.name || '';
    if (!window.confirm(`${ids.length} Schüler nach „${target}" versetzen?`)) return;
    setBulkBusy(true);
    try {
      const { results } = await api.post('/admin/users/bulk-class', { ids, classId: moveTo, reason: moveReason });
      const failed = results.filter((r) => !r.ok);
      const moved = results.filter((r) => r.ok && !r.unchanged).length;
      toast.push(`${moved} versetzt${failed.length ? `, ${failed.length} nicht möglich (${failed[0].error})` : ''}${skipped ? ` · ${skipped} ohne Schüler-Rolle übersprungen` : ''}`, failed.length ? 'error' : 'success');
      endSelection();
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  if (!users) return <Spinner />;
  const needle = q.trim().toLowerCase();
  // Eine Zeile je Person: alle Rollen-Konten derselben Person zusammengefasst.
  const people = mergePeople(users);
  const isStudent = (p) => p.roleSet.has('schueler') || p.roleSet.has('klassensprecher');
  const visible = people.filter((p) => (showDisabled || p.status !== 'disabled' || selected.includes(p.id))
    && (!onlyUnassigned || (isStudent(p) && p.studentClassIds.length === 0))
    && (!needle || p.searchText.includes(needle)));
  const disabledCount = people.filter((p) => p.status === 'disabled').length;
  const filters = groupBy === 'class' ? classFilters(classes, visible) : FILTERS;
  const selectedPeople = people.filter((p) => selected.includes(p.id));
  const activeFilter = groupBy === 'class' ? classFilter : roleFilter;
  return (
    <div className="space-y-4">
      {onlyUnassigned && (
        <div className="rounded-xl border border-status-late/30 bg-status-late/10 px-4 py-2.5 text-sm text-ivory flex items-center justify-between gap-2">
          <span>Es werden nur Schüler <b>ohne Klasse</b> angezeigt – Person öffnen und unter „Rollenbearbeitung“ eine Klasse zuweisen.</span>
          <a href="#/admin?tab=users" className="text-xs text-sage-muted underline shrink-0">Alle zeigen</a>
        </div>
      )}
      {/* Werkzeugleiste */}
      <div className="flex gap-2 flex-wrap items-center">
        <label className="relative flex-1 min-w-[12rem]">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sage-muted pointer-events-none" aria-hidden="true" />
          <input className="input pl-10" placeholder="Suchen: Name, E-Mail oder Klasse …" aria-label="Nutzer suchen" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Button variant={selecting ? 'outline' : 'ghost'} onClick={() => (selecting ? endSelection() : setSelecting(true))}>{selecting ? 'Fertig' : 'Auswählen'}</Button>
        <Button onClick={() => setShow((s) => !s)}><Plus size={18} /> Nutzer anlegen</Button>
      </div>
      {selecting && (
        <div className="sticky top-2 z-10 shadow-card rounded-xl border border-line/70 bg-card px-3 py-2.5 space-y-2.5" role="group" aria-label="Auswahl bearbeiten">
          {selected.length === 0 ? (
            <p className="text-footnote text-sage-muted">Personen in der Liste antippen, um sie auszuwählen.</p>
          ) : (
          <>
          <div className="flex flex-wrap items-center gap-2">
          <span className="text-footnote text-sage-muted w-full sm:w-auto">{selected.length} ausgewählt – versetzen nach:</span>
          <select className="input flex-1 min-w-[9rem] sm:flex-none sm:w-44" aria-label="Zielklasse" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} data-noi18n>
            <option value="">– Klasse –</option>
            {classes.filter((c) => c.kind !== 'extra').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input flex-1 min-w-[8rem] sm:flex-none sm:w-36" aria-label="Grund" value={moveReason} onChange={(e) => setMoveReason(e.target.value)}>
            <option value="transfer">Wechsel</option>
            <option value="promotion">Aufstieg</option>
            <option value="demotion">Abstieg</option>
            <option value="joined">Einstieg</option>
          </select>
          <Button onClick={bulkMove} disabled={!moveTo || bulkBusy}>Versetzen</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-2.5">
            {selectedPeople.some((p) => p.status !== 'disabled') && (
              <Button variant="outline" onClick={bulkDisable} disabled={bulkBusy}>Deaktivieren</Button>
            )}
            {selectedPeople.length > 0 && selectedPeople.every((p) => p.status === 'disabled') ? (
              confirmText === null
                ? <Button variant="ghost" className="text-status-absent" onClick={() => setConfirmText('')}><XCircle size={17} /> Endgültig löschen …</Button>
                : (
                  <div className="flex flex-wrap items-center gap-2 w-full">
                    <label className="text-footnote text-sage w-full">Zum Bestätigen <b>LÖSCHEN</b> eingeben – {selected.length} Person(en) mit allen Rollen werden unwiderruflich entfernt.</label>
                    <input className="input flex-1 min-w-[8rem] sm:flex-none sm:w-40" aria-label="Bestätigung" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
                    <Button variant="danger" onClick={bulkDelete} disabled={bulkBusy || confirmText.trim().toUpperCase() !== 'LÖSCHEN'}>Löschen</Button>
                    <Button variant="ghost" onClick={() => setConfirmText(null)}>Abbrechen</Button>
                  </div>
                )
            ) : (
              <span className="text-footnote text-sage-muted">Löschen ist erst möglich, wenn alle Ausgewählten deaktiviert sind.</span>
            )}
          </div>
          </>
          )}
        </div>
      )}
      <Segmented size="sm" value={groupBy} onChange={setGroupBy} options={[['class', 'Nach Klasse'], ['role', 'Nach Rolle']]} />
      {show && (
        <Card className="p-4 sm:p-5">
          <CardHeader title="Neuer Nutzer" icon={Users2} />
          <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <Input label="E-Mail" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
            <Input label="Passwort" type="text" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />
            <label className="block">
              <span className="text-footnote font-medium text-sage-muted">Rolle</span>
              <select className="input mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-footnote font-medium text-sage-muted">Klasse (optional)</span>
              <select className="input mt-1" value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">– keine –</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2 flex gap-2"><Button type="submit">Anlegen</Button><Button type="button" variant="ghost" onClick={() => setShow(false)}>Abbrechen</Button></div>
          </form>
        </Card>
      )}

      <UserDirectory
        users={visible}
        me={me}
        filters={filters}
        byClass={groupBy === 'class'}
        roleFilter={activeFilter}
        setRoleFilter={groupBy === 'class' ? setClassFilter : setRoleFilter}
        sort={sort}
        setSort={setSort}
        selected={selected}
        selecting={selecting}
        toggleOne={toggleOne}
        searching={Boolean(needle)}
        onOpen={(u) => {
          // Großer Bildschirm: Steckbrief rechts neben der Tabelle, sonst eigene Seite
          if (window.matchMedia('(min-width: 1280px)').matches) setDetailId(u.id);
          else navigate(`/person/${u.id}`);
        }}
        detailId={detailId}
        detail={detailId ? (
          <div className="person-compact">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-title3 text-ivory truncate" data-noi18n>{people.find((x) => x.id === detailId)?.name}</h2>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => navigate(`/person/${detailId}`)}>Ganze Seite</Button>
                <button type="button" onClick={() => setDetailId(null)} className="grid place-items-center h-8 w-8 rounded-full bg-subtle text-sage-muted hover:text-ivory" aria-label="Schließen"><XCircle size={16} /></button>
              </div>
            </div>
            <PersonAdminPanel key={detailId} userId={detailId} viewer={me} onChanged={load} />
          </div>
        ) : null}
      />

      <details className="rounded-2xl border border-line/70 bg-card text-subhead">
        <summary className="cursor-pointer px-4 py-3 text-ivory font-medium">So beförderst du jemanden (z. B. zum Klassenlehrer, zur Leitung oder zum Admin)</summary>
        <ol className="list-decimal space-y-1.5 px-8 pb-4 text-sage">
          <li>Hat sich die Person gerade erst registriert, steht sie oben im Reiter <b>„Neue Anmeldungen“</b>. Dort bei <b>„Freischalten als“</b> die Rolle wählen (bei Lehrkräften die Klassen antippen) und <b>Freischalten</b> drücken.</li>
          <li>Ist die Person schon aktiv: unten in der Liste auf den <b>Namen</b> (oder „Öffnen“) tippen – es öffnet sich ihr Steckbrief.</li>
          <li><b>Befördern</b> (z. B. Schüler → Klassenlehrer): unter <b>„Rollenbearbeitung“</b> steht links die aktuelle Position, rechts die neue Rolle wählen, Klassen antippen und <b>„Befördern“</b> drücken.</li>
          <li><b>Zusätzliche Rolle</b> (bleibt z. B. Schüler UND wird Lehrkraft): im Kasten <b>„Zusätzliche Rollen“</b> die Rolle hinzufügen. Die Person wechselt dann im Konto-Menü zwischen ihren Rollen – ohne zweites Passwort.</li>
        </ol>
      </details>
      {disabledCount > 0 && (
        <label className="flex items-center gap-2 text-sm text-sage-muted">
          <input type="checkbox" checked={showDisabled} onChange={(e) => setShowDisabled(e.target.checked)} />
          Deaktivierte Personen anzeigen ({disabledCount})
        </label>
      )}
      <details className="rounded-2xl border border-line bg-card">
        <summary className="px-4 py-3 cursor-pointer text-sm text-sage">Erweitert: zwei bestehende Konten verknüpfen</summary>
        <div className="p-2"><LinkAccountsAdminCard /></div>
      </details>
    </div>
  );
}

const ROLE_LABEL = Object.fromEntries(ROLES);
const FILTERS = [
  ['all', 'Alle', () => true],
  ['super_admin', 'Systembetreuung', (u) => u.roleSet.has('super_admin')],
  ['leitung', 'DBZ-Leitung', (u) => u.roleSet.has('leitung')],
  ['teachers', 'Lehrkräfte', (u) => u.roleSet.has('klassenlehrer') || u.roleSet.has('vertretung')],
  ['klassensprecher', 'Klassensprecher', (u) => u.roleSet.has('klassensprecher')],
  ['schueler', 'Schüler', (u) => u.roleSet.has('schueler')],
  ['eltern', 'Eltern', (u) => u.roleSet.has('eltern')],
];
const STATUS_LABEL = { pending: 'Wartet', disabled: 'Inaktiv' };

// Runder Auswahl-Haken (wie in iOS) -- nur im Auswahlmodus sichtbar.
function SelectMark({ on }) {
  return (
    <span aria-hidden="true" className={`grid place-items-center h-6 w-6 shrink-0 rounded-full border-2 transition-colors ${on ? 'bg-mint border-mint text-onaccent' : 'border-line bg-card'}`}>
      {on && <Check size={14} strokeWidth={3} />}
    </span>
  );
}
const ROLE_TONE = { super_admin: 'neutral', leitung: 'neutral', klassenlehrer: 'mint', vertretung: 'mint', klassensprecher: 'excused', schueler: 'excused', eltern: 'neutral' };
function RoleBadges({ u, max = 4 }) {
  const roles = u.roles.filter((r) => r.status !== 'disabled' || u.status === 'disabled');
  return (
    <span className="flex flex-wrap gap-1">
      {roles.slice(0, max).map((r) => <Badge key={r.id} tone={ROLE_TONE[r.role] || 'neutral'}>{ROLE_LABEL[r.role] || r.role}</Badge>)}
      {roles.length > max && <Badge tone="neutral">+{roles.length - max}</Badge>}
    </span>
  );
}

// Personenverzeichnis: Handy/iPad = Liste mit Filter-Pillen, Mac/iPad quer =
// Filterspalte + sortierbare Tabelle. Auswahl nur im Auswahlmodus.
function UserDirectory({ users, me, filters = FILTERS, byClass = false, roleFilter, setRoleFilter, sort, setSort, selected, selecting = false, toggleOne, searching, onOpen, detailId, detail }) {
  const filter = filters.find((f) => f[0] === roleFilter) || filters[0];
  const counts = Object.fromEntries(filters.map(([k, , fn]) => [k, users.filter(fn).length]));
  const isMe = (u) => u.accountIds.includes(me?.id);
  const list = users.filter(filter[2]).sort((a, b) => {
    if (sort.key === 'seen') return sort.dir * String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || ''));
    if (sort.key === 'role') return sort.dir * String(ROLE_LABEL[a.role] || '').localeCompare(String(ROLE_LABEL[b.role] || ''), 'de') || a.name.localeCompare(b.name, 'de');
    return sort.dir * a.name.localeCompare(b.name, 'de');
  });
  // Im Auswahlmodus wählt ein Tipp auf die Zeile aus, sonst öffnet er die Person.
  const tap = (u) => { if (!selecting) onOpen(u); else if (!isMe(u)) toggleOne(u.id); };
  const th = (key, label, cls = '') => (
    <th className={`py-3 px-3 font-medium ${cls}`} aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))} className="inline-flex items-center gap-1 hover:text-ivory">
        {label}{sort.key === key && <span aria-hidden="true">{sort.dir > 0 ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
  const classChips = (u) => (u.classNames?.length
    ? <span className="flex flex-wrap gap-1" data-noi18n>{u.classNames.map((c) => <span key={c} className="rounded-md bg-subtle px-1.5 py-0.5 text-caption text-sage whitespace-nowrap">{c}</span>)}</span>
    : <span className="text-sage-muted/70">–</span>);
  return (
    <div className={`lg:grid lg:gap-6 items-start ${detail ? 'lg:grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_27rem]' : 'lg:grid-cols-[13rem_minmax(0,1fr)]'}`}>
      {/* Filter: Pillen (Handy/iPad hochkant bzw. bei offenem Steckbrief), Spalte (iPad quer/Mac) */}
      <div className={`no-scrollbar flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-4 ${detail ? 'lg:col-span-full' : 'lg:flex-col lg:mb-0 lg:sticky lg:top-0'}`} role="tablist" aria-label={byClass ? 'Nach Klasse filtern' : 'Nach Rolle filtern'}>
        {filters.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={roleFilter === k} onClick={() => setRoleFilter(k)}
            className={detail
              ? `shrink-0 inline-flex items-center gap-2 rounded-full px-3.5 h-9 text-footnote font-semibold transition-colors ${roleFilter === k ? 'bg-mint text-onaccent' : 'bg-card border border-line/70 text-sage hover:bg-hover'}`
              : `shrink-0 inline-flex items-center justify-between gap-2 rounded-full lg:rounded-lg px-3.5 lg:px-3 h-9 text-footnote lg:text-subhead font-semibold lg:font-medium transition-colors ${roleFilter === k ? 'bg-mint text-onaccent lg:bg-mint/10 lg:text-mint-light lg:dark:text-mint' : 'bg-card border border-line/70 lg:border-0 lg:bg-transparent text-sage hover:bg-hover'}`}>
            <span className="truncate" {...(k.startsWith('class:') ? { 'data-noi18n': true } : {})}>{label}</span>
            <span className={`font-mono text-caption ${roleFilter === k ? 'opacity-80' : 'text-sage-muted'}`}>{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="min-w-0">
        {list.length === 0 ? (
          <Card><EmptyState icon={Users2} title={searching ? 'Keine Treffer' : 'Niemand in dieser Gruppe'} /></Card>
        ) : (
          <>
            <p className="mb-2 px-1 text-footnote text-sage-muted">{list.length === 1 ? '1 Person' : `${list.length} Personen`}</p>
            {/* Handy & iPad hochkant: kompakte Liste */}
            <ListGroup className="lg:hidden">
              {list.map((u) => {
                const on = selected.includes(u.id);
                return (
                  <button key={u.id} type="button" onClick={() => tap(u)} aria-pressed={selecting ? on : undefined}
                    aria-label={selecting ? `${u.name} ${on ? 'abwählen' : 'auswählen'}` : undefined}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 text-left active:bg-hover/60 ${on ? 'bg-mint/[0.06]' : ''} ${selecting && isMe(u) ? 'opacity-50' : ''}`}>
                    {selecting && (isMe(u) ? <span className="w-6 shrink-0" /> : <SelectMark on={on} />)}
                    <Avatar name={u.name} size={40} />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex items-center gap-2">
                        <span className="text-body font-semibold text-ivory truncate" data-noi18n>{u.name}</span>
                        {u.status !== 'active' && <Badge tone="late">{STATUS_LABEL[u.status] || u.status}</Badge>}
                        {u.guardianConsentMissing && <Badge tone="late">Einwilligung Eltern fehlt</Badge>}
                      </span>
                      <RoleBadges u={u} max={3} />
                      {(u.classNames?.length > 0 || u.studentNumber) && <span className="block text-footnote text-sage-muted truncate" data-noi18n>{[...(u.classNames || []), u.studentNumber].filter(Boolean).join(' · ')}</span>}
                    </span>
                    {!selecting && <ChevronRight size={18} className="text-sage-muted/60 shrink-0" />}
                  </button>
                );
              })}
            </ListGroup>

            {/* iPad quer & Mac: Tabelle */}
            <Card className="hidden lg:block overflow-x-auto p-0">
              <table className="w-full text-subhead">
                <thead>
                  <tr className="text-left text-footnote text-sage-muted border-b border-line/70">
                    {selecting && <th className="py-3 pl-4 pr-0 w-10"><span className="sr-only">Auswahl</span></th>}
                    {th('name', 'Name', selecting ? '' : 'pl-5')}
                    {th('role', 'Rolle')}
                    {!detail && <th className="py-3 px-3 font-medium">Klassen</th>}
                    {!detail && th('seen', 'Zuletzt online')}
                    <th className="py-3 pr-4 w-10"><span className="sr-only">Öffnen</span></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((u) => {
                    const on = selected.includes(u.id);
                    return (
                      <tr key={u.id} aria-selected={selecting ? on : detailId === u.id}
                        className={`group border-b border-line/50 last:border-0 cursor-pointer transition-colors hover:bg-hover/50 ${on || detailId === u.id ? 'bg-mint/[0.07]' : ''}`}
                        onClick={(e) => { if (e.target.closest('button')) return; tap(u); }}>
                        {selecting && (
                          <td className="py-3 pl-4 pr-0">
                            {!isMe(u) && <button type="button" onClick={() => toggleOne(u.id)} aria-pressed={on} aria-label={`${u.name} ${on ? 'abwählen' : 'auswählen'}`}><SelectMark on={on} /></button>}
                          </td>
                        )}
                        <td className={`py-3 px-3 ${selecting ? '' : 'pl-5'}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar name={u.name} size={36} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => tap(u)} className="font-semibold text-ivory truncate hover:underline text-left" data-noi18n>{u.name}</button>
                                {u.status !== 'active' && <Badge tone="late">{STATUS_LABEL[u.status] || u.status}</Badge>}
                                {u.guardianConsentMissing && <Badge tone="late">Einwilligung Eltern fehlt</Badge>}
                              </div>
                              <div className="text-footnote text-sage-muted truncate" data-noi18n>{[u.email || u.loginEmail, u.studentNumber].filter(Boolean).join(' · ')}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <RoleBadges u={u} />
                          {detail && u.classNames?.length > 0 && <div className="mt-1 text-footnote text-sage-muted" data-noi18n>{u.classNames.join(' · ')}</div>}
                        </td>
                        {!detail && <td className="py-3 px-3">{classChips(u)}</td>}
                        {!detail && <td className="py-3 px-3 text-sage-muted whitespace-nowrap">{lastSeenLabel(u.lastSeenAt)}</td>}
                        <td className="py-3 pr-4 text-right">{!selecting && <ChevronRight size={18} className="inline text-sage-muted/40 group-hover:text-sage-muted" />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>
      {detail && (
        <aside className="hidden xl:block sticky top-0 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-2xl bg-card border border-line/70 shadow-card p-4" aria-label="Steckbrief">
          {detail}
        </aside>
      )}
    </div>
  );
}

// Schuljahreswechsel: für jede Stammklasse wählen, wohin sie geht; Vorschau,
// dann alle auf einmal versetzen (Sicherung vorher, Klassenverlauf je Schüler).
function SchoolYearCard({ classes, onDone }) {
  const toast = useToast();
  const regular = classes.filter((c) => c.kind !== 'extra').sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState({}); // classId -> 'stay' | 'left' | classId
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const moves = regular.map((c) => ({ from: c.id, to: targets[c.id] || 'stay' })).filter((m) => m.to !== 'stay');
  const run = async (dryRun) => {
    if (!moves.length) { toast.push('Bitte mindestens einer Klasse ein Ziel geben', 'error'); return; }
    if (!dryRun) {
      const n = preview.moves.reduce((t, m) => t + m.count, 0);
      if (!window.confirm(`${n} Schüler versetzen bzw. austragen? Vorher wird automatisch gesichert.`)) return;
    }
    setBusy(true);
    try {
      const r = await api.post('/admin/school-year/advance', { moves, dryRun });
      if (dryRun) setPreview(r);
      else { toast.push(`${r.moved} versetzt, ${r.left} ausgetreten`, 'success'); setPreview(null); setTargets({}); setOpen(false); onDone?.(); }
    } catch (err) { toast.push(err.message, 'error'); } finally { setBusy(false); }
  };
  if (regular.length < 1) return null;
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader title="Schuljahreswechsel" subtitle="Alle Klassen auf einmal versetzen – mit Vorschau" icon={CalendarClock}
        action={<Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? 'Schließen' : 'Öffnen'}</Button>} />
      {open && (
        <div className="space-y-3">
          <p className="text-footnote text-sage-muted">Für jede Klasse wählen, wohin ihre Schüler im neuen Schuljahr gehen. Zusatzkurse bleiben unberührt; einzelne Ausnahmen danach in der Nutzerliste über „Versetzen“.</p>
          <ul className="divide-y divide-line">
            {regular.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <span className="flex-1 min-w-0 truncate text-sm text-ivory" data-noi18n>{c.name}</span>
                <span className="text-sage-muted" aria-hidden="true">→</span>
                <select className="input w-44" aria-label={`Ziel für ${c.name}`} value={targets[c.id] || 'stay'} onChange={(e) => { setTargets({ ...targets, [c.id]: e.target.value }); setPreview(null); }}>
                  <option value="stay">bleibt</option>
                  {regular.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  <option value="left">Austritt (Abschluss)</option>
                </select>
              </li>
            ))}
          </ul>
          <Button variant="outline" onClick={() => run(true)} disabled={busy || !moves.length}>Vorschau</Button>
          {preview && (
            <div className="space-y-2">
              {preview.moves.map((m) => (
                <details key={m.from} className="rounded-xl border border-line px-3 py-2 text-sm">
                  <summary className="cursor-pointer text-ivory"><span data-noi18n>{m.fromName}</span> → {m.action === 'left' ? 'Austritt' : <span data-noi18n>{m.toName}</span>} · {m.count} Schüler</summary>
                  <p className="mt-1 text-caption text-sage-muted" data-noi18n>{m.names.join(', ') || '–'}</p>
                </details>
              ))}
              <Button onClick={() => run(false)} disabled={busy}>Schuljahreswechsel durchführen</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ClassesTab() {
  const toast = useToast();
  const [classes, setClasses] = useState(null);
  const [form, setForm] = useState({ name: '', kind: 'regular', weekday: 6, startTime: '14:00', endTime: '18:00' });
  const load = () => api.get('/classes').then((d) => setClasses(d.classes));
  useEffect(() => { load(); }, []);
  const create = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/classes', { ...form, weekday: Number(form.weekday) });
      toast.push(res.pending ? 'Zur Bestätigung an den Administrator gesendet' : 'Klasse erstellt', 'success');
      setForm({ name: '', kind: 'regular', weekday: 6, startTime: '14:00', endTime: '18:00' });
      load();
    } catch (err) { toast.push(err.message, 'error'); }
  };
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  if (!classes) return <Spinner />;
  return (
    <div className="space-y-4">
      <SchoolYearCard classes={classes} onDone={load} />
      <Card className="p-4 sm:p-5">
        <CardHeader title="Neue Klasse" icon={School} />
        <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <label className="block sm:col-span-3">
            <span className="text-sm text-sage">Art</span>
            <select className="input mt-1" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="regular">Stammklasse – feste Schüler, zählt für Bericht und Note</option>
              <option value="extra">Zusatzkurs – freiwillig, zählt nicht (z. B. Umra-Kurs)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-sage">Wochentag</span>
            <select className="input mt-1" value={form.weekday} onChange={(e) => setForm({ ...form, weekday: e.target.value })}>
              {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </label>
          <Input label="Beginn" type="time" value={form.startTime} onChange={(v) => setForm({ ...form, startTime: v })} />
          <Input label="Ende" type="time" value={form.endTime} onChange={(v) => setForm({ ...form, endTime: v })} />
          <div className="sm:col-span-4"><Button type="submit">Erstellen</Button></div>
        </form>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {classes.map((c) => <ClassCard key={c.id} c={c} days={days} onChanged={load} />)}
      </div>
    </div>
  );
}

function ClassCard({ c, days, onChanged }) {
  const toast = useToast();
  const [openTeachers, setOpenTeachers] = useState(false);
  const [openMembers, setOpenMembers] = useState(false);
  const extra = c.kind === 'extra';
  const switchKind = async () => {
    const to = extra ? 'regular' : 'extra';
    const msg = extra
      ? `„${c.name}" zur Stammklasse machen? Was dort passiert, zählt dann für Bericht und Note.`
      : `„${c.name}" zum Zusatzkurs machen? Was dort passiert, zählt dann NICHT mehr für Bericht und Note.`;
    if (!window.confirm(msg)) return;
    try { await api.patch(`/admin/classes/${c.id}`, { kind: to }); toast.push('Gespeichert', 'success'); onChanged?.(); }
    catch (err) { toast.push(err.message, 'error'); }
  };
  return (
    <Card className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <div className="text-ivory flex items-center gap-2 flex-wrap"><span data-noi18n>{c.name}</span>{extra && <Badge tone="gold">Zusatzkurs</Badge>}</div>
          <div className="text-xs text-sage-muted">{days[c.weekday]} · {c.startTime}–{c.endTime} · {c.studentCount} {extra ? 'Teilnehmer' : 'Schüler'} · {c.type === 'online' ? 'Online' : 'Präsenz'}</div>
        </div>
        <div className="flex items-center gap-1 flex-wrap -ml-3 sm:ml-0 sm:shrink-0 sm:justify-end">
          {extra && <Button variant="ghost" size="sm" onClick={() => setOpenMembers((o) => !o)}><UserCheck size={16} /> Teilnehmer</Button>}
          <Button variant="ghost" size="sm" onClick={() => setOpenTeachers((o) => !o)}><Users2 size={16} /> Lehrkräfte</Button>
          <Button variant="ghost" size="sm" title="Klassenliste als CSV"
            onClick={() => api.download(`/export/roster.csv?classId=${c.id}`, `klassenliste_${c.id}.csv`).catch((e) => toast.push(e.message, 'error'))}>
            <Download size={16} /> CSV
          </Button>
        </div>
      </div>
      {openTeachers && <ClassTeachers classId={c.id} />}
      {openMembers && <CourseMembers classId={c.id} onChanged={onChanged} />}
      <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-2">
        <span className="text-xs text-sage-muted">{extra ? 'Freiwillig – zählt nicht für Bericht und Note.' : 'Stammklasse – zählt für Bericht und Note.'}</span>
        <Button variant="ghost" size="sm" onClick={switchKind}>{extra ? 'Zur Stammklasse machen' : 'Zum Zusatzkurs machen'}</Button>
      </div>
    </Card>
  );
}

// Teilnehmer eines Zusatzkurses: aufnehmen und austragen (Stammklasse bleibt).
function CourseMembers({ classId, onChanged }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [pick, setPick] = useState('');
  const load = () => api.get(`/classes/${classId}/members`).then((d) => { setData(d); setPick(''); }).catch((e) => toast.push(e.message, 'error'));
  useEffect(() => { load(); }, [classId]);
  const add = async () => {
    if (!pick) return;
    try { await api.post(`/classes/${classId}/members`, { studentId: pick }); toast.push('Teilnehmer aufgenommen', 'success'); load(); onChanged?.(); }
    catch (err) { toast.push(err.message, 'error'); }
  };
  const remove = async (id) => {
    try { await api.del(`/classes/${classId}/students/${id}`); toast.push('Ausgetragen', 'success'); load(); onChanged?.(); }
    catch (err) { toast.push(err.message, 'error'); }
  };
  if (!data) return <div className="mt-3"><Spinner /></div>;
  return (
    <div className="mt-3 border-t border-line pt-3 space-y-2">
      {data.members.length === 0 ? (
        <p className="text-xs text-sage-muted">Noch keine Teilnehmer.</p>
      ) : data.members.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-sage" data-noi18n>{m.name}{m.className ? <span className="text-sage-muted"> · {m.className}</span> : null}</span>
          <Button variant="ghost" size="sm" onClick={() => remove(m.id)}><XCircle size={15} /> Austragen</Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <select className="input py-1 text-sm w-auto flex-1" aria-label="Schüler" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">– Schüler wählen –</option>
          {data.available.map((m) => <option key={m.id} value={m.id}>{m.name}{m.className ? ` (${m.className})` : ''}</option>)}
        </select>
        <Button size="sm" onClick={add} disabled={!pick}><Plus size={15} /> Aufnehmen</Button>
      </div>
    </div>
  );
}

// Lehrkräfte einer Klasse zuordnen/entfernen (Vertretung „rein & raus").
function ClassTeachers({ classId }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [pick, setPick] = useState('');
  const load = () => api.get(`/admin/classes/${classId}/teachers`).then((d) => { setData(d); setPick(d.available[0]?.id || ''); });
  useEffect(() => { load(); }, [classId]);
  const add = async () => {
    if (!pick) return;
    try { await api.post(`/admin/classes/${classId}/teachers`, { userId: pick }); toast.push('Lehrkraft zugewiesen', 'success'); load(); }
    catch (err) { toast.push(err.message, 'error'); }
  };
  const remove = async (userId) => {
    try { await api.del(`/admin/classes/${classId}/teachers/${userId}`); toast.push('Zugang entfernt', 'success'); load(); }
    catch (err) { toast.push(err.message, 'error'); }
  };
  if (!data) return <div className="mt-3"><Spinner /></div>;
  return (
    <div className="mt-3 border-t border-line pt-3 space-y-2">
      {data.assigned.length === 0 ? (
        <p className="text-xs text-sage-muted">Noch keine Lehrkraft zugewiesen.</p>
      ) : data.assigned.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-sage">{t.name} <span className="text-sage-muted">· {t.roleLabel}</span></span>
          <Button variant="ghost" size="sm" onClick={() => remove(t.id)}><XCircle size={15} /> Entfernen</Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <select className="input py-1 text-sm w-auto flex-1" value={pick} onChange={(e) => setPick(e.target.value)}>
          {data.available.length === 0 && <option value="">– keine weitere Lehrkraft –</option>}
          {data.available.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.roleLabel})</option>)}
        </select>
        <Button size="sm" onClick={add} disabled={!pick}><Plus size={15} /> Hinzufügen</Button>
      </div>
    </div>
  );
}

// Datensicherung (nur System-Administrator): täglich automatisch, vor jeder
// Massenlöschung zusätzlich. Hier: Liste, sofort sichern, Stand zurückholen.
// Speicherübersicht (nur Systemadministrator): was belegt wie viel Platz, und
// bewertete Aufnahmen aufräumen (Sicherung vorher, Dateien 30 Tage in der Löschliste).
const fmtBytes = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
const KIND_LABEL = { audio: 'Audio', pdf: 'PDF', image: 'Bilder', other: 'Sonstiges' };
function StorageCard() {
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = (d = days) => api.get(`/admin/storage?days=${d}`).then(setData).catch((e) => toast.push(e.message, 'error'));
  useEffect(() => { load(); }, []);
  const cleanup = async () => {
    setBusy(true);
    try {
      const r = await api.post('/admin/storage/cleanup', { olderThanDays: Number(days), confirm: confirm.trim().toUpperCase() });
      toast.push(`${r.count} Aufnahme(n) entfernt (${fmtBytes(r.bytes)})`, 'success');
      setConfirm(null); load();
    } catch (err) { toast.push(err.message, 'error'); } finally { setBusy(false); }
  };
  if (!data) return <Card className="p-4 sm:p-5"><Spinner /></Card>;
  const max = Math.max(1, ...data.areas.map((a) => a.bytes));
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader title="Speicher" subtitle={`${fmtBytes(data.totalBytes)} in ${data.totalCount} Dateien`} icon={Database} />
      <ul className="space-y-2.5">
        {data.areas.map((a) => (
          <li key={a.area}>
            <div className="flex items-baseline justify-between gap-2 text-sm"><span className="text-ivory">{a.label}</span><span className="font-mono text-caption text-sage-muted">{fmtBytes(a.bytes)} · {a.count}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-subtle overflow-hidden"><div className="h-full rounded-full bg-mint" style={{ width: `${Math.max(2, (a.bytes / max) * 100)}%` }} /></div>
            <div className="mt-0.5 text-caption text-sage-muted">{Object.entries(a.kinds).map(([k, v]) => `${KIND_LABEL[k] || k} ${fmtBytes(v.bytes)}`).join(' · ')}</div>
          </li>
        ))}
      </ul>
      {data.classes.length > 0 && (
        <div className="mt-4 text-sm">
          <div className="text-ivory mb-1">Abgaben je Klasse</div>
          <ul className="text-sage-muted space-y-0.5">{data.classes.map((c) => <li key={c.classId} className="flex justify-between gap-2"><span data-noi18n>{c.name}</span><span className="font-mono text-caption">{fmtBytes(c.bytes)}</span></li>)}</ul>
        </div>
      )}
      <div className="mt-4 border-t border-line pt-3 space-y-2 text-sm">
        <div className="text-ivory">Bewertete Aufnahmen aufräumen</div>
        <p className="text-caption text-sage-muted">Betrifft nur Audio-Abgaben, die bewertet sind und die keine Lehrkraft „behalten“ hat ({data.kept} behalten). Bewertung und Feedback bleiben. Automatisch: Einstellung „Audio-Aufbewahrung“ ({data.retentionDays ? `${data.retentionDays} Tage` : 'aus'}).</p>
        <label className="flex items-center gap-2 text-sage">Älter als
          <input type="number" min="0" className="input w-20" value={days} onChange={(e) => setDays(e.target.value)} onBlur={() => load(Number(days) || 0)} aria-label="Tage seit der Bewertung" /> Tage seit der Bewertung
        </label>
        <p className="text-sage">Jetzt löschbar: <b className="text-ivory">{data.cleanable.count}</b> Aufnahme(n), <b className="text-ivory">{fmtBytes(data.cleanable.bytes)}</b></p>
        {data.cleanable.count > 0 && (confirm === null
          ? <Button variant="outline" onClick={() => setConfirm('')}>Aufräumen …</Button>
          : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-full text-caption text-sage">Zum Bestätigen <b>AUFRÄUMEN</b> eingeben. Vorher wird gesichert; die Dateien bleiben noch 30 Tage wiederherstellbar.</span>
              <input className="input w-40" aria-label="Bestätigung" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
              <Button variant="danger" onClick={cleanup} disabled={busy || confirm.trim().toUpperCase() !== 'AUFRÄUMEN'}>Aufräumen</Button>
              <Button variant="ghost" onClick={() => setConfirm(null)}>Abbrechen</Button>
            </div>
          ))}
      </div>
    </Card>
  );
}

// Angaben für Impressum und Datenschutzerklärung (öffentliche Seiten).
const LEGAL_FIELDS = [
  ['orgName', 'Name des Vereins'], ['street', 'Straße und Hausnummer'], ['zip', 'PLZ'], ['city', 'Ort'], ['country', 'Land'],
  ['representative', 'Vertreten durch (Vorstand)'], ['email', 'E-Mail (Pflicht im Impressum)'], ['phone', 'Telefon (optional)'],
  ['register', 'Registergericht und Nummer (z. B. Amtsgericht München, VR …)'], ['privacyContact', 'E-Mail für Datenschutzanfragen (optional)'],
];
function LegalCard() {
  const toast = useToast();
  const [legal, setLegal] = useState(null);
  useEffect(() => { fetch('/api/legal').then((r) => r.json()).then((d) => setLegal(d.legal)).catch(() => setLegal({})); }, []);
  const save = async (e) => {
    e.preventDefault();
    try { const r = await api.patch('/org', { legal }); if (r) toast.push('Gespeichert', 'success'); }
    catch (err) { toast.push(err.message, 'error'); }
  };
  if (!legal) return <Card className="p-4 sm:p-5"><Spinner /></Card>;
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader title="Impressum & Datenschutz" subtitle="Öffentlich sichtbar – leere Felder erscheinen nicht" icon={ShieldCheck} />
      {!legal.email && <p className="mb-3 rounded-lg bg-status-late/10 px-3 py-2 text-footnote text-ivory">Für das Impressum fehlt noch eine E-Mail-Adresse.</p>}
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        {LEGAL_FIELDS.map(([k, label]) => (
          <label key={k} className={`block ${['orgName', 'register', 'privacyContact', 'representative'].includes(k) ? 'sm:col-span-2' : ''}`}>
            <span className="text-footnote font-medium text-sage-muted">{label}</span>
            <input className="input mt-1" type={['email', 'privacyContact'].includes(k) ? 'email' : 'text'} value={legal[k] || ''} onChange={(e) => setLegal({ ...legal, [k]: e.target.value })} maxLength={200} data-noi18n />
          </label>
        ))}
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <Button type="submit">Speichern</Button>
          <a href="#/impressum" className="text-subhead text-mint-light dark:text-mint hover:underline">Impressum ansehen</a>
          <a href="#/datenschutz" className="text-subhead text-mint-light dark:text-mint hover:underline">Datenschutzerklärung ansehen</a>
        </div>
      </form>
    </Card>
  );
}

function BackupsCard() {
  const [checked, setChecked] = useState(null);
  const toast = useToast();
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/admin/backups').then((d) => setList(d.backups)).catch((err) => { setList([]); toast.push(err.message, 'error'); });
  useEffect(() => { load(); }, []);
  const create = async () => {
    setBusy(true);
    try { await api.post('/admin/backups', {}); toast.push('Sicherung angelegt', 'success'); await load(); }
    catch (err) { toast.push(err.message, 'error'); } finally { setBusy(false); }
  };
  const restore = async (b) => {
    const typed = window.prompt(`Der gesamte Datenbestand wird auf den Stand „${backupLabel(b)}" zurückgesetzt. Alles, was danach eingetragen wurde, geht verloren (der jetzige Stand wird vorher gesichert).\n\nZur Bestätigung WIEDERHERSTELLEN eingeben:`);
    if (typed == null) return;
    setBusy(true);
    try {
      await api.post(`/admin/backups/${encodeURIComponent(b.name)}/restore`, { confirm: typed.trim() });
      toast.push('Stand wiederhergestellt', 'success');
      window.location.reload();
    } catch (err) { toast.push(err.message, 'error'); setBusy(false); }
  };
  // Probe ohne Risiko: Sicherung öffnen und zählen, nichts wird verändert.
  const verify = async (b) => {
    setBusy(true);
    try {
      const r = await api.post(`/admin/backups/${encodeURIComponent(b.name)}/verify`);
      setChecked({ name: b.name, ...r });
    } catch (err) { toast.push(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader title="Datensicherung" subtitle="Täglich automatisch, zusätzlich vor jeder Massenlöschung" icon={RotateCcw} />
      {checked && (
        <div className={`mb-3 rounded-xl px-3 py-2.5 text-sm ${checked.ok ? 'bg-status-present/10' : 'bg-status-absent/10'}`} role="status">
          <div className="font-medium text-ivory">{checked.ok ? 'Sicherung ist in Ordnung' : 'Sicherung ist unvollständig'} <span className="font-normal text-sage-muted">({backupLabel({ name: checked.name })})</span></div>
          {checked.problem && <div className="text-sage">{checked.problem}</div>}
          {(checked.problems || []).map((p) => <div key={p} className="text-sage">{p}</div>)}
          {checked.counts && (
            <div className="mt-1.5 grid grid-cols-2 gap-x-4 text-caption text-sage-muted">
              {checked.counts.map((c) => <span key={c.key}>{COUNT_LABEL[c.key] || c.key}: <span className="font-mono text-ivory">{c.backup}</span> (heute {c.now})</span>)}
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2 flex-wrap mb-3">
        <Button type="button" onClick={create} disabled={busy}>Jetzt sichern</Button>
        <Button as="a" href="/api/admin/backup.json" variant="outline" type="button"><Download size={18} /> Abzug herunterladen</Button>
      </div>
      {!list ? <Spinner /> : !list.length ? (
        <p className="text-sm text-sage-muted">Noch keine Sicherung vorhanden.</p>
      ) : (
        <ul className="divide-y divide-line text-sm max-h-80 overflow-y-auto">
          {list.map((b) => (
            <li key={b.name} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate">{backupLabel(b)}</span>
                <span className="block text-xs text-sage-muted">{b.kind === 'daily' ? 'Täglich' : 'Vor einer Änderung'}{b.size ? ` · ${Math.max(1, Math.round(b.size / 1024))} KB` : ''}</span>
              </span>
              <span className="flex gap-1.5 shrink-0">
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => verify(b)}>Prüfen</Button>
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => restore(b)}>Wiederherstellen</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-sage-muted mt-3">Der heruntergeladene Abzug enthält keine Passwörter und Zugangsschlüssel.</p>
    </Card>
  );
}
const COUNT_LABEL = { users: 'Konten', classes: 'Klassen', sessions: 'Unterrichtstage', attendance: 'Anwesenheit', assignments: 'Hausaufgaben', submissions: 'Abgaben', messages: 'Nachrichten', enrollments: 'Klassenverlauf' };
function backupLabel(b) {
  const m = /^(?:daily|event)-(\d{4})-(\d{2})-(\d{2})(?:T(\d{2})-(\d{2}))?/.exec(b.name);
  if (!m) return b.name;
  return `${m[3]}.${m[2]}.${m[1]}${m[4] ? `, ${m[4]}:${m[5]} UTC` : ''}`;
}

function SettingsTab() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const toast = useToast();
  const [org, setOrg] = useState(null);
  useEffect(() => { api.get('/org').then((d) => setOrg(d.org)); }, []);
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.patch('/org', {
        name: org.name, lateAfterMinutes: Number(org.lateAfterMinutes), audioRetentionDays: Number(org.audioRetentionDays), socialLinks: org.socialLinks, checkinAutoClose: org.checkinAutoClose,
        penaltyDueDays: Number(org.penaltyDueDays), penaltySurchargePages: Number(org.penaltySurchargePages), penaltySurchargeMoney: Number(org.penaltySurchargeMoney),
      });
      toast.push('Einstellungen gespeichert', 'success');
    } catch (err) { toast.push(err.message, 'error'); }
  };
  const saveWeights = async () => {
    try {
      await api.patch('/org', { gradeWeights: org.gradeWeights });
      toast.push('Notengewichte gespeichert', 'success');
    } catch (err) { toast.push(err.message, 'error'); }
  };
  if (!org) return <Spinner />;
  return (
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      <Card className="p-4 sm:p-5">
        <CardHeader title="Organisation & Social Links" subtitle="Ohne neues Release änderbar" icon={Settings} />
        <form onSubmit={save} className="space-y-3">
          <Input label="Name der Organisation" value={org.name} onChange={(v) => setOrg({ ...org, name: v })} />
          <Input label="Verspätungsgrenze (Minuten)" type="number" value={org.lateAfterMinutes} onChange={(v) => setOrg({ ...org, lateAfterMinutes: v })} />
          <Input label="Check-in schließt automatisch um (HH:MM)" type="time" value={org.checkinAutoClose || '16:00'} onChange={(v) => setOrg({ ...org, checkinAutoClose: v })} />
          <label className="block">
            <span className="text-sm text-sage">Audio-Aufbewahrung (Tage nach der Bewertung, 0 = aus)</span>
            <input type="number" className="input mt-1" value={org.audioRetentionDays ?? 0} onChange={(e) => setOrg({ ...org, audioRetentionDays: e.target.value })} />
            <span className="text-xs text-sage-muted">Bewertete Audio-Abgaben werden so viele Tage nach der Bewertung automatisch gelöscht (Bewertung und Feedback bleiben). Was eine Lehrkraft „behalten“ hat, bleibt. 0 lässt alles unangetastet.</span>
          </label>
          {isSuperAdmin && (
            <label className="flex items-start gap-3 pt-2 border-t border-line">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[rgb(var(--c-mint))]" checked={org.leitungNeedsApproval === true}
                onChange={async (e) => {
                  const on = e.target.checked;
                  try { await api.patch('/org', { leitungNeedsApproval: on }); setOrg({ ...org, leitungNeedsApproval: on }); toast.push('Gespeichert', 'success'); }
                  catch (err) { toast.push(err.message, 'error'); }
                }} />
              <span>
                <span className="block text-sm text-ivory">Änderungen der Leitung bestätigen</span>
                <span className="block text-xs text-sage-muted">Aus: Die Leitung legt Konten und Klassen an und schaltet frei, du wirst informiert. An: Erst nach deiner Bestätigung wirksam.</span>
              </span>
            </label>
          )}
          <div className="pt-2 border-t border-line">
            <div className="text-sm text-ivory mb-2">Strafsystem</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Frist (Tage, 0 = keine)" type="number" value={org.penaltyDueDays ?? 7} onChange={(v) => setOrg({ ...org, penaltyDueDays: v })} />
              <Input label="Zuschlag (Seiten)" type="number" value={org.penaltySurchargePages ?? 0} onChange={(v) => setOrg({ ...org, penaltySurchargePages: v })} />
              <Input label="Zuschlag (€)" type="number" value={org.penaltySurchargeMoney ?? 0} onChange={(v) => setOrg({ ...org, penaltySurchargeMoney: v })} />
            </div>
            <span className="text-xs text-sage-muted">Wird bei Fristüberschreitung einmalig auf offene Strafen aufgeschlagen.</span>
          </div>
          {['youtube', 'instagram', 'tiktok'].map((k) => (
            <Input key={k} label={k[0].toUpperCase() + k.slice(1)} value={org.socialLinks?.[k] || ''} onChange={(v) => setOrg({ ...org, socialLinks: { ...org.socialLinks, [k]: v } })} />
          ))}
          <div className="flex gap-2 flex-wrap">
            <Button type="submit">Speichern</Button>
          </div>
        </form>
      </Card>

      {isSuperAdmin && <BackupsCard />}
      {isSuperAdmin && <StorageCard />}
      {isSuperAdmin && <LegalCard />}

      <GradeWeightsCard weights={org.gradeWeights} onChange={(w) => setOrg({ ...org, gradeWeights: w })} onSave={saveWeights} />
    </div>
  );
}

// Gewichte für den automatischen Notenvorschlag (in Prozent bearbeitbar).
const WEIGHT_FIELDS = [
  ['homework', 'Hausaufgaben'], ['attendance', 'Anwesenheit'], ['exams', 'Prüfungen'],
  ['activities', 'Aktivitäten'], ['audios', 'Audios'], ['behavior', 'Verhalten'],
  ['mitarbeit', 'Mitarbeit (Rezitation)'],
];
function GradeWeightsCard({ weights, onChange, onSave }) {
  const w = weights || {};
  const raw = (k) => Math.round((Number(w[k]) || 0) * 100);
  const sumRaw = WEIGHT_FIELDS.reduce((s, [k]) => s + raw(k), 0);
  const set = (k, pts) => onChange({ ...w, [k]: Math.max(0, Math.min(100, Number(pts) || 0)) / 100 });
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader title="Notengewichte" subtitle="Relative Gewichtung je Bereich – der tatsächliche Anteil wird automatisch auf 100 % normiert" icon={Settings} />
      <div className="space-y-2">
        <div className="flex items-center gap-3 text-caption text-sage-muted px-1" aria-hidden="true">
          <span className="w-32 shrink-0" />
          <span className="flex-1">Relatives Gewicht</span>
          <span className="w-20 text-center">Zahl</span>
          <span className="w-24 text-right">Anteil</span>
        </div>
        {WEIGHT_FIELDS.map(([k, label]) => {
          const pts = raw(k);
          const share = sumRaw > 0 ? Math.round((pts / sumRaw) * 100) : 0;
          return (
            <div key={k} className="flex items-center gap-3">
              <label htmlFor={`weight-${k}`} className="text-sm text-sage w-32 shrink-0">{label}</label>
              <input id={`weight-${k}`} type="range" min={0} max={100} value={pts} onChange={(e) => set(k, e.target.value)} className="flex-1" aria-label={`${label}: relatives Gewicht`} />
              <input type="number" min={0} max={100} value={pts} onChange={(e) => set(k, e.target.value)} className="input w-20 py-1.5 text-sm text-center" aria-label={`${label}: relatives Gewicht als Zahl`} />
              <span className="text-xs text-sage-muted w-24 text-right">→ {share}% Anteil</span>
            </div>
          );
        })}
        <p className="text-caption text-sage-muted mt-2">
          Die Zahlen sind relative Gewichte, kein Prozentwert für sich genommen – sie werden automatisch so ins Verhältnis gesetzt, dass der tatsächliche Anteil an der Endnote (rechte Spalte) immer 100% ergibt. Bereiche ohne Daten werden fair auf die übrigen verteilt. Es bleibt ein Vorschlag – die Lehrkraft entscheidet.
        </p>
        <Button onClick={onSave} disabled={sumRaw <= 0}>Speichern</Button>
      </div>
    </Card>
  );
}

// Übersetzt bekannte Aktionscodes in lesbaren Text; unbekannte Codes werden
// generisch aus dem Rohwert abgeleitet (kein Erfinden von Bedeutung).
const AUDIT_ACTION_LABELS = {
  'user.password_change': 'Passwort geändert',
  'user.password_reset': 'Passwort per Selbstbedienung zurückgesetzt',
  'user.reset_password': 'Passwort zurückgesetzt',
  'user.register': 'Registrierung (per Einladung)',
  'user.register_open': 'Registrierung (offen)',
  'user.create': 'Nutzer angelegt',
  'user.update': 'Nutzer bearbeitet',
  'user.delete': 'Nutzer gelöscht',
  'user.klassensprecher_toggle': 'Klassensprecher-Status geändert',
  'user.probation_toggle': 'Bewährungsstatus geändert',
  'user.assign_class': 'Klasse zugewiesen',
  'user.reject_registration': 'Registrierung abgelehnt',
  'org.update': 'Schuleinstellungen geändert',
  'session.start': 'Unterrichtseinheit gestartet',
  'session.end': 'Unterrichtseinheit beendet',
  'session.checkin_open': 'Anwesenheits-Check-in geöffnet',
  'class.checkin_code_rotate': 'Check-in-Code erneuert',
  'class.create': 'Klasse angelegt',
  'class.teacher.add': 'Lehrkraft zur Klasse hinzugefügt',
  'class.teacher.remove': 'Lehrkraft aus Klasse entfernt',
  'attendance.checkin': 'Anwesenheit erfasst',
  'attendance.correct': 'Anwesenheit korrigiert',
  'absence.decide': 'Entschuldigung entschieden',
  'absence.comment': 'Rückfrage zu Entschuldigung',
  'assignment.create': 'Aufgabe erstellt',
  'assignment.extend': 'Abgabefrist verlängert',
  'submission.review': 'Abgabe korrigiert',
  'protocol.review': 'Protokoll geprüft',
  'behavior.create': 'Verhaltensvermerk erstellt',
  'quran.goal': 'Qur’ān-Ziel gesetzt',
  'quran.attempt': 'Qur’ān-Prüfung erfasst',
  'quran.recording': 'Qur’ān-Aufnahme hochgeladen',
  'exam.create': 'Prüfung erstellt',
  'exam.publish': 'Prüfung veröffentlicht',
  'exam.grade': 'Prüfung bewertet',
  'exam.files': 'Prüfungsdateien geändert',
  'exam.return': 'Prüfung zurückgegeben',
  'report.generate': 'Bericht erstellt',
  'report.update': 'Bericht aktualisiert',
  'activity.create': 'Aktivität erstellt',
  'activity.delete': 'Aktivität gelöscht',
  'message.recall': 'Nachricht zurückgerufen',
  'material.create': 'Material hochgeladen',
  'material.bulk_create': 'Material hochgeladen (mehrere)',
  'material.delete': 'Material gelöscht',
  'penalty.create': 'Strafe erfasst',
  'penalty.approve': 'Strafe genehmigt',
  'penalty.reject': 'Strafe abgelehnt',
  'penalty.settle': 'Strafe erledigt',
  'penalty.update': 'Strafe bearbeitet',
  'penalty.request_payment': 'Zahlung angefragt',
  'penalty.confirm_payment': 'Zahlung bestätigt',
  'penalty.decline_payment': 'Zahlung abgelehnt',
  'penalty.delete': 'Strafe gelöscht',
  'family.link': 'Kind verknüpft',
  'family.unlink': 'Kind-Verknüpfung entfernt',
  'account.link': 'Konto verknüpft',
  'account.link.admin': 'Konto verknüpft (durch Verwaltung)',
  'account.unlink': 'Konto-Verknüpfung entfernt',
  'account.switch': 'Konto gewechselt',
  'announcement.create': 'Ankündigung erstellt',
  'announcement.delete': 'Ankündigung gelöscht',
  'change_request.create': 'Änderungsantrag gestellt',
  'change_request.approve': 'Änderungsantrag genehmigt',
  'change_request.reject': 'Änderungsantrag abgelehnt',
  'backup.download': 'Backup heruntergeladen',
  'invite.create': 'Einladung erstellt',
  'invite.revoke': 'Einladung widerrufen',
  'export.attendance': 'Anwesenheit exportiert',
  'export.roster': 'Klassenliste exportiert',
  'rules.catalog.school': 'Strafenkatalog (Schule) geändert',
  'rules.catalog.class': 'Strafenkatalog (Klasse) geändert',
  'rules.text.school': 'Regeltext (Schule) geändert',
  'rules.text.class': 'Regeltext (Klasse) geändert',
  'calendar.token_rotate': 'Kalender-Link erneuert',
};
function auditActionLabel(action) {
  if (AUDIT_ACTION_LABELS[action]) return AUDIT_ACTION_LABELS[action];
  return action.split('.').map((p) => p.replace(/_/g, ' ')).join(' – ');
}

const AUDIT_ENTITY_LABELS = {
  user: 'Nutzer', organization: 'Organisation', session: 'Unterrichtseinheit', class: 'Klasse',
  attendance: 'Anwesenheit', absence_request: 'Entschuldigung', assignment: 'Aufgabe',
  submission: 'Abgabe', protocol: 'Protokoll', behavior: 'Verhaltensvermerk', quran_goal: 'Qur’ān-Ziel',
  exam: 'Prüfung', attempt: 'Prüfungsversuch', report: 'Bericht', activity: 'Aktivität', thread: 'Nachricht',
  material: 'Material', penalty: 'Strafe', invite: 'Einladung', change_request: 'Änderungsantrag',
};

const AUDIT_FIELD_LABELS = {
  role: 'Rolle', status: 'Status', classId: 'Klasse', classIds: 'Klassen', childIds: 'Kinder',
  name: 'Name', email: 'E-Mail', until: 'bis', minutesLate: 'Minuten verspätet', released: 'freigegeben',
  passed: 'bestanden', probation: 'Bewährung', passwordReset: 'Passwort zurückgesetzt', via: 'Weg',
  count: 'Anzahl', with: 'mit', newDueAt: 'neue Frist', studentId: 'Schüler', outcome: 'Ergebnis',
  tone: 'Einordnung', category: 'Kategorie', type: 'Typ', viaReactivateDemoAccounts: 'per Demo-Reaktivierung',
  entityId: 'Datensatz',
};

function auditFormatValue(v) {
  if (v === null || v === undefined || v === '') return '–';
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  if (Array.isArray(v)) return v.length ? `${v.length}` : '–';
  return String(v);
}

// Fasst before/after zu einer kurzen, nachvollziehbaren Änderungsliste zusammen –
// zeigt ausschließlich Felder, die im gespeicherten Datensatz tatsächlich vorliegen.
function auditChangeSummary(l) {
  const before = l.before && typeof l.before === 'object' ? l.before : null;
  const after = l.after && typeof l.after === 'object' ? l.after : null;
  if (!before && !after) return null;
  if (before && !after) return null; // z. B. Löschung – Objektspalte zeigt bereits „gelöscht"
  const keys = new Set([...(before ? Object.keys(before) : []), ...(after ? Object.keys(after) : [])]);
  const parts = [];
  for (const k of keys) {
    const label = AUDIT_FIELD_LABELS[k] || k;
    const bv = before ? before[k] : undefined;
    const av = after ? after[k] : undefined;
    if (before && JSON.stringify(bv) === JSON.stringify(av)) continue;
    if (!before) parts.push(`${label}: ${auditFormatValue(av)}`);
    else parts.push(`${label}: ${auditFormatValue(bv)} → ${auditFormatValue(av)}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

function AuditTab() {
  const [logs, setLogs] = useState(null);
  useEffect(() => { api.get('/admin/audit').then((d) => setLogs(d.logs)); }, []);
  if (!logs) return <Spinner />;
  return (
    <Card className="p-0 overflow-hidden">
      <p className="sm:hidden px-4 pt-3 text-caption text-sage-muted">Tabelle lässt sich seitlich scrollen →</p>
      <div className="overflow-x-auto" role="region" aria-label="Audit-Log, seitlich scrollbar" tabIndex={0}>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-sage-muted border-b border-line">
            <th className="p-3">Zeit</th><th className="p-3">Wer</th><th className="p-3">Aktion</th>
            <th className="p-3">Objekt</th><th className="p-3">Änderung</th>
          </tr></thead>
          <tbody>
            {logs.map((l) => {
              const entityLabel = AUDIT_ENTITY_LABELS[l.entityType] || l.entityType;
              const change = auditChangeSummary(l);
              const isDelete = l.before && !l.after;
              return (
                <tr key={l.id} className="border-b border-line align-top">
                  <td className="p-3 text-sage-muted font-mono text-xs whitespace-nowrap">{new Date(l.createdAt).toLocaleString('de-DE')}</td>
                  <td className="p-3 text-ivory text-xs whitespace-nowrap">{l.actorName || <span className="text-sage-muted italic">unbekannt/gelöscht</span>}</td>
                  <td className="p-3 text-ivory text-xs" title={l.action}>{auditActionLabel(l.action)}</td>
                  <td className="p-3 text-sage-muted text-xs whitespace-nowrap" title={l.entityId || undefined}>
                    {entityLabel}{l.entityName ? ` „${l.entityName}“` : ''}
                  </td>
                  <td className="p-3 text-sage-muted text-xs">
                    {isDelete ? <span className="italic">gelöscht</span> : (change || '–')}
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && <tr><td colSpan={5} className="p-4 text-sage-muted">Noch keine Einträge.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function InvitesTab() {
  const toast = useToast();
  const [invites, setInvites] = useState(null);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState({ role: 'schueler', classId: '', childId: '', expiresInDays: 14, maxUses: 1 });
  const [created, setCreated] = useState(null);

  const load = () => api.get('/admin/invites').then((d) => setInvites(d.invites));
  useEffect(() => {
    load();
    api.get('/classes').then((d) => { setClasses(d.classes); setForm((f) => ({ ...f, classId: d.classes[0]?.id || '' })); });
    api.get('/admin/users').then((d) => setStudents(d.users.filter((u) => u.role === 'schueler' || u.role === 'klassensprecher')));
  }, []);

  const create = async () => {
    try {
      const payload = { ...form, expiresInDays: Number(form.expiresInDays), maxUses: Number(form.maxUses) };
      if (form.role !== 'eltern') delete payload.childId;
      const { token } = await api.post('/admin/invites', payload);
      setCreated({ link: `${window.location.origin}/#/registrieren?token=${token}` });
      toast.push('Einladung erstellt', 'success');
      load();
    } catch (err) { toast.push(err.message, 'error'); }
  };
  const revoke = async (id) => { await api.post(`/admin/invites/${id}/revoke`); load(); };
  const copy = (link) => { navigator.clipboard?.writeText(link); toast.push('Link kopiert', 'success'); };

  const statusTone = (s) => (s === 'aktiv' ? 'present' : s === 'aufgebraucht' ? 'neutral' : 'late');
  if (!invites) return <Spinner />;
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <CardHeader title="Neue Einladung" subtitle="Sicherer, befristeter Registrierungslink" icon={Mail} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <label className="block">
            <span className="text-sm text-sage">Rolle</span>
            <select className="input mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.filter(([v]) => v !== 'super_admin').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-sage">Klasse{form.role === 'leitung' ? ' (optional)' : ''}</span>
            <select className="input mt-1" value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
              <option value="">– keine –</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {form.role === 'eltern' && (
            <label className="block sm:col-span-2">
              <span className="text-sm text-sage">Kind verknüpfen (optional)</span>
              <select className="input mt-1" value={form.childId} onChange={(e) => setForm({ ...form, childId: e.target.value })}>
                <option value="">– später verknüpfen –</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          <Input label="Gültig (Tage)" type="number" value={form.expiresInDays} onChange={(v) => setForm({ ...form, expiresInDays: v })} />
          <Input label="Max. Nutzungen" type="number" value={form.maxUses} onChange={(v) => setForm({ ...form, maxUses: v })} />
          <div className="sm:col-span-2"><Button onClick={create}><Plus size={18} /> Einladung erstellen</Button></div>
        </div>
        {created && (
          <div className="mx-4 mb-4 rounded-lg border border-mint/30 bg-mint/5 p-4">
            <div className="text-sm text-sage mb-2">Diesen Link an die Person weitergeben (z. B. per WhatsApp):</div>
            <div className="flex gap-2">
              <input readOnly className="input font-mono text-xs" value={created.link} onFocus={(e) => e.target.select()} />
              <Button variant="outline" onClick={() => copy(created.link)}><Copy size={16} /> Kopieren</Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-sage-muted border-b border-line">
              <th className="p-3">Rolle</th><th className="p-3">Klasse</th><th className="p-3">Nutzung</th><th className="p-3">Gültig bis</th><th className="p-3">Status</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id} className="border-b border-line">
                  <td className="p-3 text-ivory">{i.roleLabel}{i.childName ? ` (${i.childName})` : ''}</td>
                  <td className="p-3 text-sage-muted">{i.className || '–'}</td>
                  <td className="p-3">{i.usedCount}/{i.maxUses}</td>
                  <td className="p-3 text-sage-muted">{new Date(i.expiresAt).toLocaleDateString('de-DE')}</td>
                  <td className="p-3"><Badge tone={statusTone(i.status)}>{i.status}</Badge></td>
                  <td className="p-3 text-right">{i.status === 'aktiv' && <Button size="sm" variant="ghost" onClick={() => revoke(i.id)}>Widerrufen</Button>}</td>
                </tr>
              ))}
              {invites.length === 0 && <tr><td colSpan={6} className="p-4 text-sage-muted">Noch keine Einladungen.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', required }) {
  return (
    <label className="block">
      <span className="text-sm text-sage">{label}</span>
      <input type={type} className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </label>
  );
}
