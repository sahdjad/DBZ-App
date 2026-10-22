import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Download } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { api } from '../lib/api.js';
import { Button, Card, useToast } from '../components/ui.jsx';
import LanguageSwitch from '../components/LanguageSwitch.jsx';


export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [logoOk, setLogoOk] = useState(true);

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
    // Vollflächiger Hero: Klassenfoto füllt den ganzen Bildschirm (Handy, iPad,
    // Desktop), Logo + Anmeldekarte mittig darüber.
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-[#0B1F14]">
      <img
        src="/hero.jpg"
        alt=""
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1F14]/75 via-[#0B1F14]/72 to-[#0B1F14]/90" />

      <div className="absolute right-4 z-20" style={{ top: 'max(env(safe-area-inset-top), 0.75rem)' }}>
        <LanguageSwitch compact saveToAccount={false} />
      </div>
      <div className="relative z-10 min-h-[100dvh] flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          {/* Marke */}
          <div className="text-center mb-6">
            {logoOk ? (
              <img
                src="/logo.png"
                alt="DEEN Bildungszentrum"
                className="h-28 w-28 mx-auto rounded-[1.75rem] object-contain bg-white p-2.5 shadow-float"
                onError={() => setLogoOk(false)}
              />
            ) : (
              <span className="grid place-items-center h-24 w-24 mx-auto rounded-2xl bg-white/15 border border-white/25 text-white font-display text-3xl">د</span>
            )}
            <h1 className="text-title1 font-bold text-white mt-5">Deen Bildungszentrum</h1>
            <p className="font-arabic-ui text-title3 text-[#e7d9ae] mt-1.5" lang="ar" dir="rtl">بسم الله الرحمن الرحيم</p>
          </div>

          {/* Anmeldekarte */}
          <Card className="p-6 rounded-3xl shadow-float">
            <h2 className="text-title2 font-bold text-ivory">Anmelden</h2>
            <p className="text-subhead text-sage-muted mt-0.5 mb-5">Melde dich mit deinem DBZ-Konto an.</p>

            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="text-footnote font-medium text-sage-muted">E-Mail</span>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input mt-1"
                  placeholder="name@dbz.de"
                  required
                />
              </label>
              <label className="block">
                <span className="text-footnote font-medium text-sage-muted">Passwort</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input mt-1"
                  placeholder="••••••••"
                  required
                />
              </label>
              <Button type="submit" size="lg" className="w-full" loading={busy}>
                <LogIn size={18} /> {busy ? 'Anmelden …' : 'Anmelden'}
              </Button>
            </form>

            {installPrompt && (
              <Button variant="outline" size="lg" className="w-full mt-3" onClick={install}>
                <Download size={18} /> App installieren
              </Button>
            )}

            <p className="text-subhead text-sage-muted mt-5 text-center">
              <Link to="/passwort-vergessen" className="text-mint-light hover:underline">Passwort vergessen?</Link>
              <span className="mx-2 text-sage-muted">·</span>
              Einladung? <Link to="/registrieren" className="text-mint-light hover:underline">Konto erstellen</Link>
            </p>

          </Card>

          <p className="text-center text-footnote text-white/60 mt-6">© {new Date().getFullYear()} Deen Bildungszentrum e.V.</p>
        </div>
      </div>
    </div>
  );
}
