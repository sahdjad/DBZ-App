// Verwaltung einer Person an einem Ort (Leitung/Admin): Steckbrief mit allen
// Stammdaten, Rollenbearbeitung (aktuelle Position -> Beförderung direkt
// daneben), zusätzliche Rollen, Konto (aktiv/Passwort).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowRight, Contact as IdCard, ShieldCheck, KeyRound, Mail, Phone, MapPin, Cake, Users, Clock } from 'lucide-react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Badge, Spinner, useToast } from './ui.jsx';
import { lastSeenLabel } from '../lib/format.js';

export const ROLES = [
  ['schueler', 'Schüler'],
  ['klassensprecher', 'Klassensprecher'],
  ['klassenlehrer', 'Klassenlehrer'],
  ['vertretung', 'Vertretungslehrer'],
  ['eltern', 'Eltern'],
  ['leitung', 'DBZ-Leitung'],
  ['super_admin', 'Administrator'],
];
const roleLabel = (r) => ROLES.find(([v]) => v === r)?.[1] || r;
const CLASS_ROLES = ['schueler', 'klassensprecher', 'klassenlehrer', 'vertretung'];
const MULTI_CLASS = ['klassenlehrer', 'vertretung'];

function ClassChips({ classes, value, onChange, multi }) {
  return (
    <div className="flex flex-wrap gap-2">
      {classes.map((c) => {
        const on = value.includes(c.id);
        return (
          <button key={c.id} type="button" onClick={() => onChange(on ? value.filter((x) => x !== c.id) : multi ? [...value, c.id] : [c.id])}
            className={['px-3 py-1.5 rounded-lg border text-sm', on ? 'border-mint bg-mint/10 text-ivory' : 'border-line text-sage'].join(' ')}>
            {c.name}
          </button>
        );
      })}
      {classes.length === 0 && <span className="text-sage-muted text-sm">Keine Klassen vorhanden.</span>}
    </div>
  );
}

