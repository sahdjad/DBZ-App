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
import { useState } from 'react';
import { createPortal } from 'react-dom';

export default function PageScrubber({ page, onNavigate, max = 604 }) {
  const [dragValue, setDragValue] = useState(null);
  const value = dragValue ?? page ?? 1;
  const commit = (v) => {
    setDragValue(null);
    const clamped = Math.max(1, Math.min(max, v));
    if (clamped !== page) onNavigate(clamped);
  };
  return createPortal(
    <div
      data-testid="page-scrubber"
      className="fixed bottom-20 lg:bottom-0 inset-x-0 z-20 nav-surface backdrop-blur border-t border-line px-4 py-2 flex items-center gap-3"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
    >
      <span className="text-[11px] text-sage-muted tabular-nums w-8 shrink-0">{max}</span>
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
      <span className="text-xs text-ivory tabular-nums w-16 text-center shrink-0 font-medium">Seite {value}</span>
    </div>,
    document.body,
  );
}
