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
// Seiten-Layout des Mushaf:
//  'tight' (Standard, "Ganze Seite"): wie im gedruckten Mushaf -- die ganze
//     Seite passt auf den Bildschirm, die Seite ist genau so breit wie ihre
//     längste Zeile (enger Fließtext, keine Lücken).
//  'wide' ("Große Schrift", Anfänger): Schrift füllt die volle Breite, man
//     scrollt -- ebenfalls enger Fließtext, nur größer.
export const MUSHAF_LAYOUT_KEY = 'dbz-mushaf-layout';
export function loadMushafLayout() {
  try { return localStorage.getItem(MUSHAF_LAYOUT_KEY) === 'wide' ? 'wide' : 'tight'; } catch { return 'tight'; }
}

export function useMushafAutoFit(pageElRef, { active, numLines, resetKey, layout = 'tight' }) {
  const [fs, setFs] = useState(null);
  const [width, setWidth] = useState(null);
  const [shortLines, setShortLines] = useState(() => new Set());
  useLayoutEffect(() => {
    if (!active || !numLines) { setFs(null); setWidth(null); setShortLines(new Set()); return undefined; }
    const measure = () => {
      const el = pageElRef.current; if (!el) return;
      const inner = el.querySelector('.mushaf-lines'); if (!inner) return;
      const lines = [...inner.querySelectorAll('.mushaf-line')];
      if (!lines.length) return;
      const REF = 100; // an fester Referenzgröße messen -> stabil, kein Pendeln
      const cs = getComputedStyle(el);
      const hpad = parseFloat(cs.paddingLeft || 0) + parseFloat(cs.paddingRight || 0);
      const prevW = el.style.width, prevMax = el.style.maxWidth, prevFs = el.style.fontSize;
      el.style.maxWidth = 'none'; el.style.width = 'max-content'; el.style.fontSize = `${REF}px`;
      const prevJc = lines.map((l) => l.style.justifyContent);
      lines.forEach((l) => { l.style.justifyContent = 'flex-start'; }); // natürliche Breite messen
      // Natürliche Breite jeder Zeile = Summe der Wortbreiten + Abstände.
      const natural = lines.map((l) => {
        const kids = [...l.children];
        if (!kids.length) return l.scrollWidth;
        const gap = parseFloat(getComputedStyle(l).columnGap) || 0;
        return kids.reduce((sum, k) => sum + k.getBoundingClientRect().width, 0) + gap * (kids.length - 1);
      });
      const maxNat = Math.max(...natural);
      // Sure-Kopf/Basmala-Zeilen sind DEUTLICH höher als eine normale
      // Textzeile: ein Sure-Kopf (Name + Basmala) zählt wie ~3 Textzeilen.
      const headCount = inner.querySelectorAll('.mushaf-surah-head').length;
      lines.forEach((l, i) => { l.style.justifyContent = prevJc[i] || ''; });
      el.style.width = prevW; el.style.maxWidth = prevMax; el.style.fontSize = prevFs;
      if (!(maxNat > 0)) return;
      // Wirklich kurze Zeilen (Sure-Ende, kurze Suren) mittig statt gestreckt --
      // gemessen an der echten Breite, nicht an der Wortzahl (lange Wörter!).
      const short = new Set();
      lines.forEach((l, i) => { if (natural[i] < maxNat * 0.72) short.add(l.dataset.line); });
      setShortLines((prev) => (prev.size === short.size && [...short].every((x) => prev.has(x)) ? prev : short));
      const docW = document.documentElement.clientWidth;
      const availOuter = Math.min(docW - 16, 800);
      const targetInnerW = Math.max(120, availOuter - hpad);
      const gaps = (numLines - 1) * 1.8;
      // Höhe: ganzer Bildschirm abzüglich fester Leisten (oben App-Leiste,
      // unten Seiten-Leiste/Tab-Leiste) -- NICHT abzüglich der Werkzeuge über
      // der Seite; sonst wird die Schrift auf dem Desktop winzig.
      const chrome = docW < 1024 ? 190 : 150;
      const availH = Math.max(320, window.innerHeight - chrome);
      const vpad = parseFloat(cs.paddingTop || 0) + parseFloat(cs.paddingBottom || 0);
      const fontByWidth = (REF * targetInnerW) / maxNat;
      const fontByHeight = (availH - vpad - gaps) / ((numLines + headCount * 3) * 1.9);
      // 'tight' (Ganze Seite): die ganze Seite passt auf den Bildschirm, die Seite
      //   ist so breit wie ihre längste Zeile -> enger Fließtext wie im Mushaf.
      // 'wide' (Große Schrift, Anfänger): Schrift füllt die volle Breite, dafür
      //   wird gescrollt -- ebenfalls ohne Lücken, nur größer.
      const f = layout === 'wide'
        ? Math.max(14, Math.min(46, fontByWidth))
        : Math.max(14, Math.min(44, fontByWidth, fontByHeight));
      setFs(f);
      const tightW = Math.ceil((maxNat * f) / REF + hpad + 2);
      setWidth(Math.min(availOuter, tightW));
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, numLines, resetKey, layout]);
  return { fs, width, shortLines };
}
