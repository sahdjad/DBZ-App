import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { BookMarked, KeyRound } from 'lucide-react';
import { api } from '../lib/api.js';
import { Button, Card, Spinner, useToast } from '../components/ui.jsx';

export default function PasswortNeu() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const token = params.get('token') || '';
  const [state, setState] = useState('checking'); // checking | valid | invalid | done
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    api.get(`/auth/reset/${encodeURIComponent(token)}`)
      .then(() => setState('valid'))
      .catch(() => setState('invalid'));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setState('done');
      toast.push('Passwort geändert', 'success');
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-bg p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <span className="grid place-items-center h-10 w-10 rounded-lg bg-mint/15 border border-mint/25 text-mint"><BookMarked size={22} /></span>
          <div className="font-display text-lg text-ivory">Neues Passwort</div>
        </div>

        {state === 'checking' && <Spinner label="Link wird geprüft …" />}
        {state === 'invalid' && (
          <Card className="p-5">
            <p className="text-status-absent text-sm mb-3">Dieser Link ist ungültig oder abgelaufen.</p>
            <Link to="/passwort-vergessen" className="text-mint-light hover:underline text-sm">Neuen Link anfordern</Link>
          </Card>
        )}
        {state === 'done' && (
          <Card className="p-5"><p className="text-status-present text-sm">Passwort geändert. Du wirst zur Anmeldung weitergeleitet …</p></Card>
        )}
        {state === 'valid' && (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm text-sage">Neues Passwort (mind. 6 Zeichen)</span>
              <input type="password" autoComplete="new-password" className="input mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={busy}><KeyRound size={18} /> {busy ? 'Speichern …' : 'Passwort setzen'}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
