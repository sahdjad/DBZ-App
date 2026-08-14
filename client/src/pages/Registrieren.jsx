import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { BookMarked, UserPlus } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { api } from '../lib/api.js';
import { Button, Card, Spinner, useToast } from '../components/ui.jsx';

export default function Registrieren() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get('token') || '');
  const [invite, setInvite] = useState(null); // {role, roleLabel, className, orgName}
  const [checking, setChecking] = useState(false);
  const [invalid, setInvalid] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);

  if (user) navigate('/dashboard', { replace: true });

  const checkToken = (t) => {
    if (!t) return;
    setChecking(true);
    setInvalid(null);
    api
      .get(`/invite/${encodeURIComponent(t)}`)
      .then((d) => setInvite(d))
      .catch((e) => { setInvite(null); setInvalid(e.message || 'Einladung ungültig'); })
      .finally(() => setChecking(false));
  };
  useEffect(() => { if (token) checkToken(token); /* eslint-disable-next-line */ }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register({ token, ...form });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.push(err.message || 'Registrierung fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-bg">
      <div className="hidden lg:flex flex-col justify-between p-12 hero-atmosphere border-r border-black/10">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center h-11 w-11 rounded-lg bg-mint/15 border border-mint/25 text-mint"><BookMarked size={24} /></span>
          <div className="leading-tight">
            <div className="font-display text-xl text-ivory">Deen Bildungszentrum</div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-sage-muted">DBZ-App</div>
          </div>
        </div>
        <div className="max-w-md">
          <p className="font-arabic text-3xl text-mint-light mb-4" dir="rtl">أهلاً وسهلاً</p>
          <h2 className="font-display text-3xl text-ivory leading-tight mb-3">Willkommen im DBZ</h2>
          <p className="text-sage">Erstelle dein Konto mit dem Einladungslink deiner Klasse.</p>
        </div>
        <p className="text-xs text-sage-muted">© {new Date().getFullYear()} Deen Bildungszentrum e.V.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-2xl text-ivory mb-1">Konto erstellen</h1>
          <p className="text-sm text-sage-muted mb-6">Mit Einladung der DBZ.</p>

          {!token || invalid ? (
            <Card className="p-4 mb-4">
              <p className="text-sm text-sage mb-3">
                {invalid ? <span className="text-status-absent">Einladung {invalid}. </span> : null}
                Gib deinen Einladungscode ein (oder öffne den erhaltenen Link):
              </p>
              <div className="flex gap-2">
                <input className="input" placeholder="Einladungscode" value={token} onChange={(e) => setToken(e.target.value.trim())} />
                <Button onClick={() => checkToken(token)} disabled={!token || checking}>Prüfen</Button>
              </div>
            </Card>
          ) : checking ? (
            <Spinner label="Einladung wird geprüft …" />
          ) : invite ? (
            <>
              <Card className="p-4 mb-4 border-mint/30">
                <div className="text-sm text-sage">Einladung gültig für</div>
                <div className="text-ivory">{invite.roleLabel}{invite.className ? ` · ${invite.className}` : ''}</div>
                <div className="text-xs text-sage-muted mt-1">{invite.orgName}</div>
              </Card>
              <form onSubmit={submit} className="space-y-4">
                <label className="block">
                  <span className="text-sm text-sage">Name</span>
                  <input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </label>
                <label className="block">
                  <span className="text-sm text-sage">E-Mail</span>
                  <input type="email" autoComplete="username" className="input mt-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </label>
                <label className="block">
                  <span className="text-sm text-sage">Passwort (mind. 6 Zeichen)</span>
                  <input type="password" autoComplete="new-password" className="input mt-1" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
                </label>
                <Button type="submit" size="lg" className="w-full" disabled={busy}><UserPlus size={18} /> {busy ? 'Konto wird erstellt …' : 'Konto erstellen'}</Button>
              </form>
            </>
          ) : null}

          <p className="text-sm text-sage-muted mt-6 text-center">
            Schon ein Konto? <Link to="/login" className="text-mint-light hover:underline">Anmelden</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
