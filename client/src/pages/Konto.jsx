import { useState } from 'react';
import { UserCog, Save, KeyRound } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Avatar, useToast } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

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

        <PasswordCard />
      </div>
    </AppLayout>
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
