// Eine einzige Einwilligung für alles (Datenschutz, Mikrofon, Kamera,
// Benachrichtigungen) -- einmal bei der Registrierung bestätigt, danach keine
// Einzel-Abfragen mehr in der App. Die Berechtigungen des Handys selbst
// (Mikrofon/Kamera/Mitteilungen) kann nur das Betriebssystem vergeben: sie
// werden deshalb in EINEM Schritt pro Gerät angefragt.
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { pushSupported, enablePush } from '../lib/push.js';
import { Button } from './ui.jsx';

export const CONSENT_VERSION = 1;
const DEVICE_KEY = 'dbz-device-permissions-v1';

export function ConsentText({ className = '' }) {
  return (
    <span className={`text-[11px] leading-snug text-sage-muted ${className}`}>
      Ich stimme zu, dass das DBZ meine Angaben für den Schulbetrieb speichert (Anwesenheit, Aufgaben, Nachrichten, Leistungen) und
      dass die App <b>Mikrofon</b> (Sprachnachrichten, Hifz-Erkennung – die Stimme wird nur auf dem Gerät ausgewertet und nicht gespeichert),
      <b> Kamera</b> (QR-Check-in, Fotos von Hausaufgaben) und <b>Benachrichtigungen</b> nutzt. Details regelt die Datenschutzerklärung des DBZ; ein Widerruf ist jederzeit über die DBZ-Leitung möglich.
    </span>
  );
}

// Kleines Pflicht-Häkchen für die Registrierung.
export function ConsentCheckbox({ checked, onChange }) {
  return (
    <label className="flex items-start gap-2 rounded-xl border border-line bg-subtle/40 p-2.5">
      <input type="checkbox" className="mt-0.5 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} required />
      <ConsentText />
    </label>
  );
}

export function deviceSetupDone() {
  try { return localStorage.getItem(DEVICE_KEY) === '1'; } catch { return true; }
}
function markDeviceSetup() {
  try { localStorage.setItem(DEVICE_KEY, '1'); } catch { /* egal */ }
}

// Alle Geräte-Berechtigungen in EINEM Tipp anfragen. Muss direkt im
// Klick-Handler starten (Browser verlangen eine Nutzeraktion).
export function requestDevicePermissions({ wantsPush }) {
  const jobs = [];
  if (wantsPush && pushSupported() && Notification.permission === 'default') jobs.push(enablePush().catch(() => {}));
  else if (wantsPush && pushSupported() && Notification.permission === 'granted') jobs.push(enablePush().catch(() => {}));
  if (navigator.mediaDevices?.getUserMedia) {
    jobs.push(
      navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        .catch(() => navigator.mediaDevices.getUserMedia({ audio: true }))
        .then((stream) => stream?.getTracks().forEach((t) => t.stop()))
        .catch(() => {}),
    );
  }
  markDeviceSetup();
  return Promise.all(jobs);
}

const PUSH_ROLES = ['schueler', 'klassensprecher', 'eltern'];

// Einmaliger Hinweis nach dem Anmelden: ohne gespeicherte Einwilligung
// (ältere Konten) als Pflicht-Kasten; mit Einwilligung, aber auf diesem Gerät
// noch nicht eingerichtet, als kleiner, überspringbarer Hinweis.
export function ConsentGate({ user, onDone }) {
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const needsConsent = !user.consentAt;
  if (hidden || (!needsConsent && deviceSetupDone())) return null;

  const agree = () => {
    setBusy(true);
    const perms = requestDevicePermissions({ wantsPush: PUSH_ROLES.includes(user.role) });
    const save = needsConsent ? api.post('/me/consent', { version: CONSENT_VERSION }) : Promise.resolve();
    Promise.allSettled([perms, save]).then(() => { setHidden(true); onDone?.(); });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-3 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-card border border-line shadow-2xl p-4 animate-[dbz-rise_.35s_ease-out]">
        <div className="flex items-center gap-2 mb-2 text-ivory">
          <ShieldCheck size={18} className="text-mint" />
          <span className="font-medium">{needsConsent ? 'Einmal bestätigen – dann bist du startklar' : 'Dieses Gerät einrichten'}</span>
        </div>
        {needsConsent ? <ConsentText /> : (
          <p className="text-xs text-sage-muted">Einmal tippen: Mikrofon, Kamera und Benachrichtigungen für die App erlauben. Dein Handy fragt dafür einmal kurz nach.</p>
        )}
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={agree} loading={busy}>{needsConsent ? 'Zustimmen' : 'Erlauben'}</Button>
          {!needsConsent && <Button variant="ghost" onClick={() => { markDeviceSetup(); setHidden(true); }}>Später</Button>}
        </div>
      </div>
    </div>
  );
}
