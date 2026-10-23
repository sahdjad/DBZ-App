// Gemeinsame Mushaf-Seitendaten und Leser-Einstellungen für „Lesen" und
// „Auswendig rezitieren" (beide nutzen den Vollbild-Leser, components/mushaf/).
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { ensurePageFont, isPageFontLoaded } from './mushafFont.js';

export const clampPage = (p) => Math.max(1, Math.min(604, Number(p) || 1));
export const LAST_PAGE_KEY = 'dbz-mushaf-page';
export function lastPage() {
  try { return clampPage(localStorage.getItem(LAST_PAGE_KEY) || 1); } catch { return 1; }
}
export function rememberPage(p) {
  try { localStorage.setItem(LAST_PAGE_KEY, String(p)); } catch { /* egal */ }
}

// ---- Seiten (Speicher bleibt über Tab-Wechsel bestehen) --------------------
const cache = new Map();
const pending = new Map();
export const cachedPage = (p) => cache.get(p) || null;
export function fetchPage(p) {
  if (cache.has(p)) return Promise.resolve(cache.get(p));
  if (!pending.has(p)) {
    pending.set(p, api.get(`/quran/page/${p}`)
      .then((r) => { cache.set(p, r.page); return r.page; })
      .finally(() => pending.delete(p)));
  }
  return pending.get(p);
}
/** Seite + Seitenschrift. Die Schrift wartet höchstens kurz, sonst lesbare Ersatzschrift. */
export async function preparePage(p) {
  const d = await fetchPage(p);
  if (d.font === 'v1' && !isPageFontLoaded(d.fontPage)) {
    await Promise.race([ensurePageFont(d.fontPage), new Promise((r) => setTimeout(r, 2500))]);
  }
  return d;
}
export function prefetchPage(p) {
  if (p < 1 || p > 604) return;
  fetchPage(p).then((d) => { if (d.font === 'v1') ensurePageFont(d.fontPage); }).catch(() => {});
}

// ---- Leser-Einstellungen ---------------------------------------------------
// view: 'mushaf' (Medina-Seite) | 'text' (Fließtext, Schriftgröße einstellbar)
// scroll: 'horizontal' (blättern) | 'vertical' (untereinander scrollen)
// layout: 'tight' (ganze Seite) | 'wide' (große Schrift) -- nur Mushaf-Ansicht
// textSize: Stufe 0..6 -- nur Text-Ansicht
const PREFS_KEY = 'dbz-mushaf-prefs';
export const TEXT_SIZES = [1.25, 1.5, 1.75, 2, 2.35, 2.75, 3.25]; // rem
const DEFAULTS = { view: 'mushaf', scroll: 'horizontal', layout: 'tight', textSize: 2 };
function readPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    // Übernahme der früheren Einstellung „Ganze Seite / Große Schrift".
    const oldLayout = localStorage.getItem('dbz-mushaf-layout');
    return {
      view: p.view === 'text' ? 'text' : 'mushaf',
      scroll: p.scroll === 'vertical' ? 'vertical' : 'horizontal',
      layout: (p.layout || oldLayout) === 'wide' ? 'wide' : 'tight',
      textSize: Number.isInteger(p.textSize) && p.textSize >= 0 && p.textSize < TEXT_SIZES.length ? p.textSize : DEFAULTS.textSize,
    };
  } catch { return { ...DEFAULTS }; }
}
const listeners = new Set();
let current = null;
export function getMushafPrefs() { if (!current) current = readPrefs(); return current; }
export function setMushafPrefs(patch) {
  current = { ...getMushafPrefs(), ...patch };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(current)); } catch { /* egal */ }
  listeners.forEach((fn) => fn(current));
}
export function useMushafPrefs() {
  const [p, setP] = useState(getMushafPrefs);
  useEffect(() => { listeners.add(setP); return () => listeners.delete(setP); }, []);
  return [p, setMushafPrefs];
}

// ---- Farben für Lesezeichen/Markierungen ----------------------------------
export const MARK_COLORS = [
  ['red', 'Rot', '#d64545'],
  ['yellow', 'Gelb', '#d9a514'],
  ['green', 'Grün', '#2f9e6b'],
  ['blue', 'Blau', '#3a78c9'],
];
export const markColor = (c) => MARK_COLORS.find((x) => x[0] === c)?.[2] || '#2f9e6b';
