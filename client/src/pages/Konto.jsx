import { useEffect, useState } from 'react';
import { UserCog, Save, KeyRound, Users, Link2, Unlink, RefreshCw, Copy, Monitor, Sun, Moon, Bell, BellOff } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Avatar, Spinner, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { getThemePref, setThemePref } from '../lib/theme.js';
import { getPushState, enablePush, disablePush, iosNeedsInstall } from '../lib/push.js';

const LINKABLE = ['schueler', 'klassensprecher'];

export default function Konto() {
  const { user, updateName } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateName(name.trim());
      toast.push('Gespeichert', 'success');
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppLayout title="Konto">
      <div className="max-w-md space-y-4">
        <Card className="p-5">
          <CardHeader title="Mein Konto" icon={UserCog} />
          <div className="p-4">
            <div className="flex items-center gap-4 mb-5">
              <Avatar name={user.name} size={56} />
              <div>
                <div className="text-ivory">{user.roleLabel}</div>
                <div className="text-sm text-sage-muted">{user.email}</div>
              </div>
            </div>
            <form onSubmit={save} className="space-y-3">
              <label className="block">
                <span className="text-sm text-sage">Anzeigename</span>
                <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <Button type="submit" disabled={busy}><Save size={18} /> Speichern</Button>
            </form>
          </div>
        </Card>

        <ThemeCard />
        <NotificationsCard />

        {user.role === 'eltern' && <ParentChildrenCard />}
        {LINKABLE.includes(user.role) && <FamilyCodeCard />}

        <PasswordCard />
      </div>
    </AppLayout>
  );
}

