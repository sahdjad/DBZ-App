// Untere Leiste zum flüssigen Durchblättern der 604 Mushaf-Seiten per Wisch-
// /Zieh-Geste -- gemeinsam genutzt von der Mushaf-Lese-Ansicht und dem
// Auswendig-Modus (Seite wählen). Nutzt bewusst einen nativen
// <input type="range">: swipe-fähig auf jedem Gerät (Touch-Ziehen, Maus,
// Pfeiltasten), barrierefrei, ohne eigene Zeigergesten-Mathematik. Während
// des Ziehens wird nur lokal (kein Netzwerk) die Live-Vorschau gezeigt;
// navigiert wird erst beim Loslassen -- kein Sturm an Seitenanfragen pro
// Pixel Wischweg.
//
// Leserichtung wie im echten Mushaf: Seite 1 RECHTS, Seite 604 LINKS.
// dir="rtl" auf <input type="range"> wird nicht von allen Browsern (v.a.
// iOS Safari) zuverlässig unterstützt -- stattdessen der Slider per CSS
// horizontal gespiegelt (scaleX(-1)), das dreht Darstellung UND
// Ziehrichtung garantiert gemeinsam um, unabhängig vom Browser.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Computer (ab 1024 px, Seitenleiste links sichtbar): kein schwebendes
// Element über dem Text -- die Leiste steht als normaler Block direkt unter
// der Mushaf-Seite. Handy: fest unten über der Navigation (Daumen-Bereich).
const DESKTOP = '(min-width: 1024px)';
function useDesktop() {
  const [d, setD] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(DESKTOP).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(DESKTOP);
    if (!mq) return undefined;
    const on = () => setD(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return d;
}

export default function PageScrubber({ page, onNavigate, max = 604 }) {
  const desktop = useDesktop();
  const [dragValue, setDragValue] = useState(null);
  const value = dragValue ?? page ?? 1;
  const commit = (v) => {
    setDragValue(null);
    const clamped = Math.max(1, Math.min(max, v));
    if (clamped !== page) onNavigate(clamped);
  };
  const bar = (
    <div
      data-testid="page-scrubber"
      className={desktop
        ? 'mx-auto mt-4 max-w-2xl rounded-2xl border border-line bg-card px-5 pt-2 pb-3'
        : 'nav-surface backdrop-blur border-t border-line px-4 pt-1.5 pb-2'}
      style={desktop ? undefined : { paddingBottom: 'max(8px, calc(env(safe-area-inset-bottom) - var(--dbz-tabbar-h, 0px)))' }}
    >
      {/* Große, immer sichtbare Seitenzahl -- nicht nur eine kleine Randnotiz,
          damit man auf einen Blick sieht, wo man gerade ist (auch ohne zu ziehen). */}
      <div className="flex justify-center mb-1">
        <span
          data-testid="page-scrubber-label"
          className="px-3 py-0.5 rounded-full bg-mint text-onaccent text-sm font-semibold tabular-nums"
        >
          Seite {value} <span className="opacity-70 font-normal">/ {max}</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-sage-muted tabular-nums w-6 shrink-0">{max}</span>
        <input
          type="range"
          min={1}
          max={max}
          step={1}
          value={value}
          onChange={(e) => setDragValue(Number(e.target.value))}
          onMouseUp={(e) => commit(Number(e.target.value))}
          onTouchEnd={(e) => commit(Number(e.target.value))}
          onKeyUp={(e) => commit(Number(e.target.value))}
          className="flex-1 accent-mint h-6"
          style={{ transform: 'scaleX(-1)' }}
          aria-label="Seite wählen (1 bis 604), Seite 1 rechts wie im gedruckten Mushaf"
          aria-valuetext={`Seite ${value}`}
        />
        <span className="text-[11px] text-sage-muted tabular-nums w-6 text-right shrink-0">1</span>
      </div>
    </div>
  );
  if (desktop) return bar;
  return createPortal(
    <div className="fixed inset-x-0 z-20" style={{ bottom: 'var(--dbz-tabbar-h, 0px)' }}>{bar}</div>,
    document.body,
  );
}
