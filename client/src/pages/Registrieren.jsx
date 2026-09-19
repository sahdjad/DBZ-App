import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { BookMarked, UserPlus, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { api } from '../lib/api.js';
import { Button, Card, Spinner, useToast } from '../components/ui.jsx';

const emptyProfile = {
  firstName: '', lastName: '', birthDate: '', gender: '',
  street: '', houseNumber: '', zip: '', city: '', phone: '',
  desiredLevel: '',
  guardianName: '', guardianPhone: '', guardianEmail: '',
  siblings: '', notes: '',
  selfPayer: false,
};

// Aus dem Geburtsdatum das aktuelle Alter berechnen (für die Live-Anzeige im
// Formular – wird nicht gespeichert, nur zur Bestätigung angezeigt).
function ageFromBirthDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const beforeBirthday = now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

// Anmeldedaten fürs Sekretariat – für beide Registrierungswege gleich (mit
// Einladung UND ohne), nur die Klassenzuteilung unterscheidet sich.
function ProfileFields({ profile, setProfile }) {
  const set = (k) => (e) => setProfile({ ...profile, [k]: e.target.value });
  const age = ageFromBirthDate(profile.birthDate);

  return (
    <div className="space-y-4 pt-2 border-t border-line">
      <p className="text-xs text-sage-muted pt-2">Anmeldedaten (für das Sekretariat)</p>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-sm text-sage">Vorname</span>
          <input className="input mt-1" value={profile.firstName} onChange={set('firstName')} required />
        </label>
        <label className="block">
          <span className="text-sm text-sage">Nachname</span>
          <input className="input mt-1" value={profile.lastName} onChange={set('lastName')} required />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-sm text-sage">Geburtsdatum</span>
          <input type="date" className="input mt-1" value={profile.birthDate} onChange={set('birthDate')} required />
          {age !== null && <span className="text-xs text-sage-muted mt-1 block">Alter: {age} Jahre</span>}
        </label>
        <label className="block">
          <span className="text-sm text-sage">Geschlecht</span>
          <select className="input mt-1" value={profile.gender} onChange={set('gender')} required>
            <option value="">– auswählen –</option>
            <option value="weiblich">weiblich</option>
            <option value="maennlich">männlich</option>
            <option value="divers">divers</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="block col-span-2">
          <span className="text-sm text-sage">Straße</span>
          <input className="input mt-1" value={profile.street} onChange={set('street')} required />
        </label>
        <label className="block">
          <span className="text-sm text-sage">Hausnummer</span>
          <input className="input mt-1" value={profile.houseNumber} onChange={set('houseNumber')} required />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-sm text-sage">PLZ</span>
          <input className="input mt-1" value={profile.zip} onChange={set('zip')} required />
        </label>
        <label className="block col-span-2">
          <span className="text-sm text-sage">Ort</span>
          <input className="input mt-1" value={profile.city} onChange={set('city')} required />
        </label>
      </div>

      <label className="block">
        <span className="text-sm text-sage">Telefonnummer</span>
        <input type="tel" className="input mt-1" value={profile.phone} onChange={set('phone')} required />
      </label>

      <label className="block">
        <span className="text-sm text-sage">Gewünschte Klasse / Einstufung (optional)</span>
        <input className="input mt-1" placeholder="z. B. Anfänger, Fortgeschritten …" value={profile.desiredLevel} onChange={set('desiredLevel')} />
      </label>

      <label className="flex items-center gap-2 text-sm text-sage">
        <input type="checkbox" checked={profile.selfPayer} onChange={(e) => setProfile({ ...profile, selfPayer: e.target.checked })} />
        Ich bin Selbstzahler (keine Erziehungsberechtigten-Angaben nötig)
      </label>

      {!profile.selfPayer && (
        <div className="space-y-3 rounded-lg border border-line p-3">
          <p className="text-xs text-sage-muted">Erziehungsberechtigte(r)</p>
          <label className="block">
            <span className="text-sm text-sage">Name (Mutter/Vater bzw. Erziehungsberechtigte/r)</span>
            <input className="input mt-1" value={profile.guardianName} onChange={set('guardianName')} required />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-sm text-sage">Telefonnummer</span>
              <input type="tel" className="input mt-1" value={profile.guardianPhone} onChange={set('guardianPhone')} required />
            </label>
            <label className="block">
              <span className="text-sm text-sage">E-Mail</span>
              <input type="email" className="input mt-1" value={profile.guardianEmail} onChange={set('guardianEmail')} required />
            </label>
          </div>
        </div>
      )}

      <label className="block">
        <span className="text-sm text-sage">Geschwister am DBZ (optional)</span>
        <input className="input mt-1" placeholder="Namen, falls vorhanden" value={profile.siblings} onChange={set('siblings')} />
      </label>
      <label className="block">
        <span className="text-sm text-sage">Bemerkungen für die Verwaltung (optional)</span>
        <textarea className="input mt-1" rows={2} value={profile.notes} onChange={set('notes')} />
      </label>
    </div>
  );
}

export default function Registrieren() {
  const { user, register, registerOpen } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get('token') || '');
  const [invite, setInvite] = useState(null); // {role, roleLabel, className, orgName}
  const [checking, setChecking] = useState(false);
  const [invalid, setInvalid] = useState(null);
  const [openMode, setOpenMode] = useState(false); // Registrierung ohne Einladung/Klasse
  const [openDone, setOpenDone] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [profile, setProfile] = useState(emptyProfile);
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

  // Bei Schüler/Klassensprecher ersetzen Vor-/Nachname aus den Anmeldedaten
  // das separate Namensfeld (weniger Doppelerfassung).
  const showsProfileFields = openMode || invite?.role === 'schueler' || invite?.role === 'klassensprecher';
  const nameFor = () => (showsProfileFields ? `${profile.firstName} ${profile.lastName}`.trim() : form.name);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register({ token, ...form, name: nameFor(), ...profile });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.push(err.message || 'Registrierung fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitOpen = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await registerOpen({ ...form, name: nameFor(), ...profile });
      setOpenDone(true);
    } catch (err) {
      toast.push(err.message || 'Registrierung fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-bg">
      <div className="hidden lg:flex flex-col justify-between p-12 hero-atmosphere border-r border-line">
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
          <p className="text-sage">Erstelle dein Konto mit dem Einladungslink deiner Klasse – oder melde dich neu an, wenn du noch keiner Klasse zugeteilt bist.</p>
        </div>
        <p className="text-xs text-sage-muted">© {new Date().getFullYear()} Deen Bildungszentrum e.V.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {openDone ? (
            <Card className="p-5 border-mint/30 text-center">
              <CheckCircle2 size={32} className="mx-auto mb-3 text-mint" />
              <h1 className="font-display text-xl text-ivory mb-2">Anmeldung eingegangen</h1>
              <p className="text-sm text-sage">
                Deine Daten wurden übermittelt. Die DBZ-Leitung teilt dich einer Klasse zu — du bekommst
                dann eine E-Mail bzw. kannst dich anmelden, sobald das erledigt ist.
              </p>
              <Button as={Link} to="/login" className="w-full mt-5">Zum Login</Button>
            </Card>
          ) : (
            <>
              <h1 className="font-display text-2xl text-ivory mb-1">Konto erstellen</h1>
              <p className="text-sm text-sage-muted mb-6">
                {openMode ? 'Ohne Einladung – du wirst später einer Klasse zugeteilt.' : 'Mit Einladung der DBZ.'}
              </p>

              {openMode ? (
                <form onSubmit={submitOpen} className="space-y-4">
                  <label className="block">
                    <span className="text-sm text-sage">E-Mail</span>
                    <input type="email" autoComplete="username" className="input mt-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                  </label>
                  <label className="block">
                    <span className="text-sm text-sage">Passwort (mind. 6 Zeichen)</span>
                    <input type="password" autoComplete="new-password" className="input mt-1" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
                  </label>
                  <ProfileFields profile={profile} setProfile={setProfile} />
                  <Button type="submit" size="lg" className="w-full" disabled={busy}><UserPlus size={18} /> {busy ? 'Wird gesendet …' : 'Anmeldung senden'}</Button>
                  <button type="button" onClick={() => setOpenMode(false)} className="text-sm text-mint-light hover:underline w-full text-center">
                    Ich habe doch einen Einladungscode
                  </button>
                </form>
              ) : !token || invalid ? (
                <Card className="p-4 mb-4">
                  <p className="text-sm text-sage mb-3">
                    {invalid ? <span className="text-status-absent">Einladung {invalid}. </span> : null}
                    Gib deinen Einladungscode ein (oder öffne den erhaltenen Link):
                  </p>
                  <div className="flex gap-2">
                    <input className="input" placeholder="Einladungscode" value={token} onChange={(e) => setToken(e.target.value.trim())} />
                    <Button onClick={() => checkToken(token)} disabled={!token || checking}>Prüfen</Button>
                  </div>
                  <button type="button" onClick={() => setOpenMode(true)} className="text-sm text-mint-light hover:underline mt-3 w-full text-center">
                    Ich habe noch keinen Einladungscode (neue Anmeldung)
                  </button>
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
                    {!showsProfileFields && (
                      <label className="block">
                        <span className="text-sm text-sage">Name</span>
                        <input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                      </label>
                    )}
                    <label className="block">
                      <span className="text-sm text-sage">E-Mail</span>
                      <input type="email" autoComplete="username" className="input mt-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                    </label>
                    <label className="block">
                      <span className="text-sm text-sage">Passwort (mind. 6 Zeichen)</span>
                      <input type="password" autoComplete="new-password" className="input mt-1" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
                    </label>
                    {showsProfileFields && (
                      <ProfileFields profile={profile} setProfile={setProfile} />
                    )}
                    <Button type="submit" size="lg" className="w-full" disabled={busy}><UserPlus size={18} /> {busy ? 'Konto wird erstellt …' : 'Konto erstellen'}</Button>
                  </form>
                </>
              ) : null}

              <p className="text-sm text-sage-muted mt-6 text-center">
                Schon ein Konto? <Link to="/login" className="text-mint-light hover:underline">Anmelden</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