// Eltern: mit Kindern per Familien-Code verknüpfen und verwalten.
function ParentChildrenCard() {
  const toast = useToast();
  const [children, setChildren] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/family/children').then((d) => setChildren(d.children));
  useEffect(() => { load(); }, []);

  const link = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { child } = await api.post('/family/link', { code: code.trim() });
      toast.push(`${child.name} verknüpft`, 'success');
      setCode('');
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (childId, name) => {
    if (!window.confirm(`Verknüpfung zu ${name} wirklich lösen?`)) return;
    try {
      await api.post('/family/unlink', { childId });
      toast.push('Verknüpfung gelöst', 'success');
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  return (
    <Card className="p-5">
      <CardHeader title="Meine Kinder" subtitle="Mit dem Familien-Code des Kindes verknüpfen" icon={Users} />
      <div className="p-4 space-y-4">
        {!children ? (
          <Spinner />
        ) : children.length === 0 ? (
          <p className="text-sm text-sage-muted">Noch kein Kind verknüpft. Gib unten den Familien-Code ein, den dein Kind (oder die Lehrkraft) dir gibt.</p>
        ) : (
          <ul className="divide-y divide-line">
            {children.map((c) => (
              <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={c.name} size={36} />
                  <div className="min-w-0">
                    <div className="text-ivory truncate">{c.name}</div>
                    {c.className && <div className="text-xs text-sage-muted">{c.className}</div>}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => unlink(c.id, c.name)} aria-label="Verknüpfung lösen">
                  <Unlink size={16} />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={link} className="flex items-end gap-2">
          <label className="block flex-1">
            <span className="text-sm text-sage">Familien-Code</span>
            <input
              className="input mt-1 font-mono tracking-widest uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="z. B. K7F9QT"
              maxLength={8}
              required
            />
          </label>
          <Button type="submit" disabled={busy}><Link2 size={18} /> Verknüpfen</Button>
        </form>
      </div>
    </Card>
  );
}

// Schüler: eigener Familien-Code für die Eltern.
function FamilyCodeCard() {
  const toast = useToast();
  const [code, setCode] = useState(null);

  useEffect(() => { api.get('/me/family-code').then((d) => setCode(d.code)); }, []);

  const rotate = async () => {
    if (!window.confirm('Neuen Code erzeugen? Der alte Code funktioniert dann nicht mehr.')) return;
    try {
      const d = await api.post('/me/family-code/rotate');
      setCode(d.code);
      toast.push('Neuer Code erzeugt', 'success');
    } catch (err) {
      toast.push(err.message, 'error');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.push('Code kopiert', 'success');
    } catch {
      toast.push('Kopieren nicht möglich', 'error');
    }
  };

  return (
    <Card className="p-5">
      <CardHeader title="Familien-Code" subtitle="Gib diesen Code deinen Eltern, damit sie dich verknüpfen können" icon={Users} />
      <div className="p-4">
        {!code ? (
          <Spinner />
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-2xl tracking-[0.3em] text-ivory bg-subtle rounded-lg px-4 py-2">{code}</span>
            <Button size="sm" variant="outline" onClick={copy}><Copy size={16} /> Kopieren</Button>
            <Button size="sm" variant="ghost" onClick={rotate}><RefreshCw size={16} /> Neu</Button>
          </div>
        )}
        <p className="text-[11px] text-sage-muted mt-3">Nur an deine eigenen Eltern weitergeben. Bei Missbrauch einfach „Neu" drücken – der alte Code wird ungültig.</p>
      </div>
    </Card>
  );
}

// Darstellung: System / Hell / Dunkel
function ThemeCard() {
  const [pref, setPref] = useState(getThemePref());
  const OPTIONS = [
    { key: 'system', label: 'System', icon: Monitor },
    { key: 'light', label: 'Hell', icon: Sun },
    { key: 'dark', label: 'Dunkel', icon: Moon },
  ];
  const choose = (k) => { setPref(k); setThemePref(k); };
  return (
    <Card className="p-5">
      <CardHeader title="Darstellung" subtitle="Hell, Dunkel oder automatisch (System)" icon={Sun} />
      <div className="p-4">
        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => choose(key)}
              className={[
                'flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm transition',
                pref === key ? 'border-mint bg-mint/10 text-mint-light' : 'border-line text-sage hover:bg-hover',
              ].join(' ')}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-sage-muted mt-3">„Dunkel" ist ein warmes, augenschonendes Grün. „System" folgt automatisch der Einstellung deines Geräts.</p>
      </div>
    </Card>
  );
}

// Push-Benachrichtigungen für dieses Gerät ein-/ausschalten.
function NotificationsCard() {
  const toast = useToast();
  const [state, setState] = useState(null); // { supported, subscribed, permission }
  const [busy, setBusy] = useState(false);
  const iosHint = iosNeedsInstall();

  useEffect(() => { getPushState().then(setState).catch(() => setState({ supported: false })); }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (state?.subscribed) { await disablePush(); toast.push('Benachrichtigungen ausgeschaltet'); }
      else { await enablePush(); toast.push('Benachrichtigungen aktiviert'); }
      setState(await getPushState());
    } catch (err) { toast.push(err.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-5">
      <CardHeader title="Benachrichtigungen" subtitle="Neue Nachrichten, Ankündigungen, Hausaufgaben & Termine" icon={Bell} />
      <div className="p-4">
        {!state ? (
          <p className="text-sm text-sage-muted">Wird geprüft …</p>
        ) : !state.supported ? (
          <p className="text-sm text-sage-muted">
            {iosHint
              ? 'Auf iPhone/iPad: Öffne die App über „Teilen → Zum Home-Bildschirm", dann sind Benachrichtigungen möglich.'
              : 'Dieses Gerät bzw. dieser Browser unterstützt keine Push-Benachrichtigungen.'}
          </p>
        ) : state.permission === 'denied' ? (
          <p className="text-sm text-status-absent">
            Benachrichtigungen sind im Browser blockiert. Bitte in den Website-Einstellungen des Browsers wieder erlauben.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-ivory text-sm">{state.subscribed ? 'Aktiviert auf diesem Gerät' : 'Auf diesem Gerät aktivieren'}</div>
              <div className="text-xs text-sage-muted">Auch wenn die App geschlossen ist.</div>
            </div>
            <Button size="sm" variant={state.subscribed ? 'outline' : 'primary'} onClick={toggle} disabled={busy}>
              {state.subscribed ? <><BellOff size={16} /> Aus</> : <><Bell size={16} /> An</>}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  const change = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch('/me/password', { currentPassword: current, newPassword: next });
      toast.push('Passwort geändert', 'success');
      setCurrent('');
      setNext('');
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <CardHeader title="Passwort ändern" icon={KeyRound} />
      <form onSubmit={change} className="p-4 space-y-3">
        <label className="block">
          <span className="text-sm text-sage">Aktuelles Passwort</span>
          <input type="password" autoComplete="current-password" className="input mt-1" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm text-sage">Neues Passwort (mind. 6 Zeichen)</span>
          <input type="password" autoComplete="new-password" className="input mt-1" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} />
        </label>
        <Button type="submit" disabled={busy}><KeyRound size={18} /> Passwort ändern</Button>
      </form>
    </Card>
  );
}
