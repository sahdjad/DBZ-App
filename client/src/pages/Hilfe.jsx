// Hilfe & Anleitung: die Einführung je Rolle zum Nachlesen bzw. erneut
// Starten, plus häufige Fragen. Lehrkräfte/Leitung können auch die
// Anleitung anderer Rollen ansehen (z. B. um sie Schülern zu erklären).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LifeBuoy, PlayCircle, ChevronDown, ChevronUp } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { Card, CardHeader, Button } from '../components/ui.jsx';
import { GuideTour } from '../components/GuideTour.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { GUIDE_ROLES, guideFor, guideKeyFor, FAQ } from '../lib/guide.js';

const STAFF = ['klassenlehrer', 'vertretung', 'leitung', 'super_admin'];

export default function Hilfe() {
  const { user } = useAuth();
  const own = guideKeyFor(user.role);
  const [key, setKey] = useState(own);
  const [tour, setTour] = useState(false);
  const [openQ, setOpenQ] = useState(null);
  const guide = guideFor(key);
  const steps = guide.steps.slice(1, -1); // ohne Begrüßung/Abschluss
  return (
    <AppLayout title="Hilfe & Anleitung">
      {tour && <GuideTour guideKey={key} onClose={() => setTour(false)} />}
      <Card className="p-4 sm:p-5 mb-4">
        <CardHeader title="Anleitung" subtitle={`Schritt für Schritt · ${guide.label}`} icon={LifeBuoy} />
        <div className="space-y-4">
          {STAFF.includes(user.role) && (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Anleitung für Rolle">
              {GUIDE_ROLES.map((r) => (
                <button key={r} role="tab" aria-selected={key === r} onClick={() => setKey(r)}
                  className={`rounded-full px-3 py-1 text-xs border ${key === r ? 'bg-mint text-onaccent border-mint' : 'border-line text-sage hover:bg-hover'}`}>
                  {guideFor(r).label}{r === own ? ' (du)' : ''}
                </button>
              ))}
            </div>
          )}
          <Button onClick={() => setTour(true)}><PlayCircle size={18} /> Einführung starten</Button>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="shrink-0 grid place-items-center h-7 w-7 rounded-full bg-mint/15 text-mint text-sm font-semibold">{i + 1}</span>
                <div className="min-w-0">
                  <div className="text-ivory font-medium">{s.title}</div>
                  <p className="text-sm text-sage leading-relaxed">{s.text}</p>
                  {s.to && key === own && <Link to={s.to} className="text-xs text-mint hover:underline">Öffnen →</Link>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Card>
      <Card className="p-4 sm:p-5">
        <CardHeader title="Häufige Fragen" icon={LifeBuoy} />
        <div className="p-2 divide-y divide-line">
          {FAQ.map((f, i) => (
            <div key={f.q}>
              <button type="button" onClick={() => setOpenQ(openQ === i ? null : i)} aria-expanded={openQ === i}
                className="w-full flex items-center justify-between gap-3 py-3 px-2 text-left text-ivory hover:bg-hover rounded-lg">
                <span className="text-sm">{f.q}</span>
                {openQ === i ? <ChevronUp size={16} className="shrink-0 text-sage-muted" /> : <ChevronDown size={16} className="shrink-0 text-sage-muted" />}
              </button>
              {openQ === i && <p className="px-2 pb-3 text-sm text-sage leading-relaxed">{f.a}</p>}
            </div>
          ))}
        </div>
        <p className="text-xs text-sage-muted px-4 pb-2">Noch Fragen? Schreib unter „Nachrichten" deiner Klassenleitung oder der DBZ-Leitung.</p>
      </Card>
    </AppLayout>
  );
}
