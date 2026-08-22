import { useEffect, useState } from 'react';
import { Users2, School, Settings, ScrollText, Plus, Download, Mail, Copy, KeyRound } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, Spinner, useToast } from '../components/ui.jsx';

const TABS = [
  ['users', 'Nutzer', Users2],
  ['invites', 'Einladungen', Mail],
  ['classes', 'Klassen', School],
  ['settings', 'Einstellungen', Settings],
  ['audit', 'Audit-Log', ScrollText],
];

export default function Admin() {
  const [tab, setTab] = useState('users');
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
      {tab === 'invites' && <InvitesTab />}
      {tab === 'classes' && <ClassesTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'audit' && <AuditTab />}
    </AppLayout>
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

function UsersTab() {
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [classes, setClasses] = useState([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'schueler', classId: '' });

  const load = () => api.get('/admin/users').then((d) => setUsers(d.users));
  useEffect(() => { load(); api.get('/classes').then((d) => setClasses(d.classes)); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/users', { ...form, classIds: form.classId ? [form.classId] : [] });
      toast.push('Nutzer angelegt', 'success');
      setShow(false);
      setForm({ name: '', email: '', password: '', role: 'schueler', classId: '' });
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  if (!users) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setShow((s) => !s)}><Plus size={18} /> Nutzer anlegen</Button></div>
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
          students={users.filter((u) => u.role === 'schueler')}
          onDone={() => { setEditing(null); load(); }}
          onCancel={() => setEditing(null)}
        />
      )}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-sage-muted border-b border-line">
              <th className="p-3">Name</th><th className="p-3">E-Mail</th><th className="p-3">Rolle</th><th className="p-3">Status</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line">
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
        </div>
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
      await api.post('/admin/classes', { ...form, weekday: Number(form.weekday) });
      toast.push('Klasse erstellt', 'success');
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
        {classes.map((c) => (
          <Card key={c.id} className="p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-ivory">{c.name}</div>
              <div className="text-xs text-sage-muted">{days[c.weekday]} · {c.startTime}–{c.endTime} · {c.studentCount} Schüler</div>
            </div>
            <Button as="a" href={`/api/export/roster.csv?classId=${c.id}`} variant="ghost" size="sm" title="Klassenliste als CSV">
              <Download size={16} /> CSV
            </Button>
          </Card>
        ))}
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
      await api.patch('/org', { name: org.name, lateAfterMinutes: Number(org.lateAfterMinutes), audioRetentionDays: Number(org.audioRetentionDays), socialLinks: org.socialLinks });
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
          <label className="block">
            <span className="text-sm text-sage">Audio-Aufbewahrung (Tage, 0 = deaktiviert)</span>
            <input type="number" className="input mt-1" value={org.audioRetentionDays ?? 0} onChange={(e) => setOrg({ ...org, audioRetentionDays: e.target.value })} />
            <span className="text-xs text-sage-muted">Audio-Abgaben werden nach dieser Frist automatisch gelöscht (Bewertung bleibt). 0 lässt alles unangetastet.</span>
          </label>
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
  ['activities', 'Aktivitäten'], ['behavior', 'Verhalten'],
];
function GradeWeightsCard({ weights, onChange, onSave }) {
  const w = weights || {};
  const sum = WEIGHT_FIELDS.reduce((s, [k]) => s + (Number(w[k]) || 0), 0);
  const set = (k, pct) => onChange({ ...w, [k]: Math.max(0, Math.min(100, Number(pct) || 0)) / 100 });
  return (
    <Card className="p-5">
      <CardHeader title="Notengewichte" subtitle="Wie stark jeder Bereich in den Notenvorschlag einfließt" icon={Settings} />
      <div className="p-4 space-y-2">
        {WEIGHT_FIELDS.map(([k, label]) => {
          const pct = Math.round((Number(w[k]) || 0) * 100);
          const share = sum > 0 ? Math.round(((Number(w[k]) || 0) / sum) * 100) : 0;
          return (
            <div key={k} className="flex items-center gap-3">
              <span className="text-sm text-sage w-32 shrink-0">{label}</span>
              <input type="range" min={0} max={100} value={pct} onChange={(e) => set(k, e.target.value)} className="flex-1" />
              <input type="number" min={0} max={100} value={pct} onChange={(e) => set(k, e.target.value)} className="input w-20 py-1.5 text-sm text-center" />
              <span className="text-xs text-sage-muted w-14 text-right">= {share}%</span>
            </div>
          );
        })}
        <p className="text-[11px] text-sage-muted mt-2">
          Die Werte werden automatisch ins Verhältnis gesetzt (aktuelle Summe {Math.round(sum * 100)}%). Bereiche ohne Daten werden fair auf die übrigen verteilt. Es bleibt ein Vorschlag – die Lehrkraft entscheidet.
        </p>
        <Button onClick={onSave} disabled={sum <= 0}>Speichern</Button>
      </div>
    </Card>
  );
}

function AuditTab() {
  const [logs, setLogs] = useState(null);
  useEffect(() => { api.get('/admin/audit').then((d) => setLogs(d.logs)); }, []);
  if (!logs) return <Spinner />;
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-sage-muted border-b border-line">
            <th className="p-3">Zeit</th><th className="p-3">Aktion</th><th className="p-3">Objekt</th>
          </tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-line">
                <td className="p-3 text-sage-muted font-mono text-xs">{new Date(l.createdAt).toLocaleString('de-DE')}</td>
                <td className="p-3 text-ivory font-mono text-xs">{l.action}</td>
                <td className="p-3 text-sage-muted text-xs">{l.entityType}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={3} className="p-4 text-sage-muted">Noch keine Einträge.</td></tr>}
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
    api.get('/admin/users').then((d) => setStudents(d.users.filter((u) => u.role === 'schueler')));
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
