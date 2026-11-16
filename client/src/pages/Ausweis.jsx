// Digitaler Schülerausweis: Name, Schülernummer, Klasse, Schuljahr und ein
// QR-Code, über den jemand die Gültigkeit prüfen kann (öffentliche Prüfseite
// zeigt nur gültig/ungültig, Kurzname, Nummer und Schuljahr).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BadgeCheck, XCircle } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Spinner } from '../components/ui.jsx';
import { QrImage } from '../components/QrCode.jsx';

export default function Ausweis() {
  const [pass, setPass] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.get('/me/pass').then(setPass).catch((e) => setError(e.message)); }, []);
  const verifyUrl = pass ? `${window.location.origin}/#/ausweis/pruefen/${pass.token}` : '';
  return (
    <AppLayout title="Schülerausweis">
      <div className="max-w-sm mx-auto">
        {error && <p className="text-sm text-sage-muted text-center py-10">{error}</p>}
        {!pass && !error && <Spinner />}
        {pass && (
          <div className="rounded-3xl overflow-hidden shadow-card border border-line/70 bg-card">
            <div className="bg-[#063a2e] text-white px-5 pt-5 pb-4 flex items-center gap-3">
              <img src="/logo.png" alt="" className="h-11 w-11 rounded-xl bg-white/90 p-1" />
              <div className="min-w-0">
                <div className="text-footnote uppercase tracking-wider text-white/70">Schülerausweis</div>
                <div className="font-semibold truncate" data-noi18n>{pass.orgName}</div>
              </div>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <div className="text-caption uppercase tracking-wider text-sage-muted">Name</div>
                <div className="text-title2 font-bold text-ivory" data-noi18n>{pass.name}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-caption uppercase tracking-wider text-sage-muted">Schülernummer</div>
                  <div className="font-mono text-body text-ivory" data-noi18n>{pass.studentNumber}</div>
                </div>
                <div>
                  <div className="text-caption uppercase tracking-wider text-sage-muted">Klasse</div>
                  <div className="text-body text-ivory" data-noi18n>{pass.className || '–'}</div>
                </div>
                <div>
                  <div className="text-caption uppercase tracking-wider text-sage-muted">Schuljahr</div>
                  <div className="text-body text-ivory">{pass.schoolYear}</div>
                </div>
                <div>
                  <div className="text-caption uppercase tracking-wider text-sage-muted">Gültig bis</div>
                  <div className="text-body text-ivory">{new Date(`${pass.validUntil}T12:00:00`).toLocaleDateString('de-DE')}</div>
                </div>
              </div>
              <div className="flex flex-col items-center pt-1">
                <QrImage value={verifyUrl} size={180} alt="QR-Code zur Prüfung des Ausweises" />
                <p className="mt-2 text-caption text-sage-muted text-center">QR-Code scannen, um den Ausweis zu prüfen</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// Öffentliche Prüfseite (ohne Anmeldung).
export function AusweisPruefen() {
  const { token } = useParams();
  const [res, setRes] = useState(null);
  useEffect(() => {
    fetch(`/api/pass/${encodeURIComponent(token)}`).then((r) => r.json()).then(setRes).catch(() => setRes({ valid: false }));
  }, [token]);
  return (
    <div className="min-h-dvh grid place-items-center bg-[rgb(var(--c-bg))] p-6">
      <div className="w-full max-w-sm rounded-3xl bg-card border border-line/70 shadow-card p-6 text-center">
        {!res ? <Spinner /> : res.valid ? (
          <>
            <BadgeCheck size={56} className="mx-auto text-status-present" />
            <h1 className="mt-3 text-title2 font-bold text-ivory">Gültiger Schülerausweis</h1>
            <p className="mt-2 text-body text-ivory" data-noi18n>{res.name}</p>
            <p className="text-subhead text-sage-muted"><span data-noi18n>{res.studentNumber}</span> · Schuljahr {res.schoolYear}</p>
            <p className="mt-3 text-footnote text-sage-muted" data-noi18n>{res.orgName}</p>
          </>
        ) : (
          <>
            <XCircle size={56} className="mx-auto text-status-absent" />
            <h1 className="mt-3 text-title2 font-bold text-ivory">Ausweis nicht gültig</h1>
            <p className="mt-2 text-subhead text-sage-muted">Dieser Ausweis ist unbekannt oder nicht mehr aktiv.</p>
          </>
        )}
      </div>
    </div>
  );
}
