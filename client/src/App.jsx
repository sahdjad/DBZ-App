import { Suspense, lazy, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/AuthContext.jsx';
import { Spinner } from './components/ui.jsx';

// Login bleibt eager geladen (erste, unangemeldete Ansicht -> schnellster Start).
import Login from './pages/Login.jsx';

// Alle übrigen Seiten werden erst bei Bedarf nachgeladen (Code-Splitting).
// Das verkleinert das Start-Bündel deutlich -> spürbar schnellerer App-Start,
// besonders auf dem Handy und im umfangreichen Lehrer-Bereich.
const Registrieren = lazy(() => import('./pages/Registrieren.jsx'));
const PasswortVergessen = lazy(() => import('./pages/PasswortVergessen.jsx'));
const PasswortNeu = lazy(() => import('./pages/PasswortNeu.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Aufgaben = lazy(() => import('./pages/Aufgaben.jsx'));
const AufgabeDetail = lazy(() => import('./pages/AufgabeDetail.jsx'));
const Checkin = lazy(() => import('./pages/Checkin.jsx'));
const Unterricht = lazy(() => import('./pages/Unterricht.jsx'));
const Anwesenheit = lazy(() => import('./pages/Anwesenheit.jsx'));
const Abwesenheit = lazy(() => import('./pages/Abwesenheit.jsx'));
const Entschuldigungen = lazy(() => import('./pages/Entschuldigungen.jsx'));
const Korrektur = lazy(() => import('./pages/Korrektur.jsx'));
const Verhalten = lazy(() => import('./pages/Verhalten.jsx'));
const Strafen = lazy(() => import('./pages/Strafen.jsx'));
const Regeln = lazy(() => import('./pages/Regeln.jsx'));
const Klassenliste = lazy(() => import('./pages/Klassenliste.jsx'));
const Leitung = lazy(() => import('./pages/Leitung.jsx'));
const StudentProfil = lazy(() => import('./pages/StudentProfil.jsx'));
const Kalender = lazy(() => import('./pages/Kalender.jsx'));
const Berichte = lazy(() => import('./pages/Berichte.jsx'));
const Aktivitaeten = lazy(() => import('./pages/Aktivitaeten.jsx'));
const BerichtDruck = lazy(() => import('./pages/BerichtDruck.jsx'));
const Pruefungen = lazy(() => import('./pages/Pruefungen.jsx'));
const Pruefung = lazy(() => import('./pages/Pruefung.jsx'));
const PruefungDruck = lazy(() => import('./pages/PruefungDruck.jsx'));
const Hifz = lazy(() => import('./pages/Hifz.jsx'));
const QuranReader = lazy(() => import('./pages/QuranReader.jsx'));
const Tadschwid = lazy(() => import('./pages/Tadschwid.jsx'));
const Protokolle = lazy(() => import('./pages/Protokolle.jsx'));
const Ankuendigungen = lazy(() => import('./pages/Ankuendigungen.jsx'));
const Materialien = lazy(() => import('./pages/Materialien.jsx'));
const Nachrichten = lazy(() => import('./pages/Nachrichten.jsx'));
const Benachrichtigungen = lazy(() => import('./pages/Benachrichtigungen.jsx'));
const DbzOnline = lazy(() => import('./pages/DbzOnline.jsx'));
const Konto = lazy(() => import('./pages/Konto.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));

const MANAGERS = ['klassenlehrer', 'vertretung', 'super_admin', 'leitung'];
const ADMINS = ['super_admin', 'leitung'];

// Markenstart-Bildschirm: DBZ-Logo mit sanfter Einblende-Animation statt eines
// nüchternen „Sitzung wird geprüft"-Spinners – wirkt hochwertig beim Öffnen.
function Splash() {
  const [logoOk, setLogoOk] = useState(true);
  return (
    <div className="app-splash min-h-screen grid place-items-center bg-bg">
      <div className="flex flex-col items-center">
        <div className="splash-mark relative grid place-items-center h-24 w-24 rounded-3xl bg-mint/10 border border-mint/20">
          <span className="splash-glow" aria-hidden="true" />
          {logoOk ? (
            <img src="/logo.png" alt="DBZ" className="h-14 w-14 object-contain" onError={() => setLogoOk(false)} />
          ) : (
            <span className="font-display text-2xl text-mint-light">DBZ</span>
          )}
        </div>
        <div className="splash-text mt-5 text-center">
          <div className="font-display text-xl text-ivory">Deen Bildungszentrum</div>
          <div className="text-xs text-sage-muted mt-1">wird geladen …</div>
        </div>
      </div>
    </div>
  );
}

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

// Kurzer Ladehinweis, während eine Seite nachgeladen wird.
function PageFallback() {
  return (
    <div className="min-h-screen grid place-items-center bg-bg">
      <Spinner label="Lädt …" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
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
        <Route path="/regeln" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher', 'eltern']}><Regeln /></Protected>} />
        <Route path="/klassenliste" element={<Protected roles={MANAGERS}><Klassenliste /></Protected>} />
        <Route path="/leitung" element={<Protected roles={ADMINS}><Leitung /></Protected>} />
        <Route path="/profil/:id" element={<Protected><StudentProfil /></Protected>} />
        <Route path="/kalender" element={<Protected><Kalender /></Protected>} />
        <Route path="/berichte" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher', 'eltern']}><Berichte /></Protected>} />
        <Route path="/aktivitaeten" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher', 'eltern']}><Aktivitaeten /></Protected>} />
        <Route path="/bericht/:id/druck" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher', 'eltern']}><BerichtDruck /></Protected>} />
        <Route path="/pruefungen" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher']}><Pruefungen /></Protected>} />
        <Route path="/pruefung/:id" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher']}><Pruefung /></Protected>} />
        <Route path="/pruefung/:id/druck" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher']}><PruefungDruck /></Protected>} />
        <Route path="/hifz" element={<Protected roles={['klassenlehrer', 'vertretung', 'super_admin', 'leitung', 'schueler', 'klassensprecher', 'eltern']}><Hifz /></Protected>} />
        <Route path="/quran" element={<Protected><QuranReader /></Protected>} />
        <Route path="/tadschwid" element={<Protected><Tadschwid /></Protected>} />
        <Route path="/protokolle" element={<Protected><Protokolle /></Protected>} />
        <Route path="/ankuendigungen" element={<Protected><Ankuendigungen /></Protected>} />
        <Route path="/materialien" element={<Protected><Materialien /></Protected>} />
        <Route path="/nachrichten" element={<Protected><Nachrichten /></Protected>} />
        <Route path="/nachrichten/:threadId" element={<Protected><Nachrichten /></Protected>} />
        <Route path="/benachrichtigungen" element={<Protected><Benachrichtigungen /></Protected>} />
        <Route path="/dbz-online" element={<Protected><DbzOnline /></Protected>} />
        <Route path="/konto" element={<Protected><Konto /></Protected>} />
        <Route path="/admin" element={<Protected roles={ADMINS}><Admin /></Protected>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
