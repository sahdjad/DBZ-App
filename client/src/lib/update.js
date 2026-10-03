// Selbst-Aktualisierung der App. Eine auf dem Home-Bildschirm installierte
// App lädt sonst nie neu (sie wird nur aus dem Hintergrund geholt) und bliebe
// auf alten Versionen hängen. Ablauf:
//  - beim Start, beim Zurückholen aus dem Hintergrund und alle 10 Minuten
//    /api/version mit der eigenen Build-Kennung vergleichen;
//  - gibt es eine neuere Version, wird sie hinter dem DBZ-Logo geladen
//    ("DBZ wird aktualisiert …") – sofort beim Start/Zurückholen, sonst über
//    einen Hinweis mit Knopf (damit nichts mitten im Tippen verloren geht).
/* global __BUILD_ID__ */
export const BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

export function buildLabel(build = BUILD) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(build);
  return m ? `${m[3]}.${m[2]}.${m[1]}, ${m[4]}:${m[5]} Uhr` : build;
}

export async function fetchLatestBuild() {
  try {
    const r = await fetch('/api/version', { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) return null;
    return (await r.json()).build || null;
  } catch { return null; }
}

const ATTEMPT_KEY = 'dbz-update-attempt';

function showUpdateScreen() {
  if (document.getElementById('dbz-updating')) return;
  const el = document.createElement('div');
  el.id = 'dbz-updating';
  el.setAttribute('role', 'status');
  el.innerHTML = '<div class="dbz-upd-inner"><div class="dbz-upd-mark"><svg viewBox="0 0 112 112"><circle cx="56" cy="56" r="52"/></svg><img src="/logo.png" alt=""/></div>'
    + '<b>DBZ wird aktualisiert …</b><span>Neue Version wird geladen</span></div>';
  document.body.appendChild(el);
}

// Neue Version jetzt laden (hinter dem DBZ-Logo).
export async function applyUpdate(latest) {
  // Schutz vor Endlos-Schleifen: dieselbe Version höchstens einmal pro Sitzung erzwingen.
  try {
    if (latest && sessionStorage.getItem(ATTEMPT_KEY) === latest) return false;
    if (latest) sessionStorage.setItem(ATTEMPT_KEY, latest);
  } catch { /* egal */ }
  showUpdateScreen();
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) {
      await Promise.race([reg.update(), new Promise((r) => setTimeout(r, 2500))]);
      reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
    }
  } catch { /* egal */ }
  setTimeout(() => window.location.reload(), 900);
  return true;
}

// Startet die Überwachung. onAvailable(latest) wird aufgerufen, wenn während
// der Nutzung eine neue Version erscheint (Hinweis anzeigen).
export function startUpdateWatcher(onAvailable) {
  if (BUILD === 'dev') return () => {};
  let pending = null;
  const check = async (mode) => {
    const latest = await fetchLatestBuild();
    if (!latest || latest === BUILD || latest === 'dev') return;
    pending = latest;
    if (mode === 'start' || mode === 'resume') applyUpdate(latest);
    else onAvailable?.(latest);
  };
  check('start');
  const onVis = () => { if (document.visibilityState === 'visible') check(pending ? 'resume' : 'resume'); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pageshow', onVis);
  const t = setInterval(() => { if (document.visibilityState === 'visible') check('tick'); }, 10 * 60 * 1000);
  return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pageshow', onVis); clearInterval(t); };
}
