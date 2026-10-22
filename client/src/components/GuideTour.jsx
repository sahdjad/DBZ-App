// Schritt-für-Schritt-Einführung (App-Guide) als Fenster über der App.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Hand, LifeBuoy, Bell, Smartphone, LayoutDashboard, QrCode, Mic, CalendarClock, CalendarX, MessagesSquare,
  Book, ClipboardList, Lightbulb, Link2, BarChart3, CheckSquare, Users2, ShieldCheck, ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { GUIDE_VERSION, guideFor, guideKeyFor } from '../lib/guide.js';
import { deviceSetupDone } from './Consent.jsx';
import { Button } from './ui.jsx';

const ICONS = {
  hand: Hand, help: LifeBuoy, bell: Bell, phone: Smartphone, home: LayoutDashboard, qr: QrCode, mic: Mic,
  calendar: CalendarClock, absence: CalendarX, chat: MessagesSquare, book: Book, protocol: ClipboardList,
  lightbulb: Lightbulb, link: Link2, chart: BarChart3, check: CheckSquare, users: Users2, shield: ShieldCheck,
};

export function GuideTour({ guideKey, onClose }) {
  const navigate = useNavigate();
  const guide = guideFor(guideKey);
  const [i, setI] = useState(0);
  const step = guide.steps[i];
  const last = i === guide.steps.length - 1;
  const Icon = ICONS[step.icon] || LifeBuoy;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && !last) setI((x) => x + 1);
      if (e.key === 'ArrowLeft' && i > 0) setI((x) => x - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [i, last, onClose]);

  return (
    <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center p-3 bg-black/55 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Einführung">
      <div className="w-full max-w-md rounded-2xl bg-card border border-line shadow-2xl p-5 animate-[dbz-rise_.35s_ease-out]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-caption font-mono uppercase tracking-wider text-sage-muted">Anleitung · {guide.label} · {i + 1}/{guide.steps.length}</span>
          <button type="button" onClick={onClose} className="p-1.5 -m-1.5 rounded-lg text-sage-muted hover:text-ivory hover:bg-hover" aria-label="Anleitung schließen"><X size={18} /></button>
        </div>
        <div key={i} className="animate-[dbz-rise_.25s_ease-out]">
          <span className="grid place-items-center h-14 w-14 rounded-2xl bg-mint/15 text-mint mb-3"><Icon size={28} strokeWidth={1.75} /></span>
          <h2 className="font-display text-xl text-ivory">{step.title}</h2>
          <p className="text-subhead leading-relaxed text-sage mt-2">{step.text}</p>
          {step.to && (
            <button type="button" onClick={() => { onClose(); navigate(step.to); }} className="mt-2 text-sm text-mint hover:underline">
              Gleich dorthin →
            </button>
          )}
        </div>
        <div className="flex justify-center gap-1.5 my-4" aria-hidden="true">
          {guide.steps.map((_, k) => (
            <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-5 bg-mint' : 'w-1.5 bg-line'}`} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {i > 0 ? (
            <Button variant="outline" onClick={() => setI(i - 1)}><ChevronLeft size={18} /> Zurück</Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>Überspringen</Button>
          )}
          <Button className="flex-1" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? 'Los geht’s' : <>Weiter <ChevronRight size={18} /></>}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Zeigt die Einführung einmal pro Rolle – nach Einwilligung/Geräte-Einrichtung.
export function GuideGate() {
  const { user, refresh } = useAuth();
  const [, force] = useState(0);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const on = () => force((x) => x + 1);
    window.addEventListener('dbz:consent-closed', on);
    return () => window.removeEventListener('dbz:consent-closed', on);
  }, []);
  if (!user || closed) return null;
  // Sofort lokal merken (sonst startet die Anleitung nach „Gleich dorthin" auf
  // der nächsten Seite erneut, bevor der Server geantwortet hat).
  const localKey = `dbz-guide-${user.id}-${user.role}`;
  let localSeen = 0;
  try { localSeen = Number(localStorage.getItem(localKey)) || 0; } catch { /* egal */ }
  const seen = Math.max((user.guideSeen || {})[user.role] || 0, localSeen) >= GUIDE_VERSION;
  if (seen || !user.consentAt || !deviceSetupDone()) return null;
  const done = () => {
    setClosed(true);
    try { localStorage.setItem(localKey, String(GUIDE_VERSION)); } catch { /* egal */ }
    api.post('/me/guide', { version: GUIDE_VERSION }).then(() => refresh?.()).catch(() => {});
  };
  return <GuideTour guideKey={guideKeyFor(user.role)} onClose={done} />;
}
