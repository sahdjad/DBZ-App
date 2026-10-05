import { useEffect, useState } from 'react';
import { onServerSlow } from '../lib/api.js';

// Kleiner Hinweis oben, solange eine Anfrage ungewöhnlich lange dauert --
// typisch für den Kaltstart des kostenlosen Servers nach einer Pause.
export default function ServerWakeNotice() {
  const [slow, setSlow] = useState(false);
  const [since, setSince] = useState(0);
  useEffect(() => onServerSlow((s) => { setSlow(s); if (s) setSince(Date.now()); }), []);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!slow) return undefined;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [slow]);
  if (!slow) return null;
  const secs = Math.round((Date.now() - since) / 1000) + 4;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[120] flex justify-center px-4" style={{ top: 'max(env(safe-area-inset-top), 0.5rem)' }} role="status" aria-live="polite">
      <div className="flex items-center gap-2 rounded-full bg-sidebar/95 px-4 py-2 text-xs text-ivory shadow-lg ring-1 ring-mint/30">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-mint/30 border-t-mint" />
        <span>Server wird gestartet … {secs} s <span className="text-sage-muted">(nach einer Pause bis zu 1 Minute)</span></span>
      </div>
    </div>
  );
}