// Rollenbearbeitung: links die aktuelle Position, rechts direkt die Beförderung.
export function RoleEditor({ user, classes, isSuperAdmin, onChanged }) {
  const toast = useToast();
  const [role, setRole] = useState(user.role);
  const [cls, setCls] = useState(user.classIds || []);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRole(user.role); setCls(user.classIds || []); }, [user.id, user.role, (user.classIds || []).join(',')]);
  const options = ROLES.filter(([v]) => isSuperAdmin || v !== 'super_admin');
  const sameClasses = [...cls].sort().join(',') === [...(user.classIds || [])].sort().join(',');
  const changed = role !== user.role || (CLASS_ROLES.includes(role) && !sameClasses);
  const promote = async () => {
    if (CLASS_ROLES.includes(role) && !MULTI_CLASS.includes(role) && cls.length !== 1) return toast.push('Bitte genau eine Klasse wählen', 'error');
    const msg = role !== user.role ? `${user.name}: ${roleLabel(user.role)} → ${roleLabel(role)}?` : `Klassen von ${user.name} ändern?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const r = await api.patch(`/admin/users/${user.id}`, { role, classIds: CLASS_ROLES.includes(role) ? cls : [] });
      toast.push(r.pending ? 'Zur Bestätigung an den Administrator gesendet' : role !== user.role ? `Befördert: ${roleLabel(role)}` : 'Klassen gespeichert', 'success');
      onChanged?.();
    } catch (err) { toast.push(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto_1.4fr] items-start">
      <div className="rounded-xl border border-line bg-subtle/50 p-4">
        <div className="text-xs uppercase tracking-wide text-sage-muted">Aktuelle Position</div>
        <div className="mt-2"><Badge tone="mint">{roleLabel(user.role)}</Badge></div>
        <div className="mt-2 text-sm text-sage">{user.classNames?.length ? user.classNames.join(', ') : CLASS_ROLES.includes(user.role) ? 'noch ohne Klasse' : 'keine Klasse nötig'}</div>
        {user.otherRoles?.length > 0 && <div className="mt-1 text-xs text-sage-muted">auch: {user.otherRoles.join(', ')}</div>}
      </div>
      <div className="hidden md:grid place-items-center self-center text-sage-muted"><ArrowRight size={22} /></div>
      <div className="rounded-xl border border-mint/30 bg-mint/[0.05] p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-sage-muted">Befördern / ändern</div>
        <select className="input" value={role} onChange={(e) => { setRole(e.target.value); if (!CLASS_ROLES.includes(e.target.value)) setCls([]); }} disabled={!user.canEditRole && user.canEditRole !== undefined}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}{v === user.role ? ' (aktuell)' : ''}</option>)}
        </select>
        {CLASS_ROLES.includes(role) && (
          <div>
            <div className="text-xs text-sage-muted mb-1.5">{MULTI_CLASS.includes(role) ? 'Unterrichtet in:' : 'Klasse:'}</div>
            <ClassChips classes={classes} value={cls} onChange={setCls} multi={MULTI_CLASS.includes(role)} />
          </div>
        )}
        <Button onClick={promote} disabled={!changed || busy}>{role !== user.role ? `Zu ${roleLabel(role)} befördern` : 'Klassen speichern'}</Button>
        <p className="text-[11px] text-sage-muted">Die bisherige Rolle wird ersetzt. Soll sie bleiben, unten „Zusätzliche Rolle“ nutzen.</p>
      </div>
    </div>
  );
}

// Alle Rollen einer Person an einem Ort: hinzufügen, Klassen anpassen, entziehen.
export function PersonRolesCard({ userId, classes, onChanged }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [role, setRole] = useState('');
  const [cls, setCls] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = () => api.get(`/admin/users/${userId}/roles`).then(setData).catch((e) => toast.push(e.message, 'error'));
  useEffect(() => { load(); }, [userId]);
  if (!data) return <Spinner label="Rollen laden …" />;
  const active = data.accounts.filter((a) => a.status !== 'disabled');
  const has = (r) => active.some((a) => a.role === r || (['schueler', 'klassensprecher'].includes(r) && ['schueler', 'klassensprecher'].includes(a.role)));
  const options = ROLES.filter(([v]) => data.grantable.includes(v) && !has(v));
  const needsClass = ['schueler', 'klassensprecher', 'klassenlehrer', 'vertretung'].includes(role);
  const multi = ['klassenlehrer', 'vertretung'].includes(role);
  const add = async () => {
    if (!role) return;
    setBusy(true);
    try {
      await api.post(`/admin/users/${userId}/roles`, { role, classIds: cls });
      toast.push('Rolle hinzugefügt', 'success');
      setRole(''); setCls([]);
      load(); onChanged?.();
    } catch (err) { toast.push(err.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async (a) => {
    if (!window.confirm(`Rolle „${a.roleLabel}" entziehen? Der bisherige Verlauf bleibt gespeichert; die Rolle lässt sich später wieder vergeben.`)) return;
    try { await api.del(`/admin/users/${userId}/roles/${a.id}`); toast.push('Rolle entzogen', 'success'); load(); onChanged?.(); }
    catch (err) { toast.push(err.message, 'error'); }
  };
  return (
    <div className="rounded-xl border border-line p-3 space-y-3">
      <div className="text-sm text-ivory font-medium">Zusätzliche Rollen <span className="font-normal text-sage-muted">– bisherige Rolle bleibt, ein Passwort</span></div>
      <div className="text-xs text-sage-muted">Anmeldung: {data.person.email || '–'}</div>
      <ul className="space-y-1.5">
        {data.accounts.map((a) => (
          <li key={a.id} className={`flex items-center gap-2 text-sm ${a.status === 'disabled' ? 'opacity-50' : ''}`}>
            <Badge tone={a.status === 'disabled' ? 'neutral' : 'mint'}>{a.roleLabel}</Badge>
            <span className="text-sage-muted truncate flex-1">{a.classNames.join(', ') || (['schueler', 'klassensprecher'].includes(a.role) ? 'noch ohne Klasse' : '')}{a.status === 'disabled' ? ' · entzogen' : ''}</span>
            {!a.login && a.status !== 'disabled' && <Button size="sm" variant="ghost" onClick={() => remove(a)}>Entziehen</Button>}
          </li>
        ))}
      </ul>
      {options.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] items-end border-t border-line pt-3">
          <label className="block">
            <span className="text-sm text-sage">Zusätzliche Rolle hinzufügen</span>
            <select className="input mt-1" value={role} onChange={(e) => { setRole(e.target.value); setCls([]); }}>
              <option value="">– Rolle wählen –</option>
              {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <Button onClick={add} disabled={!role || busy}><Plus size={16} /> Hinzufügen</Button>
          {needsClass && (
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <span className="text-xs text-sage-muted w-full">{multi ? 'Klassen der Lehrkraft' : 'Klasse (optional – kann später zugewiesen werden)'}</span>
              {classes.map((c) => {
                const on = cls.includes(c.id);
                return (
                  <button key={c.id} type="button" onClick={() => setCls(on ? cls.filter((x) => x !== c.id) : multi ? [...cls, c.id] : [c.id])}
                    className={['px-3 py-1.5 rounded-lg border text-sm', on ? 'border-mint bg-mint/10 text-ivory' : 'border-line text-sage'].join(' ')}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : null);

function Row({ icon: Icon, label, children }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon size={16} className="mt-0.5 text-sage-muted shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] text-sage-muted">{label}</div>
        <div className="text-sm text-ivory break-words">{children}</div>
      </div>
    </div>
  );
}

// Steckbrief + Verwaltung einer Person (nur Leitung/Admin).
export function PersonAdminPanel({ userId, viewer, onChanged }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [u, setU] = useState(null);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [pw, setPw] = useState('');
  const [name, setName] = useState('');
  const [kids, setKids] = useState([]);
  const load = () => api.get(`/admin/users/${userId}`).then((d) => { setU(d.user); setName(d.user.name); setKids(d.user.childIds || []); }).catch((e) => toast.push(e.message, 'error'));
  useEffect(() => { load(); api.get('/classes').then((d) => setClasses(d.classes)).catch(() => {}); }, [userId]);
  useEffect(() => {
    if (u?.role === 'eltern' && !students.length) api.get('/admin/users').then((d) => setStudents(d.users.filter((x) => ['schueler', 'klassensprecher'].includes(x.role) && x.status !== 'disabled'))).catch(() => {});
  }, [u?.role]);
  if (!u) return <Spinner />;
  const saveBasics = async () => {
    try { await api.patch(`/admin/users/${u.id}`, { name, ...(u.role === 'eltern' ? { childIds: kids } : {}) }); toast.push('Gespeichert', 'success'); changed(); }
    catch (err) { toast.push(err.message, 'error'); }
  };
  const removeForever = async () => {
    if (!window.confirm(`${u.name} endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    try { await api.del(`/admin/users/${u.id}`); toast.push('Nutzer gelöscht', 'success'); navigate('/admin'); }
    catch (err) { toast.push(err.message, 'error'); }
  };
  const p = u.profile || {};
  const changed = () => { load(); onChanged?.(); };
  const setStatus = async (status) => {
    try { await api.patch(`/admin/users/${u.id}`, { status }); toast.push(status === 'active' ? 'Konto aktiviert' : 'Konto deaktiviert', 'success'); changed(); }
    catch (err) { toast.push(err.message, 'error'); }
  };
  const resetPw = async () => {
    if (pw.length < 6) return toast.push('Mindestens 6 Zeichen', 'error');
    try { await api.post(`/admin/users/${u.id}/reset-password`, { newPassword: pw }); toast.push('Passwort zurückgesetzt – bitte der Person mitteilen', 'success'); setPw(''); }
    catch (err) { toast.push(err.message, 'error'); }
  };
  const address = [p.street && `${p.street} ${p.houseNumber || ''}`.trim(), [p.zip, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <CardHeader title="Steckbrief" subtitle={`${u.roleLabel}${u.classNames?.length ? ` · ${u.classNames.join(', ')}` : ''}`} icon={IdCard}
          action={u.status !== 'active' ? <Badge tone="late">{u.status === 'pending' ? 'wartet auf Freischaltung' : 'deaktiviert'}</Badge> : null} />
        <div className="grid gap-x-6 px-4 pb-2 sm:grid-cols-2 lg:grid-cols-3">
          <Row icon={Mail} label="E-Mail / Anmeldung">{u.email || u.loginEmail}</Row>
          <Row icon={Phone} label="Telefon">{p.phone}</Row>
          <Row icon={Cake} label="Geburtsdatum">{p.birthDate ? `${fmtDate(p.birthDate)}${p.gender ? ` · ${p.gender}` : ''}` : null}</Row>
          <Row icon={MapPin} label="Adresse">{address}</Row>
          <Row icon={Users} label="Erziehungsberechtigte">{(p.guardians || []).map((g) => `${g.name}${g.phones?.length ? ` (${g.phones.join(' / ')})` : ''}`).join('; ') || (u.parentNames?.length ? u.parentNames.join(', ') : null)}</Row>
          <Row icon={Users} label="Kinder">{u.childNames?.length ? u.childNames.join(', ') : null}</Row>
          <Row icon={Clock} label="Zuletzt online">{lastSeenLabel(u.lastSeenAt)}</Row>
          <Row icon={Clock} label="Registriert">{fmtDate(u.createdAt)}</Row>
          <Row icon={IdCard} label="Gewünschte Einstufung / Bemerkung">{[p.desiredLevel, p.notes].filter(Boolean).join(' · ') || null}</Row>
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader title="Rollenbearbeitung" subtitle="Aktuelle Position und Beförderung auf einen Blick" icon={ShieldCheck} />
        <div className="p-4 space-y-4">
          <RoleEditor user={u} classes={classes} isSuperAdmin={viewer?.role === 'super_admin'} onChanged={changed} />
          <PersonRolesCard userId={u.id} classes={classes} onChanged={changed} />
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader title="Konto" icon={KeyRound} />
        <div className="p-4 grid gap-3 sm:grid-cols-2 items-end">
          <div className={u.role === 'eltern' ? 'sm:col-span-2 space-y-2' : 'sm:col-span-2'}>
            <div className="text-sm text-sage mb-1">Name</div>
            <div className="flex gap-2">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              {u.role !== 'eltern' && <Button variant="outline" onClick={saveBasics} disabled={!name.trim() || name === u.name}>Speichern</Button>}
            </div>
            {u.role === 'eltern' && (
              <>
                <div className="text-sm text-sage">Verknüpfte Kinder</div>
                <ClassChips classes={students.map((x) => ({ id: x.id, name: x.name }))} value={kids} onChange={setKids} multi />
                <Button variant="outline" onClick={saveBasics}>Speichern</Button>
              </>
            )}
          </div>
          {(u.email || !u.loginEmail) && (
            <div>
              <div className="text-sm text-sage mb-1">Passwort zurücksetzen</div>
              <div className="flex gap-2">
                <input type="text" className="input" placeholder="Neues Passwort (mind. 6 Zeichen)" value={pw} onChange={(e) => setPw(e.target.value)} />
                <Button variant="outline" onClick={resetPw}>Setzen</Button>
              </div>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {u.status === 'active'
              ? (viewer?.id !== u.id && <Button variant="outline" onClick={() => window.confirm(`${u.name} deaktivieren? Anmeldung ist dann nicht mehr möglich.`) && setStatus('disabled')}>Konto deaktivieren</Button>)
              : <Button onClick={() => setStatus('active')}>Konto aktivieren</Button>}
            {u.status === 'disabled' && viewer?.id !== u.id && <Button variant="danger" onClick={removeForever}>Endgültig löschen</Button>}
          </div>
        </div>
      </Card>
    </div>
  );
}
