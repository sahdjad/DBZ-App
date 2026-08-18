import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/AuthContext.jsx';
import { Spinner } from './components/ui.jsx';

import Login from './pages/Login.jsx';
import Registrieren from './pages/Registrieren.jsx';
import PasswortVergessen from './pages/PasswortVergessen.jsx';
import PasswortNeu from './pages/PasswortNeu.jsx';
import NotFound from './pages/NotFound.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Aufgaben from './pages/Aufgaben.jsx';
import AufgabeDetail from './pages/AufgabeDetail.jsx';
import Checkin from './pages/Checkin.jsx';
import Unterricht from './pages/Unterricht.jsx';
import Anwesenheit from './pages/Anwesenheit.jsx';
import Abwesenheit from './pages/Abwesenheit.jsx';
import Entschuldigungen from './pages/Entschuldigungen.jsx';
import Korrektur from './pages/Korrektur.jsx';
import Verhalten from './pages/Verhalten.jsx';
import Strafen from './pages/Strafen.jsx';
import Klassenliste from './pages/Klassenliste.jsx';
import Leitung from './pages/Leitung.jsx';
import StudentProfil from './pages/StudentProfil.jsx';
import Kalender from './pages/Kalender.jsx';
import Berichte from './pages/Berichte.jsx';
import BerichtDruck from './pages/BerichtDruck.jsx';
import Pruefungen from './pages/Pruefungen.jsx';
import Pruefung from './pages/Pruefung.jsx';
import Hifz from './pages/Hifz.jsx';
import QuranReader from './pages/QuranReader.jsx';
import Protokolle from './pages/Protokolle.jsx';
import Ankuendigungen from './pages/Ankuendigungen.jsx';
import Materialien from './pages/Materialien.jsx';
import Nachrichten from './pages/Nachrichten.jsx';
import Benachrichtigungen from './pages/Benachrichtigungen.jsx';
import DbzOnline from './pages/DbzOnline.jsx';
import Konto from './pages/Konto.jsx';
import Admin from './pages/Admin.jsx';

const MANAGERS = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];
const ADMINS = ['super_admin', 'leitung'];

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="min-h-screen grid place-items-center bg-bg">
        <Spinner label="Sitzung wird geprüft …" />
      </div>
    );
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/registrieren" element={<Registrieren />} />
      <Route path="/passwort-vergessen" element={<PasswortVergessen />} />
      <Route path="/passwort-neu" element={<PasswortNeu />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/aufgaben" element={<Protected><Aufgaben /></Protected>} />
      <Route path="/aufgaben/:id" element={<Protected><AufgabeDetail /></Protected>} />
      <Route path="/checkin" element={<Protected roles={['schueler', 'klassensprecher']}><Checkin /></Protected>} />
      <Route path="/unterricht" element={<Protected roles={MANAGERS}><Unterricht /></Protected>} />
      <Route path="/anwesenheit" element={<Protected><Anwesenheit /></Protected>} />
      <Route path="/abwesenheit" element={<Protected roles={['schueler', 'klassensprecher', 'eltern']}><Abwesenheit /></Protected>} />
      <Route path="/entschuldigungen" element={<Protected roles={MANAGERS}><Entschuldigungen /></Protected>} />
      <Route path="/korrektur" element={<Protected roles={MANAGERS}><Korrektur /></Protected>} />
      <Route path="/verhalten" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher', 'eltern']}><Verhalten /></Protected>} />
      <Route path="/strafen" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher', 'eltern']}><Strafen /></Protected>} />
      <Route path="/klassenliste" element={<Protected roles={MANAGERS}><Klassenliste /></Protected>} />
      <Route path="/leitung" element={<Protected roles={ADMINS}><Leitung /></Protected>} />
      <Route path="/profil/:id" element={<Protected><StudentProfil /></Protected>} />
      <Route path="/kalender" element={<Protected><Kalender /></Protected>} />
      <Route path="/berichte" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher', 'eltern']}><Berichte /></Protected>} />
      <Route path="/bericht/:id/druck" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher', 'eltern']}><BerichtDruck /></Protected>} />
      <Route path="/pruefungen" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher']}><Pruefungen /></Protected>} />
      <Route path="/pruefung/:id" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher']}><Pruefung /></Protected>} />
      <Route path="/hifz" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher', 'eltern']}><Hifz /></Protected>} />
      <Route path="/quran" element={<Protected><QuranReader /></Protected>} />
      <Route path="/protokolle" element={<Protected><Protokolle /></Protected>} />
      <Route path="/ankuendigungen" element={<Protected><Ankuendigungen /></Protected>} />
      <Route path="/materialien" element={<Protected><Materialien /></Protected>} />
      <Route path="/nachrichten" element={<Protected><Nachrichten /></Protected>} />
      <Route path="/benachrichtigungen" element={<Protected><Benachrichtigungen /></Protected>} />
      <Route path="/dbz-online" element={<Protected><DbzOnline /></Protected>} />
      <Route path="/konto" element={<Protected><Konto /></Protected>} />
      <Route path="/admin" element={<Protected roles={ADMINS}><Admin /></Protected>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
