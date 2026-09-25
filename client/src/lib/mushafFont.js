// Lädt die offizielle Mushaf-Seitenschrift (KFGQPC HAFS v1) je Seite nach.
// Die Glyphen liegen im „Private Use Area"-Bereich – ohne die passende
// Schrift würden sie als wirre Ersatzzeichen erscheinen. Wird von der
// Mushaf-Lese-Ansicht UND dem Auswendig-Modus (echte Seitenansicht) geteilt,
// damit beide dieselbe, bereits geladene Schrift wiederverwenden.
import { useLayoutEffect, useState } from 'react';

const loadedFontPages = new Set();
const fontPromises = new Map();

export function ensurePageFont(page) {
  const p = Number(page);
  if (!(p >= 1 && p <= 604)) return Promise.resolve(false);
  if (loadedFontPages.has(p)) return Promise.resolve(true);
  if (fontPromises.has(p)) return fontPromises.get(p);
  let pr;
  try {
    const ff = new FontFace(`qcf-p${p}`, `url('/api/quran/font/v1/${p}') format('woff2')`, { display: 'swap' });
    pr = ff.load().then((f) => { document.fonts.add(f); loadedFontPages.add(p); return true; }).catch(() => false);
  } catch { pr = Promise.resolve(false); }
  fontPromises.set(p, pr);
  return pr;
}

export const isPageFontLoaded = (page) => loadedFontPages.has(Number(page));

// Passende Schriftgröße je Mushaf-Seite (Auto-Fit): die breiteste Zeile soll
// die volle Breite exakt ausfüllen (ohne Umbruch) und alle Zeilen sollen die
// volle Höhe bis zum unteren Rand ausnutzen -- wie eine echte gedruckte
// Mushaf-Seite, auf jedem Gerät. Gemeinsam genutzt von der Mushaf-Lese-Ansicht
// UND dem Auswendig-Modus, die beide dieselbe reale Seitenschrift-Ansicht
// zeigen -- eine Messung, die nur an EINER Stelle gepflegt wird, statt zwei
// unabhängige Implementierungen aus dem Takt geraten zu lassen (genau das war
// vorher passiert: der Auswendig-Modus hatte eine eigene, viel einfachere,
// nie aktualisierte Darstellung mit fester vw-Schriftgröße -- dadurch blieb
// dort z. B. die halbe Seite leer, weil der Text nie auf die volle
// Container-Breite gestreckt wurde).
export function useMushafAutoFit(pageElRef, { active, numLines, resetKey }) {
  const [fs, setFs] = useState(null);
  const [width, setWidth] = useState(null);
  useLayoutEffect(() => {
    if (!active || !numLines) { setFs(null); setWidth(null); return undefined; }
    const measure = () => {
      const el = pageElRef.current; if (!el) return;
      const inner = el.querySelector('.mushaf-lines'); if (!inner) return;
      // Normalerweise nur an "vollen" Zeilen messen (kurze Zeilen sind kein
      // verlässliches Maß für die Seitenbreite). Sind ALLE Zeilen einer Seite
      // kurz (z. B. Al-Fatiha), gäbe es sonst gar keine Messgrundlage mehr --
      // dann eben an allen Zeilen messen, statt die Seite unvermessen (zu
      // klein) zu lassen.
      let lines = [...inner.querySelectorAll('.mushaf-line:not(.is-short)')];
      if (!lines.length) lines = [...inner.querySelectorAll('.mushaf-line')];
      if (!lines.length) return;
      const REF = 100; // an fester Referenzgröße messen -> stabil, kein Pendeln
      const cs = getComputedStyle(el);
      const hpad = parseFloat(cs.paddingLeft || 0) + parseFloat(cs.paddingRight || 0);
      const rectTop = el.getBoundingClientRect().top;
      const prevW = el.style.width, prevMax = el.style.maxWidth, prevFs = el.style.fontSize;
      el.style.maxWidth = 'none'; el.style.width = ''; el.style.fontSize = `${REF}px`;
      const prevJc = lines.map((l) => l.style.justifyContent);
      lines.forEach((l) => { l.style.justifyContent = 'flex-start'; }); // natürliche Breite messen
      let maxNat = 0;
      lines.forEach((l) => { if (l.scrollWidth > maxNat) maxNat = l.scrollWidth; });
      // Sure-Kopf/Basmala-Zeilen (z. B. auf Seite 2, Beginn einer Sure) sind
      // DEUTLICH höher als eine normale Textzeile. Ihre echte Höhe bei
      // REF=100px lässt sich nicht zuverlässig messen (der Sure-Name kann bei
      // so großer Referenzschrift selbst umbrechen und die Messung
      // verfälschen) -- stattdessen ein fester, konservativer Schätzwert: ein
      // Sure-Kopf (Name + Basmala) zählt wie ~3 zusätzliche Textzeilen.
      const headCount = inner.querySelectorAll('.mushaf-surah-head').length;
      lines.forEach((l, i) => { l.style.justifyContent = prevJc[i] || ''; });
      el.style.width = prevW; el.style.maxWidth = prevMax; el.style.fontSize = prevFs;
      if (maxNat <= 0) return;
      // Verfügbarer Platz: volle Breite (bis 800px lesbar) und volle Höhe bis
      // zum unteren Rand -> Schriftgröße füllt BEIDE Achsen; die Seite wird zum
      // Hochformat wie im gedruckten Mushaf.
      const docW = document.documentElement.clientWidth;
      const availOuter = Math.min(docW - 16, 800);
      const targetInnerW = Math.max(120, availOuter - hpad);
      const gaps = (numLines - 1) * 1.8;
      const availH = Math.max(260, window.innerHeight - rectTop - 16 - 20);
      const fontByWidth = (REF * targetInnerW) / maxNat;
      const fontByHeight = (availH - gaps - 6) / ((numLines + headCount * 3) * 1.9);
      setFs(Math.max(12, Math.min(44, Math.min(fontByWidth, fontByHeight))));
      // Die Seite bekommt IMMER die volle verfügbare Breite (nie die anhand
      // der Schriftgröße gemessene, ungestreckte Wortbreite) -- sonst bliebe
      // bei vielen Zeilen (Schriftgröße von der Höhe begrenzt) eine ganze
      // Seitenhälfte leer, weil die einzelnen Zeilen dann schmaler wären als
      // der Container. justify-content: space-between (siehe index.css
      // .mushaf-page.is-glyph .mushaf-line) verteilt die Wörter danach über
      // die volle Breite -- wie im gedruckten Mushaf.
      setWidth(availOuter);
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, numLines, resetKey]);
  return { fs, width };
}
