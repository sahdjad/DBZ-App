import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users2, School, Settings, ScrollText, Plus, Download, Mail, Copy, KeyRound, CheckCircle2, ShieldCheck, XCircle, Link2, UserCheck, RotateCcw } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { Card, CardHeader, Button, Badge, Spinner, useToast } from '../components/ui.jsx';

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
    <AppLayout title="Verwaltung">
      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map(([k, label, Icon]) => (
          <Button key={k} variant={tab === k ? 'primary' : 'outline'} size="sm" onClick={() => setTab(k)}>
            <Icon size={16} /> {label}
          </Button>
        ))}
      </div>
      {tab === 'users' && <UsersTab />}
      {tab === 'pending' && <PendingTab />}
      {tab === 'invites' && <InvitesTab />}
      {tab === 'classes' && <ClassesTab />}
      {tab === 'approvals' && <ApprovalsTab isSuperAdmin={isSuperAdmin} />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'audit' && <AuditTab />}
    </AppLayout>
  );
}

// Genehmigungen: der System-Administrator bestätigt/lehnt Grundlagen-Änderungen
// der Leitung (neue Konten, neue Klassen). Die Leitung sieht hier ihre eigenen
// Anträge samt Status.
function ApprovalsTab({ isSuperAdmin }) {
  const toast = useToast();
  const [requests, setRequests] = useState(null);
  const load = () => api.get('/admin/change-requests').then((d) => setRequests(d.requests)).catch(() => setRequests([]));
  useEffect(() => { load(); }, []);

  const decide = async (id, action) => {
    try {
      await api.post(`/admin/change-requests/${id}/${action}`, {});
      toast.push(action === 'approve' ? 'Bestätigt' : 'Abgelehnt', 'success');
      load();
    } catch (err) { toast.push(err.message, 'error'); }
  };

  if (!requests) return <Spinner />;
  const STAT = { pending: ['Offen', 'late'], approved: ['Bestätigt', 'present'], rejected: ['Abgelehnt', 'absent'] };
  return (
    <Card className="p-5">
      <CardHeader
        title={isSuperAdmin ? 'Zu bestätigen' : 'Meine Anträge'}
        subtitle={isSuperAdmin ? 'Neue Konten und Klassen der Leitung freigeben' : 'Deine Änderungen warten auf Bestätigung durch den Administrator'}
        icon={ShieldCheck}
      />
      {requests.length === 0 ? (
        <p className="p-4 text-sage-muted text-sm">Nichts offen.</p>
      ) : (
        <ul className="divide-y divide-line">
          {requests.map((r) => (
            <li key={r.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-ivory text-sm">{r.summary}</div>
                <div className="text-xs text-sage-muted">
                  {r.type === 'create_user' ? 'Neues Konto' : r.type === 'assign_class' ? 'Klassenzuweisung' : 'Neue Klasse'} · beantragt von {r.requestedByName}
                  {' · '}{new Date(r.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </div>
              {isSuperAdmin && r.status === 'pending' ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => decide(r.id, 'approve')}><CheckCircle2 size={16} /> Bestätigen</Button>
                  <Button size="sm" variant="outline" onClick={() => decide(r.id, 'reject')}><XCircle size={16} /> Ablehnen</Button>
                </div>
              ) : (
                <Badge tone={STAT[r.status]?.[1] || 'neutral'}>{STAT[r.status]?.[0] || r.status}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
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
    <Card className="p-5">
      <CardHeader title="Konten verknüpfen" subtitle="Dieselbe Person mit mehreren Rollen zusammenführen (z. B. Schüler + Klassenlehrer + Leitung)" icon={Link2} />
      <form onSubmit={link} className="p-4 grid gap-2 sm:grid-cols-2">
        <input className="input" type="email" placeholder="E-Mail Konto 1" value={f.emailA} onChange={(e) => setF({ ...f, emailA: e.target.value })} required />
        <input className="input" type="email" placeholder="E-Mail Konto 2" value={f.emailB} onChange={(e) => setF({ ...f, emailB: e.target.value })} required />
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

  const assign = async (id) => {
    const classId = picked[id];
    if (!classId) { toast.push('Bitte zuerst eine Klasse auswählen', 'error'); return; }
    setBusy(id);
    try {
      const res = await api.post(`/admin/pending-registrations/${id}/assign`, { classId });
      toast.push(res.pending ? 'Zur Bestätigung an den Administrator gesendet' : 'Klasse zugewiesen', 'success');
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
    <Card className="p-5">
      <CardHeader title="Neue Anmeldungen" subtitle="Ohne Einladung registriert – wartet auf Klassenzuweisung" icon={UserCheck} />
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
              <div className="flex items-center gap-2 flex-wrap">
                <select className="input py-1.5 w-auto text-sm" value={picked[u.id] || ''} onChange={(e) => setPicked({ ...picked, [u.id]: e.target.value })}>
                  <option value="">– Klasse wählen –</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Button size="sm" onClick={() => assign(u.id)} disabled={busy === u.id}><CheckCircle2 size={16} /> Zuweisen</Button>
                <Button size="sm" variant="outline" onClick={() => reject(u.id)} disabled={busy === u.id}><XCircle size={16} /> Ablehnen</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function UsersTab() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [classes, setClasses] = useState([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'schueler', classId: '' });
  const [selected, setSelected] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  // Nur im Demo-Betrieb anzeigen -- in Produktion lehnt der Server die
  // Anfrage ohnehin ab (IS_PRODUCTION in server/api.js), der Button würde
  // also nur einen Fehler produzieren.
  const [demoModeAvailable, setDemoModeAvailable] = useState(false);
  useEffect(() => { api.get('/health').then((d) => setDemoModeAvailable(d.mode === 'demo')).catch(() => {}); }, []);

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

  // Das eigene Konto lässt sich nie mit auswählen/löschen.
  const selectable = (users || []).filter((u) => u.id !== me?.id);
  const allSelected = selectable.length > 0 && selected.length === selectable.length;
  const toggleAll = () => setSelected(allSelected ? [] : selectable.map((u) => u.id));
  const toggleOne = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const bulkDelete = async () => {
    if (!selected.length) return;
    if (!window.confirm(`${selected.length} Konto(en) endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    setBulkBusy(true);
    try {
      const { results } = await api.post('/admin/users/bulk-delete', { ids: selected });
      const okCount = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        toast.push(`${okCount} gelöscht, ${failed.length} nicht möglich (${failed[0].error}${failed.length > 1 ? ' u. a.' : ''})`, okCount > 0 ? 'success' : 'error');
      } else {
        toast.push(`${okCount} Konto(en) endgültig gelöscht`, 'success');
      }
      setSelected([]);
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  // Setzt die 6 Demo-Konten von der Login-Seite wieder auf aktiv UND ihr
  // Passwort zwingend auf demo1234 zurück. Fehlt eins komplett (z. B. durch
  // versehentliches Löschen), wird es mit denselben Werten wie beim
  // ursprünglichen Seeding neu angelegt.
  const reactivateDemo = async () => {
    setDemoBusy(true);
    try {
      const { results } = await api.post('/admin/reactivate-demo-accounts', {});
      const recreated = results.filter((r) => r.recreated).length;
      const msg = recreated > 0
        ? `Alle 6 Demo-Konten aktiv (${recreated} davon neu angelegt), Passwort auf demo1234 zurückgesetzt`
        : 'Alle 6 Demo-Konten aktiv, Passwort auf demo1234 zurückgesetzt';
      toast.push(msg, 'success');
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setDemoBusy(false);
    }
  };

  if (!users) return <Spinner />;
  return (
    <div className="space-y-4">
      <LinkAccountsAdminCard />
      <div className="flex justify-end gap-2 flex-wrap">
        {demoModeAvailable && (
          <Button variant="outline" onClick={reactivateDemo} disabled={demoBusy}>
            <RotateCcw size={18} /> Demo-Konten reaktivieren
          </Button>
        )}
        {selected.length > 0 && (
          <Button variant="danger" onClick={bulkDelete} disabled={bulkBusy}>
            <XCircle size={18} /> {selected.length} löschen
          </Button>
        )}
        <Button onClick={() => setShow((s) => !s)}><Plus size={18} /> Nutzer anlegen</Button>
      </div>
      {show && (
        <Card className="p-5">
          <CardHeader title="Neuer Nutzer" icon={Users2} />
          <form onSubmit={create} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <Input label="E-Mail" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
            <Input label="Passwort" type="text" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />
            <label className="block">
              <span className="text-sm text-sage">Rolle</span>
              <select className="input mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm text-sage">Klasse (optional)</span>
              <select className="input mt-1" value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">– keine –</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2"><Button type="submit">Anlegen</Button></div>
          </form>
        </Card>
      )}
      {editing && (
        <EditUser
          user={editing}
          classes={classes}
          students={users.filter((u) => u.role === 'schueler' || u.role === 'klassensprecher')}
          onDone={() => { setEditing(null); load(); }}
          onCancel={() => setEditing(null)}
        />
      )}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-sage-muted border-b border-line">
              <th className="p-3 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
              <th className="p-3">Name</th><th className="p-3">E-Mail</th><th className="p-3">Rolle</th><th className="p-3">Status</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line">
                  <td className="p-3">
                    {u.id !== me?.id && (
                      <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggleOne(u.id)} />
                    )}
                  </td>
                  <td className="p-3 text-ivory">{u.name}</td>
                  <td className="p-3 text-sage-muted font-mono text-xs">{u.email}</td>
                  <td className="p-3">{u.roleLabel}</td>
                  <td className="p-3"><Badge tone={u.status === 'active' ? 'present' : 'late'}>{u.status}</Badge></td>
                  <td className="p-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Bearbeiten</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function EditUser({ user, classes, students, onDone, onCancel }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: user.name,
    role: user.role,
    status: user.status,
    classIds: user.classIds || [],
    childIds: user.childIds || [],
  });
  const toggle = (key, id) => setF((x) => ({ ...x, [key]: x[key].includes(id) ? x[key].filter((v) => v !== id) : [...x[key], id] }));
  const [pw, setPw] = useState('');

  const resetPw = async () => {
    if (pw.length < 6) return toast.push('Mindestens 6 Zeichen', 'error');
    try {
      await api.post(`/admin/users/${user.id}/reset-password`, { newPassword: pw });
      toast.push('Passwort zurückgesetzt – bitte der Person mitteilen', 'success');
      setPw('');
    } catch (err) { toast.push(err.message, 'error'); }
  };

  const save = async () => {
    try {
      await api.patch(`/admin/users/${user.id}`, f);
      toast.push('Gespeichert', 'success');
      onDone();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  const remove = async () => {
    if (!window.confirm(`${user.name} endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    try {
      await api.del(`/admin/users/${user.id}`);
      toast.push('Nutzer gelöscht', 'success');
      onDone();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  const showClasses = ['schueler', 'klassensprecher', 'klassenlehrer', 'vertretung'].includes(f.role);
  return (
    <Card className="p-5 border-mint/30">
      <CardHeader title={`Bearbeiten: ${user.name}`} subtitle={user.email} icon={Users2} />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
          <label className="block">
            <span className="text-sm text-sage">Rolle</span>
            <select className="input mt-1" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-sage">
          <input type="checkbox" checked={f.status === 'active'} onChange={(e) => setF({ ...f, status: e.target.checked ? 'active' : 'disabled' })} />
          Konto aktiv
        </label>

        {showClasses && (
          <div>
            <span className="text-sm text-sage">Klassen</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {classes.map((c) => (
                <button key={c.id} onClick={() => toggle('classIds', c.id)}
                  className={['px-3 py-1.5 rounded-lg border text-sm', f.classIds.includes(c.id) ? 'border-mint bg-mint/10 text-ivory' : 'border-line text-sage'].join(' ')}>
                  {c.name}
                </button>
              ))}
              {classes.length === 0 && <span className="text-sage-muted text-sm">Keine Klassen vorhanden.</span>}
            </div>
          </div>
        )}

        {f.role === 'eltern' && (
          <div>
            <span className="text-sm text-sage">Verknüpfte Kinder</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {students.map((s) => (
                <button key={s.id} onClick={() => toggle('childIds', s.id)}
                  className={['px-3 py-1.5 rounded-lg border text-sm', f.childIds.includes(s.id) ? 'border-mint bg-mint/10 text-ivory' : 'border-line text-sage'].join(' ')}>
                  {s.name}
                </button>
              ))}
              {students.length === 0 && <span className="text-sage-muted text-sm">Keine Schüler vorhanden.</span>}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-line p-3">
          <div className="text-sm text-sage mb-2 flex items-center gap-2"><KeyRound size={16} /> Passwort zurücksetzen</div>
          <div className="flex gap-2">
            <input type="text" className="input" placeholder="Neues Passwort (mind. 6 Zeichen)" value={pw} onChange={(e) => setPw(e.target.value)} />
            <Button variant="outline" onClick={resetPw}>Zurücksetzen</Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={save}>Speichern</Button>
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
          {user.status === 'disabled' && (
            <Button variant="danger" onClick={remove} className="ml-auto">Endgültig löschen</Button>
          )}
        </div>
        {user.status !== 'disabled' && (
          <p className="text-[11px] text-sage-muted">Zum endgültigen Löschen zuerst „Konto aktiv" ausschalten und speichern.</p>
        )}
      </div>
    </Card>
  );
}

function ClassesTab() {
  const toast = useToast();
  const [classes, setClasses] = useState(null);
  const [form, setForm] = useState({ name: '', weekday: 6, startTime: '14:00', endTime: '18:00' });
  const load = () => api.get('/classes').then((d) => setClasses(d.classes));
  useEffect(() => { load(); }, []);
  const create = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/classes', { ...form, weekday: Number(form.weekday) });
      toast.push(res.pending ? 'Zur Bestätigung an den Administrator gesendet' : 'Klasse erstellt', 'success');
      setForm({ name: '', weekday: 6, startTime: '14:00', endTime: '18:00' });
      load();
    } catch (err) { toast.push(err.message, 'error'); }
  };
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  if (!classes) return <Spinner />;
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <CardHeader title="Neue Klasse" icon={School} />
        <form onSubmit={create} className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
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
        {classes.map((c) => <ClassCard key={c.id} c={c} days={days} />)}
      </div>
    </div>
  );
}

function ClassCard({ c, days }) {
  const toast = useToast();
  const [openTeachers, setOpenTeachers] = useState(false);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-ivory">{c.name}</div>
          <div className="text-xs text-sage-muted">{days[c.weekday]} · {c.startTime}–{c.endTime} · {c.studentCount} Schüler · {c.type === 'online' ? 'Online' : 'Präsenz'}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setOpenTeachers((o) => !o)}><Users2 size={16} /> Lehrkräfte</Button>
          <Button variant="ghost" size="sm" title="Klassenliste als CSV"
            onClick={() => api.download(`/export/roster.csv?classId=${c.id}`, `klassenliste_${c.id}.csv`).catch((e) => toast.push(e.message, 'error'))}>
            <Download size={16} /> CSV
          </Button>
        </div>
      </div>
      {openTeachers && <ClassTeachers classId={c.id} />}
    </Card>
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

function SettingsTab() {
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
      <Card className="p-5">
        <CardHeader title="Organisation & Social Links" subtitle="Ohne neues Release änderbar" icon={Settings} />
        <form onSubmit={save} className="p-4 space-y-3">
          <Input label="Name der Organisation" value={org.name} onChange={(v) => setOrg({ ...org, name: v })} />
          <Input label="Verspätungsgrenze (Minuten)" type="number" value={org.lateAfterMinutes} onChange={(v) => setOrg({ ...org, lateAfterMinutes: v })} />
          <Input label="Check-in schließt automatisch um (HH:MM)" type="time" value={org.checkinAutoClose || '16:00'} onChange={(v) => setOrg({ ...org, checkinAutoClose: v })} />
          <label className="block">
            <span className="text-sm text-sage">Audio-Aufbewahrung (Tage, 0 = deaktiviert)</span>
            <input type="number" className="input mt-1" value={org.audioRetentionDays ?? 0} onChange={(e) => setOrg({ ...org, audioRetentionDays: e.target.value })} />
            <span className="text-xs text-sage-muted">Audio-Abgaben werden nach dieser Frist automatisch gelöscht (Bewertung bleibt). 0 lässt alles unangetastet.</span>
          </label>
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
            <Button as="a" href="/api/admin/backup.json" variant="outline" type="button"><Download size={18} /> Backup herunterladen</Button>
          </div>
        </form>
      </Card>

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
    <Card className="p-5">
      <CardHeader title="Notengewichte" subtitle="Relative Gewichtung je Bereich – der tatsächliche Anteil wird automatisch auf 100 % normiert" icon={Settings} />
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-3 text-[11px] text-sage-muted px-1" aria-hidden="true">
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
        <p className="text-[11px] text-sage-muted mt-2">
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
      <p className="sm:hidden px-4 pt-3 text-[11px] text-sage-muted">Tabelle lässt sich seitlich scrollen →</p>
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
      <Card className="p-5">
        <CardHeader title="Neue Einladung" subtitle="Sicherer, befristeter Registrierungslink" icon={Mail} />
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
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
