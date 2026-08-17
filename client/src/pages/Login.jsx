import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BookMarked, LogIn, Download } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { Button, Card, useToast } from '../components/ui.jsx';

const DEMO = [
  { email: 'lehrer@dbz.de', label: 'Klassenlehrer' },
  { email: 'schueler@dbz.de', label: 'Schüler' },
  { email: 'sprecher@dbz.de', label: 'Klassensprecher' },
  { email: 'eltern@dbz.de', label: 'Eltern' },
  { email: 'leitung@dbz.de', label: 'DBZ-Leitung' },
  { email: 'admin@dbz.de', label: 'Administrator' },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (user) navigate('/dashboard', { replace: true });

  const submit = async (e, creds) => {
    e?.preventDefault();
    const em = creds?.email ?? email;
    const pw = creds?.password ?? password;
    setBusy(true);
    try {
      await login(em, pw);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.push(err.message || 'Anmeldung fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-bg">
      {/* Markenseite */}
      <div className="hidden lg:flex flex-col justify-between p-12 hero-atmosphere border-r border-black/10">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center h-11 w-11 rounded-lg bg-mint/15 border border-mint/25 text-mint">
            <BookMarked size={24} strokeWidth={1.75} />
          </span>
          <div className="leading-tight">
            <div className="font-display text-xl text-ivory">Deen Bildungszentrum</div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-sage-muted">DBZ-App</div>
          </div>
        </div>
        <div className="max-w-md">
          <p className="font-arabic text-3xl text-mint-light mb-4" dir="rtl">
            بسم الله الرحمن الرحيم
          </p>
          <h2 className="font-display text-3xl text-ivory leading-tight mb-3">
            Die digitale Schulplattform des DBZ
          </h2>
          <p className="text-sage">
            Anwesenheit, Hausaufgaben, Qur'an-Fortschritt und Kommunikation – strukturiert,
            privat und an einem Ort. Pilot für Klasse 3.
          </p>
        </div>
        <p className="text-xs text-sage-muted">© {new Date().getFullYear()} Deen Bildungszentrum e.V.</p>
      </div>

      {/* Login-Formular */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-2xl text-ivory mb-1">Anmelden</h1>
          <p className="text-sm text-sage-muted mb-6">Melde dich mit deinem DBZ-Konto an.</p>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm text-sage">E-Mail</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg bg-card border border-black/10 px-3 py-2.5 text-ivory placeholder:text-sage-muted focus:border-mint/40"
                placeholder="name@dbz.de"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm text-sage">Passwort</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg bg-card border border-black/10 px-3 py-2.5 text-ivory placeholder:text-sage-muted focus:border-mint/40"
                placeholder="••••••••"
                required
              />
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              <LogIn size={18} /> {busy ? 'Anmelden …' : 'Anmelden'}
            </Button>
          </form>

          {installPrompt && (
            <Button variant="outline" size="lg" className="w-full mt-3" onClick={install}>
              <Download size={18} /> App installieren
            </Button>
          )}

          <p className="text-sm text-sage-muted mt-4 text-center">
            <Link to="/passwort-vergessen" className="text-mint-light hover:underline">Passwort vergessen?</Link>
            <span className="mx-2 text-black/15">·</span>
            Einladung? <Link to="/registrieren" className="text-mint-light hover:underline">Konto erstellen</Link>
          </p>

          <Card className="mt-6 p-4">
            <p className="text-xs text-sage-muted mb-3">
              Demo-Zugänge (Passwort <span className="font-mono text-sage">demo1234</span>):
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  onClick={(e) => submit(e, { email: d.email, password: 'demo1234' })}
                  disabled={busy}
                  className="text-left rounded-lg border border-black/10 px-3 py-2 hover:bg-black/[0.05] transition"
                >
                  <div className="text-sm text-ivory">{d.label}</div>
                  <div className="text-[11px] font-mono text-sage-muted truncate">{d.email}</div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
