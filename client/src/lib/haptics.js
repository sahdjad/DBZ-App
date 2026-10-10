// Leichtes haptisches Feedback (kurzes "Ticken") beim Antippen.
// - Android (Chrome): Vibrations-Schnittstelle.
// - iPhone/iPad: Safari kennt keine Vibrations-Schnittstelle. Ab iOS 18 löst
//   aber das Umschalten eines System-Schalters (<input type=checkbox switch>)
//   den Taptic-Engine-Klick aus -- das nutzen wir unsichtbar. Ältere iOS-
//   Versionen: einfach kein Effekt (kein Fehler).
// Abschaltbar unter Konto -> Darstellung.
const KEY = 'dbz-haptics';
let label = null;
let last = 0;

export function hapticsEnabled() {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}
export function setHapticsEnabled(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* egal */ }
}

export function haptic(kind = 'light') {
  if (!hapticsEnabled()) return;
  const now = Date.now();
  if (now - last < 60) return; // nicht doppelt bei einem Tippen
  last = now;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(kind === 'success' ? [10, 50, 10] : kind === 'warning' ? [20, 60, 20] : 8);
      return;
    }
    if (!label) {
      label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9999px;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
    }
    label.click();
  } catch { /* egal */ }
}

// Einmal global: jedes Antippen eines Knopfes/Links gibt ein kurzes Ticken.
export function installHaptics() {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    const el = e.target.closest?.('button, a[href], [role="button"], [role="tab"], select, input[type="checkbox"], input[type="radio"]');
    if (!el || el.disabled || (label && label.contains(el))) return;
    haptic();
  }, { capture: true, passive: true });
}
