import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookMarked, Mail } from 'lucide-react';
import { api } from '../lib/api.js';
import { Button, Card } from '../components/ui.jsx';

export default function PasswortVergessen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email });
    } catch {
      /* bewusst keine Rückmeldung über Existenz des Kontos */
    } finally {
      setBusy(false);
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-bg p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <span className="grid place-items-center h-10 w-10 rounded-lg bg-mint/15 border border-mint/25 text-mint"><BookMarked size={22} /></span>
          <div className="font-display text-lg text-ivory">Passwort vergessen</div>
        </div>
        {sent ? (
          <Card className="p-5">
            <p className="text-sage text-sm">
              Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet
              (1 Stunde gültig). Ohne E-Mail-Anbindung wende dich bitte an die DBZ-Leitung.
            </p>
            <Link to="/login" className="text-mint-light hover:underline text-sm mt-4 inline-block">Zurück zur Anmeldung</Link>
          </Card>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm text-sage">E-Mail</span>
              <input type="email" className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@dbz.de" required />
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={busy}><Mail size={18} /> {busy ? 'Senden …' : 'Link anfordern'}</Button>
            <Link to="/login" className="text-sage-muted hover:text-ivory text-sm block text-center">Zurück zur Anmeldung</Link>
          </form>
        )}
      </div>
    </div>
  );
}
