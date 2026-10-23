// Gemeinsame Mushaf-Seitendaten und Leser-Einstellungen für „Lesen" und
// „Auswendig rezitieren" (beide nutzen den Vollbild-Leser, components/mushaf/).
import { useEffect, useState } from 'react';
import { ensurePageFont, ensureBasmalaFont } from './mushafFont.js';

export const clampPage = (p) => Math.max(1, Math.min(604, Number(p) || 1));
export const LAST_PAGE_KEY = 'dbz-mushaf-page';
export function lastPage() {
  try { return clampPage(localStorage.getItem(LAST_PAGE_KEY) || 1); } catch { return 1; }
}
export function rememberPage(p) {
  try { localStorage.setItem(LAST_PAGE_KEY, String(p)); } catch { /* egal */ }
}

// ---- Seiten (Muṣḥaf al-Madīnah 1421H, eingebaut: /mushaf/qpc-v2) -----------
// Jede Seite ist eine feste Einheit aus 15 Zeilen (scripts/build-mushaf.mjs):
// { page, firstVerse, lastVerse, surahs, lines: [{ n, type: 'surah'|'basmala'|'text',
//   c?: zentriert, words?: [{ t, g, v, p, x?, xn?, e?, q?, part? }] }] }.
// „Bereit" ist eine Seite erst, wenn auch ihre Seitenschrift geladen ist.
const BASE = '/mushaf/qpc-v2/pages';
const cache = new Map(); // Seite -> Daten (Schrift geladen)
const pending = new Map();
const failed = new Map(); // Seite -> Fehlermeldung
export const cachedPage = (p) => cache.get(p) || null;
export const pageError = (p) => failed.get(p) || null;

async function loadPage(p) {
  const res = await fetch(`${BASE}/${String(p).padStart(3, '0')}.json`);
  if (!res.ok) throw new Error(`Seite ${p} nicht gefunden (${res.status})`);
  const d = await res.json();
  if (d.page !== p || !Array.isArray(d.lines) || !d.lines.length) throw new Error(`Seite ${p} ist unvollständig`);
  const fonts = [ensurePageFont(p)];
  if (d.lines.some((l) => l.type === 'basmala')) fonts.push(ensureBasmalaFont());
  const ok = await Promise.all(fonts);
  if (ok.includes(false)) throw new Error('Die Seitenschrift konnte nicht geladen werden.');
  return d;
}

/** Seite + Seitenschrift(en). Wirft bei Fehler -- es gibt keine Ersatzdarstellung. */
export function preparePage(p) {
  if (cache.has(p)) return Promise.resolve(cache.get(p));
  if (!pending.has(p)) {
    failed.delete(p);
    pending.set(p, loadPage(p)
      .then((d) => { cache.set(p, d); return d; })
      .catch((err) => { failed.set(p, err.message || 'Seite konnte nicht geladen werden.'); throw err; })
      .finally(() => pending.delete(p)));
  }
  return pending.get(p);
}
export const fetchPage = preparePage;
export function prefetchPage(p) {
  if (p < 1 || p > 604) return;
  preparePage(p).catch(() => {});
}

// ---- Leser-Einstellungen ---------------------------------------------------
// view: 'mushaf' (Medina-Seite) | 'text' (Fließtext, Schriftgröße einstellbar)
// scroll: 'horizontal' (blättern) | 'vertical' (untereinander scrollen)
// layout: 'tight' (ganze Seite) | 'wide' (große Schrift) -- nur Mushaf-Ansicht
// textSize: Stufe 0..6 -- nur Text-Ansicht
// spread: 'auto' (Doppelseite im Querformat auf iPad/Mac) | 'single' | 'double'
// (gespeichert je Gerät; Handys zeigen immer eine Seite)
const PREFS_KEY = 'dbz-mushaf-prefs';
export const TEXT_SIZES = [1.25, 1.5, 1.75, 2, 2.35, 2.75, 3.25]; // rem
const DEFAULTS = { view: 'mushaf', scroll: 'horizontal', layout: 'tight', textSize: 2, spread: 'auto' };
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
      spread: ['single', 'double'].includes(p.spread) ? p.spread : 'auto',
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
