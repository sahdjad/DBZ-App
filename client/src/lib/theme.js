// Theme-Verwaltung: „System / Hell / Dunkel".
// - Standard ist „System" (übernimmt die Geräteeinstellung automatisch).
// - Die Auswahl wird lokal gespeichert und sofort angewendet (Klasse .dark am
//   <html>). „Dunkel" ist ein warmes, augenschonendes Dunkelgrün (siehe index.css).

const KEY = 'dbz-theme';
const media = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : { matches: false, addEventListener: () => {} };

export function getThemePref() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref = getThemePref()) {
  return pref === 'dark' || (pref === 'system' && media.matches) ? 'dark' : 'light';
}

function apply(pref) {
  document.documentElement.classList.toggle('dark', resolveTheme(pref) === 'dark');
}

export function setThemePref(pref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  apply(pref);
  try {
    window.dispatchEvent(new CustomEvent('dbz:theme', { detail: pref }));
  } catch {
    /* ignore */
  }
}

export function initTheme() {
  apply(getThemePref());
  // Wenn „System" gewählt ist, auf Umschalten des Geräts reagieren.
  media.addEventListener?.('change', () => {
    if (getThemePref() === 'system') apply('system');
  });
}
